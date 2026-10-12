import type { DeviceSession, EmergencyRequest } from "@family-ledger/shared";

/**
 * Server-side session registry and family security controls.
 *
 * Supabase issues the JWTs, but tokens stay cryptographically valid until
 * they expire. This registry is what makes revocation immediate: every API
 * request checks the token's session_id here, so a revoked device is refused
 * even if it refreshes its token or replays an old one.
 *
 * In production this runs inside a single Durable Object (strongly
 * consistent, single-threaded). In tests it runs over an in-memory map.
 */

export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<unknown>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
}

export class MemoryKV implements KV {
  private map = new Map<string, unknown>();
  async get<T>(key: string) {
    return structuredClone(this.map.get(key)) as T | undefined;
  }
  async put<T>(key: string, value: T) {
    this.map.set(key, structuredClone(value));
  }
  async delete(key: string) {
    return this.map.delete(key);
  }
  async list<T>({ prefix }: { prefix: string }) {
    const out = new Map<string, T>();
    for (const [k, v] of [...this.map.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (k.startsWith(prefix)) out.set(k, structuredClone(v) as T);
    }
    return out;
  }
}

export interface SessionRecord {
  id: string;
  memberId: string;
  authUserId: string;
  label: string;
  createdAt: number;
  lastSeenAt: number;
  revokedAt?: number;
  revokedBy?: string;
  revokedReason?: "signed_out" | "revoked" | "revoke_all" | "idle" | "expired" | "locked";
}

interface MemberSecurity {
  memberId: string;
  authUserId?: string;
  locked?: boolean;
  lockedAt?: number;
  /** Any session authenticated before this instant is refused. */
  revokedBefore?: number;
}

export interface SecurityEvent {
  id: string;
  at: number;
  actorId: string;
  action: string;
  summary: string;
  targetMemberId?: string;
}

export type SessionCheck =
  | { ok: true; session: SessionRecord; isNew: boolean }
  | { ok: false; reason: "revoked" | "idle" | "expired" | "locked" };

export interface CheckSessionInput {
  sessionId: string;
  memberId: string;
  authUserId: string;
  /** From the token's amr claim when present. */
  authTimeMs?: number;
  nowMs: number;
  label: string;
  idleSeconds: number;
  maxAgeSeconds: number;
}

export const APPROVALS_REQUIRED = 2;
const EMERGENCY_TTL_MS = 24 * 3_600_000;
const TOUCH_INTERVAL_MS = 30_000;

export class SecurityError extends Error {
  constructor(
    public code: "forbidden" | "not_found" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "SecurityError";
  }
}

/** The methods the Worker may call. Mirrored by the Durable Object RPC wrapper. */
export interface SecurityService {
  resolveMember(
    authUserId: string,
    email: string | undefined,
    members: Array<{ id: string; email?: string }>,
    nowMs: number,
  ): Promise<string | null>;
  checkSession(input: CheckSessionInput): Promise<SessionCheck>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  listSessions(nowMs: number, idleSeconds: number, currentSessionId: string): Promise<DeviceSession[]>;
  revokeSession(
    sessionId: string,
    actorMemberId: string,
    nowMs: number,
    reason?: "signed_out" | "revoked",
  ): Promise<void>;
  revokeAllForMember(memberId: string, actorMemberId: string, nowMs: number): Promise<void>;
  memberStatuses(memberIds: string[]): Promise<Record<string, { locked: boolean; authUserId?: string }>>;
  createEmergency(input: {
    kind: "lock" | "unlock";
    targetMemberId: string;
    requestedBy: string;
    reason: string;
    nowMs: number;
    memberIds: string[];
    newId: string;
  }): Promise<EmergencyRequest>;
  approveEmergency(id: string, approverId: string, nowMs: number, memberIds: string[]): Promise<EmergencyRequest>;
  cancelEmergency(id: string, actorId: string, nowMs: number): Promise<EmergencyRequest>;
  listEmergencies(nowMs: number): Promise<EmergencyRequest[]>;
  rateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
    nowMs: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  recordEvent(event: SecurityEvent): Promise<void>;
  listEvents(limit: number): Promise<SecurityEvent[]>;
}

export class SecurityEngine implements SecurityService {
  constructor(private kv: KV) {}

  private async member(memberId: string): Promise<MemberSecurity> {
    return (await this.kv.get<MemberSecurity>(`member:${memberId}`)) ?? { memberId };
  }

  private async saveMember(m: MemberSecurity) {
    await this.kv.put(`member:${m.memberId}`, m);
  }

  /**
   * Map a verified identity to a family member. Membership comes from server
   * configuration (FAMILY_MEMBERS), never from the client. The first verified
   * sign-in with a member's email binds that identity; a different identity
   * with the same email is refused until the family unlocks/re-binds it.
   */
  async resolveMember(
    authUserId: string,
    email: string | undefined,
    members: Array<{ id: string; email?: string }>,
    nowMs: number,
  ) {
    const bound = await this.kv.get<string>(`bind:${authUserId}`);
    if (bound) {
      return members.some((m) => m.id === bound) ? bound : null;
    }
    if (!email) return null;
    const match = members.find((m) => m.email && m.email.toLowerCase() === email.toLowerCase());
    if (!match) return null;
    const sec = await this.member(match.id);
    if (sec.authUserId && sec.authUserId !== authUserId) {
      await this.recordEvent({
        id: `evt_${nowMs}_${authUserId.slice(0, 8)}`,
        at: nowMs,
        actorId: match.id,
        action: "security.unrecognised_identity",
        summary: "A sign-in with this member's email was refused because it didn't match their registered sign-in.",
        targetMemberId: match.id,
      });
      return null;
    }
    sec.authUserId = authUserId;
    await this.saveMember(sec);
    await this.kv.put(`bind:${authUserId}`, match.id);
    return match.id;
  }

  async checkSession(input: CheckSessionInput): Promise<SessionCheck> {
    const sec = await this.member(input.memberId);
    const key = `session:${input.sessionId}`;
    const existing = await this.kv.get<SessionRecord>(key);

    if (existing && (existing.memberId !== input.memberId || existing.authUserId !== input.authUserId)) {
      return { ok: false, reason: "revoked" };
    }
    if (sec.locked) {
      if (existing && !existing.revokedAt)
        await this.kv.put(key, { ...existing, revokedAt: input.nowMs, revokedReason: "locked" });
      return { ok: false, reason: "locked" };
    }
    if (existing?.revokedAt) {
      return {
        ok: false,
        reason:
          existing.revokedReason === "idle" ? "idle" : existing.revokedReason === "expired" ? "expired" : "revoked",
      };
    }

    const authTime = input.authTimeMs ?? existing?.createdAt ?? input.nowMs;
    if (sec.revokedBefore && authTime < sec.revokedBefore) {
      if (existing) await this.kv.put(key, { ...existing, revokedAt: input.nowMs, revokedReason: "revoke_all" });
      return { ok: false, reason: "revoked" };
    }

    if (existing) {
      if (input.nowMs - existing.lastSeenAt > input.idleSeconds * 1000) {
        await this.kv.put(key, { ...existing, revokedAt: input.nowMs, revokedReason: "idle" });
        return { ok: false, reason: "idle" };
      }
      if (input.nowMs - existing.createdAt > input.maxAgeSeconds * 1000) {
        await this.kv.put(key, { ...existing, revokedAt: input.nowMs, revokedReason: "expired" });
        return { ok: false, reason: "expired" };
      }
      if (input.nowMs - existing.lastSeenAt > TOUCH_INTERVAL_MS) {
        existing.lastSeenAt = input.nowMs;
        await this.kv.put(key, existing);
      }
      return { ok: true, session: existing, isNew: false };
    }

    // A session id we have never seen: only accept it if the sign-in is recent.
    // This stops an old, previously-unseen token from starting a session long after sign-in.
    if (input.authTimeMs !== undefined && input.nowMs - input.authTimeMs > input.maxAgeSeconds * 1000) {
      return { ok: false, reason: "expired" };
    }
    const session: SessionRecord = {
      id: input.sessionId,
      memberId: input.memberId,
      authUserId: input.authUserId,
      label: input.label,
      createdAt: input.authTimeMs ?? input.nowMs,
      lastSeenAt: input.nowMs,
    };
    await this.kv.put(key, session);
    await this.recordEvent({
      id: `evt_${input.nowMs}_${input.sessionId.slice(0, 8)}`,
      at: input.nowMs,
      actorId: input.memberId,
      action: "security.new_sign_in",
      summary: `Signed in on a device: ${input.label}`,
    });
    return { ok: true, session, isNew: true };
  }

  async getSession(sessionId: string) {
    return (await this.kv.get<SessionRecord>(`session:${sessionId}`)) ?? null;
  }

  async listSessions(nowMs: number, idleSeconds: number, currentSessionId: string): Promise<DeviceSession[]> {
    const all = await this.kv.list<SessionRecord>({ prefix: "session:" });
    const weekAgo = nowMs - 7 * 86_400_000;
    return [...all.values()]
      .filter((s) => {
        const idle = !s.revokedAt && nowMs - s.lastSeenAt > idleSeconds * 1000;
        if (idle) return false;
        return !s.revokedAt || s.revokedAt > weekAgo;
      })
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((s) => ({
        id: s.id,
        memberId: s.memberId,
        label: s.label,
        createdAt: new Date(s.createdAt).toISOString(),
        lastSeenAt: new Date(s.lastSeenAt).toISOString(),
        current: s.id === currentSessionId,
        revokedAt: s.revokedAt ? new Date(s.revokedAt).toISOString() : undefined,
      }));
  }

  /** Members may revoke only their OWN sessions. Other members go through emergency requests. */
  async revokeSession(
    sessionId: string,
    actorMemberId: string,
    nowMs: number,
    reason: "signed_out" | "revoked" = "revoked",
  ) {
    const s = await this.getSession(sessionId);
    if (!s) throw new SecurityError("not_found", "Session not found");
    if (s.memberId !== actorMemberId) throw new SecurityError("forbidden", "You can only sign out your own devices");
    if (s.revokedAt) return;
    await this.kv.put(`session:${sessionId}`, {
      ...s,
      revokedAt: nowMs,
      revokedBy: actorMemberId,
      revokedReason: reason,
    });
    if (reason === "revoked") {
      await this.recordEvent({
        id: `evt_${nowMs}_${sessionId.slice(0, 8)}`,
        at: nowMs,
        actorId: actorMemberId,
        action: "security.session_revoked",
        summary: `Signed out a device: ${s.label}`,
      });
    }
  }

  async revokeAllForMember(memberId: string, actorMemberId: string, nowMs: number) {
    const sec = await this.member(memberId);
    sec.revokedBefore = nowMs + 1;
    await this.saveMember(sec);
    const all = await this.kv.list<SessionRecord>({ prefix: "session:" });
    for (const s of all.values()) {
      if (s.memberId === memberId && !s.revokedAt) {
        await this.kv.put(`session:${s.id}`, {
          ...s,
          revokedAt: nowMs,
          revokedBy: actorMemberId,
          revokedReason: "revoke_all",
        });
      }
    }
  }

  async memberStatuses(memberIds: string[]) {
    const out: Record<string, { locked: boolean; authUserId?: string }> = {};
    for (const id of memberIds) {
      const m = await this.member(id);
      out[id] = { locked: Boolean(m.locked), authUserId: m.authUserId };
    }
    return out;
  }

  private async expire(req: EmergencyRequest, nowMs: number): Promise<EmergencyRequest> {
    if (req.status === "pending" && Date.parse(req.expiresAt) <= nowMs) {
      req.status = "expired";
      await this.kv.put(`emergency:${req.id}`, req);
    }
    return req;
  }

  async createEmergency(input: {
    kind: "lock" | "unlock";
    targetMemberId: string;
    requestedBy: string;
    reason: string;
    nowMs: number;
    memberIds: string[];
    newId: string;
  }): Promise<EmergencyRequest> {
    const { kind, targetMemberId, requestedBy, nowMs } = input;
    if (!input.memberIds.includes(targetMemberId)) throw new SecurityError("not_found", "Member not found");
    if (targetMemberId === requestedBy) {
      throw new SecurityError("invalid", "To protect your own account, use “Sign out everywhere” instead.");
    }
    const eligible = input.memberIds.filter((m) => m !== targetMemberId);
    if (eligible.length < APPROVALS_REQUIRED) {
      throw new SecurityError("invalid", "There aren't enough family members to approve this.");
    }
    const target = await this.member(targetMemberId);
    if (kind === "lock" && target.locked) throw new SecurityError("invalid", "This account is already paused.");
    if (kind === "unlock" && !target.locked) throw new SecurityError("invalid", "This account isn't paused.");
    for (const req of await this.listEmergencies(nowMs)) {
      if (req.status === "pending" && req.targetMemberId === targetMemberId && req.kind === kind) {
        throw new SecurityError("invalid", "A request for this is already waiting for approval.");
      }
    }
    const req: EmergencyRequest = {
      id: input.newId,
      kind,
      targetMemberId,
      requestedBy,
      approvals: [requestedBy],
      reason: input.reason.slice(0, 500),
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + EMERGENCY_TTL_MS).toISOString(),
      status: "pending",
    };
    await this.kv.put(`emergency:${req.id}`, req);
    await this.recordEvent({
      id: `evt_${nowMs}_${req.id.slice(0, 8)}`,
      at: nowMs,
      actorId: requestedBy,
      action: `security.emergency_${kind}_requested`,
      summary:
        kind === "lock" ? "Asked to pause a family member's account" : "Asked to unpause a family member's account",
      targetMemberId,
    });
    return req;
  }

  async approveEmergency(
    id: string,
    approverId: string,
    nowMs: number,
    memberIds: string[],
  ): Promise<EmergencyRequest> {
    const stored = await this.kv.get<EmergencyRequest>(`emergency:${id}`);
    if (!stored) throw new SecurityError("not_found", "Request not found");
    const req = await this.expire(stored, nowMs);
    if (req.status !== "pending") throw new SecurityError("invalid", "This request is no longer waiting for approval.");
    if (approverId === req.targetMemberId)
      throw new SecurityError("forbidden", "You can't approve a request about your own account.");
    if (!memberIds.includes(approverId)) throw new SecurityError("forbidden", "Not a family member");
    if (req.approvals.includes(approverId)) throw new SecurityError("invalid", "You've already approved this.");
    req.approvals.push(approverId);

    if (req.approvals.length >= APPROVALS_REQUIRED) {
      const target = await this.member(req.targetMemberId);
      if (req.kind === "lock") {
        target.locked = true;
        target.lockedAt = nowMs;
        await this.saveMember(target);
        await this.revokeAllForMember(req.targetMemberId, approverId, nowMs);
      } else {
        // Unpause: old sessions stay dead and the sign-in binding is cleared,
        // so the member signs in fresh (and can re-bind a recreated identity).
        target.locked = false;
        target.revokedBefore = nowMs + 1;
        if (target.authUserId) await this.kv.delete(`bind:${target.authUserId}`);
        delete target.authUserId;
        await this.saveMember(target);
      }
      req.status = "completed";
      req.completedAt = new Date(nowMs).toISOString();
      await this.recordEvent({
        id: `evt_${nowMs}_${req.id.slice(0, 8)}_done`,
        at: nowMs,
        actorId: approverId,
        action: `security.emergency_${req.kind}_completed`,
        summary:
          req.kind === "lock"
            ? "A family member's account was paused and signed out everywhere"
            : "A family member's account was unpaused",
        targetMemberId: req.targetMemberId,
      });
    }
    await this.kv.put(`emergency:${id}`, req);
    return req;
  }

  async cancelEmergency(id: string, actorId: string, nowMs: number): Promise<EmergencyRequest> {
    const req = await this.kv.get<EmergencyRequest>(`emergency:${id}`);
    if (!req) throw new SecurityError("not_found", "Request not found");
    if (req.status !== "pending") throw new SecurityError("invalid", "This request is no longer waiting for approval.");
    // The target cannot cancel a pause request (a thief holding their phone could otherwise block it).
    if (actorId === req.targetMemberId && req.kind === "lock") {
      throw new SecurityError("forbidden", "Please ask another family member to cancel this.");
    }
    req.status = "cancelled";
    await this.kv.put(`emergency:${id}`, req);
    await this.recordEvent({
      id: `evt_${nowMs}_${req.id.slice(0, 8)}_cancel`,
      at: nowMs,
      actorId,
      action: "security.emergency_cancelled",
      summary: "Cancelled a family security request",
      targetMemberId: req.targetMemberId,
    });
    return req;
  }

  async listEmergencies(nowMs: number): Promise<EmergencyRequest[]> {
    const all = await this.kv.list<EmergencyRequest>({ prefix: "emergency:" });
    const out: EmergencyRequest[] = [];
    for (const r of all.values()) out.push(await this.expire(r, nowMs));
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50);
  }

  /** Fixed-window counter. */
  async rateLimit(key: string, limit: number, windowSeconds: number, nowMs: number) {
    const k = `rl:${key}`;
    const windowMs = windowSeconds * 1000;
    const entry = (await this.kv.get<{ start: number; count: number }>(k)) ?? { start: nowMs, count: 0 };
    if (nowMs - entry.start >= windowMs) {
      entry.start = nowMs;
      entry.count = 0;
    }
    entry.count += 1;
    await this.kv.put(k, entry);
    const allowed = entry.count <= limit;
    return { allowed, retryAfterSeconds: allowed ? 0 : Math.ceil((entry.start + windowMs - nowMs) / 1000) };
  }

  async recordEvent(event: SecurityEvent) {
    await this.kv.put(`event:${String(event.at).padStart(15, "0")}:${event.id}`, event);
    // Keep the most recent 1000 events.
    const all = await this.kv.list<SecurityEvent>({ prefix: "event:" });
    if (all.size > 1000) {
      const excess = [...all.keys()].slice(0, all.size - 1000);
      for (const k of excess) await this.kv.delete(k);
    }
  }

  async listEvents(limit: number) {
    const all = await this.kv.list<SecurityEvent>({ prefix: "event:" });
    return [...all.values()].reverse().slice(0, limit);
  }
}
