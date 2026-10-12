import { expect, test, type Page, type TestInfo } from "@playwright/test";

/* Demo build only: all data is fictional and lives in browser memory. */

async function signIn(page: Page, who: "Neeta" | "Chandra" | "Monica" = "Neeta") {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Who's using Family Ledger?" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^${who}`) }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`, ${who}$`) })).toBeVisible();
}

function nav(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Main" }).getByRole("link", { name });
}

async function shot(page: Page, info: TestInfo, name: string, fullPage = false) {
  if (info.project.name !== "iphone") return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage });
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function openAccount(page: Page, name: string) {
  await nav(page, "Accounts").click();
  await expect(page.getByRole("heading", { level: 1, name: "Accounts" })).toBeVisible();
  await page
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("demo sign-in shows the dashboard with a clearly partial total", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByText("Demo — made-up information.")).toBeVisible();
  await shot(page, info, "01-sign-in");
  await signIn(page);
  await expect(page.getByText("Family net worth (estimated)")).toBeVisible();
  await expect(page.getByText(/Partial — 0 of \d+ accounts have amounts/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Things to check" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent family activity" })).toBeVisible();
  await expect(page.getByText("Demo — made-up information.")).toBeVisible();
  await shot(page, info, "02-home");
  await shot(page, info, "02-home-full", true);
});

test("view an account and reveal masked sign-in details after confirming", async ({ page }, info) => {
  await signIn(page);
  await openAccount(page, "Rohit Portfolio");
  await expect(page.getByText("Not yet entered").first()).toBeVisible();
  await expect(page.getByText("Passwords and OTPs are not stored here")).toBeVisible();
  await expect(page.getByText("family.demo@example.com")).toHaveCount(0);
  const website = page.getByRole("link", { name: /Official website · groww.in/ });
  await expect(website).toHaveAttribute("rel", "noopener noreferrer");
  await expect(website).toHaveAttribute("target", "_blank");
  await shot(page, info, "03-account-detail");
  await page.getByRole("button", { name: "Show details" }).click();
  await expect(page.getByRole("dialog", { name: "Confirm it's you" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm it's me" }).click();
  await expect(page.getByText("family.demo@example.com")).toBeVisible();
  await expect(page.getByText(/Showing for \d+ more seconds/)).toBeVisible();
  await shot(page, info, "04-account-revealed");
  await page.getByRole("button", { name: "Hide details" }).click();
  await expect(page.getByText("family.demo@example.com")).toHaveCount(0);
});

test("update an amount and see it in the activity log", async ({ page }, info) => {
  await signIn(page);
  await openAccount(page, "Rohit Portfolio");
  await page.getByRole("link", { name: "Update amount" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Update amount" })).toBeVisible();
  await page.getByLabel("How much is in it now?").fill("12 lakh");
  await expect(page.getByText("That's ₹12,00,000 · ₹12 lakh")).toBeVisible();
  await page.getByLabel("Our own estimate").check();
  await page.getByLabel("No — it's an estimate").check();
  await shot(page, info, "05-update-amount");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Rohit Portfolio" })).toBeVisible();
  await expect(page.getByText("₹12 lakh").first()).toBeVisible();
  await expect(page.getByText("Estimated").first()).toBeVisible();
  await nav(page, "More").click();
  await page.getByRole("link", { name: /Family activity/ }).click();
  await expect(page.getByText(/Added an estimated amount of ₹12 lakh for “Rohit Portfolio”/).first()).toBeVisible();
  await expect(page.getByText("History checked: nothing has been changed outside the app.")).toBeVisible();
  await shot(page, info, "06-activity");
});

test("create and edit a note, keeping the earlier wording", async ({ page }, info) => {
  await signIn(page);
  await nav(page, "More").click();
  await page.getByRole("link", { name: /^Notes/ }).click();
  await page.getByRole("link", { name: "New", exact: true }).click();
  await page.getByLabel("Your note").fill("The locker key is with Chandra.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText("The locker key is with Chandra.")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Words").fill("The locker key is in the blue file.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("The locker key is in the blue file.")).toBeVisible();
  await page.getByRole("button", { name: /See earlier versions/ }).click();
  await expect(page.getByText("The locker key is with Chandra.")).toBeVisible();
  await shot(page, info, "07-note");
});

test("create a plan and comment on it", async ({ page }, info) => {
  await signIn(page);
  await nav(page, "Plans").click();
  await expect(page.getByRole("heading", { level: 1, name: "Plans" })).toBeVisible();
  await shot(page, info, "08-plans");
  await page.getByRole("link", { name: "New", exact: true }).click();
  await page.getByLabel("What's the plan?").fill("Family trip to Kerala");
  await page.getByRole("button", { name: "Start this plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Family trip to Kerala" })).toBeVisible();
  await page.getByLabel("Write your thought").fill("December might be a good time.");
  await page.getByRole("button", { name: "Post thought" }).click();
  await expect(page.getByText("December might be a good time.")).toBeVisible();
  await expect(page.getByText("Neeta shared a thought")).toBeVisible();
  await page.getByRole("button", { name: "Record a decision" }).click();
  await page.getByLabel("The decision").fill("We'll go in December.");
  await page.getByRole("button", { name: "Record this decision" }).click();
  await expect(page.getByText("Agreed by Neeta")).toBeVisible();
  await shot(page, info, "09-plan-detail", true);
});

test("browse accounts and money breakdowns", async ({ page }, info) => {
  await signIn(page);
  await page.getByRole("button", { name: "Fill in sample amounts" }).click();
  await page.getByRole("button", { name: "Add sample amounts" }).click();
  await expect(page.getByText(/Sample amounts added/)).toBeVisible();
  await expect(page.getByText(/Partial — 6 of \d+ accounts have amounts/)).toBeVisible();
  await shot(page, info, "10-home-with-amounts");
  await nav(page, "Accounts").click();
  await page.getByRole("radio", { name: "By person" }).click();
  await expect(page.getByRole("heading", { name: /Neeta/ }).first()).toBeVisible();
  await shot(page, info, "11-accounts");
  await expectNoHorizontalScroll(page);
  await nav(page, "Money").click();
  await expect(page.getByRole("heading", { level: 1, name: "Our Money" })).toBeVisible();
  await page.getByRole("radio", { name: "Where" }).click();
  await expect(page.getByRole("link", { name: "Groww", exact: true })).toBeVisible();
  await page.getByText("Show as a table").first().click();
  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(page.getByText("In your name (confirmed)")).toBeVisible();
  await expect(page.getByText("Shared or not yet confirmed")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, info, "12-money", true);
});

test("security: revoke another device, then this device signs out", async ({ page }, info) => {
  await signIn(page);
  await nav(page, "More").click();
  await page.getByRole("link", { name: /^Security/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Security" })).toBeVisible();
  await expect(page.getByText("Neeta's iPhone")).toBeVisible();
  await shot(page, info, "13-security");
  await page.getByRole("button", { name: "Sign out this device: Neeta's iPhone" }).click();
  await page.getByRole("button", { name: "Sign it out" }).click();
  await expect(page.getByText(/was signed out/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out this device: Neeta's iPhone" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out this device: This device" }).click();
  await page.getByRole("button", { name: "Sign it out" }).click();
  await expect(page.getByRole("heading", { name: "Who's using Family Ledger?" })).toBeVisible();
  await expect(page.getByText("This device was signed out. Please sign in again.")).toBeVisible();
});

test("sign out returns to the demo sign-in screen", async ({ page }) => {
  await signIn(page, "Chandra");
  await nav(page, "More").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Who's using Family Ledger?" })).toBeVisible();
});

test("no horizontal scrolling at 390px on main screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  for (const tab of ["Home", "Money", "Accounts", "Plans", "More"]) {
    await nav(page, tab).click();
    await page.waitForTimeout(150);
    await expectNoHorizontalScroll(page);
  }
  await openAccount(page, "Overdraft against Fixed Deposit");
  await expectNoHorizontalScroll(page);
  await expect(page.getByText("This is the limit the bank allows — not money borrowed.")).toBeVisible();
});

test("visual tour of key iPhone screens", async ({ page }, info) => {
  test.skip(info.project.name !== "iphone", "screenshots are taken on iPhone only");
  await signIn(page);
  await page.getByRole("button", { name: "Fill in sample amounts" }).click();
  await page.getByRole("button", { name: "Add sample amounts" }).click();
  await expect(page.getByText(/Sample amounts added/)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss message" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, info, "20-home-amounts-top");
  await nav(page, "Money").click();
  await expect(page.getByRole("heading", { level: 1, name: "Our Money" })).toBeVisible();
  await shot(page, info, "21-money-top");
  await page.getByRole("heading", { name: "Break it down" }).scrollIntoViewIfNeeded();
  await shot(page, info, "22-money-breakdown");
  await nav(page, "Accounts").click();
  await shot(page, info, "23-accounts-by-type");
  await page.getByRole("link", { name: "Add" }).click();
  await shot(page, info, "24-add-account");
  await nav(page, "More").click();
  await shot(page, info, "25-more");
  await page.getByRole("link", { name: /^Security/ }).click();
  await shot(page, info, "26-security");
  await page.getByRole("heading", { name: "Emergency" }).scrollIntoViewIfNeeded();
  await shot(page, info, "27-emergency");
});
