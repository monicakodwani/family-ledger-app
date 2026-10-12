import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Plus, Search, X } from "lucide-react";
import { ASSET_CLASS_LABELS, isLiability, type Account, type LedgerState } from "@family-ledger/shared";
import { useLedgerData, useToday } from "../data/hooks";
import { PageHeader } from "../components/AppShell";
import { EmptyState, RowGroup } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Segmented } from "../components/ui/field";
import { AccountRow } from "../components/AccountRow";
import { ASSET_CLASS_TILES } from "../lib/labels";
import { personName } from "../lib/format";
import { t } from "../i18n";

type GroupBy = "type" | "person";

function groupAccounts(
  ledger: LedgerState,
  accounts: Account[],
  by: GroupBy,
): Array<{ key: string; label: string; items: Account[] }> {
  const groups = new Map<string, { key: string; label: string; items: Account[] }>();
  const add = (key: string, label: string, a: Account) => {
    const g = groups.get(key) ?? { key, label, items: [] };
    g.items.push(a);
    groups.set(key, g);
  };
  for (const a of accounts) {
    if (by === "type") {
      add(a.assetClass, ASSET_CLASS_LABELS[a.assetClass], a);
    } else {
      const ids = a.ownership.owners.length
        ? a.ownership.owners.map((o) => o.personId)
        : a.ownership.associatedPersonIds;
      if (ids.length === 0) add("_none", "Not recorded yet", a);
      else if (ids.length > 1)
        add(`joint:${[...ids].sort().join("+")}`, `Shared: ${ids.map((i) => personName(ledger, i)).join(" & ")}`, a);
      else add(ids[0]!, personName(ledger, ids[0]), a);
    }
  }
  const order = (k: string) => {
    if (by === "type") {
      const i = ASSET_CLASS_TILES.findIndex((t) => t.value === k);
      return i === -1 ? 99 : i;
    }
    return k === "_none" ? 99 : k.startsWith("joint:") ? 50 : 0;
  };
  return [...groups.values()].sort((x, y) => order(x.key) - order(y.key) || x.label.localeCompare(y.label));
}

export default function AccountsPage() {
  const ledger = useLedgerData();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [by, setBy] = useState<GroupBy>("type");
  const ids = params.get("ids")?.split(",").filter(Boolean);
  const from = params.get("from");

  const s = q.trim().toLowerCase();
  const accounts = ledger.accounts
    .filter((a) => !a.archivedAt)
    .filter((a) => !ids || ids.includes(a.id))
    .filter(
      (a) =>
        !s ||
        [a.displayName, a.nickname, a.institution, a.description, ASSET_CLASS_LABELS[a.assetClass]].some((f) =>
          f?.toLowerCase().includes(s),
        ),
    );
  const groups = groupAccounts(ledger, accounts, by);
  const archivedCount = ledger.accounts.filter((a) => a.archivedAt).length;

  return (
    <div>
      <PageHeader
        title={t("page.accounts")}
        action={
          <Button asChild size="sm">
            <Link to="/accounts/new">
              <Plus aria-hidden className="size-5" />
              Add
            </Link>
          </Button>
        }
      />

      {ids && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-accent-soft px-4 py-3">
          <p className="leading-snug">
            Showing {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
            {from ? (
              <>
                {" "}
                in <span className="font-semibold">{from}</span>
              </>
            ) : null}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setParams({})}>
            <X aria-hidden className="size-4" /> Show all
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            aria-label="Search accounts"
            placeholder="Search accounts"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-12"
          />
        </div>
        <Segmented
          label="Group accounts by"
          value={by}
          onChange={setBy}
          options={[
            { value: "type", label: "By type" },
            { value: "person", label: "By person" },
          ]}
        />
      </div>

      <div className="mt-5 space-y-6">
        {groups.length === 0 && (
          <EmptyState title={s ? "No accounts match your search" : "No accounts yet"}>
            {!s && (
              <Link to="/accounts/new" className="font-semibold text-accent">
                Add the first account
              </Link>
            )}
          </EmptyState>
        )}
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`grp-${g.key}`}>
            <h2 id={`grp-${g.key}`} className="mb-2 px-1 text-[0.9375rem] font-bold tracking-wide text-muted uppercase">
              {g.label} <span className="font-semibold normal-case">· {g.items.length}</span>
            </h2>
            <RowGroup>
              {g.items.map((a) => (
                <AccountRow key={a.id} account={a} ledger={ledger} today={today} />
              ))}
            </RowGroup>
            {by === "type" && g.items.some(isLiability) && (
              <p className="mt-2 px-1 text-[0.9375rem] text-muted">
                Amounts here are money owed. Approved limits are not counted as borrowed.
              </p>
            )}
          </section>
        ))}
      </div>

      {archivedCount > 0 && (
        <p className="mt-8 text-center">
          <Link to="/archived" className="inline-flex min-h-12 items-center font-semibold text-accent">
            See archived accounts ({archivedCount})
          </Link>
        </p>
      )}
    </div>
  );
}
