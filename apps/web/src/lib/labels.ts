import {
  Banknote,
  Briefcase,
  Building2,
  ChartLine,
  Coins,
  CreditCard,
  Gem,
  House,
  Landmark,
  PiggyBank,
  ScrollText,
  Shield,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AssetClass, PlanEntryType, PlanStatus, ValuationSource } from "@family-ledger/shared";

export const ASSET_CLASS_TILES: Array<{ value: AssetClass; label: string; hint: string; icon: LucideIcon }> = [
  { value: "savings", label: "Bank savings", hint: "Savings or current account", icon: PiggyBank },
  { value: "fixed_deposit", label: "Fixed deposit", hint: "FD or recurring deposit", icon: Landmark },
  { value: "mutual_funds", label: "Mutual funds", hint: "SIPs and fund folios", icon: ChartLine },
  { value: "listed_equity", label: "Shares", hint: "Stocks in a demat account", icon: Building2 },
  { value: "managed_portfolio", label: "Managed portfolio", hint: "Someone manages it for us", icon: Briefcase },
  { value: "provident_fund", label: "Provident fund", hint: "PF, PPF, EPF or pension", icon: Wallet },
  { value: "insurance_investment", label: "Insurance investment", hint: "Policies with a savings part", icon: Shield },
  { value: "gold", label: "Gold", hint: "Jewellery, coins, gold bonds", icon: Gem },
  { value: "real_estate", label: "Property", hint: "House, flat or land", icon: House },
  { value: "bonds", label: "Bonds", hint: "Government or company bonds", icon: ScrollText },
  { value: "cash", label: "Cash", hint: "Cash kept at home", icon: Banknote },
  { value: "liability", label: "Loan or overdraft", hint: "Money we owe", icon: CreditCard },
  { value: "other", label: "Something else", hint: "Not sure? Choose this", icon: Coins },
];

export function assetClassIcon(value: AssetClass): LucideIcon {
  return ASSET_CLASS_TILES.find((t) => t.value === value)?.icon ?? Coins;
}

export const SOURCE_LABELS: Record<ValuationSource, string> = {
  statement: "Official statement",
  app_or_website: "Bank or broker app / website",
  document: "A certificate or document",
  conversation: "Someone told us",
  estimate: "Our own estimate",
  sync: "Automatic update",
};

export const SOURCE_CHOICES: ValuationSource[] = [
  "statement",
  "app_or_website",
  "document",
  "conversation",
  "estimate",
];

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  idea: "Idea",
  discussing: "Discussing",
  researching: "Researching",
  decided: "Decided",
  in_progress: "In progress",
  completed: "Completed",
  on_hold: "On hold",
};

export const PLAN_STATUS_ORDER: PlanStatus[] = [
  "idea",
  "discussing",
  "researching",
  "decided",
  "in_progress",
  "completed",
  "on_hold",
];

export const ENTRY_LABELS: Record<PlanEntryType, string> = {
  proposal: "Proposal",
  discussion: "Thought",
  decision: "Decision",
  action_item: "Action",
};

export const DOCUMENT_KIND_LABELS = {
  statement: "Statement",
  certificate: "Certificate",
  policy: "Policy",
  agreement: "Agreement",
  id_proof: "ID proof",
  tax: "Tax paper",
  other: "Other",
} as const;

export const OWNERSHIP_LABELS = {
  confirmed: "Confirmed",
  unconfirmed: "Not yet confirmed",
  disputed: "We're not sure — views differ",
  unknown: "Not known yet",
} as const;

export const LIFECYCLE_LABELS = { active: "Active", closed: "Closed", unknown: "Not sure" } as const;
