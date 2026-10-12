#!/usr/bin/env node
/**
 * Fails if the static Pages artefact contains anything that must never be
 * public: private keys, tokens, encrypted ledger envelopes, source maps, or
 * files outside the expected static types.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: check-pages-artifact.mjs <dist-dir>");
  process.exit(2);
}

const ALLOWED_EXT = new Set([
  ".html",
  ".js",
  ".css",
  ".svg",
  ".png",
  ".ico",
  ".webmanifest",
  ".txt",
  ".woff2",
  ".json",
]);
const FORBIDDEN = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/, "GitHub fine-grained token"],
  [/"alg"\s*:\s*"A256GCM"/, "encrypted ledger envelope"],
  [/service_role/, "Supabase service role reference"],
  [/DATA_ENCRYPTION_KEYS/, "encryption key variable"],
  [/sk_live_[A-Za-z0-9]+/, "live secret key"],
];

const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(root, full);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    const ext = extname(name).toLowerCase();
    if (ext === ".map") problems.push(`${rel}: source maps must not be published`);
    else if (!ALLOWED_EXT.has(ext)) problems.push(`${rel}: unexpected file type`);
    if ([".js", ".html", ".json", ".css", ".txt", ".webmanifest"].includes(ext)) {
      const text = readFileSync(full, "utf8");
      for (const [re, what] of FORBIDDEN) if (re.test(text)) problems.push(`${rel}: contains ${what}`);
    }
  }
}
walk(root);

if (problems.length) {
  console.error("Refusing to publish:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("Pages artefact check passed.");
