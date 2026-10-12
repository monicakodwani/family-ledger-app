import { describe, expect, it } from "vitest";
import {
  chainEntries,
  draftToInput,
  isSafeExternalUrl,
  maskAccess,
  passwordManagerHref,
  searchAudit,
  toLedgerView,
  verifyChain,
} from "../src";
import { run, seed } from "./helpers";

let n = 0;
const nid = () => `a${++n}`;

describe("audit chain", () => {
  it("detects edits and deletions of earlier entries", async () => {
    const res = run(seed(), { type: "account.create", data: { displayName: "A", assetClass: "cash" } });
    const res2 = run(res.state, { type: "check.create", title: "Check A" });
    const inputs = [...res.audit, ...res2.audit].map((d) => draftToInput(d, "m_me", "2026-10-12T00:00:00.000Z"));
    const first = await chainEntries(inputs.slice(0, 1), null, nid);
    const second = await chainEntries(inputs.slice(1), first[0]!, nid);
    const all = [...first, ...second];
    expect(await verifyChain(all)).toEqual({ ok: true });

    const tampered = all.map((e) => (e.seq === 1 ? { ...e, summary: "Nothing happened" } : e));
    expect((await verifyChain(tampered)).ok).toBe(false);
    expect((await verifyChain(all.slice(1))).ok).toBe(false);
    expect(searchAudit(all, "check a")).toHaveLength(1);
  });
});

describe("URL validation", () => {
  it.each([
    ["https://groww.in/", true],
    ["https://www.onlinesbi.sbi/", true],
    ["http://groww.in/", false],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
    ["https://user:pass@groww.in/", false],
    ["https://localhost/", false],
    ["https://192.168.1.1/", false],
    ["https://xn--grww-8qa.in/", false],
    ["https://intranet/", false],
    ['https://groww.in/"onmouseover=', false],
    ["not a url", false],
  ])("%s → %s", (url, ok) => {
    expect(isSafeExternalUrl(url)).toBe(ok);
  });

  it("only uses password manager item links on the provider's own domain", () => {
    expect(passwordManagerHref("bitwarden", "https://evil.example.com/")).toBe("https://vault.bitwarden.com/");
    expect(passwordManagerHref("bitwarden", "https://vault.bitwarden.com/#/vault?itemId=abc")).toContain("itemId=abc");
    expect(passwordManagerHref("none")).toBeNull();
  });
});

describe("masking", () => {
  it("masks contact details and strips auth bindings from the browser view", () => {
    const masked = maskAccess({
      registeredEmail: "papa.sharma@example.com",
      registeredPhone: "+91 98765 43210",
      usernameHint: "papa1960",
      otpDestination: "SMS to 98765 43210",
      authenticator: "no",
      contacts: [{ id: "c1", name: "RM", phone: "9999912345" }],
    });
    expect(masked.registeredEmail).toBe("p•••@e•••.com");
    expect(masked.registeredPhone).toBe("•••• •• 3210");
    expect(masked.usernameHint).toBe("pa••••");
    expect(masked.otpDestination).not.toContain("98765");
    expect(masked.contacts[0]!.phone).toBe("•••• •• 2345");

    const s = seed();
    s.members[0]!.authUserId = "secret-auth-id";
    expect(JSON.stringify(toLedgerView(s))).not.toContain("secret-auth-id");
  });
});
