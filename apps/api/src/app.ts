import {
  type AuditEntry,
  DomainError,
  EmergencyCreateBody,
  type LedgerState,
  type SessionInfo,
  SnapshotCreateBody,
  toLedgerView,
  hasRevealableAccess,
  maskAuditEntry,
} from "@family-ledger/shared";
import { AuthError, type TokenVerifier, type VerifiedClaims, bearerToken, deviceLabel } from "./auth";
import type { AppConfig } from "./config";
import { HttpError, SECURITY_HEADERS, corsHeaders, errorResponse, json, logEvent, readJson } from "./http";
import type { ProviderAdmin } from "./provider-admin";
import { type SecurityEvent, SecurityError, type SecurityService, type SessionRecord } from "./security/engine";
import { LedgerService, StorageBusyError } from "./service";
import { StoreUnavailableError } from "./storage/types";

export interface AppDeps {
  config: AppConfig;
  verifier: TokenVerifier;
  security: SecurityService;
  service: LedgerService;
  providerAdmin?: ProviderAdmin;
  now?: () => number;
  newId?: () => string;
}

interface AuthContext {
  token: string;
  claims: VerifiedClaims;
  memberId: string;
  session: SessionRecord;
  isNewSession: boolean;
}

type Handler = (req: Request, ctx: AuthContext, params: Record<string, string>) => Promise<Response>;

interface Route {
  method: "GET" | "POST";
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  freshAuth?: boolean;
  limit?: { bucket: string; max: number; windowSeconds: number };
}

const ID = "([a-zA-Z0-9_-]{1,64})";

export function createApp(deps: AppDeps) {
  const { config, verifier, security, service } = deps;
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const memberIds = config.members.map((m) => m.id);

  const routes: Route[] = [];
  const route = (
    method: Route["method"],
    path: string,
    handler: Handler,
    opts: Partial<Pick<Route, "freshAuth" | "limit">> = {},
  ) => {
    const keys: string[] = [];
    const pattern = new RegExp(
      "^" +
        path.replace(/:(\w+)/g, (_m, k: string) => {
          keys.push(k);
          return ID;
        }) +
        "$",
    );
    routes.push({ method, pattern, keys, handler, ...opts });
  };

  const freshRemaining = (ctx: AuthContext) =>
    Math.max(0, Math.floor((ctx.claims.authTimeMs + config.freshAuthSeconds * 1000 - now()) / 1000));

  const memberName = (id: string) => config.members.find((m) => m.id === id)?.displayName ?? "A family member";

  const securityAudit = (actorId: string, action: string, summary: string, extra: Partial<AuditEntry> = {}) =>
    service.recordAudit([{ actorId, category: "security", action, summary, changes: [], ...extra }]);

  const ledgerBody = (state: LedgerState) => ({ ledger: toLedgerView(state), revision: state.revision });

  /* ---------------- Session ---------------- */

  route("GET", "/api/session", async (_req, ctx) => {
    const m = config.members.find((x) => x.id === ctx.memberId)!;
    const body: SessionInfo = {
      mode: "connected",
      member: { id: m.id, personId: `p_${m.id.replace(/^m_/, "")}`, displayName: m.displayName },
      session: {
        id: ctx.session.id,
        createdAt: new Date(ctx.session.createdAt).toISOString(),
        lastSeenAt: new Date(ctx.session.lastSeenAt).toISOString(),
        isNewDevice: ctx.isNewSession,
      },
      freshAuthRemainingSeconds: freshRemaining(ctx),
      idleTimeoutSeconds: config.idleTimeoutSeconds,
    };
    return json(body);
  });

  route("POST", "/api/session/sign-out", async (_req, ctx) => {
    await security.revokeSession(ctx.session.id, ctx.memberId, now(), "signed_out");
    return json({ ok: true });
  });

  /* ---------------- Ledger ---------------- */

  route("GET", "/api/ledger", async () => json(ledgerBody(await service.getState())));

  route(
    "POST",
    "/api/commands",
    async (req, ctx) => {
      const body = (await readJson(req)) as { command?: unknown };
      if (!body || typeof body !== "object" || !("command" in body)) throw new HttpError("invalid");
      const { state, entityId } = await service.execute(body.command, ctx.memberId);
      return json({ ...ledgerBody(state), entityId });
    },
    { limit: { bucket: "commands", max: 60, windowSeconds: 60 } },
  );

  route("GET", "/api/audit", async (req) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.slice(0, 100) ?? undefined;
    const entityId = url.searchParams.get("entityId") ?? undefined;
    const cursor = url.searchParams.get("cursor");
    if (entityId && !/^[a-zA-Z0-9_-]{1,64}$/.test(entityId)) throw new HttpError("invalid");
    if (cursor && !/^\d{1,10}$/.test(cursor)) throw new HttpError("invalid");
    const page = await service.getAuditHistory({ q, entityId, beforeSeq: cursor ? Number(cursor) : undefined });
    page.entries = page.entries.map(maskAuditEntry);
    // Sign-in events live in the security registry; include them on the first, unfiltered page.
    if (!entityId && !cursor) {
      const events = await security.listEvents(50);
      const asEntries = events.filter((e) => !q || e.summary.toLowerCase().includes(q.toLowerCase())).map(eventToEntry);
      page.entries = [...page.entries, ...asEntries].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 80);
    }
    return json(page);
  });

  route(
    "POST",
    "/api/accounts/:id/reveal",
    async (_req, ctx, { id }) => {
      const state = await service.getState();
      const account = state.accounts.find((a) => a.id === id);
      if (!account) throw new HttpError("not_found");
      if (hasRevealableAccess(account.access)) {
        await securityAudit(ctx.memberId, "access.reveal", `Viewed sign-in details for “${account.displayName}”`, {
          entityType: "account",
          entityId: account.id,
          entityLabel: account.displayName,
        });
      }
      return json({ access: account.access });
    },
    { freshAuth: true, limit: { bucket: "reveal", max: 30, windowSeconds: 600 } },
  );

  /* ---------------- Security ---------------- */

  route("GET", "/api/security", async (_req, ctx) => {
    const [sessions, statuses, emergencyRequests] = await Promise.all([
      security.listSessions(now(), config.idleTimeoutSeconds, ctx.session.id),
      security.memberStatuses(memberIds),
      security.listEmergencies(now()),
    ]);
    return json({
      sessions,
      members: config.members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        status: statuses[m.id]?.locked ? "locked" : statuses[m.id]?.authUserId ? "active" : "invited",
      })),
      emergencyRequests,
      approvalsRequired: 2,
    });
  });

  route("POST", "/api/security/sessions/:id/revoke", async (_req, ctx, { id }) => {
    await security.revokeSession(id!, ctx.memberId, now());
    return json({ ok: true });
  });

  route(
    "POST",
    "/api/security/revoke-all",
    async (_req, ctx) => {
      await security.revokeAllForMember(ctx.memberId, ctx.memberId, now());
      await deps.providerAdmin?.signOutEverywhere(ctx.token);
      await securityAudit(ctx.memberId, "security.revoke_all", "Signed out of Family Ledger on every device");
      return json({ ok: true });
    },
    { freshAuth: true },
  );

  route(
    "POST",
    "/api/security/emergency",
    async (req, ctx) => {
      const parsed = EmergencyCreateBody.safeParse(await readJson(req));
      if (!parsed.success) throw new HttpError("invalid");
      const result = await security.createEmergency({
        ...parsed.data,
        requestedBy: ctx.memberId,
        nowMs: now(),
        memberIds,
        newId: `em_${newId()}`,
      });
      await securityAudit(
        ctx.memberId,
        `security.emergency_${result.kind}_requested`,
        `Asked to ${result.kind === "lock" ? "pause" : "unpause"} ${memberName(result.targetMemberId)}'s account (needs a second family member)`,
        { reason: parsed.data.reason },
      );
      return json(result);
    },
    { freshAuth: true, limit: { bucket: "emergency", max: 10, windowSeconds: 3600 } },
  );

  route(
    "POST",
    "/api/security/emergency/:id/approve",
    async (_req, ctx, { id }) => {
      const result = await security.approveEmergency(id!, ctx.memberId, now(), memberIds);
      if (result.status === "completed") {
        const statuses = await security.memberStatuses([result.targetMemberId]);
        const target = statuses[result.targetMemberId];
        if (result.kind === "lock" && target?.authUserId) await deps.providerAdmin?.setBanned(target.authUserId, true);
        await securityAudit(
          ctx.memberId,
          `security.emergency_${result.kind}_completed`,
          `${memberName(result.targetMemberId)}'s account was ${result.kind === "lock" ? "paused and signed out everywhere" : "unpaused"}`,
        );
      }
      return json(result);
    },
    { freshAuth: true },
  );

  route("POST", "/api/security/emergency/:id/cancel", async (_req, ctx, { id }) => {
    return json(await security.cancelEmergency(id!, ctx.memberId, now()));
  });

  /* ---------------- Backups ---------------- */

  route("GET", "/api/snapshots", async () => json(await service.listSnapshots()));

  route(
    "POST",
    "/api/snapshots",
    async (req, ctx) => {
      const parsed = SnapshotCreateBody.safeParse(await readJson(req));
      if (!parsed.success) throw new HttpError("invalid");
      return json(await service.createSnapshot(parsed.data.label, ctx.memberId));
    },
    { freshAuth: true, limit: { bucket: "snapshot", max: 10, windowSeconds: 3600 } },
  );

  route(
    "POST",
    "/api/snapshots/:id/restore",
    async (_req, ctx, { id }) => {
      const restored = await service.restoreSnapshot(id!, ctx.memberId);
      if (!restored) throw new HttpError("not_found");
      return json({ ok: true });
    },
    { freshAuth: true, limit: { bucket: "snapshot", max: 10, windowSeconds: 3600 } },
  );

  route(
    "GET",
    "/api/export",
    async (_req, ctx) => {
      const data = await service.exportAll();
      await securityAudit(ctx.memberId, "data.export", "Downloaded a full copy of the family ledger");
      return json(data, 200, {
        "Content-Disposition": `attachment; filename="family-ledger-export-${data.exportedAt.slice(0, 10)}.json"`,
      });
    },
    { freshAuth: true, limit: { bucket: "export", max: 5, windowSeconds: 3600 } },
  );

  /* ---------------- Pipeline ---------------- */

  async function authenticate(req: Request, ip: string): Promise<AuthContext> {
    const token = bearerToken(req.headers.get("Authorization"));
    if (!token) throw new HttpError("unauthenticated");
    let claims: VerifiedClaims;
    try {
      claims = await verifier(token);
    } catch (e) {
      const rl = await security.rateLimit(`authfail:${ip}`, 30, 300, now());
      if (!rl.allowed) throw new HttpError("rate_limited", undefined, undefined, rl.retryAfterSeconds);
      throw e instanceof AuthError ? e : new HttpError("unauthenticated");
    }
    const memberId = await security.resolveMember(claims.sub, claims.email, config.members, now());
    if (!memberId) throw new HttpError("not_a_member");

    const rl = await security.rateLimit(`member:${memberId}`, 300, 60, now());
    if (!rl.allowed) throw new HttpError("rate_limited", undefined, undefined, rl.retryAfterSeconds);

    const check = await security.checkSession({
      sessionId: claims.sessionId,
      memberId,
      authUserId: claims.sub,
      authTimeMs: claims.authTimeMs,
      nowMs: now(),
      label: deviceLabel(req.headers.get("User-Agent")),
      idleSeconds: config.idleTimeoutSeconds,
      maxAgeSeconds: config.sessionMaxAgeSeconds,
    });
    if (!check.ok) throw new HttpError(check.reason === "locked" ? "member_locked" : "session_revoked");
    return { token, claims, memberId, session: check.session, isNewSession: check.isNew };
  }

  async function fetchHandler(req: Request): Promise<Response> {
    const started = now();
    const requestId = newId();
    const url = new URL(req.url);
    const origin = req.headers.get("Origin");
    const cors = corsHeaders(origin, config.allowedOrigins);
    const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
    let routeName = url.pathname;

    const finish = (res: Response, code?: string, reason?: string) => {
      for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...cors })) res.headers.set(k, v);
      res.headers.set("X-Request-Id", requestId);
      logEvent({
        requestId,
        route: `${req.method} ${routeName}`,
        status: res.status,
        code,
        reason,
        ms: now() - started,
      });
      return res;
    };

    try {
      // Browsers always send Origin on cross-origin requests; refuse unknown sites outright.
      if (origin && !config.allowedOrigins.includes(origin)) throw new HttpError("forbidden");

      if (req.method === "OPTIONS") {
        return finish(new Response(null, { status: 204 }));
      }
      if (url.pathname === "/api/health" && req.method === "GET") {
        return finish(json({ ok: true }));
      }

      const match = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
      if (!match) {
        const pathExists = routes.some((r) => r.pattern.test(url.pathname));
        throw new HttpError(pathExists ? "invalid" : "not_found");
      }
      routeName = match.pattern.source;
      const values = match.pattern.exec(url.pathname)!.slice(1);
      const params = Object.fromEntries(match.keys.map((k, i) => [k, values[i]!]));

      const ctx = await authenticate(req, ip);
      if (match.limit) {
        const rl = await security.rateLimit(
          `${match.limit.bucket}:${ctx.memberId}`,
          match.limit.max,
          match.limit.windowSeconds,
          now(),
        );
        if (!rl.allowed) throw new HttpError("rate_limited", undefined, undefined, rl.retryAfterSeconds);
      }
      if (match.freshAuth && freshRemaining(ctx) <= 0) throw new HttpError("reauth_required");

      return finish(await match.handler(req, ctx, params));
    } catch (e) {
      const err = toHttpError(e);
      return finish(
        errorResponse(err),
        err.code,
        e instanceof AuthError ? e.reason : e instanceof Error ? e.name : undefined,
      );
    }
  }

  return { fetch: fetchHandler };
}

function eventToEntry(e: SecurityEvent): AuditEntry {
  return {
    id: e.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "evt",
    seq: 0,
    at: new Date(e.at).toISOString(),
    actorId: e.actorId,
    category: "security",
    action: e.action,
    summary: e.summary,
    changes: [],
    prevHash: "",
    hash: "",
  };
}

function toHttpError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof AuthError) return new HttpError("unauthenticated");
  if (e instanceof DomainError) {
    const code = e.code === "not_allowed" ? "forbidden" : e.code;
    return new HttpError(code, e.friendly, e.code === "version_conflict" ? toLedgerSafe(e.current) : undefined);
  }
  if (e instanceof SecurityError) return new HttpError(e.code, e.message);
  if (e instanceof StorageBusyError) return new HttpError("storage_busy");
  if (e instanceof StoreUnavailableError) return new HttpError("unavailable");
  return new HttpError("internal");
}

/** Conflicting entities are returned to help the user merge; mask any access details. */
function toLedgerSafe(current: unknown): unknown {
  if (current && typeof current === "object" && "access" in current) {
    const { access: _access, ...rest } = current as Record<string, unknown>;
    return rest;
  }
  return current;
}
