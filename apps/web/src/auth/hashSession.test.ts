import { describe, expect, it, vi } from "vitest";
import { takeFragmentSession } from "./hashSession";

function fakeLocation(url: string) {
  const u = new URL(url);
  return { hash: u.hash, pathname: u.pathname, search: u.search } as Location;
}

describe("takeFragmentSession", () => {
  it("extracts invite-link tokens and strips them from the address bar", () => {
    const hist = { state: null, replaceState: vi.fn() } as unknown as History;
    const s = takeFragmentSession(
      fakeLocation("https://x.com/family-ledger-app/#access_token=aaa&refresh_token=bbb&type=invite"),
      hist,
    );
    expect(s).toEqual({ access_token: "aaa", refresh_token: "bbb" });
    expect(hist.replaceState).toHaveBeenCalledWith(null, "", "/family-ledger-app/");
  });

  it("clears error fragments (e.g. expired link) without returning a session", () => {
    const hist = { state: null, replaceState: vi.fn() } as unknown as History;
    expect(
      takeFragmentSession(fakeLocation("https://x.com/#error=access_denied&error_code=otp_expired"), hist),
    ).toBeNull();
    expect(hist.replaceState).toHaveBeenCalled();
  });

  it("ignores ordinary fragments", () => {
    const hist = { state: null, replaceState: vi.fn() } as unknown as History;
    expect(takeFragmentSession(fakeLocation("https://x.com/#section"), hist)).toBeNull();
    expect(hist.replaceState).not.toHaveBeenCalled();
  });
});
