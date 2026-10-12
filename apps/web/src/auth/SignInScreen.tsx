import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CircleAlert, FlaskConical, Mail, ScanFace, ShieldCheck } from "lucide-react";
import { FRIENDLY_ERRORS, LedgerClientError } from "@family-ledger/shared";
import { Button } from "../components/ui/button";
import { Field, Input } from "../components/ui/field";
import { DemoBanner, OfflineBanner } from "../components/AppShell";
import { isDemoClient, type SessionEndCode } from "../data/types";
import { PASSKEYS_UNAVAILABLE } from "./passkeys";
import { useAuth } from "./AuthProvider";

const ENDED_MESSAGES: Record<SessionEndCode, string> = {
  idle: "You were signed out after a while without activity, to keep things private.",
  session_revoked: FRIENDLY_ERRORS.session_revoked,
  member_locked: FRIENDLY_ERRORS.member_locked,
  unauthenticated: FRIENDLY_ERRORS.unauthenticated,
  not_a_member: FRIENDLY_ERRORS.not_a_member,
  signed_out: "You're signed out.",
};

export function AppLogo({ className = "size-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" rx="112" fill="#1F5F5B" />
      <rect x="136" y="112" width="240" height="296" rx="28" fill="#FAF7F2" />
      <rect x="136" y="112" width="44" height="296" rx="20" fill="#E9DFCF" />
      <rect x="212" y="176" width="128" height="20" rx="10" fill="#1F5F5B" />
      <rect x="212" y="228" width="104" height="20" rx="10" fill="#9DB8A8" />
      <rect x="212" y="280" width="120" height="20" rx="10" fill="#9DB8A8" />
      <circle cx="276" cy="352" r="18" fill="#C9963B" />
    </svg>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-cream">
      <DemoBanner />
      <OfflineBanner />
      <main className="mx-auto flex max-w-md flex-col px-5 pt-10 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}

function EndedNotice({ reason }: { reason: SessionEndCode | null }) {
  if (!reason || reason === "signed_out") return null;
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
      <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
      <p className="leading-snug">{ENDED_MESSAGES[reason]}</p>
    </div>
  );
}

export function SignInScreen() {
  const { client } = useAuth();
  if (client && isDemoClient(client)) return <DemoSignIn />;
  return <ConnectedSignIn />;
}

function DemoSignIn() {
  const { client, signInDemo, endedReason } = useAuth();
  const [members, setMembers] = useState<Array<{ id: string; displayName: string; status: string }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (client && isDemoClient(client)) void client.listSignInMembers().then(setMembers);
  }, [client, endedReason]);

  const choose = async (id: string) => {
    setBusy(id);
    setProblem(null);
    try {
      await signInDemo(id);
    } catch (err) {
      setProblem(err instanceof LedgerClientError ? err.message : "That didn't work. Please try again.");
      setBusy(null);
    }
  };

  return (
    <Frame>
      <div className="mb-8 flex flex-col items-center text-center">
        <AppLogo />
        <h1 className="mt-5 text-[2rem] font-bold tracking-tight">Who's using Family Ledger?</h1>
        <p className="mt-2 text-muted">Tap your name to start.</p>
      </div>
      <EndedNotice reason={endedReason} />
      {problem && (
        <p role="alert" className="mb-4 rounded-2xl bg-con-bg px-4 py-3 text-con-ink">
          {problem}
        </p>
      )}
      <ul className="space-y-3">
        {members.map((m) => {
          const locked = m.status === "locked";
          return (
            <li key={m.id}>
              <button
                type="button"
                disabled={locked || busy !== null}
                onClick={() => void choose(m.id)}
                className="flex min-h-20 w-full items-center gap-4 rounded-2xl border border-line bg-card px-5 text-left shadow-card transition-colors hover:border-line-strong active:bg-cream-deep disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xl font-bold text-accent"
                >
                  {m.displayName.slice(0, 1)}
                </span>
                <span className="flex-1">
                  <span className="block text-xl font-semibold">{m.displayName}</span>
                  {locked && <span className="block text-[0.9375rem] text-muted">Paused for safety</span>}
                </span>
                {busy === m.id && <span className="text-muted">Opening…</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-8 flex items-start gap-3 rounded-2xl bg-est-bg p-4 text-est-ink">
        <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0" />
        <p className="leading-snug">
          This is a demo simulation. No real sign-in happens and all the information is made up. In the real app, each
          person signs in with Face ID on their own phone.
        </p>
      </div>
    </Frame>
  );
}

function ConnectedSignIn() {
  const { auth, completeSignIn, endedReason } = useAuth();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(() => auth?.linkProblem() ?? null);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const passkeys = auth?.passkeysAvailable() ?? false;

  const faceId = async () => {
    if (!auth) return;
    setBusy(true);
    setProblem(null);
    const result = await auth.signInWithPasskey();
    if (!result.ok) {
      setProblem(result.message);
      setBusy(false);
      return;
    }
    try {
      await completeSignIn();
    } catch (err) {
      setProblem(err instanceof LedgerClientError ? err.message : FRIENDLY_ERRORS.internal);
      setBusy(false);
    }
  };

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setProblem("Please check the email address.");
      return;
    }
    setBusy(true);
    setProblem(null);
    const result = await auth.sendEmailLink(email);
    setBusy(false);
    if (result.ok) setSent(true);
    else setProblem(result.message);
  };

  return (
    <Frame>
      <div className="mb-8 flex flex-col items-center text-center">
        <AppLogo className="size-20" />
        <h1 className="mt-5 text-[2rem] font-bold tracking-tight">Family Ledger</h1>
      </div>
      <EndedNotice reason={endedReason} />
      {problem && (
        <p role="alert" className="mb-4 rounded-2xl bg-con-bg px-4 py-3 text-con-ink">
          {problem}
        </p>
      )}
      {sent ? (
        <div role="status" className="rounded-2xl border border-line bg-card p-6 text-center shadow-card">
          <Mail aria-hidden className="mx-auto size-10 text-accent" />
          <h2 className="mt-3 text-xl font-bold">Check your email</h2>
          <p className="mt-2 text-muted">
            If this address belongs to our family, a sign-in link is on its way. Open it on this phone to sign in.
          </p>
          <Button variant="ghost" className="mt-4" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Button
            size="lg"
            block
            onClick={() => void faceId()}
            disabled={busy || !passkeys}
            className="min-h-16 text-lg"
          >
            <ScanFace aria-hidden className="size-6" />
            Sign in with Face ID
          </Button>
          {!passkeys && <p className="text-center text-muted">{PASSKEYS_UNAVAILABLE}</p>}
          {!showEmail ? (
            <Button variant="secondary" size="lg" block onClick={() => setShowEmail(true)}>
              <Mail aria-hidden className="size-5" />
              Email me a sign-in link
            </Button>
          ) : (
            <form
              onSubmit={(e) => void sendLink(e)}
              className="space-y-4 rounded-2xl border border-line bg-card p-5 shadow-card"
            >
              <Field label="Your email address">
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    required
                  />
                )}
              </Field>
              <Button type="submit" size="lg" block disabled={busy}>
                {busy ? "Sending…" : "Send the link"}
              </Button>
            </form>
          )}
        </div>
      )}
      <p className="mt-10 flex items-start justify-center gap-2 text-center text-[0.9375rem] text-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        Only our family can sign in. Nothing is stored on this phone.
      </p>
    </Frame>
  );
}

export function LoadingScreen({ label = "Opening Family Ledger…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-cream"
      role="status"
      aria-live="polite"
    >
      <AppLogo className="size-16 animate-pulse" />
      <p className="text-muted">{label}</p>
    </div>
  );
}

export function UnavailableScreen() {
  return (
    <Frame>
      <div className="rounded-3xl border border-line bg-card p-8 text-center shadow-card">
        <AppLogo className="mx-auto size-14" />
        <h1 className="mt-4 text-2xl font-bold">We can't reach Family Ledger</h1>
        <p className="mt-3 text-muted">{FRIENDLY_ERRORS.unavailable}</p>
        <Button size="lg" block className="mt-6" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    </Frame>
  );
}
