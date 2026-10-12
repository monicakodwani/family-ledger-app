import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Eye, EyeOff, KeyRound, LockKeyhole, Phone } from "lucide-react";
import {
  PASSWORD_MANAGER_HOMES,
  displayHost,
  hasRevealableAccess,
  passwordManagerHref,
  safeHref,
  type AccessDetails,
  type Account,
} from "@family-ledger/shared";
import { useSignedIn } from "../auth/AuthProvider";
import { useSensitive } from "../auth/ReauthProvider";
import { useErrorToast } from "../data/hooks";
import { Button } from "./ui/button";

export const REVEAL_SECONDS = 60;

/** Reveal unmasked sign-in details (fresh auth + audited); hides itself after 60 seconds. */
export function useReveal(accountId: string) {
  const { client } = useSignedIn();
  const sensitive = useSensitive();
  const showError = useErrorToast();
  const [access, setAccess] = useState<AccessDetails | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!access) return;
    const started = Date.now();
    setRemaining(REVEAL_SECONDS);
    const timer = window.setInterval(() => {
      const left = REVEAL_SECONDS - Math.floor((Date.now() - started) / 1000);
      if (left <= 0) {
        setAccess(null);
        setRemaining(0);
        window.clearInterval(timer);
      } else setRemaining(left);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [access]);

  // Never keep revealed details around when leaving the page.
  useEffect(() => () => setAccess(null), [accountId]);

  const reveal = async () => {
    setBusy(true);
    try {
      const res = await sensitive(() => client.revealAccess(accountId));
      setAccess(res.access);
      return res.access;
    } catch (err) {
      showError(err);
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { access, remaining, busy, reveal, hide: () => setAccess(null) };
}

function ExternalButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line-strong bg-card px-4 py-2.5 font-semibold text-accent no-underline hover:bg-cream"
    >
      <span className="min-w-0 break-words">{children}</span>
      <ExternalLink aria-hidden className="size-5 shrink-0" />
    </a>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="py-2.5">
      <dt className="text-[0.9375rem] text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium break-words tabular">{value}</dd>
    </div>
  );
}

export function AccessSection({ account }: { account: Account }) {
  const masked = account.access;
  const { access: revealed, remaining, busy, reveal, hide } = useReveal(account.id);
  const shown = revealed ?? masked;
  const website = safeHref(masked.officialWebsite);
  const login = safeHref(masked.loginUrl);
  const pm = masked.passwordManager;
  const pmHref = pm ? passwordManagerHref(pm.provider, pm.itemUrl) : null;
  const pmName =
    pm && (pm.provider === "bitwarden" || pm.provider === "1password")
      ? PASSWORD_MANAGER_HOMES[pm.provider].name
      : "password manager";
  const canReveal = hasRevealableAccess(masked);
  const authenticator = { yes: "Yes", no: "No", unknown: "" }[masked.authenticator];

  return (
    <div className="space-y-4">
      {(website || login) && (
        <div className="space-y-2">
          {website && <ExternalButton href={website}>Official website · {displayHost(website)}</ExternalButton>}
          {login && login !== website && (
            <ExternalButton href={login}>Sign-in page · {displayHost(login)}</ExternalButton>
          )}
        </div>
      )}

      {canReveal ? (
        <div className="rounded-xl bg-cream px-4 py-2">
          <dl className="divide-y divide-line">
            <Detail label="Username or customer ID" value={shown.usernameHint} />
            <Detail label="Registered email" value={shown.registeredEmail} />
            <Detail label="Registered phone" value={shown.registeredPhone} />
            <Detail label="OTP goes to" value={shown.otpDestination} />
            <Detail label="Uses an authenticator app" value={authenticator} />
          </dl>
          {shown.contacts.length > 0 && (
            <div className="border-t border-line py-3">
              <p className="text-[0.9375rem] text-muted">People to contact</p>
              <ul className="mt-1 space-y-2">
                {shown.contacts.map((c) => (
                  <li key={c.id}>
                    <p className="font-medium">
                      {c.name}
                      {c.role && <span className="font-normal text-muted"> · {c.role}</span>}
                    </p>
                    {c.phone && (
                      <p className="text-[0.9375rem] tabular">
                        {revealed ? (
                          <a
                            href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                            className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent"
                          >
                            <Phone aria-hidden className="size-4" /> {c.phone}
                          </a>
                        ) : (
                          c.phone
                        )}
                      </p>
                    )}
                    {c.email && <p className="text-[0.9375rem] break-words">{c.email}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="border-t border-line py-3">
            {revealed ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p role="status" className="text-[0.9375rem] text-muted">
                  Showing for {remaining} more seconds
                </p>
                <Button variant="secondary" size="sm" onClick={hide}>
                  <EyeOff aria-hidden className="size-4" /> Hide details
                </Button>
              </div>
            ) : (
              <Button variant="secondary" block onClick={() => void reveal()} disabled={busy}>
                <Eye aria-hidden className="size-5" /> {busy ? "Checking…" : "Show details"}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted">No sign-in details recorded yet.</p>
      )}

      {pm && pm.provider !== "none" && (
        <div className="rounded-xl border border-line px-4 py-3">
          <p className="flex items-center gap-2 font-semibold">
            <KeyRound aria-hidden className="size-5 text-accent" /> Password is in {pmName}
          </p>
          {pm.itemReference && <p className="mt-1 text-muted">Look for: “{pm.itemReference}”</p>}
          {pm.instructions && <p className="mt-1 text-muted">{pm.instructions}</p>}
          {pmHref && (
            <div className="mt-3">
              <ExternalButton href={pmHref}>Open {pmName}</ExternalButton>
            </div>
          )}
        </div>
      )}

      <p className="flex items-start gap-2.5 rounded-xl bg-accent-soft px-4 py-3 text-ink">
        <LockKeyhole aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
        Passwords and OTPs are not stored here. Keep them in your password manager.
      </p>
    </div>
  );
}
