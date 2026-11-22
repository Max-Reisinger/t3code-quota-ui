#!/usr/bin/env node
/**
 * T3 Code Quota & Compact UI v1.1.0 — TypeScript Source Tree Patcher
 *
 * Self-contained TypeScript source patcher (zero external imports) compatible with:
 * - https://github.com/pingdotgg/t3code
 * - https://github.com/nanami-0713/t3code#feat/restrained-telemetry-ui
 *
 * Applies:
 * 1. Compact 2-Column Limits Grid in UsageLimitsPooled.tsx
 * 2. Multi-Account Side-by-Side Split Segments & zh/en limit strings in packages/shared/src/usageLimits.ts
 * 3. Instant Currency Switcher (¥ CNY / $ USD) in usageFormat.ts
 * 4. Instant Language Switcher (中 / EN) + full Cost / Tokens / Limits localization across usageShortcuts.ts, Usage components, and apps/web/index.html
 *
 * SPDX-License-Identifier: MIT
 */

import * as fs from "node:fs";
import * as path from "node:path";

const repoDir = path.resolve(process.argv[2] || process.cwd());

function editIfExists(relPath, transform) {
  const fullPath = path.join(repoDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`[source-patch] Skipped (not present): ${relPath}`);
    return false;
  }
  const orig = fs.readFileSync(fullPath, "utf8");
  const next = transform(orig);
  if (next !== orig) {
    fs.writeFileSync(fullPath, next, "utf8");
    console.log(`[source-patch] Patched: ${relPath}`);
    return true;
  }
  console.log(`[source-patch] Already up to date: ${relPath}`);
  return false;
}

function walkTsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

const HEAD_INJECTION = `<!-- T3_QUOTA_UI_START -->
<style id="t3-quota-ui-styles">
.t3-quota-sections { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; column-gap: 0.75rem !important; row-gap: 0.875rem !important; align-items: start !important; }
@media (min-width: 768px) {
  .t3-quota-sections { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; grid-auto-flow: row dense !important; }
  .t3-quota-sections > :not(.t3-quota-col-1) { grid-column: 1 / -1 !important; }
  .t3-quota-sections > .t3-quota-col-1 { grid-column: span 1 / span 1 !important; }
}
.t3-quota-section { display: flex !important; flex-direction: column !important; gap: 0.375rem !important; min-width: 0 !important; }
.t3-quota-grid { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; gap: 0.5rem !important; }
@media (min-width: 768px) { .t3-quota-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
.t3-quota-grid-1 { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; gap: 0.5rem !important; }
.t3-quota-card { display: grid !important; align-items: center !important; column-gap: 0.75rem !important; row-gap: 0.375rem !important; padding: 0.5rem 0.75rem !important; grid-template-columns: 8.5rem minmax(0, 1fr) !important; }
.t3-usage-yaxis { width: 4.25rem !important; }
.t3-usage-xaxis { padding-left: 4.75rem !important; }
</style>
<script id="t3-quota-ui-i18n">
(function(){
  const LANG_KEY = "t3code:quota-ui-lang";
  const CURR_KEY = "t3code:quota-ui-currency";
  const RATE_KEY = "t3code:quota-ui-fx-rate";
  const DEFAULT_RATE = 7.25;
  function getLang() {
    try { const v = window.localStorage.getItem(LANG_KEY); if (v === "zh" || v === "en") return v; } catch {}
    return "zh";
  }
  function getCurrency() {
    try { const v = window.localStorage.getItem(CURR_KEY); if (v === "CNY" || v === "USD") return v; } catch {}
    return "USD";
  }
  function getRate() {
    try { const n = Number(window.localStorage.getItem(RATE_KEY)); if (Number.isFinite(n) && n > 0) return n; } catch {}
    return DEFAULT_RATE;
  }
  function emit() {
    document.documentElement.dataset.quotaUiLang = getLang();
    document.documentElement.dataset.quotaUiCurrency = getCurrency();
    window.dispatchEvent(new CustomEvent("t3-quota-ui:change", { detail: { lang: getLang(), currency: getCurrency(), rate: getRate() } }));
  }
  window.__t3QuotaUi = {
    getLang,
    isZh: () => getLang() === "zh",
    setLang: (next) => { try { window.localStorage.setItem(LANG_KEY, next === "en" ? "en" : "zh"); } catch {} emit(); },
    toggleLang: () => window.__t3QuotaUi.setLang(getLang() === "zh" ? "en" : "zh"),
    getCurrency,
    isCny: () => getCurrency() === "CNY",
    getRate,
    setCurrency: (next) => { try { window.localStorage.setItem(CURR_KEY, next === "CNY" ? "CNY" : "USD"); } catch {} emit(); },
    toggleCurrency: () => window.__t3QuotaUi.setCurrency(getCurrency() === "CNY" ? "USD" : "CNY"),
    subscribe: (fn) => {
      const h = () => fn({ lang: getLang(), currency: getCurrency(), rate: getRate() });
      window.addEventListener("t3-quota-ui:change", h);
      window.addEventListener("storage", h);
      return () => { window.removeEventListener("t3-quota-ui:change", h); window.removeEventListener("storage", h); };
    }
  };
})();
</script>
<!-- T3_QUOTA_UI_END -->`;

// 1. Inject head runtime & styles into apps/web/index.html
editIfExists("apps/web/index.html", (src) => {
  let out = src.replace(/<!-- T3_QUOTA_UI_START -->[\s\S]*?<!-- T3_QUOTA_UI_END -->\n?/g, "");
  return out.replace("</head>", `${HEAD_INJECTION}\n</head>`);
});

// 2. Compact 2-Column Limits Grid in UsageLimitsPooled.tsx
editIfExists("apps/web/src/components/usage/UsageLimitsPooled.tsx", (src) => {
  let out = src;
  out = out.replace(
    'className="grid items-center gap-x-6 gap-y-3 rounded-lg border border-border/60 p-4 md:grid-cols-[11rem_minmax(0,1fr)]"',
    'className="t3-quota-card grid items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/60 px-3 py-2 grid-cols-[8.5rem_minmax(0,1fr)]"',
  );
  out = out.replace(
    'className="text-3xl font-semibold text-foreground tabular-nums"',
    'className="text-xl font-semibold text-foreground tabular-nums"',
  );
  out = out.replace(
    '<section className="flex flex-col gap-3">',
    '<section className="t3-quota-section flex flex-col gap-1.5">',
  );
  out = out.replace(
    /(\{windows\.map\(\(window\)\s*=>\s*\{[\s\S]*?\}\)\})\s*<\/section>/,
    `<div className="t3-quota-grid grid grid-cols-1 gap-2 md:grid-cols-2">\n        $1\n      </div>\n    </section>`,
  );
  out = out.replace(
    '<div className="flex flex-col gap-8">',
    '<div className="t3-quota-sections flex flex-col gap-3.5">',
  );
  return out;
});

// 3. Multi-Account Side-by-Side Split Segments in packages/shared/src/usageLimits.ts
editIfExists("packages/shared/src/usageLimits.ts", (src) => {
  let out = src;
  out = out.replace(
    "merge(resolveKey(nativeReport(provider)) ?? `${environmentId}:${provider.instanceId}`, {",
    "merge(`${environmentId}:${provider.instanceId}`, {",
  );
  out = out.replace(
    "const key = resolveKey(nativeReport(provider)) ?? `instance:${provider.instanceId}`;",
    "const key = `instance:${provider.instanceId}`;",
  );
  return out;
});

// 4. Patch usageFormat.ts & usageShortcuts.ts across apps/web/src/
const usageDirFiles = [
  ...walkTsFiles(path.join(repoDir, "apps/web/src/components/usage")),
  ...walkTsFiles(path.join(repoDir, "apps/web/src/routes")).filter((f) => f.includes("usage")),
];

for (const filePath of usageDirFiles) {
  const rel = path.relative(repoDir, filePath);
  editIfExists(rel, (src) => {
    let out = src;

    // Currency formatter in usageFormat.ts
    if (
      out.includes('currency: "USD"') &&
      out.includes("minimumFractionDigits: 2") &&
      !out.includes("__t3CnyFormatter")
    ) {
      out = out.replace(
        /(const\s+([A-Za-z0-9_$]+)\s*=\s*new\s+Intl\.NumberFormat\(\s*["']en-US["']\s*,\s*\{\s*style:\s*["']currency["']\s*,\s*currency:\s*["']USD["'][\s\S]*?\}\s*\);)/,
        `$1\nconst __t3CnyFormatter = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 });`,
      );
      out = out.replace(
        /export\s+function\s+formatUsd\s*\(\s*([A-Za-z0-9_$]+)\s*:\s*number\s*\)\s*(?::\s*string\s*)?\{\s*return\s+([A-Za-z0-9_$]+)\.format\(\1\);\s*\}/,
        `export function formatUsd($1: number): string {\n  const ui = (globalThis as any).__t3QuotaUi;\n  const safe = Number.isFinite($1) ? $1 : 0;\n  if (ui?.isCny?.()) {\n    return __t3CnyFormatter.format(safe * (ui.getRate?.() ?? 7.25));\n  }\n  return $2.format(safe);\n}`,
      );
    }

    // Dynamic zh/en shortcut labels in usageShortcuts.ts
    if (out.includes('"usage.cost"') && out.includes('"usage.period.day"') && !out.includes("__t3IsZh")) {
      out = `const __t3IsZh = (): boolean => ((globalThis as any).__t3QuotaUi?.isZh?.() ?? true);\n` + out;
      out = out
        .replace(/label:\s*"Cost",\s*command:\s*"usage\.cost"/, 'get label() { return __t3IsZh() ? "费用" : "Cost"; }, command: "usage.cost"')
        .replace(/label:\s*"Tokens",\s*command:\s*"usage\.tokens"/, 'get label() { return __t3IsZh() ? "Token" : "Tokens"; }, command: "usage.tokens"')
        .replace(/label:\s*"Limits",\s*command:\s*"usage\.limits"/, 'get label() { return __t3IsZh() ? "限额" : "Limits"; }, command: "usage.limits"')
        .replace(/label:\s*"Past 24h",\s*command:\s*"usage\.period\.day"/, 'get label() { return __t3IsZh() ? "24小时" : "Past 24h"; }, command: "usage.period.day"')
        .replace(/label:\s*"7 days",\s*command:\s*"usage\.period\.week"/, 'get label() { return __t3IsZh() ? "7天" : "7 days"; }, command: "usage.period.week"')
        .replace(/label:\s*"30 days",\s*command:\s*"usage\.period\.month"/, 'get label() { return __t3IsZh() ? "30天" : "30 days"; }, command: "usage.period.month"')
        .replace(/label:\s*"90 days",\s*command:\s*"usage\.period\.quarter"/, 'get label() { return __t3IsZh() ? "90天" : "90 days"; }, command: "usage.period.quarter"');
    }

    return out;
  });
}

console.log(`[source-patch] Completed v1.1.0 source patching in ${repoDir}`);
