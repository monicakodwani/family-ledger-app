import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  DatabaseBackup,
  Download,
  Fingerprint,
  Laptop,
  LifeBuoy,
  Lock,
  LockOpen,
  LogOut,
  Smartphone,
  TriangleAlert,
  Users,
} from "lucide-react";
import { todayIST, type EmergencyRequest, type SecurityOverview } from "@family-ledger/shared";
import { useAuth, useSignedIn } from "../auth/AuthProvider";
import { useSensitive } from "../auth/ReauthProvider";
import { qk, useErrorToast, useMe, useSecurity, useSnapshots } from "../data/hooks";
import type { PasskeyItem } from "../auth/types";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Card, EmptyState, SectionTitle } from "../components/ui/card";
import { Field, Input, Select, Textarea } from "../components/ui/field";
import { ConfirmDialog, Sheet } from "../components/ui/dialog";
import { useToast } from "../components/Toaster";
import { formatDateTime, formatDay, formatRelative, joinNames } from "../lib/format";
import { t } from "../i18n";

export default function SecurityPage() {
  const security = useSecurity();
  return (
    <div>
      <PageHeader title={t("page.security")} back="/more" />
      {security.isPending && (
        <p className="text-muted" role="status">
          Loading…
        </p>
      )}
      {security.isError && <p className="text-muted">Security details couldn't be loaded. Please try again.</p>}
      {security.data && <SecurityContent data={security.data} />}
    </div>
  );
}

function useSecurityAction() {
  const queryClient = useQueryClient();
  const sensitive = useSensitive();
  const toast = useToast();
  const showError = useErrorToast();
  return async <T,>(fn: () => Promise<T>, message: string): Promise<T | null> => {
    try {
      const result = await sensitive(fn);
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey: qk.security });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
      return result;
    } catch (err) {
      showError(err);
      return null;
    }
  };
}

function SecurityContent({ data }: { data: SecurityOverview }) {
  const { client } = useSignedIn();
  const me = useMe();
  const act = useSecurityAction();
  const [revoke, setRevoke] = useState<{ id: string; label: string; current: boolean } | null>(null);
  const [everywhere, setEverywhere] = useState(false);
  const name = (id: string) => data.members.find((m) => m.id === id)?.displayName ?? "A family member";
  const mine = data.sessions.filter((s) => s.memberId === me.id && !s.revokedAt);
  const family = data.sessions.filter((s) => s.memberId !== me.id && !s.revokedAt);
  const pending = data.emergencyRequests.filter((r) => r.status === "pending");
  const recent = data.emergencyRequests.filter((r) => r.status !== "pending").slice(0, 3);

  return (
    <>
      <SectionTitle>My devices</SectionTitle>
      <Card className="divide-y divide-line py-1">
        {mine.map((s) => {
          const Icon = /laptop|mac|pc/i.test(s.label) ? Laptop : Smartphone;
          return (
            <div key={s.id} className="py-4">
              <div className="flex items-start gap-3">
                <Icon aria-hidden className="mt-0.5 size-6 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{s.label}</p>
                  {s.current && (
                    <p className="mt-1 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-[0.8125rem] font-semibold text-accent">
                      You're using this one
                    </p>
                  )}
                  <p className="mt-1 text-[0.9375rem] text-muted">
                    Last used {formatRelative(s.lastSeenAt)} · signed in {formatDay(s.createdAt)}
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                block
                className="mt-3"
                aria-label={`Sign out this device: ${s.label}`}
                onClick={() => setRevoke({ id: s.id, label: s.label, current: s.current })}
              >
                Sign out this device
              </Button>
            </div>
          );
        })}
        {mine.length === 0 && <p className="py-3 text-muted">No devices.</p>}
      </Card>
      <Button variant="secondary" block className="mt-3" onClick={() => setEverywhere(true)}>
        <LogOut aria-hidden className="size-5" /> Sign out everywhere
      </Button>

      {family.length > 0 && (
        <>
          <SectionTitle>Family devices</SectionTitle>
          <Card className="divide-y divide-line py-1">
            {family.map((s) => (
              <div key={s.id} className="flex items-start gap-3 py-4">
                <Smartphone aria-hidden className="mt-0.5 size-6 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">
                    {name(s.memberId)} · {s.label}
                  </p>
                  <p className="mt-1 text-[0.9375rem] text-muted">Last used {formatRelative(s.lastSeenAt)}</p>
                </div>
              </div>
            ))}
          </Card>
          <p className="mt-2 text-[0.9375rem] text-muted">
            Only each person can sign out their own devices. If someone's phone is lost, use the emergency option below.
          </p>
        </>
      )}

      <SignInMethods />

      <SectionTitle>Family members</SectionTitle>
      <Card className="divide-y divide-line py-1">
        {data.members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 py-3">
            <span className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-10 items-center justify-center rounded-full bg-accent-soft font-bold text-accent"
              >
                {m.displayName.slice(0, 1)}
              </span>
              <span className="font-semibold">
                {m.displayName}
                {m.id === me.id && <span className="font-normal text-muted"> (you)</span>}
              </span>
            </span>
            <span
              className={
                m.status === "locked"
                  ? "inline-flex items-center gap-1.5 rounded-full bg-con-bg px-3 py-1 text-[0.875rem] font-semibold text-con-ink"
                  : "inline-flex items-center gap-1.5 rounded-full bg-ver-bg px-3 py-1 text-[0.875rem] font-semibold text-ver-ink"
              }
            >
              {m.status === "locked" ? (
                <Lock aria-hidden className="size-4" />
              ) : (
                <Users aria-hidden className="size-4" />
              )}
              {m.status === "locked" ? "Paused" : m.status === "invited" ? "Invited" : "Active"}
            </span>
          </div>
        ))}
      </Card>

      <Emergency data={data} pending={pending} recent={recent} name={name} />

      <Card className="mt-6 border-est-line bg-est-bg">
        <p className="flex items-start gap-2 font-semibold text-est-ink">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" /> Important
        </p>
        <p className="mt-2 text-est-ink">
          Signing out or pausing Family Ledger does <strong>not</strong> stop access to bank accounts, email, the
          password manager or the Apple ID on a lost phone. Those need separate steps.
        </p>
        <Button asChild variant="secondary" className="mt-3">
          <Link to="/help/separate-steps">See the separate steps</Link>
        </Button>
      </Card>

      <Backups />

      <ConfirmDialog
        open={Boolean(revoke)}
        onOpenChange={(o) => !o && setRevoke(null)}
        title={revoke?.current ? "Sign out this device?" : `Sign out “${revoke?.label}”?`}
        body={
          revoke?.current ? (
            <p>You're using this device now, so you'll be signed out straight away.</p>
          ) : (
            <p>That device will need to sign in again before it can see the family ledger.</p>
          )
        }
        confirmLabel="Sign it out"
        onConfirm={async () => {
          if (!revoke) return;
          const target = revoke;
          setRevoke(null);
          await act(() => client.revokeSession(target.id), `“${target.label}” was signed out.`);
        }}
      />
      <ConfirmDialog
        open={everywhere}
        onOpenChange={setEverywhere}
        title="Sign out everywhere?"
        body={
          <p>
            All your devices — including this one — will be signed out of Family Ledger. You can sign in again with Face
            ID.
          </p>
        }
        confirmLabel="Sign out everywhere"
        tone="danger"
        onConfirm={async () => {
          setEverywhere(false);
          await act(() => client.revokeAllMySessions(), "Signed out on every device.");
        }}
      />
    </>
  );
}

function SignInMethods() {
  const { auth } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<PasskeyItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<PasskeyItem | null>(null);
  const connected = auth?.kind === "connected";

  useEffect(() => {
    if (connected && auth) void auth.listPasskeys().then(setList);
  }, [auth, connected]);

  return (
    <>
      <SectionTitle>Sign-in methods</SectionTitle>
      <Card>
        {!connected ? (
          <p className="flex items-start gap-3 text-muted">
            <Fingerprint aria-hidden className="mt-0.5 size-5 shrink-0" />
            In the real app, each person signs in with Face ID (a passkey) or an email link. The demo only simulates
            this.
          </p>
        ) : list === null ? (
          <p className="text-muted">Passkeys aren't available yet — use the email link.</p>
        ) : (
          <>
            {list.length === 0 && <p className="text-muted">No Face ID passkeys yet.</p>}
            <ul className="divide-y divide-line">
              {list.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    <span className="block font-semibold">{p.name}</span>
                    <span className="block text-[0.9375rem] text-muted">
                      Added {formatDay(p.createdAt)}
                      {p.lastUsedAt ? ` · last used ${formatRelative(p.lastUsedAt)}` : ""}
                    </span>
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => setRemoving(p)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              className="mt-3"
              disabled={busy || !auth?.passkeysAvailable()}
              onClick={async () => {
                if (!auth) return;
                setBusy(true);
                const r = await auth.registerPasskey();
                setBusy(false);
                if (r.ok) {
                  toast.success("Face ID sign-in added for this device.");
                  setList(await auth.listPasskeys());
                } else toast.error(r.message);
              }}
            >
              <Fingerprint aria-hidden className="size-5" /> Add Face ID on this device
            </Button>
          </>
        )}
      </Card>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this passkey?"
        body={<p>That device won't be able to sign in with Face ID any more. You can still use the email link.</p>}
        confirmLabel="Remove passkey"
        tone="danger"
        onConfirm={async () => {
          if (!removing || !auth) return;
          const r = await auth.deletePasskey(removing.id);
          setRemoving(null);
          if (r.ok) {
            toast.success("Passkey removed.");
            setList(await auth.listPasskeys());
          } else toast.error(r.message);
        }}
      />
    </>
  );
}

function Emergency({
  data,
  pending,
  recent,
  name,
}: {
  data: SecurityOverview;
  pending: EmergencyRequest[];
  recent: EmergencyRequest[];
  name: (id: string) => string;
}) {
  const { client } = useSignedIn();
  const me = useMe();
  const act = useSecurityAction();
  const [mode, setMode] = useState<"lock" | "unlock" | null>(null);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const others = data.members.filter((m) => m.id !== me.id);
  const locked = data.members.filter((m) => m.status === "locked");
  const candidates = mode === "unlock" ? locked : others.filter((m) => m.status !== "locked");

  const submit = async () => {
    if (!mode || !target || !reason.trim()) return;
    const res = await act(
      () => client.createEmergency({ kind: mode, targetMemberId: target, reason: reason.trim() }),
      mode === "lock"
        ? "Request sent. Another family member needs to approve it."
        : "Request sent. Another family member needs to approve it.",
    );
    if (res) {
      setMode(null);
      setTarget("");
      setReason("");
    }
  };

  return (
    <>
      <SectionTitle>Emergency</SectionTitle>
      <div className="space-y-3">
        <Button
          variant="secondary"
          size="lg"
          block
          className="h-auto justify-start py-3 text-left"
          onClick={() => setMode("lock")}
        >
          <Lock aria-hidden className="size-5 shrink-0" /> A family member's phone was lost or stolen
        </Button>
        <Button
          variant="secondary"
          size="lg"
          block
          className="h-auto justify-start py-3 text-left"
          onClick={() => setLostOpen(true)}
        >
          <LifeBuoy aria-hidden className="size-5 shrink-0" /> I lost my phone
        </Button>
        {locked.length > 0 && (
          <Button
            variant="secondary"
            size="lg"
            block
            className="h-auto justify-start py-3 text-left"
            onClick={() => setMode("unlock")}
          >
            <LockOpen aria-hidden className="size-5 shrink-0" /> Unpause a family member
          </Button>
        )}
      </div>

      <h3 className="mt-6 mb-2 px-1 font-semibold">Requests waiting for approval</h3>
      {pending.length === 0 ? (
        <EmptyState title="No requests waiting" />
      ) : (
        <ul className="space-y-3">
          {pending.map((r) => {
            const canApprove = r.targetMemberId !== me.id && !r.approvals.includes(me.id);
            const canCancel = !(r.targetMemberId === me.id && r.kind === "lock");
            return (
              <li key={r.id} className="rounded-2xl border border-con-line bg-card p-4 shadow-card">
                <p className="font-semibold">
                  {r.kind === "lock"
                    ? `Pause ${name(r.targetMemberId)}'s access`
                    : `Unpause ${name(r.targetMemberId)}'s access`}
                </p>
                <p className="mt-1 text-[0.9375rem] text-muted">
                  Asked by {name(r.requestedBy)} · {formatDateTime(r.createdAt)} · “{r.reason}”
                </p>
                <p className="mt-2 font-medium">
                  {r.approvals.length} of {data.approvalsRequired} approvals
                  {r.approvals.length > 0 && (
                    <span className="font-normal text-muted"> ({joinNames(r.approvals.map(name))})</span>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canApprove && (
                    <Button
                      size="sm"
                      onClick={() => void act(() => client.approveEmergency(r.id), "Approved. Thank you.")}
                    >
                      Approve
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void act(() => client.cancelEmergency(r.id), "Request cancelled.")}
                    >
                      Cancel request
                    </Button>
                  )}
                </div>
                {r.targetMemberId === me.id && (
                  <p className="mt-2 text-[0.9375rem] text-muted">This is about your access, so others decide.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {recent.length > 0 && (
        <ul className="mt-3 space-y-1 px-1 text-[0.9375rem] text-muted">
          {recent.map((r) => (
            <li key={r.id}>
              {r.kind === "lock" ? "Pause" : "Unpause"} {name(r.targetMemberId)} —{" "}
              {r.status === "completed" ? "done" : r.status} · {formatDay(r.createdAt)}
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={mode !== null}
        onOpenChange={(o) => !o && setMode(null)}
        title={mode === "unlock" ? "Unpause a family member" : "Pause a family member's access"}
        description={
          mode === "unlock"
            ? "Their access comes back once two family members (not them) approve."
            : "Their Family Ledger access is paused once two family members (not them) approve. You count as the first."
        }
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Who?">
            {({ id }) => (
              <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)} required>
                <option value="">Choose a family member</option>
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="What happened?" hint="For example “Phone stolen”.">
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-describedby={describedBy}
                maxLength={500}
              />
            )}
          </Field>
          <Button type="submit" size="lg" block disabled={!target || !reason.trim()}>
            Send request
          </Button>
        </form>
      </Sheet>

      <Sheet
        open={lostOpen}
        onOpenChange={setLostOpen}
        title="I lost my phone"
        description="Do these from any device you still have."
      >
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            In “My devices” above, tap <strong>Sign out this device</strong> next to the lost phone. Or use{" "}
            <strong>Sign out everywhere</strong>.
          </li>
          <li>Ask a family member to pause your access if you can't sign in anywhere else.</li>
          <li>Then follow the separate steps for your bank, email, password manager and Apple ID.</li>
        </ol>
        <Button asChild variant="secondary" block className="mt-5">
          <Link to="/help/separate-steps" onClick={() => setLostOpen(false)}>
            See the separate steps
          </Link>
        </Button>
      </Sheet>
    </>
  );
}

function Backups() {
  const { client } = useSignedIn();
  const snapshots = useSnapshots();
  const queryClient = useQueryClient();
  const act = useSecurityAction();
  const sensitive = useSensitive();
  const toast = useToast();
  const showError = useErrorToast();
  const [label, setLabel] = useState("");
  const [restore, setRestore] = useState<{ id: string; label: string } | null>(null);
  const me = useMe();

  const create = async () => {
    const res = await act(
      () => client.createSnapshot(label.trim() || `Backup ${formatDay(new Date().toISOString())}`),
      "Backup made.",
    );
    if (res) {
      setLabel("");
      void queryClient.invalidateQueries({ queryKey: qk.snapshots });
    }
  };

  const exportData = async () => {
    try {
      const blob = await sensitive(() => client.exportData());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `family-ledger-export-${todayIST()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Download started. The file is not encrypted.");
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    } catch (err) {
      showError(err);
    }
  };

  return (
    <>
      <SectionTitle>Backups</SectionTitle>
      <Card className="space-y-4">
        <p className="text-muted">
          A backup is a saved copy of everything at one moment. Restoring one brings records back to that moment; the
          history of changes is always kept.
        </p>
        {snapshots.data && snapshots.data.length > 0 ? (
          <ul className="divide-y divide-line">
            {snapshots.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="block font-semibold">{s.label}</span>
                  <span className="block text-[0.9375rem] text-muted">
                    {formatDateTime(s.createdAt)}
                    {s.createdBy === me.id ? " · by you" : ""}
                  </span>
                </span>
                <Button variant="secondary" size="sm" onClick={() => setRestore({ id: s.id, label: s.label })}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{snapshots.isPending ? "Loading…" : "No backups yet."}</p>
        )}
        <form
          className="space-y-3 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Field label="Name for a new backup" optional>
            {({ id }) => (
              <Input
                id={id}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Before tax season"
                maxLength={120}
              />
            )}
          </Field>
          <Button type="submit" variant="secondary">
            <DatabaseBackup aria-hidden className="size-5" /> Make a backup now
          </Button>
        </form>
      </Card>

      <SectionTitle>Export my family data</SectionTitle>
      <Card>
        <p className="text-muted">
          Download everything as a file (JSON). Anyone with the file can read it, so keep it somewhere safe.
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => void exportData()}>
          <Download aria-hidden className="size-5" /> Download a copy
        </Button>
      </Card>

      <ConfirmDialog
        open={Boolean(restore)}
        onOpenChange={(o) => !o && setRestore(null)}
        title={`Restore “${restore?.label}”?`}
        body={
          <>
            <p>
              All accounts, notes and plans go back to how they were when this backup was made. Changes since then will
              no longer show.
            </p>
            <p>The history of changes is kept, and you can make a backup first if you're unsure.</p>
          </>
        }
        confirmLabel="Restore this backup"
        tone="danger"
        onConfirm={async () => {
          if (!restore) return;
          const target = restore;
          setRestore(null);
          const ok = await act(
            () => client.restoreSnapshot(target.id),
            "Backup restored. Everyone will see the restored records.",
          );
          if (ok !== null) void queryClient.invalidateQueries({ queryKey: qk.ledger });
        }}
      />
    </>
  );
}
