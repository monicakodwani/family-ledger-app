/** Minimal stand-in for the `cloudflare:workers` module in Node tests. */
export class DurableObject {
  constructor(
    public ctx: { storage: unknown },
    public env: unknown,
  ) {}
}
