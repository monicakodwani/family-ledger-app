import { BadgeCheck, CircleDashed, History, Hourglass, PencilLine, Scale, type LucideIcon } from "lucide-react";
import { VERIFICATION_LABELS, type VerificationStatus } from "@family-ledger/shared";
import { cn } from "../lib/cn";

const STYLES: Record<VerificationStatus, { icon: LucideIcon; className: string }> = {
  not_entered: { icon: CircleDashed, className: "bg-none-bg text-none-ink border-none-line" },
  estimated: { icon: PencilLine, className: "bg-est-bg text-est-ink border-est-line" },
  waiting_for_statement: { icon: Hourglass, className: "bg-wait-bg text-wait-ink border-wait-line" },
  verified: { icon: BadgeCheck, className: "bg-ver-bg text-ver-ink border-ver-line" },
  outdated: { icon: History, className: "bg-old-bg text-old-ink border-old-line" },
  conflicting: { icon: Scale, className: "bg-con-bg text-con-ink border-con-line" },
};

/** Status is always shown as icon + words, never colour alone. */
export function StatusChip({ status, className }: { status: VerificationStatus; className?: string }) {
  const { icon: Icon, className: tone } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.875rem] font-semibold leading-none whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {VERIFICATION_LABELS[status]}
    </span>
  );
}

export function statusLabel(status: VerificationStatus): string {
  return VERIFICATION_LABELS[status];
}
