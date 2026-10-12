import { describe, expect, it } from "vitest";
import { SecurityDurableObject, durableSecurityClient } from "../src/security/durable";
import { MemoryKV } from "../src/security/engine";

/**
 * Cloudflare forbids using a Durable Object stub outside the request that
 * created it ("Cannot perform I/O on behalf of a different request"). The
 * client is cached across requests, so it must create a stub per call.
 */
describe("Durable Object security client", () => {
  function fakeNamespace() {
    const kv = new MemoryKV();
    const object = new SecurityDurableObject({ storage: kv } as never, {} as never);
    let currentRequest = 1;
    const stubs: number[] = [];
    const ns = {
      idFromName: (name: string) => name,
      get: () => {
        const createdIn = currentRequest;
        stubs.push(createdIn);
        return {
          call: (method: string, args: unknown[]) => {
            if (createdIn !== currentRequest) throw new Error("Cannot perform I/O on behalf of a different request");
            return object.call(method, args);
          },
        };
      },
    };
    return { ns, stubs, nextRequest: () => currentRequest++ };
  }

  it("works across requests and makes a fresh stub for every call", async () => {
    const { ns, stubs, nextRequest } = fakeNamespace();
    const client = durableSecurityClient(ns as unknown as DurableObjectNamespace);
    expect((await client.rateLimit("k", 5, 60, 1000)).allowed).toBe(true);
    nextRequest();
    expect((await client.rateLimit("k", 5, 60, 2000)).allowed).toBe(true);
    expect(stubs).toEqual([1, 2]);
  });

  it("only exposes allow-listed methods", async () => {
    const { ns } = fakeNamespace();
    const client = durableSecurityClient(ns as unknown as DurableObjectNamespace) as unknown as Record<string, unknown>;
    expect(client.deleteEverything).toBeUndefined();
    const object = new SecurityDurableObject({ storage: new MemoryKV() } as never, {} as never);
    await expect(object.call("constructor", [])).rejects.toThrow(/Unknown security method/);
  });
});
