import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { deriveValue, isLiability, type Account, type LedgerState } from "@family-ledger/shared";
import { assetClassIcon } from "../lib/labels";
import { inrShort } from "../lib/format";
import { whereLine } from "../lib/ledger";
import { StatusChip } from "./StatusChip";

export function AccountRow({ account, ledger, today }: { account: Account; ledger: LedgerState; today: string }) {
  const view = deriveValue(account, today);
  const Icon = assetClassIcon(account.assetClass);
  const where = whereLine(ledger, account);
  const amount = view.current ? inrShort(view.current.amountMinor) : null;
  return (
    <Link
      to={`/accounts/${account.id}`}
      className="flex min-h-20 items-start gap-3.5 px-4 py-4 text-ink no-underline hover:bg-cream active:bg-cream-deep"
    >
      <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug break-words">{account.displayName}</span>
        {where && <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{where}</span>}
        <span className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip status={view.status} />
            {isLiability(account) && (
              <span className="rounded-full border border-line px-2.5 py-1 text-[0.8125rem] font-semibold text-muted">
                Money owed
              </span>
            )}
            {account.archivedAt && (
              <span className="rounded-full border border-line px-2.5 py-1 text-[0.8125rem] font-semibold text-muted">
                Archived
              </span>
            )}
          </span>
          {amount && (
            <span className="tabular text-lg font-bold">
              {isLiability(account) && <span className="sr-only">Owed: </span>}
              {amount}
            </span>
          )}
        </span>
      </span>
      <ChevronRight aria-hidden className="mt-3 size-5 shrink-0 text-muted" />
    </Link>
  );
}
