import { describe, expect, it } from "vitest";
import { DomainError, applyCommand } from "../src";
import { ctx, run, seed } from "./helpers";

describe("account CRUD", () => {
  it("creates with partial information", () => {
    const res = run(seed(), { type: "account.create", data: { displayName: "Post office RD", assetClass: "savings" } });
    const acc = res.state.accounts.find((a) => a.id === res.entityId)!;
    expect(acc.ownership.status).toBe("unknown");
    expect(acc.valuations).toEqual([]);
    expect(res.audit[0]!.summary).toContain("Post office RD");
    expect(res.state.revision).toBe(1);
  });

  it("records previous and new values on update", () => {
    const s = seed();
    const res = run(s, {
      type: "account.update",
      id: "acc_fd",
      expectedVersion: 0,
      patch: { maturityDate: "2026-12-15" },
    });
    expect(res.audit[0]!.changes).toEqual([{ field: "maturityDate", before: undefined, after: "2026-12-15" }]);
    expect(res.state.accounts.find((a) => a.id === "acc_fd")!.version).toBe(1);
  });

  it("rejects stale edits instead of overwriting someone else's change", () => {
    const s1 = run(
      seed(),
      { type: "account.update", id: "acc_fd", expectedVersion: 0, patch: { nickname: "Papa's FD" } },
      "m_papa",
    ).state;
    try {
      run(s1, { type: "account.update", id: "acc_fd", expectedVersion: 0, patch: { nickname: "Old FD" } }, "m_mumma");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe("version_conflict");
      expect((e as DomainError).current).toMatchObject({ nickname: "Papa's FD" });
    }
  });

  it("archives softly and restores", () => {
    let s = run(seed(), { type: "account.archive", id: "acc_gold", expectedVersion: 0 }).state;
    expect(s.accounts.find((a) => a.id === "acc_gold")!.archivedAt).toBeDefined();
    s = run(s, { type: "account.restore", id: "acc_gold" }).state;
    expect(s.accounts.find((a) => a.id === "acc_gold")!.archivedAt).toBeUndefined();
  });

  it("validates input and references", () => {
    expect(() => run(seed(), { type: "account.create", data: { displayName: "", assetClass: "cash" } })).toThrow(
      DomainError,
    );
    expect(() =>
      run(seed(), {
        type: "account.create",
        data: { displayName: "X", assetClass: "cash", managedByPersonId: "p_nobody" },
      }),
    ).toThrow(/isn't in the family list/);
    expect(() =>
      run(seed(), {
        type: "account.update",
        id: "acc_rohit_portfolio",
        expectedVersion: 0,
        patch: { access: { loginUrl: "javascript:alert(1)", authenticator: "unknown", contacts: [] } },
      }),
    ).toThrow(DomainError);
    expect(() => applyCommand(seed(), { type: "account.nuke" }, ctx())).toThrow(DomainError);
  });

  it("prevents parent cycles", () => {
    let s = seed();
    const child = run(s, {
      type: "account.create",
      data: { displayName: "Child", assetClass: "cash", parentId: "acc_rohit_portfolio" },
    });
    s = child.state;
    expect(() =>
      run(s, {
        type: "account.update",
        id: "acc_rohit_portfolio",
        expectedVersion: 0,
        patch: { parentId: child.entityId },
      }),
    ).toThrow(/inside one of its own/);
  });

  it("refuses masked values being saved back as real data", () => {
    expect(() =>
      run(seed(), {
        type: "account.update",
        id: "acc_fd",
        expectedVersion: 0,
        patch: { access: { registeredPhone: "•••• •• 1234", authenticator: "unknown", contacts: [] } },
      }),
    ).toThrow(/Show details/);
  });

  it("rejects actors who are not active members", () => {
    expect(() => run(seed(), { type: "check.create", title: "x" }, "m_stranger")).toThrow(/isn't active/);
  });
});

describe("notes CRUD", () => {
  it("creates, edits with history, comments, resolves, archives", () => {
    let res = run(
      seed(),
      { type: "note.create", data: { kind: "question", body: "Does the FD renew in December?" } },
      "m_papa",
    );
    const id = res.entityId;
    res = run(
      res.state,
      { type: "note.update", id, expectedVersion: 0, patch: { body: "Does the FD renew in December or January?" } },
      "m_mumma",
    );
    let note = res.state.notes.find((n) => n.id === id)!;
    expect(note.history[0]!.body).toBe("Does the FD renew in December?");
    expect(note.history[0]!.editedBy).toBe("m_papa");
    res = run(res.state, { type: "note.comment", noteId: id, body: "I'll check the certificate." }, "m_me");
    res = run(res.state, { type: "note.resolve", id, resolved: true }, "m_me");
    res = run(res.state, { type: "note.archive", id });
    note = res.state.notes.find((n) => n.id === id)!;
    expect(note.comments).toHaveLength(1);
    expect(note.resolvedBy).toBe("m_me");
    expect(note.archivedAt).toBeDefined();
  });

  it("does not let one member rewrite another member's reply", () => {
    let res = run(seed(), { type: "note.create", data: { kind: "note", body: "x" } });
    res = run(res.state, { type: "note.comment", noteId: res.entityId, body: "Mumma's view" }, "m_mumma");
    const note = res.state.notes.find((n) => n.id === res.entityId)!;
    expect(() =>
      run(
        res.state,
        { type: "note.editComment", noteId: note.id, commentId: note.comments[0]!.id, body: "changed" },
        "m_papa",
      ),
    ).toThrow(/Only the person who wrote this/);
  });
});

describe("plans CRUD", () => {
  it("keeps proposals, discussion and decisions distinct; decisions need explicit agreement", () => {
    let res = run(seed(), { type: "plan.create", data: { title: "Review insurance" } }, "m_mumma");
    const planId = res.entityId;
    res = run(
      res.state,
      { type: "plan.addEntry", planId, entryType: "proposal", body: "Let's compare policies" },
      "m_mumma",
    );
    res = run(
      res.state,
      { type: "plan.addEntry", planId, entryType: "discussion", body: "I disagree, ours is fine" },
      "m_papa",
    );
    let plan = res.state.plans.find((p) => p.id === planId)!;
    expect(plan.status).toBe("idea"); // discussion never auto-decides
    expect(plan.entries.map((e) => e.type)).toEqual(["proposal", "discussion"]);

    res = run(res.state, { type: "plan.recordDecision", planId, body: "Get one quote first" }, "m_me");
    plan = res.state.plans.find((p) => p.id === planId)!;
    const decision = plan.entries.find((e) => e.type === "decision")!;
    expect(decision.agreedBy).toEqual(["m_me"]);
    res = run(res.state, { type: "plan.agree", planId, entryId: decision.id, agree: true }, "m_papa");
    expect(res.state.plans[0]!.entries.find((e) => e.id === decision.id)!.agreedBy).toEqual(["m_me", "m_papa"]);
    expect(res.state.plans[0]!.status).toBe("idea");

    res = run(res.state, { type: "plan.addTask", planId, title: "Call agent", assigneePersonId: "p_papa" });
    const taskId = res.state.plans[0]!.tasks[0]!.id;
    res = run(res.state, { type: "plan.setTaskDone", planId, taskId, done: true }, "m_papa");
    expect(res.state.plans[0]!.tasks[0]!.doneBy).toBe("m_papa");
  });

  it("re-asks for agreement if a decision's wording changes", () => {
    let res = run(seed(), { type: "plan.create", data: { title: "P" } });
    const planId = res.entityId;
    res = run(res.state, { type: "plan.recordDecision", planId, body: "A" });
    const entryId = res.state.plans[0]!.entries[0]!.id;
    res = run(res.state, { type: "plan.agree", planId, entryId, agree: true }, "m_mumma");
    res = run(res.state, { type: "plan.editEntry", planId, entryId, body: "B" });
    const entry = res.state.plans[0]!.entries[0]!;
    expect(entry.agreedBy).toEqual(["m_me"]);
    expect(entry.history[0]!.body).toBe("A");
  });
});

describe("valuations", () => {
  it("never deletes a value; setting aside keeps history", () => {
    let s = run(seed(), {
      type: "valuation.add",
      accountId: "acc_gold",
      valuation: { amountMinor: "100", valuationDate: "2026-10-01", source: "estimate", confidence: "estimated" },
    }).state;
    const vid = s.accounts.find((a) => a.id === "acc_gold")!.valuations[0]!.id;
    s = run(s, { type: "valuation.setAside", accountId: "acc_gold", valuationId: vid, note: "typo" }).state;
    const acc = s.accounts.find((a) => a.id === "acc_gold")!;
    expect(acc.valuations).toHaveLength(1);
    expect(acc.valuations[0]!.setAside?.note).toBe("typo");
  });
});
