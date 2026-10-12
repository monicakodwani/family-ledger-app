import { useState } from "react";
import {
  Activity,
  Archive,
  FileText,
  FlaskConical,
  HelpCircle,
  ListChecks,
  LogOut,
  Settings,
  ShieldCheck,
  StickyNote,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useSignedIn } from "../auth/AuthProvider";
import { qk, useErrorToast, useLedgerData, useMe, useToday } from "../data/hooks";
import { isDemoClient } from "../data/types";
import { PageHeader } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { RowGroup, RowLink, SectionTitle } from "../components/ui/card";
import { ConfirmDialog } from "../components/ui/dialog";
import { useToast } from "../components/Toaster";
import { thingsToCheck } from "../lib/ledger";
import { t } from "../i18n";

export default function MorePage() {
  const ledger = useLedgerData();
  const today = useToday();
  const me = useMe();
  const { signOut } = useAuth();
  const { client } = useSignedIn();
  const [confirmOut, setConfirmOut] = useState(false);
  const openQuestions = ledger.notes.filter((n) => !n.archivedAt && n.kind === "question" && !n.resolvedAt).length;
  const checks = thingsToCheck(ledger, today).length;

  return (
    <div>
      <PageHeader title={t("page.more")} subtitle={`Signed in as ${me.displayName}`} />
      <RowGroup>
        <RowLink
          to="/notes"
          icon={<StickyNote aria-hidden className="size-5" />}
          title={t("page.notes")}
          subtitle={
            openQuestions
              ? `${openQuestions} open ${openQuestions === 1 ? "question" : "questions"}`
              : "Notes and questions"
          }
        />
        <RowLink
          to="/checks"
          icon={<ListChecks aria-hidden className="size-5" />}
          title={t("page.checks")}
          subtitle={checks ? `${checks} to look at` : "All clear"}
        />
        <RowLink
          to="/documents"
          icon={<FileText aria-hidden className="size-5" />}
          title={t("page.documents")}
          subtitle="Where papers are kept"
        />
        <RowLink
          to="/activity"
          icon={<Activity aria-hidden className="size-5" />}
          title={t("page.activity")}
          subtitle="Who changed what, and when"
        />
        <RowLink
          to="/archived"
          icon={<Archive aria-hidden className="size-5" />}
          title={t("page.archived")}
          subtitle="Bring things back"
        />
      </RowGroup>
      <SectionTitle>Safety &amp; settings</SectionTitle>
      <RowGroup>
        <RowLink
          to="/security"
          icon={<ShieldCheck aria-hidden className="size-5" />}
          title={t("page.security")}
          subtitle="Devices, lost phone, backups"
        />
        <RowLink
          to="/settings"
          icon={<Settings aria-hidden className="size-5" />}
          title={t("page.settings")}
          subtitle="Text size, language"
        />
        <RowLink
          to="/help/separate-steps"
          icon={<HelpCircle aria-hidden className="size-5" />}
          title={t("page.help")}
          subtitle="If a phone is lost or stolen"
        />
      </RowGroup>
      {import.meta.env.VITE_APP_MODE === "demo" && isDemoClient(client) && <DemoTools />}
      <div className="mt-8">
        <Button variant="secondary" size="lg" block onClick={() => setConfirmOut(true)}>
          <LogOut aria-hidden className="size-5" /> {t("action.signOut")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOut}
        onOpenChange={setConfirmOut}
        title="Sign out?"
        body={<p>You'll need to sign in again to see the family ledger on this device.</p>}
        confirmLabel={t("action.signOut")}
        onConfirm={() => signOut()}
      />
    </div>
  );
}

function DemoTools() {
  const { client } = useSignedIn();
  const queryClient = useQueryClient();
  const toast = useToast();
  const showError = useErrorToast();
  const [busy, setBusy] = useState(false);
  if (!isDemoClient(client)) return null;
  return (
    <>
      <SectionTitle>Demo</SectionTitle>
      <div className="rounded-2xl border border-est-line bg-est-bg p-5 text-est-ink">
        <p className="flex items-start gap-2">
          <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0" />
          This demo keeps everything in memory. It resets when you reload or close the app.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          disabled={busy || client.hasSampleAmounts()}
          onClick={async () => {
            setBusy(true);
            try {
              await client.fillSampleAmounts();
              await queryClient.invalidateQueries({ queryKey: qk.ledger });
              await queryClient.invalidateQueries({ queryKey: ["audit"] });
              toast.success("Sample amounts added.");
            } catch (err) {
              showError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          {client.hasSampleAmounts() ? "Sample amounts added" : "Fill in sample amounts (fictional)"}
        </Button>
      </div>
    </>
  );
}
