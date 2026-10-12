#!/usr/bin/env node
/**
 * Family Ledger one-command setup.
 *
 *   npm run setup            set everything up (safe to re-run; finished steps are skipped)
 *   npm run setup -- links [names]   fresh sign-in links (e.g. `links neeta chandra`)
 *   npm run setup -- status  show what has been set up
 *   npm run setup -- emails  re-enter the family's email addresses, then continue
 *
 * What you do yourself: sign in to Supabase/Cloudflare when asked, click
 * "Create" and "Install" for the GitHub App, and type three email addresses.
 *
 * Local files (outside the repository, readable only by you):
 *   ~/.family-ledger-setup/state.json     progress, non-secret
 *   ~/.family-ledger-setup/secrets.json   encryption key, GitHub App key, Supabase keys
 */
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  appManifest,
  familyMembers,
  githubAppJwt,
  newDataKey,
  parsePagesUrl,
  passkeyPatch,
  pickSupabaseKeys,
  toPkcs8,
  validEmail,
  workerConfig,
  workersDevUrl,
} from "./setup-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(ROOT, "apps/api");
const DIR = join(homedir(), ".family-ledger-setup");
const STATE_FILE = join(DIR, "state.json");
const SECRETS_FILE = join(DIR, "secrets.json");
const LINKS_FILE = join(DIR, "sign-in-links.txt");
const GENERATED_CONFIG = join(API_DIR, "wrangler.generated.jsonc");
const APP_REPO = "family-ledger-app";
const DATA_REPO = "family-ledger-private-data";

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

const rl = createInterface({ input: process.stdin, output: process.stdout });
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const step = (n, title) => console.log(`\n${bold(`Step ${n}. ${title}`)}`);
const ok = (msg) => console.log(`  ${green("✓")} ${msg}`);
const info = (msg) => console.log(`  ${msg}`);
const you = (msg) => console.log(`  ${yellow("→ You:")} ${msg}`);

function fail(msg) {
  console.error(`\n✗ ${msg}\n  Fix that and run \`npm run setup\` again — finished steps will be skipped.`);
  process.exit(1);
}

function readJson(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
}

function writePrivate(file, content) {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(file, content, { mode: 0o600 });
  chmodSync(file, 0o600);
}

const state = readJson(STATE_FILE, {});
const secrets = readJson(SECRETS_FILE, {});
const saveState = () => writePrivate(STATE_FILE, JSON.stringify(state, null, 2));
const saveSecrets = () => writePrivate(SECRETS_FILE, JSON.stringify(secrets, null, 2));

async function ask(question, { validate, fallback } = {}) {
  for (;;) {
    const answer = (await rl.question(`  ${question}${fallback ? ` [${fallback}]` : ""}: `)).trim() || fallback || "";
    if (!validate || validate(answer)) return answer;
    info("That doesn't look right — please try again.");
  }
}

async function pressEnter(msg) {
  await rl.question(`  ${yellow("→ You:")} ${msg} Then press Enter. `);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", cwd: opts.cwd ?? ROOT, input: opts.input, env: process.env });
  if (opts.check !== false && res.status !== 0)
    fail(`${cmd} ${args.slice(0, 2).join(" ")} failed:\n${(res.stderr || res.stdout).trim()}`);
  return { ok: res.status === 0, out: (res.stdout ?? "").trim(), err: (res.stderr ?? "").trim() };
}

/** Run with the terminal attached (for logins and prompts), while also capturing output. */
function runLive(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ["inherit", "pipe", "pipe"], env: process.env });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      out += d;
      process.stderr.write(d);
    });
    child.on("close", (code) => resolve({ ok: code === 0, out }));
  });
}

function openBrowser(url) {
  spawnSync(process.platform === "darwin" ? "open" : "xdg-open", [url], { stdio: "ignore" });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(url, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, ok: res.ok, json, text };
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

async function checkTools() {
  step(1, "Checking this computer");
  if (Number(process.versions.node.split(".")[0]) < 20) fail("Node.js 20 or newer is needed.");
  const gh = run("gh", ["auth", "status"], { check: false });
  if (!gh.ok) fail("The GitHub CLI isn't signed in. Run `gh auth login` first.");
  state.owner ??= run("gh", ["api", "user", "--jq", ".login"]).out;
  const pages = run("gh", ["api", `repos/${state.owner}/${APP_REPO}/pages`, "--jq", ".html_url"], { check: false });
  if (!pages.ok) fail(`GitHub Pages isn't set up for ${state.owner}/${APP_REPO}.`);
  Object.assign(state, parsePagesUrl(pages.out));
  saveState();
  ok(`GitHub: ${state.owner}`);
  ok(`App address: ${state.siteUrl}`);
}

async function collectFamily() {
  step(2, "Family members");
  if (state.members?.length === 3) {
    state.members.forEach((m) => ok(`${m.displayName} <${m.email}>`));
    return;
  }
  info("Each person signs in with their own email. Use the address they can open on their phone.");
  for (;;) {
    const people = [];
    for (const name of ["Neeta", "Chandra", "Monica"]) {
      const email = await ask(`${name}'s email`, { validate: validEmail });
      people.push({ name, email });
    }
    console.log("");
    people.forEach((p) => info(`${p.name}: ${p.email}`));
    const answer = await ask("Is this right? (yes/no)", { validate: (a) => /^(y|yes|n|no)$/i.test(a) });
    if (/^y/i.test(answer)) {
      state.members = familyMembers(people);
      break;
    }
    info("OK, let's enter them again.");
  }
  saveState();
  ok("Saved.");
}

async function privateRepo() {
  step(3, "Private data repository");
  const full = `${state.owner}/${DATA_REPO}`;
  let view = run("gh", ["repo", "view", full, "--json", "visibility,isEmpty"], { check: false });
  if (!view.ok) {
    run("gh", [
      "repo",
      "create",
      full,
      "--private",
      "--add-readme",
      "--description",
      "Encrypted Family Ledger records (written only by the API)",
    ]);
    view = run("gh", ["repo", "view", full, "--json", "visibility,isEmpty"]);
  }
  const { visibility, isEmpty } = JSON.parse(view.out);
  if (visibility !== "PRIVATE")
    fail(`${full} is ${visibility.toLowerCase()}. It must be private. Change it in the repository settings.`);
  if (isEmpty) fail(`${full} is empty. Add a README on GitHub so it has a first commit.`);
  ok(`${full} exists and is private.`);
}

async function encryptionKey() {
  step(4, "Encryption key");
  if (secrets.dataKeys) {
    ok("Already created.");
    return;
  }
  if (state.secretsUploaded) {
    fail(
      `The encryption key file is missing (${SECRETS_FILE}) but the API already has a key. Restore secrets.json from your password manager backup.`,
    );
  }
  secrets.dataKeys = { k1: newDataKey() };
  saveSecrets();
  ok("Created a new 256-bit key.");
}

async function githubApp() {
  step(5, "GitHub App (lets the API write to the private repository only)");
  if (!secrets.githubAppPem) {
    const port = 8000 + Math.floor(Math.random() * 900);
    const nonce = randomBytes(16).toString("hex");
    const manifest = appManifest({
      owner: state.owner,
      siteUrl: state.siteUrl,
      redirectUrl: `http://127.0.0.1:${port}/callback`,
    });
    const code = await new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        if (url.pathname === "/") {
          const escaped = JSON.stringify(manifest).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<!doctype html><meta charset="utf-8"><title>Family Ledger setup</title>
<body style="font:18px system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1>Create the Family Ledger GitHub App</h1>
<p>GitHub will show a page with a green <b>Create GitHub App</b> button. Click it.</p>
<form method="post" action="https://github.com/settings/apps/new?state=${nonce}">
<input type="hidden" name="manifest" value="${escaped}">
<button style="font:inherit;padding:.6rem 1.2rem">Continue to GitHub</button></form>`);
        } else if (url.pathname === "/callback") {
          const ok = url.searchParams.get("state") === nonce && url.searchParams.get("code");
          res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            ok
              ? "<body style='font:18px system-ui;margin:4rem'>Done — you can close this tab and go back to the terminal.</body>"
              : "Unexpected request.",
          );
          if (ok) {
            server.close();
            resolve(url.searchParams.get("code"));
          }
        } else {
          res.writeHead(404).end();
        }
      });
      server.on("error", reject);
      server.listen(port, "127.0.0.1", () => {
        you("A browser tab will open. Click “Continue to GitHub”, then “Create GitHub App”.");
        openBrowser(`http://127.0.0.1:${port}/`);
      });
    });
    const conv = await http(`https://api.github.com/app-manifests/${code}/conversions`, { method: "POST" });
    if (!conv.ok) fail(`GitHub didn't finish creating the app (${conv.status}).`);
    secrets.githubAppPem = toPkcs8(conv.json.pem);
    state.githubApp = { id: conv.json.id, slug: conv.json.slug };
    saveSecrets();
    saveState();
    ok(`Created app “${conv.json.slug}”.`);
  } else {
    ok(`App “${state.githubApp.slug}” already created.`);
  }

  const appHeaders = () => ({ Authorization: `Bearer ${githubAppJwt(state.githubApp.id, secrets.githubAppPem)}` });
  const findInstallation = async () => {
    const res = await http("https://api.github.com/app/installations", { headers: appHeaders() });
    return res.ok ? res.json.find((i) => i.account?.login?.toLowerCase() === state.owner.toLowerCase()) : null;
  };

  let installation = await findInstallation();
  if (!installation) {
    you(`A browser tab will open. Choose “Only select repositories”, pick ${bold(DATA_REPO)}, and click Install.`);
    openBrowser(`https://github.com/apps/${state.githubApp.slug}/installations/new`);
    for (let i = 0; i < 100 && !installation; i++) {
      await sleep(3000);
      installation = await findInstallation();
    }
    if (!installation) fail("The app wasn't installed within 5 minutes.");
  }
  state.githubApp.installationId = installation.id;
  saveState();

  const token = await http(`https://api.github.com/app/installations/${installation.id}/access_tokens`, {
    method: "POST",
    headers: appHeaders(),
    body: { repositories: [DATA_REPO], permissions: { contents: "write" } },
  });
  if (!token.ok) {
    fail(
      `The app can't reach ${DATA_REPO}. Open https://github.com/settings/installations, configure the app, and add ${DATA_REPO} to its repositories.`,
    );
  }
  ok(`Installed with access to ${DATA_REPO} only (contents: read & write).`);
}

async function supabase() {
  step(6, "Supabase (sign-in with Face ID / passkeys)");
  if (!secrets.supabaseToken) {
    you("Create a Supabase access token (sign up first if you don't have an account).");
    info("A browser tab will open: click “Generate new token”, name it “family-ledger-setup”, and copy it.");
    openBrowser("https://supabase.com/dashboard/account/tokens");
    secrets.supabaseToken = await ask("Paste the token", { validate: (t) => t.startsWith("sbp_") });
    saveSecrets();
  }
  const api = (path, opts = {}) =>
    http(`https://api.supabase.com/v1${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${secrets.supabaseToken}` },
    });

  if (!state.supabaseRef) {
    const projects = await api("/projects");
    if (projects.status === 401) {
      delete secrets.supabaseToken;
      saveSecrets();
      fail("Supabase didn't accept that token.");
    }
    const existing = projects.json?.find((p) => p.name === "family-ledger");
    if (existing) {
      state.supabaseRef = existing.id ?? existing.ref;
    } else {
      const orgs = (await api("/organizations")).json ?? [];
      if (orgs.length === 0)
        fail("Your Supabase account has no organisation yet. Open supabase.com/dashboard once to create one.");
      let org = orgs[0];
      if (orgs.length > 1) {
        orgs.forEach((o, i) => info(`${i + 1}. ${o.name}`));
        org = orgs[Number(await ask("Which organisation? (number)", { validate: (n) => orgs[Number(n) - 1] })) - 1];
      }
      const created = await api("/projects", {
        method: "POST",
        body: {
          name: "family-ledger",
          organization_id: org.id,
          region: "ap-south-1",
          db_pass: randomBytes(24).toString("base64url"),
        },
      });
      if (!created.ok) {
        fail(
          `Supabase couldn't create the project: ${created.json?.message ?? created.status}. (Free accounts allow 2 active projects.)`,
        );
      }
      state.supabaseRef = created.json.id ?? created.json.ref;
      info("Creating project in Mumbai — this takes a couple of minutes…");
    }
    saveState();
  }
  const ref = state.supabaseRef;
  state.supabaseUrl = `https://${ref}.supabase.co`;

  for (let i = 0; i < 80; i++) {
    const p = await api(`/projects/${ref}`);
    if (p.json?.status === "ACTIVE_HEALTHY") break;
    if (i === 79) fail("The Supabase project didn't become ready in time. Try again in a few minutes.");
    await sleep(5000);
  }
  ok(`Project ready: ${state.supabaseUrl}`);

  const keys = pickSupabaseKeys((await api(`/projects/${ref}/api-keys?reveal=true`)).json ?? []);
  if (!keys.publishable || !keys.secret) fail("Couldn't read the project's API keys.");
  state.supabasePublishableKey = keys.publishable; // designed to be public
  secrets.supabaseServiceKey = keys.secret;
  saveState();
  saveSecrets();

  const current = (await api(`/projects/${ref}/config/auth`)).json ?? {};
  const pk = passkeyPatch(current, { host: state.host, origin: state.origin });
  const patch = {
    site_url: state.siteUrl,
    uri_allow_list: state.siteUrl,
    disable_signup: true,
    mailer_otp_exp: 86400,
    ...pk,
  };
  const patched = await api(`/projects/${ref}/config/auth`, { method: "PATCH", body: patch });
  if (!patched.ok) fail(`Couldn't update sign-in settings: ${patched.json?.message ?? patched.status}`);
  ok("Sign-ups turned off (family members are invited), app address set.");

  if (Object.keys(pk).length > 0) {
    ok("Passkeys turned on.");
  } else if (!state.passkeysConfirmed) {
    you("Turn on passkeys (Supabase doesn't allow this through its API yet).");
    info(`In the tab that opens: Authentication → Passkeys → enable, and use:`);
    info(`  Relying Party ID:      ${bold(state.host)}`);
    info(`  Relying Party Origins: ${bold(state.origin)}`);
    info(`  Display name:          ${bold("Family Ledger")}`);
    openBrowser(`https://supabase.com/dashboard/project/${ref}/auth/providers`);
    await pressEnter("Save it.");
    state.passkeysConfirmed = true;
    saveState();
  }

  const jwks = await http(`${state.supabaseUrl}/auth/v1/.well-known/jwks.json`);
  if (!jwks.json?.keys?.some((k) => ["EC", "RSA", "OKP"].includes(k.kty))) {
    you("Switch the project to JWT signing keys (the API only trusts those).");
    openBrowser(`https://supabase.com/dashboard/project/${ref}/settings/jwt`);
    await pressEnter("Click “Migrate JWT secret” / create the signing key and rotate to it.");
  }
  ok("Tokens are signed with an asymmetric key.");
}

async function cloudflare() {
  step(7, "Cloudflare Worker (the API)");
  const who = run("npx", ["wrangler", "whoami"], { cwd: API_DIR, check: false });
  if (!who.ok || /not authenticated/i.test(who.out + who.err)) {
    you("A browser tab will open to sign in to Cloudflare (sign up for free if needed). Click “Allow”.");
    const login = await runLive("npx", ["wrangler", "login"], API_DIR);
    if (!login.ok) fail("Cloudflare sign-in didn't complete.");
  }
  ok("Signed in to Cloudflare.");

  const config = workerConfig({
    origin: state.origin,
    supabaseUrl: state.supabaseUrl,
    owner: state.owner,
    appId: state.githubApp.id,
    installationId: state.githubApp.installationId,
  });
  writeFileSync(
    GENERATED_CONFIG,
    `// Generated by scripts/setup.mjs. Not committed.\n${JSON.stringify(config, null, 2)}\n`,
  );

  info("Deploying…");
  const deploy = await runLive("npx", ["wrangler", "deploy", "-c", GENERATED_CONFIG], API_DIR);
  if (!deploy.ok) {
    if (/workers\.dev subdomain/i.test(deploy.out)) {
      you("Pick a free workers.dev subdomain in the tab that opens, then run `npm run setup` again.");
      const onboarding = deploy.out.match(/https:\/\/dash\.cloudflare\.com\/[a-f0-9]+\/workers\/onboarding/)?.[0];
      openBrowser(onboarding ?? "https://dash.cloudflare.com/?to=/:account/workers-and-pages");
      process.exit(1);
    }
    fail("Deploying the Worker failed (see above).");
  }
  state.apiUrl = workersDevUrl(deploy.out) ?? state.apiUrl;
  if (!state.apiUrl)
    state.apiUrl = await ask("Paste the workers.dev address printed above", { validate: (u) => /^https:\/\//.test(u) });
  saveState();

  const tmp = join(DIR, "worker-secrets.tmp.json");
  writePrivate(
    tmp,
    JSON.stringify({
      FAMILY_MEMBERS: JSON.stringify(state.members),
      DATA_ENCRYPTION_KEYS: JSON.stringify(secrets.dataKeys),
      GITHUB_APP_PRIVATE_KEY: secrets.githubAppPem,
      SUPABASE_SERVICE_ROLE_KEY: secrets.supabaseServiceKey,
    }),
  );
  const bulk = run("npx", ["wrangler", "secret", "bulk", tmp, "-c", GENERATED_CONFIG], { cwd: API_DIR, check: false });
  rmSync(tmp, { force: true });
  if (!bulk.ok) fail(`Uploading secrets failed:\n${bulk.err || bulk.out}`);
  state.secretsUploaded = true;
  saveState();
  ok("Secrets stored in Cloudflare.");

  // A brand-new workers.dev subdomain can take several minutes to get its HTTPS certificate.
  let healthy = false;
  for (let i = 0; i < 100 && !healthy; i++) {
    if (i === 3) info("Waiting for Cloudflare to finish setting up the new address (can take a few minutes)…");
    await sleep(6000);
    healthy = await http(`${state.apiUrl}/api/health`).then(
      (r) => r.json?.ok === true,
      () => false,
    );
  }
  if (!healthy)
    fail(`The API at ${state.apiUrl} isn't answering. Check the Worker's logs in the Cloudflare dashboard.`);
  const locked = await http(`${state.apiUrl}/api/ledger`, { headers: { Origin: state.origin } });
  if (locked.status !== 401) fail(`The API answered ${locked.status} instead of asking for sign-in.`);
  ok(`API running at ${state.apiUrl} and refusing anyone not signed in.`);
}

async function publishConnected() {
  step(8, "Switch the website from demo to the real app");
  if (!state.connectedPublished) {
    info(`${state.siteUrl} currently shows the demo. After this it will show the real app (sign-in required).`);
    const yes = await ask("Continue? (yes/no)", { validate: (a) => /^(y|yes|n|no)$/i.test(a) });
    if (/^n/i.test(yes)) {
      info("Stopped. Run `npm run setup` again when you're ready.");
      return false;
    }
  }
  const repo = `${state.owner}/${APP_REPO}`;
  const vars = {
    APP_MODE: "connected",
    API_BASE_URL: state.apiUrl,
    SUPABASE_URL: state.supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: state.supabasePublishableKey,
  };
  for (const [k, v] of Object.entries(vars)) run("gh", ["variable", "set", k, "--body", v, "--repo", repo]);
  run("gh", ["workflow", "run", "deploy-pages.yml", "--repo", repo]);
  info("Building and publishing (about 2 minutes)…");
  await sleep(8000);
  const id = run("gh", [
    "run",
    "list",
    "--workflow",
    "deploy-pages.yml",
    "--repo",
    repo,
    "--limit",
    "1",
    "--json",
    "databaseId",
    "--jq",
    ".[0].databaseId",
  ]).out;
  const watch = await runLive("gh", ["run", "watch", id, "--repo", repo, "--exit-status", "--interval", "10"], ROOT);
  if (!watch.ok) fail("Publishing failed. See the Actions tab on GitHub.");
  state.connectedPublished = true;
  saveState();
  ok(`Published: ${state.siteUrl}`);
  return true;
}

async function signInLinks(only = []) {
  step(9, "Sign-in links for the family");
  const key = secrets.supabaseServiceKey;
  if (!key || !state.supabaseUrl) fail("Supabase isn't set up yet.");
  const headers = key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
  const lines = [];
  const wanted = only.map((n) => n.toLowerCase());
  const members = wanted.length
    ? state.members.filter((m) => wanted.includes(m.displayName.toLowerCase()))
    : state.members;
  if (members.length === 0) fail(`No family member called ${only.join(", ")}.`);
  for (const m of members) {
    let res = await http(`${state.supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers,
      body: { type: "invite", email: m.email, redirect_to: state.siteUrl },
    });
    if (!res.ok) {
      res = await http(`${state.supabaseUrl}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers,
        body: { type: "magiclink", email: m.email, redirect_to: state.siteUrl },
      });
    }
    const link = res.json?.action_link ?? res.json?.properties?.action_link;
    if (!link) fail(`Couldn't make a link for ${m.displayName}: ${res.json?.msg ?? res.status}`);
    lines.push(`${m.displayName}:\n${link}\n`);
  }
  writePrivate(
    LINKS_FILE,
    `Family Ledger sign-in links — valid for 24 hours, each works once.\nSend each person ONLY their own link.\n\n${lines.join("\n")}`,
  );
  ok(`Links saved to ${LINKS_FILE}`);
  you("Send each person their own link (e.g. on WhatsApp). On their iPhone they should:");
  info("  1. Tap the link → Family Ledger opens signed in.");
  info("  2. Tap “Set up Face ID sign-in”.");
  info("  3. In Safari: Share → Add to Home Screen.");
  info("Need new links later? Run: npm run setup -- links");
}

function finish() {
  console.log(`\n${bold(green("All set."))}`);
  you(
    `Save ${bold(SECRETS_FILE)} in your password manager (it holds the encryption key — without it the data can't be recovered).`,
  );
  info("You can then revoke the Supabase access token at supabase.com/dashboard/account/tokens.");
}

/* ------------------------------------------------------------------ */

async function main() {
  const command = process.argv[2] ?? "all";
  try {
    if (command === "status") {
      console.log(JSON.stringify({ ...state, members: state.members?.map((m) => m.displayName) }, null, 2));
      return;
    }
    if (command === "links") {
      await signInLinks(process.argv.slice(3));
      return;
    }
    if (command === "emails") {
      delete state.members;
      saveState();
    } else if (command !== "all")
      fail(`Unknown command “${command}”. Use: setup, setup -- links, setup -- status, setup -- emails`);
    console.log(bold("Family Ledger setup") + " — safe to re-run; finished steps are skipped.");
    await checkTools();
    await collectFamily();
    await privateRepo();
    await encryptionKey();
    await githubApp();
    await supabase();
    await cloudflare();
    if (await publishConnected()) {
      await signInLinks();
      finish();
    }
  } finally {
    rl.close();
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
