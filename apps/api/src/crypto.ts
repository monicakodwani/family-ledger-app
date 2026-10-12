/**
 * Authenticated encryption for records stored in the private repository.
 *
 * - AES-256-GCM via the platform WebCrypto API (no custom crypto).
 * - A fresh random 96-bit IV per encryption.
 * - Additional authenticated data binds each ciphertext to its file path, so a
 *   ciphertext cannot be silently swapped into a different file.
 * - Each envelope names its key id, enabling rotation: old keys stay
 *   configured for decryption until every file has been re-encrypted.
 */

export interface Envelope {
  fl: 1;
  alg: "A256GCM";
  kid: string;
  iv: string;
  ct: string;
}

const te = new TextEncoder();
const td = new TextDecoder();

export function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class DecryptionError extends Error {
  constructor(message = "Record could not be decrypted") {
    super(message);
    this.name = "DecryptionError";
  }
}

export interface RecordCodec {
  encode(path: string, value: unknown): Promise<string>;
  decode(path: string, text: string): Promise<unknown>;
  readonly activeKeyId: string;
}

export class AesGcmCodec implements RecordCodec {
  private constructor(
    private keys: Map<string, CryptoKey>,
    public readonly activeKeyId: string,
  ) {}

  /**
   * @param keyMaterial JSON object {keyId: base64(32 random bytes)}
   * @param activeKeyId key used for new encryptions
   */
  static async fromConfig(keyMaterial: string, activeKeyId: string): Promise<AesGcmCodec> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(keyMaterial);
    } catch {
      throw new Error("DATA_ENCRYPTION_KEYS must be a JSON object");
    }
    if (!parsed || typeof parsed !== "object") throw new Error("DATA_ENCRYPTION_KEYS must be a JSON object");
    const keys = new Map<string, CryptoKey>();
    for (const [kid, b64] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^[a-zA-Z0-9_-]{1,32}$/.test(kid) || typeof b64 !== "string") throw new Error("Invalid key id");
      const raw = b64decode(b64);
      if (raw.length !== 32) throw new Error(`Key ${kid} must be exactly 32 bytes`);
      keys.set(kid, await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]));
      raw.fill(0);
    }
    if (!keys.has(activeKeyId)) throw new Error("Active key id not present in DATA_ENCRYPTION_KEYS");
    return new AesGcmCodec(keys, activeKeyId);
  }

  private aad(path: string) {
    return te.encode(`family-ledger:v1:${path}`);
  }

  async encode(path: string, value: unknown): Promise<string> {
    const key = this.keys.get(this.activeKeyId)!;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: this.aad(path) },
      key,
      te.encode(JSON.stringify(value)),
    );
    const env: Envelope = {
      fl: 1,
      alg: "A256GCM",
      kid: this.activeKeyId,
      iv: b64encode(iv),
      ct: b64encode(new Uint8Array(ct)),
    };
    return JSON.stringify(env);
  }

  async decode(path: string, text: string): Promise<unknown> {
    let env: Envelope;
    try {
      env = JSON.parse(text) as Envelope;
    } catch {
      throw new DecryptionError("Record is not an encryption envelope");
    }
    if (env.fl !== 1 || env.alg !== "A256GCM") throw new DecryptionError("Unknown envelope format");
    const key = this.keys.get(env.kid);
    if (!key) throw new DecryptionError(`Key ${env.kid} is not configured`);
    try {
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64decode(env.iv), additionalData: this.aad(path) },
        key,
        b64decode(env.ct),
      );
      return JSON.parse(td.decode(pt));
    } catch {
      throw new DecryptionError();
    }
  }

  keyIdOf(text: string): string | null {
    try {
      return (JSON.parse(text) as Envelope).kid ?? null;
    } catch {
      return null;
    }
  }
}

export function generateKeyBase64(): string {
  return b64encode(crypto.getRandomValues(new Uint8Array(32)));
}
