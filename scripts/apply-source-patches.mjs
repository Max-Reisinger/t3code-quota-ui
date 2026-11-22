#!/usr/bin/env node
/**
 * T3 Code Quota & Compact UI — TypeScript Source Tree Patcher
 *
 * Applies the Quota UI & Multi-Account enhancements directly to a cloned T3 Code
 * source repository (compatible with https://github.com/pingdotgg/t3code and
 * https://github.com/nanami-0713/t3code#feat/restrained-telemetry-ui) prior to building.
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
    return;
  }
  const orig = fs.readFileSync(fullPath, "utf8");
  const next = transform(orig);
  if (next !== orig) {
    fs.writeFileSync(fullPath, next, "utf8");
    console.log(`[source-patch] Patched: ${relPath}`);
  } else {
    console.log(`[source-patch] Already up to date: ${relPath}`);
  }
}

// 1. Compact 2-Column Limits Grid in UsageLimitsPooled.tsx
editIfExists("apps/web/src/components/usage/UsageLimitsPooled.tsx", (src) => {
  let out = src;
  out = out.replace(
    'className="grid items-center gap-x-6 gap-y-3 rounded-lg border border-border/60 p-4 md:grid-cols-[11rem_minmax(0,1fr)]"',
    'className="grid items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/60 px-3 py-2 grid-cols-[8.5rem_minmax(0,1fr)]"',
  );
  out = out.replace(
    'className="text-3xl font-semibold text-foreground tabular-nums"',
    'className="text-xl font-semibold text-foreground tabular-nums"',
  );
  out = out.replace(
    '<section className="flex flex-col gap-3">',
    '<section className="flex flex-col gap-1.5">',
  );
  out = out.replace(
    /(\{windows\.map\(\(window\)\s*=>\s*\{[\s\S]*?\}\)\})\s*<\/section>/,
    `<div className="grid grid-cols-1 gap-2 md:grid-cols-2">\n        $1\n      </div>\n    </section>`,
  );
  out = out.replace(
    '<div className="flex flex-col gap-8">',
    '<div className="flex flex-col gap-3.5">',
  );
  return out;
});

// 2. Multi-Account Side-by-Side Split Segments in packages/shared/src/usageLimits.ts
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

console.log(`[source-patch] Completed source patching in ${repoDir}`);
