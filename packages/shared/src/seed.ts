import { Account, LedgerState, SCHEMA_VERSION, type Member, type Person } from "./schema";
import type { Command } from "./commands";

/**
 * Starter records. EVERYTHING HERE IS FICTIONAL / PLACEHOLDER.
 * No amounts are pre-filled: unknown values show as "Not yet entered".
 * The same structure seeds the production ledger on first run (with real
 * member emails supplied by server configuration, never committed here).
 */

const SEED_TIME = "2026-10-01T04:30:00.000Z";

export const SEED_MEMBER_IDS = { me: "m_me", mumma: "m_mumma", papa: "m_papa" } as const;

export interface SeedMemberConfig {
  id: string;
  displayName: string;
  email?: string;
}

export const DEFAULT_MEMBERS: SeedMemberConfig[] = [
  { id: SEED_MEMBER_IDS.mumma, displayName: "Neeta" },
  { id: SEED_MEMBER_IDS.papa, displayName: "Chandra" },
  { id: SEED_MEMBER_IDS.me, displayName: "Monica" },
];

const personIdFor = (memberId: string) => `p_${memberId.replace(/^m_/, "")}`;

function account(partial: Partial<Account> & Pick<Account, "id" | "displayName" | "assetClass">): Account {
  return Account.parse({
    version: 0,
    ownership: { status: "unknown", owners: [], associatedPersonIds: [] },
    createdBy: SEED_MEMBER_IDS.me,
    createdAt: SEED_TIME,
    updatedBy: SEED_MEMBER_IDS.me,
    updatedAt: SEED_TIME,
    ...partial,
  });
}

export function createSeedState(members: SeedMemberConfig[] = DEFAULT_MEMBERS): LedgerState {
  const memberRecords: Member[] = members.map((m) => ({
    id: m.id,
    personId: personIdFor(m.id),
    displayName: m.displayName,
    email: m.email,
    status: "active",
    createdAt: SEED_TIME,
  }));
  const P = {
    mumma: personIdFor(SEED_MEMBER_IDS.mumma),
    papa: personIdFor(SEED_MEMBER_IDS.papa),
    me: personIdFor(SEED_MEMBER_IDS.me),
    rohit: "p_rohit",
    amit: "p_amit_seth",
  };
  const people: Person[] = [
    ...memberRecords.map((m) => ({ id: m.personId, name: m.displayName, relation: "Family", memberId: m.id })),
    { id: P.rohit, name: "Rohit", relation: "Manages a portfolio for the family" },
    { id: P.amit, name: "Amit Seth", relation: "Portfolio manager" },
  ];

  const accounts: Account[] = [
    account({
      id: "acc_rohit_portfolio",
      displayName: "Rohit Portfolio",
      institution: "Groww",
      assetClass: "managed_portfolio",
      description: "Investments on Groww that Rohit looks after.",
      ownership: { status: "unconfirmed", owners: [], associatedPersonIds: [P.mumma, P.papa] },
      managedByPersonId: P.rohit,
      access: { officialWebsite: "https://groww.in/", authenticator: "unknown", contacts: [] },
    }),
    account({
      id: "acc_amit_seth_portfolio",
      displayName: "Amit Seth Portfolio",
      assetClass: "managed_portfolio",
      description: "Portfolio managed by Amit Seth.",
      ownership: { status: "unconfirmed", owners: [], associatedPersonIds: [P.mumma, P.papa, P.me] },
      managedByPersonId: P.amit,
    }),
    account({
      id: "acc_sbi_insurance",
      displayName: "SBI Insurance Investment",
      institution: "SBI Life",
      assetClass: "insurance_investment",
      ownership: { status: "unconfirmed", owners: [], associatedPersonIds: [P.papa] },
      liquidity: "restricted",
      access: { officialWebsite: "https://www.sbilife.co.in/", authenticator: "unknown", contacts: [] },
    }),
    account({
      id: "acc_mumma_ppo",
      displayName: "Neeta PPO",
      assetClass: "other",
      productTypeNote: "Product type requires clarification — is this a pension payment order or something else?",
      ownership: { status: "unconfirmed", owners: [], associatedPersonIds: [P.mumma] },
    }),
    account({
      id: "acc_my_ppo",
      displayName: `${members.find((m) => m.id === SEED_MEMBER_IDS.me)?.displayName ?? "My"} PPO`,
      assetClass: "other",
      productTypeNote: "Product type requires clarification.",
      ownership: { status: "unconfirmed", owners: [], associatedPersonIds: [P.me] },
    }),
    account({
      id: "acc_sapra_equity",
      displayName: "Sapra Equity Portfolio",
      institution: "Stoxkart",
      assetClass: "listed_equity",
      ownership: { status: "unconfirmed", owners: [], associatedPersonIds: [P.mumma] },
      liquidity: "liquid",
      access: { officialWebsite: "https://www.stoxkart.com/", authenticator: "unknown", contacts: [] },
    }),
    account({
      id: "acc_mumma_groww",
      displayName: "Neeta Groww Equity",
      institution: "Groww",
      assetClass: "listed_equity",
      ownership: { status: "unconfirmed", owners: [], associatedPersonIds: [P.mumma] },
      liquidity: "liquid",
      access: { officialWebsite: "https://groww.in/", authenticator: "unknown", contacts: [] },
    }),
    account({
      id: "acc_icici_mf",
      displayName: "ICICI Direct Mutual Funds",
      institution: "ICICI Direct",
      assetClass: "mutual_funds",
      ownership: { status: "unconfirmed", owners: [], associatedPersonIds: [P.papa] },
      liquidity: "liquid",
      access: { officialWebsite: "https://www.icicidirect.com/", authenticator: "unknown", contacts: [] },
    }),
    account({
      id: "acc_fd",
      displayName: "Fixed Deposit",
      institution: "Bank of India or Indian Bank (not confirmed)",
      assetClass: "fixed_deposit",
      description: "Fixed deposit linked to an overdraft facility.",
      ownership: { status: "unconfirmed", owners: [], associatedPersonIds: [P.papa] },
      linkedAccountIds: ["acc_fd_overdraft"],
      liquidity: "locked",
      restrictions: "Linked to an overdraft facility — may be held as security.",
      interestDetails: "Interest terms need checking.",
    }),
    account({
      id: "acc_fd_overdraft",
      displayName: "Overdraft against Fixed Deposit",
      institution: "Bank of India or Indian Bank (not confirmed)",
      assetClass: "liability",
      description:
        "₹25 lakh was mentioned as the overdraft facility. That is the limit, not necessarily what has been borrowed.",
      ownership: { status: "unconfirmed", owners: [], associatedPersonIds: [P.papa] },
      creditLimitMinor: "250000000",
      linkedAccountIds: ["acc_fd"],
    }),
    account({
      id: "acc_nokia_pf",
      displayName: "Nokia Provident Fund",
      assetClass: "provident_fund",
      productTypeNote: "Exact scheme and withdrawal rules need checking.",
      ownership: { status: "unconfirmed", owners: [], associatedPersonIds: [P.papa] },
      liquidity: "restricted",
    }),
    account({
      id: "acc_gold",
      displayName: "Physical Gold",
      assetClass: "gold",
      description: "Family gold. Weight, purity, location and value not yet recorded.",
      ownership: {
        status: "unknown",
        owners: [],
        associatedPersonIds: [P.mumma, P.papa, P.me],
        note: "Family holding — individual ownership not discussed yet.",
      },
      liquidity: "restricted",
    }),
  ];

  return LedgerState.parse({
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    baseCurrency: "INR",
    members: memberRecords,
    people,
    accounts,
    plans: [],
    notes: [],
    checks: [],
    documents: [],
    updatedAt: SEED_TIME,
  });
}

/**
 * Starter conversation content, applied through commands so it is audited.
 * Fictional examples only.
 */
export function seedCommands(): Array<{ actor: string; command: Command }> {
  const { me, mumma, papa } = SEED_MEMBER_IDS;
  return [
    {
      actor: me,
      command: { type: "check.create", title: "Confirm Nokia PF balance", accountId: "acc_nokia_pf" },
    },
    {
      actor: me,
      command: {
        type: "check.create",
        title: "Find out how much of the overdraft is actually used",
        accountId: "acc_fd_overdraft",
      },
    },
    {
      actor: mumma,
      command: {
        type: "check.create",
        title: "Get the latest statement from Amit Seth",
        accountId: "acc_amit_seth_portfolio",
      },
    },
    {
      actor: papa,
      command: {
        type: "check.create",
        title: "Confirm whose name the Groww accounts are in",
        accountId: "acc_mumma_groww",
      },
    },
    {
      actor: me,
      command: {
        type: "note.create",
        data: {
          kind: "question",
          body: "Chandra thinks the FD renews in December. Need to check the actual certificate.",
          accountId: "acc_fd",
          pinned: true,
        },
      },
    },
    {
      actor: mumma,
      command: {
        type: "note.create",
        data: {
          kind: "note",
          title: "Where the papers are",
          body: "Most bank papers are in the blue file in the cupboard. (Example note.)",
        },
      },
    },
    {
      actor: papa,
      command: {
        type: "plan.create",
        data: {
          title: "Plan for the fixed deposit maturity",
          category: "Fixed deposit",
          description: "Decide what to do when the FD matures, once we know the actual date.",
          status: "discussing",
          relatedAccountIds: ["acc_fd", "acc_fd_overdraft"],
        },
      },
    },
    {
      actor: mumma,
      command: {
        type: "plan.create",
        data: {
          title: "Build an emergency fund",
          category: "Safety net",
          description: "Keep some money that can be withdrawn quickly for emergencies.",
          status: "idea",
        },
      },
    },
    {
      actor: me,
      command: {
        type: "document.create",
        data: {
          title: "FD certificate",
          kind: "certificate",
          whereKept: "Blue file (example)",
          accountIds: ["acc_fd"],
        },
      },
    },
  ];
}

/** Clearly fictional sample amounts, offered ONLY in demo mode to explore charts. */
export const DEMO_SAMPLE_AMOUNTS: Array<{
  accountId: string;
  amountMinor: string;
  confidence: "estimated" | "verified";
}> = [
  { accountId: "acc_rohit_portfolio", amountMinor: "1850000000", confidence: "estimated" },
  { accountId: "acc_mumma_groww", amountMinor: "312500000", confidence: "verified" },
  { accountId: "acc_icici_mf", amountMinor: "905000000", confidence: "verified" },
  { accountId: "acc_fd", amountMinor: "4000000000", confidence: "verified" },
  { accountId: "acc_fd_overdraft", amountMinor: "600000000", confidence: "estimated" },
  { accountId: "acc_sapra_equity", amountMinor: "227500000", confidence: "estimated" },
];
