/// <reference types="vitest/config" />
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { buildCsp, normaliseBasePath, resolveAppMode, validateBuildEnv } from "./config/envGuard";

function pkgFile(name: string, file?: string): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve(`${name}/package.json`);
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { module?: string };
  return join(dirname(pkgPath), file ?? pkg.module ?? "");
}

/** Test-only: ES module builds so React-using libraries share this app's React copy. */
function lucideEsm(): string {
  return pkgFile("lucide-react");
}

/** GitHub Pages serves 404.html for unknown paths; make it the SPA so deep links work. */
function spaFallback(): Plugin {
  return {
    name: "family-ledger:spa-404",
    apply: "build",
    writeBundle(options) {
      const dir = options.dir ?? "dist";
      const index = join(dir, "index.html");
      if (existsSync(index)) copyFileSync(index, join(dir, "404.html"));
    },
  };
}

/** Pages cannot send headers, so the CSP is delivered as a meta tag in built HTML. */
function cspMeta(csp: string): Plugin {
  return {
    name: "family-ledger:csp",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler() {
        return [
          { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: csp }, injectTo: "head-prepend" },
        ];
      },
    },
  };
}

export default defineConfig(({ command, mode, isPreview }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_") };
  const skipGuard = isPreview || mode === "test" || process.env.VITEST;

  let appMode = resolveAppMode(mode, env);
  let basePath = normaliseBasePath(env.VITE_BASE_PATH);
  let csp = buildCsp({});

  if (!skipGuard) {
    const result = validateBuildEnv({ mode, command, env });
    if (result.errors.length > 0) {
      throw new Error(
        `\nFamily Ledger configuration problem (${result.appMode} mode):\n  - ${result.errors.join("\n  - ")}\n`,
      );
    }
    appMode = result.appMode;
    basePath = result.basePath;
    csp = buildCsp(result);
  }

  return {
    base: basePath,
    // DEV_HTTPS=1 serves the dev server over HTTPS (self-signed) so phones on the same Wi-Fi
    // get a secure context; WebCrypto and passkeys don't work over plain http on a LAN address.
    plugins: [react(), tailwindcss(), cspMeta(csp), spaFallback(), ...(process.env.DEV_HTTPS ? [basicSsl()] : [])],
    // npm may hoist a second React copy for peer deps in the monorepo; always use ours.
    resolve: { dedupe: ["react", "react-dom", "react/jsx-runtime"] },
    define: {
      // Fixed at build time so the demo client is tree-shaken out of connected builds.
      "import.meta.env.VITE_APP_MODE": JSON.stringify(appMode),
    },
    build: {
      sourcemap: false,
      target: "es2022",
    },
    server: { port: 5173 },
    preview: { port: 4173, strictPort: true },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}", "config/**/*.test.ts"],
      css: false,
      // The monorepo root may hoist a different React for other packages; tests must use this app's copy.
      alias: [
        { find: /^react(\/.*)?$/, replacement: `${fileURLToPath(new URL("./node_modules/react", import.meta.url))}$1` },
        // lucide-react's "main" is CommonJS (bypasses aliases); use its ES module build in tests.
        { find: /^lucide-react$/, replacement: lucideEsm() },
        // react-router resolves to CommonJS under Node conditions; use its ES module build.
        { find: /^react-router$/, replacement: pkgFile("react-router", "dist/development/index.mjs") },
        {
          find: /^react-dom(\/.*)?$/,
          replacement: `${fileURLToPath(new URL("./node_modules/react-dom", import.meta.url))}$1`,
        },
      ],
      // Resolve React (and libraries that import it) through Vite so `dedupe` applies.
      server: {
        deps: { inline: [/react-router/, /@tanstack/, /@radix-ui/, /react-hook-form/, /@hookform/, /lucide-react/] },
      },
    },
  };
});
