import { DurableObject } from "cloudflare:workers";
import { type KV, SecurityEngine, type SecurityService } from "./engine";

type Method = keyof SecurityService;

const ALLOWED: ReadonlySet<Method> = new Set<Method>([
  "resolveMember",
  "checkSession",
  "getSession",
  "listSessions",
  "revokeSession",
  "revokeAllForMember",
  "memberStatuses",
  "createEmergency",
  "approveEmergency",
  "cancelEmergency",
  "listEmergencies",
  "rateLimit",
  "recordEvent",
  "listEvents",
]);

/** Adapts Durable Object storage to the engine's KV interface. */
class DurableKV implements KV {
  constructor(private storage: DurableObjectStorage) {}
  get<T>(key: string) {
    return this.storage.get<T>(key);
  }
  put<T>(key: string, value: T) {
    return this.storage.put(key, value);
  }
  delete(key: string) {
    return this.storage.delete(key);
  }
  list<T>(options: { prefix: string }) {
    return this.storage.list<T>({ prefix: options.prefix });
  }
}

/**
 * One instance ("family") holds the whole security registry. Durable Objects
 * process requests one at a time with strongly consistent storage, so
 * revocations take effect for the very next API request worldwide.
 */
export class SecurityDurableObject extends DurableObject {
  private engine = new SecurityEngine(new DurableKV(this.ctx.storage));

  async call(method: string, args: unknown[]): Promise<unknown> {
    if (!ALLOWED.has(method as Method)) throw new Error("Unknown security method");
    const fn = this.engine[method as Method] as (...a: unknown[]) => Promise<unknown>;
    return fn.apply(this.engine, args);
  }
}

/**
 * Worker-side client: every SecurityService call becomes one RPC to the object.
 * A Durable Object stub is an I/O object tied to the request that created it, so
 * a fresh stub is made for every call (cheap) — the client itself is cached
 * across requests and must never hold one.
 */
export function durableSecurityClient(namespace: DurableObjectNamespace): SecurityService {
  const id = namespace.idFromName("family");
  return new Proxy({} as SecurityService, {
    get(_t, prop: string) {
      if (!ALLOWED.has(prop as Method)) return undefined;
      return (...args: unknown[]) => {
        const stub = namespace.get(id) as unknown as { call(method: string, args: unknown[]): Promise<unknown> };
        return stub.call(prop, args);
      };
    },
  });
}
