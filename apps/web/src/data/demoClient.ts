/**
 * DemoLedgerClient — runs entirely in browser memory with FICTIONAL data.
 * Nothing is written to localStorage, IndexedDB or any cache; everything
 * resets when the page reloads. Loaded only in demo builds (see client.ts).
 */
import {
  DEMO_SAMPLE_AMOUNTS,
  DomainError,
  FRIENDLY_ERRORS,
  LedgerClientError,
  applyCommand,
  chainEntries,
  createSeedState,
  draftToInput,
  maskAuditEntry,
  searchAudit,
  seedCommands,
  toLedgerView,
  todayIST,
  verifyChain,
  type AccessDetails,
  type ApiErrorCode,
  type AuditEntry,
  type AuditInput,
  type AuditPage,
  type Command,
  type CommandResponse,
  type DeviceSession,
  type EmergencyRequest,
  type LedgerResponse,
  type LedgerState,
  type RevealResponse,
  type SecurityOverview,
  type SessionInfo,
  type SnapshotMeta,
} from "@family-ledger/shared";
import type { AppClient, DemoControls, SessionEndCode } from "./types";

const FRESH_AUTH_SECONDS = 5 * 60;
const APPROVALS_REQUIRED = 2;
const PAGE_SIZE = 50;

/** Clearly fictional sign-in details so masking and "Show details" can be tried. */
const DEMO_ACCESS: Record<string, Partial<AccessDetails>> = {
  acc_rohit_portfolio: {
    officialWebsite: "https://groww.in/",
    loginUrl: "https://groww.in/login",
    usernameHint: "family.demo.user",
    registeredEmail: "family.demo@example.com",
    registeredPhone: "+91 90000 00001",
    otpDestination: "+91 90000 00001",
    authenticator: "no",
    passwordManager: { provider: "bitwarden", itemReference: "Groww — family (example)" },
    statementInstructions: "Example: open the Groww app → Profile → Reports → Holdings statement.",
    contacts: [
      {
        id: "c_demo_rohit",
        name: "Rohit (example)",
        role: "Looks after this portfolio",
        phone: "+91 90000 00002",
        email: "rohit.demo@example.com",
      },
    ],
  },
  acc_icici_mf: {
    officialWebsite: "https://www.icicidirect.com/",
    registeredEmail: "chandra.demo@example.com",
    registeredPhone: "+91 90000 00003",
    otpDestination: "chandra.demo@example.com",
    authenticator: "unknown",
    passwordManager: { provider: "1password", itemReference: "ICICI Direct (example)" },
    contacts: [],
  },
  acc_sbi_insurance: {
    officialWebsite: "https://www.sbilife.co.in/",
    usernameHint: "SBIL-DEMO-0001",
    otpDestination: "+91 90000 00004",
    authenticator: "unknown",
    contacts: [{ id: "c_demo_agent", name: "Insurance advisor (example)", role: "Agent", phone: "+91 90000 00005" }],
  },
};

const OTHER_DEVICES: Record<string, string> = {
  m_mumma: "Neeta's iPhone",
  m_papa: "Chandra's iPad",
  m_me: "Monica's laptop",
};

interface Snapshot {
  meta: SnapshotMeta;
  state: LedgerState;
}

export interface DemoOptions {
  now?: () => Date;
  latencyMs?: number;
  idleTimeoutSeconds?: number;
}

let idCounter = 0;
function demoId(prefix = "d"): string {
  idCounter += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}${idCounter}`;
}

function clientError(code: ApiErrorCode, message?: string, current?: unknown): LedgerClientError {
  return new LedgerClientError(code, message ?? FRIENDLY_ERRORS[code], current);
}

export class DemoLedgerClient implements AppClient, DemoControls {
  readonly mode = "demo" as const;
  readonly isDemo = true as const;

  private state!: LedgerState;
  private audit: AuditEntry[] = [];
  private sessions: DeviceSession[] = [];
  private emergencies: EmergencyRequest[] = [];
  private snapshots: Snapshot[] = [];
  private memberId: string | null = null;
  private sessionId: string | null = null;
  private freshUntil = 0;
  private sampleAmountsAdded = false;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly ready: Promise<void>;
  private sessionEndedHandler: ((code: SessionEndCode) => void) | null = null;
  private readonly now: () => Date;
  private readonly latencyMs: number;
  private readonly idleTimeoutSeconds: number;

  constructor(options: DemoOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.latencyMs = options.latencyMs ?? 0;
    this.idleTimeoutSeconds = options.idleTimeoutSeconds ?? 15 * 60;
    this.ready = this.init();
  }

  /* ------------------------------ setup ------------------------------ */

  private async init() {
    let state = createSeedState();
    state = {
      ...state,
      accounts: state.accounts.map((a) => {
        const extra = DEMO_ACCESS[a.id];
        return extra ? { ...a, access: { ...a.access, ...extra, contacts: extra.contacts ?? a.access.contacts } } : a;
      }),
    };
    const commands = seedCommands();
    const start = this.now().getTime() - (commands.length + 1) * 26 * 3_600_000;
    const inputs: AuditInput[] = [];
    commands.forEach(({ actor, command }, i) => {
      const at = new Date(start + i * 26 * 3_600_000).toISOString();
      const result = applyCommand(state, command, { actorId: actor, now: at, newId: () => demoId() });
      state = result.state;
      inputs.push(...result.audit.map((d) => draftToInput(d, actor, at)));
    });
    this.state = state;
    this.audit = await chainEntries(inputs, null, () => demoId("audit"));
    const created = new Date(start - 30 * 86_400_000).toISOString();
    const seen = new Date(this.now().getTime() - 2 * 86_400_000).toISOString();
    this.sessions = Object.entries(OTHER_DEVICES).map(([memberId, label]) => ({
      id: demoId("sess"),
      memberId,
      label,
      createdAt: created,
      lastSeenAt: seen,
      current: false,
    }));
  }

  private async delay() {
    await this.ready;
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  /** Serialise anything that changes state so audit hashes chain in order. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private requireMember(): string {
    if (!this.memberId) throw clientError("unauthenticated");
    const session = this.sessions.find((s) => s.id === this.sessionId);
    if (!session || session.revokedAt) {
      this.memberId = null;
      throw clientError("session_revoked");
    }
    const member = this.state.members.find((m) => m.id === this.memberId);
    if (member?.status === "locked") {
      this.endSession("member_locked");
      throw clientError("member_locked");
    }
    session.lastSeenAt = this.nowIso();
    return this.memberId;
  }

  private requireFresh() {
    if (this.now().getTime() > this.freshUntil) throw clientError("reauth_required");
  }

  private endSession(code: SessionEndCode) {
    const session = this.sessions.find((s) => s.id === this.sessionId);
    if (session && !session.revokedAt) session.revokedAt = this.nowIso();
    this.memberId = null;
    this.sessionId = null;
    this.freshUntil = 0;
    if (code !== "signed_out") this.sessionEndedHandler?.(code);
  }

  private async appendAudit(inputs: AuditInput[]) {
    const last = this.audit[this.audit.length - 1];
    const chained = await chainEntries(inputs, last ? { seq: last.seq, hash: last.hash } : null, () => demoId("audit"));
    this.audit.push(...chained);
  }

  private async securityAudit(action: string, summary: string, extra: Partial<AuditInput> = {}) {
    await this.appendAudit([
      {
        at: this.nowIso(),
        actorId: this.memberId ?? "m_me",
        category: "security",
        action,
        summary,
        changes: [],
        ...extra,
      },
    ]);
  }

  private memberName(id: string): string {
    return this.state.members.find((m) => m.id === id)?.displayName ?? "A family member";
  }

  private applyAs(actorId: string, command: Command) {
    const at = this.nowIso();
    try {
      const result = applyCommand(this.state, command, { actorId, now: at, newId: () => demoId() });
      return { result, inputs: result.audit.map((d) => draftToInput(d, actorId, at)) };
    } catch (err) {
      if (err instanceof DomainError) {
        const code: ApiErrorCode = err.code === "not_allowed" ? "forbidden" : err.code;
        throw clientError(code, err.friendly, err.current);
      }
      throw clientError("internal");
    }
  }

  /* ------------------------------ demo controls ------------------------------ */

  setSessionEndedHandler(handler: ((code: SessionEndCode) => void) | null) {
    this.sessionEndedHandler = handler;
  }

  async listSignInMembers() {
    await this.ready;
    return this.state.members.map((m) => ({ id: m.id, displayName: m.displayName, status: m.status }));
  }

  async signIn(memberId: string): Promise<SessionInfo> {
    await this.delay();
    const member = this.state.members.find((m) => m.id === memberId);
    if (!member) throw clientError("not_a_member");
    if (member.status === "locked") throw clientError("member_locked");
    const now = this.nowIso();
    const session: DeviceSession = {
      id: demoId("sess"),
      memberId,
      label: "This device",
      createdAt: now,
      lastSeenAt: now,
      current: true,
    };
    this.sessions.push(session);
    this.memberId = memberId;
    this.sessionId = session.id;
    this.freshUntil = 0;
    await this.exclusive(() => this.securityAudit("session.signIn", `Signed in on a new device (demo)`));
    return this.getSession();
  }

  confirmFreshAuth() {
    if (this.memberId) this.freshUntil = this.now().getTime() + FRESH_AUTH_SECONDS * 1000;
  }

  hasSampleAmounts() {
    return this.sampleAmountsAdded;
  }

  async fillSampleAmounts(): Promise<number> {
    await this.delay();
    const actor = this.requireMember();
    return this.exclusive(async () => {
      const today = todayIST(this.now());
      const earlier = todayIST(new Date(this.now().getTime() - 92 * 86_400_000));
      let count = 0;
      for (const sample of DEMO_SAMPLE_AMOUNTS) {
        if (!this.state.accounts.some((a) => a.id === sample.accountId)) continue;
        const valuations: Array<{ amountMinor: string; date: string }> = [];
        if (sample.confidence === "verified") {
          // An earlier fictional amount so value history can be explored.
          valuations.push({ amountMinor: ((BigInt(sample.amountMinor) * 94n) / 100n).toString(), date: earlier });
        }
        valuations.push({ amountMinor: sample.amountMinor, date: today });
        for (const v of valuations) {
          const { result, inputs } = this.applyAs(actor, {
            type: "valuation.add",
            accountId: sample.accountId,
            valuation: {
              amountMinor: v.amountMinor,
              valuationDate: v.date,
              source: sample.confidence === "verified" ? "statement" : "estimate",
              sourceNote: "Fictional sample number (demo only)",
              confidence: sample.confidence,
            },
            reason: "Demo: sample amounts",
          });
          this.state = result.state;
          await this.appendAudit(inputs);
          count += 1;
        }
      }
      this.sampleAmountsAdded = true;
      return count;
    });
  }

  /* ------------------------------ LedgerClient ------------------------------ */

  async getSession(): Promise<SessionInfo> {
    await this.delay();
    const memberId = this.requireMember();
    const member = this.state.members.find((m) => m.id === memberId)!;
    const session = this.sessions.find((s) => s.id === this.sessionId)!;
    return {
      mode: "demo",
      member: { id: member.id, personId: member.personId, displayName: member.displayName },
      session: { id: session.id, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, isNewDevice: false },
      freshAuthRemainingSeconds: Math.max(0, Math.floor((this.freshUntil - this.now().getTime()) / 1000)),
      idleTimeoutSeconds: this.idleTimeoutSeconds,
    };
  }

  async getLedger(): Promise<LedgerResponse> {
    await this.delay();
    this.requireMember();
    return { ledger: toLedgerView(structuredClone(this.state)), revision: this.state.revision };
  }

  async sendCommand(command: Command): Promise<CommandResponse> {
    await this.delay();
    const actor = this.requireMember();
    return this.exclusive(async () => {
      const { result, inputs } = this.applyAs(actor, command);
      this.state = result.state;
      if (inputs.length) await this.appendAudit(inputs);
      return {
        ledger: toLedgerView(structuredClone(this.state)),
        revision: this.state.revision,
        entityId: result.entityId,
      };
    });
  }

  async getAudit(params: { q?: string; entityId?: string; cursor?: string } = {}): Promise<AuditPage> {
    await this.delay();
    this.requireMember();
    let entries = [...this.audit].reverse();
    if (params.entityId) entries = entries.filter((e) => e.entityId === params.entityId);
    if (params.q) entries = searchAudit(entries, params.q);
    const offset = params.cursor ? Number(params.cursor) || 0 : 0;
    const page = entries.slice(offset, offset + PAGE_SIZE);
    const chain = await verifyChain(this.audit);
    return {
      // Same as the real API: access details in change history are always masked.
      entries: structuredClone(page).map((e) => maskAuditEntry(e)),
      nextCursor: offset + PAGE_SIZE < entries.length ? String(offset + PAGE_SIZE) : undefined,
      chainVerified: chain.ok,
    };
  }

  async revealAccess(accountId: string): Promise<RevealResponse> {
    await this.delay();
    this.requireMember();
    this.requireFresh();
    const account = this.state.accounts.find((a) => a.id === accountId);
    if (!account) throw clientError("not_found");
    await this.exclusive(() =>
      this.securityAudit("access.reveal", `Viewed sign-in details for “${account.displayName}”`, {
        entityType: "account",
        entityId: account.id,
        entityLabel: account.displayName,
      }),
    );
    return { access: structuredClone(account.access) };
  }

  async getSecurity(): Promise<SecurityOverview> {
    await this.delay();
    this.requireMember();
    const now = this.now().toISOString();
    for (const req of this.emergencies) {
      if (req.status === "pending" && req.expiresAt < now) req.status = "expired";
    }
    return {
      sessions: structuredClone(
        this.sessions
          // Like the real API: everyone's active devices are visible; only your own can be signed out.
          .filter((s) => !s.revokedAt)
          .map((s) => ({ ...s, current: s.id === this.sessionId })),
      ),
      members: this.state.members.map((m) => ({ id: m.id, displayName: m.displayName, status: m.status })),
      emergencyRequests: structuredClone([...this.emergencies].reverse()),
      approvalsRequired: APPROVALS_REQUIRED,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.delay();
    const memberId = this.requireMember();
    const session = this.sessions.find((s) => s.id === sessionId && s.memberId === memberId);
    if (!session) throw clientError("not_found");
    await this.exclusive(async () => {
      session.revokedAt = this.nowIso();
      await this.securityAudit("session.revoke", `Signed out “${session.label}”`);
    });
    if (sessionId === this.sessionId) this.endSession("session_revoked");
  }

  async revokeAllMySessions(): Promise<void> {
    await this.delay();
    const memberId = this.requireMember();
    this.requireFresh();
    await this.exclusive(async () => {
      for (const s of this.sessions) if (s.memberId === memberId && !s.revokedAt) s.revokedAt = this.nowIso();
      await this.securityAudit("session.revokeAll", "Signed out of Family Ledger on every device");
    });
    this.endSession("session_revoked");
  }

  async createEmergency(body: {
    kind: "lock" | "unlock";
    targetMemberId: string;
    reason: string;
  }): Promise<EmergencyRequest> {
    await this.delay();
    const memberId = this.requireMember();
    this.requireFresh();
    const target = this.state.members.find((m) => m.id === body.targetMemberId);
    if (!target) throw clientError("not_found");
    if (!body.reason.trim()) throw clientError("invalid", "Please say briefly what happened.");
    if (body.kind === "lock" && target.status === "locked")
      throw clientError("invalid", `${target.displayName}'s access is already paused.`);
    if (body.kind === "unlock" && target.status !== "locked")
      throw clientError("invalid", `${target.displayName}'s access isn't paused.`);
    if (
      this.emergencies.some((r) => r.status === "pending" && r.targetMemberId === target.id && r.kind === body.kind)
    ) {
      throw clientError("invalid", "There's already a request waiting for approval.");
    }
    return this.exclusive(async () => {
      const now = this.now();
      const req: EmergencyRequest = {
        id: demoId("emg"),
        kind: body.kind,
        targetMemberId: target.id,
        requestedBy: memberId,
        approvals: memberId === target.id ? [] : [memberId],
        reason: body.reason.trim().slice(0, 500),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
        status: "pending",
      };
      this.emergencies.push(req);
      await this.securityAudit(
        "emergency.request",
        body.kind === "lock"
          ? `Asked to pause ${target.displayName}'s access`
          : `Asked to unpause ${target.displayName}'s access`,
        { reason: req.reason },
      );
      await this.maybeComplete(req);
      return structuredClone(req);
    });
  }

  private async maybeComplete(req: EmergencyRequest) {
    if (req.approvals.length < APPROVALS_REQUIRED) return;
    const target = this.state.members.find((m) => m.id === req.targetMemberId);
    if (!target) return;
    req.status = "completed";
    req.completedAt = this.nowIso();
    target.status = req.kind === "lock" ? "locked" : "active";
    if (req.kind === "lock") {
      for (const s of this.sessions) if (s.memberId === target.id && !s.revokedAt) s.revokedAt = this.nowIso();
    }
    await this.securityAudit(
      req.kind === "lock" ? "emergency.locked" : "emergency.unlocked",
      req.kind === "lock"
        ? `${target.displayName}'s access was paused after two approvals`
        : `${target.displayName}'s access was restored after two approvals`,
    );
  }

  async approveEmergency(id: string): Promise<EmergencyRequest> {
    await this.delay();
    const memberId = this.requireMember();
    this.requireFresh();
    const req = this.emergencies.find((r) => r.id === id);
    if (!req) throw clientError("not_found");
    if (req.status !== "pending") throw clientError("invalid", "This request is no longer waiting for approval.");
    if (req.targetMemberId === memberId)
      throw clientError("forbidden", "Someone else in the family needs to approve this.");
    if (req.approvals.includes(memberId)) throw clientError("invalid", "You've already approved this.");
    return this.exclusive(async () => {
      req.approvals.push(memberId);
      await this.securityAudit(
        "emergency.approve",
        `Approved the request about ${this.memberName(req.targetMemberId)}'s access`,
      );
      await this.maybeComplete(req);
      return structuredClone(req);
    });
  }

  async cancelEmergency(id: string): Promise<EmergencyRequest> {
    await this.delay();
    const memberId = this.requireMember();
    const req = this.emergencies.find((r) => r.id === id);
    if (!req) throw clientError("not_found");
    if (req.status !== "pending") throw clientError("invalid", "This request is no longer waiting for approval.");
    if (req.targetMemberId === memberId && req.kind === "lock") {
      throw clientError("forbidden", "Another family member needs to cancel this request.");
    }
    return this.exclusive(async () => {
      req.status = "cancelled";
      await this.securityAudit(
        "emergency.cancel",
        `Cancelled the request about ${this.memberName(req.targetMemberId)}'s access`,
      );
      return structuredClone(req);
    });
  }

  async listSnapshots(): Promise<SnapshotMeta[]> {
    await this.delay();
    this.requireMember();
    return structuredClone(this.snapshots.map((s) => s.meta).reverse());
  }

  async createSnapshot(label: string): Promise<SnapshotMeta> {
    await this.delay();
    const memberId = this.requireMember();
    this.requireFresh();
    const clean = label.trim().slice(0, 120);
    if (!clean) throw clientError("invalid", "Please give the backup a name.");
    return this.exclusive(async () => {
      const meta: SnapshotMeta = {
        id: demoId("snap"),
        createdAt: this.nowIso(),
        createdBy: memberId,
        label: clean,
        revision: this.state.revision,
      };
      this.snapshots.push({ meta, state: structuredClone(this.state) });
      await this.securityAudit("snapshot.create", `Made a backup: “${clean}”`);
      return structuredClone(meta);
    });
  }

  async restoreSnapshot(id: string): Promise<void> {
    await this.delay();
    this.requireMember();
    this.requireFresh();
    const snap = this.snapshots.find((s) => s.meta.id === id);
    if (!snap) throw clientError("not_found");
    await this.exclusive(async () => {
      const restored = structuredClone(snap.state);
      // Member security status is never rolled back by a restore.
      restored.members = structuredClone(this.state.members);
      restored.revision = this.state.revision + 1;
      restored.updatedAt = this.nowIso();
      this.state = restored;
      await this.securityAudit(
        "snapshot.restore",
        `Restored the backup “${snap.meta.label}” (the change history is kept)`,
      );
    });
  }

  async exportData(): Promise<Blob> {
    await this.delay();
    this.requireMember();
    this.requireFresh();
    await this.exclusive(() => this.securityAudit("data.export", "Downloaded a copy of the family data"));
    const payload = {
      exportedAt: this.nowIso(),
      mode: "demo",
      notice: "Demo export — all information is made up.",
      ledger: this.state,
      audit: this.audit,
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  }

  async signOut(): Promise<void> {
    await this.ready;
    if (this.memberId) {
      await this.exclusive(() => this.securityAudit("session.signOut", "Signed out"));
    }
    this.endSession("signed_out");
  }
}
