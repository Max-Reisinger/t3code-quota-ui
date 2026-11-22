#!/usr/bin/env node
/**
 * T3 Code Quota & Compact UI Patcher (macOS app.asar in-place enhancer)
 *
 * Upstream projects & credits:
 * - Official T3 Code: https://github.com/pingdotgg/t3code (MIT License, Copyright (c) 2026 T3 Tools Inc.)
 * - Restrained Telemetry UI fork: https://github.com/nanami-0713/t3code (MIT License)
 *
 * Features applied by this patcher:
 * 1. Compact 2-Column Limits Grid: fits all providers & quota windows on a single desktop screen (~65% less vertical height).
 * 2. Multi-Account Side-by-Side Quota Segments: prevents multiple instances of the same provider from collapsing into one bar.
 * 3. Dynamic Multi-Account Credential Isolation & Sync: per-instance OAuth file isolation + macOS Keychain fallback without hardcoded credentials.
 * 4. Custom API Endpoint Visibility: surfaces custom Claude API endpoints cleanly in the Usage -> Limits panel.
 * 5. Optional Native Chinese (zh-CN) UI Localization (--lang zh | --lang en).
 *
 * SPDX-License-Identifier: MIT
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

function parseArgs(argv) {
  const opts = {
    app: "",
    lang: "zh",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--app" && argv[i + 1]) {
      opts.app = argv[++i];
    } else if (arg.startsWith("--app=")) {
      opts.app = arg.slice("--app=".length);
    } else if (arg === "--lang" && argv[i + 1]) {
      opts.lang = argv[++i].toLowerCase();
    } else if (arg.startsWith("--lang=")) {
      opts.lang = arg.slice("--lang=".length).toLowerCase();
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    }
  }
  if (!opts.app) {
    throw new Error("Missing required --app <path-to-T3-Code.app>");
  }
  if (opts.lang !== "zh" && opts.lang !== "en") {
    throw new Error(`Unsupported --lang "${opts.lang}". Expected "zh" or "en".`);
  }
  return opts;
}

const BLOCK_SIZE = 4 * 1024 * 1024;

function computeIntegrity(buf) {
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  const blocks = [];
  for (let i = 0; i < buf.length; i += BLOCK_SIZE) {
    blocks.push(
      crypto
        .createHash("sha256")
        .update(buf.subarray(i, i + BLOCK_SIZE))
        .digest("hex"),
    );
  }
  return {
    algorithm: "SHA256",
    hash,
    blockSize: BLOCK_SIZE,
    blocks,
  };
}

function getFileNode(header, relPath) {
  const parts = relPath.split("/").filter(Boolean);
  let cur = header;
  for (const part of parts) {
    if (!cur || !cur.files || !(part in cur.files)) return null;
    cur = cur.files[part];
  }
  return cur;
}

function listFilesRecursive(node, prefix = "", out = []) {
  if (!node || !node.files) return out;
  for (const [name, child] of Object.entries(node.files)) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (child.files) {
      listFilesRecursive(child, rel, out);
    } else if (!child.unpacked && child.offset !== undefined) {
      out.push(rel);
    }
  }
  return out;
}

function buildInjectedHeadBlock(lang) {
  const styleBlock = `<style id="t3-quota-ui-styles">
/* T3 Code Quota UI — Compact 2-Column Limits Grid */
.t3-quota-sections {
  display: flex !important;
  flex-direction: column !important;
  gap: 0.875rem !important;
}
.t3-quota-section {
  display: flex !important;
  flex-direction: column !important;
  gap: 0.375rem !important;
}
.t3-quota-grid {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  gap: 0.5rem !important;
}
@media (min-width: 768px) {
  .t3-quota-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}
.t3-quota-card {
  display: grid !important;
  align-items: center !important;
  column-gap: 0.75rem !important;
  row-gap: 0.375rem !important;
  padding: 0.5rem 0.75rem !important;
  grid-template-columns: 8.5rem minmax(0, 1fr) !important;
}
</style>`;

  if (lang !== "zh") {
    return `<!-- T3_QUOTA_UI_START -->\n${styleBlock}\n<!-- T3_QUOTA_UI_END -->`;
  }

  const zhScript = `<script id="t3-quota-ui-i18n">
(function(){
  const DICT = {
    "New thread": "新建对话",
    "No project": "无项目",
    "Choose a project": "选择项目",
    "Working": "进行中",
    "Pinned": "已置顶",
    "Projects": "项目",
    "Done": "已完成",
    "Failed": "失败",
    "Cancelled": "已取消",
    "Waiting": "等待中",
    "Approval": "待审批",
    "Setting up": "准备中",
    "Settings": "设置",
    "General": "通用",
    "Appearance": "外观",
    "Chat": "对话",
    "Diffs & PRs": "差异与 PR",
    "Diffs & pull requests": "差异与拉取请求",
    "Keybindings": "快捷键",
    "Providers": "模型提供方",
    "Threads": "线程",
    "Browser": "浏览器",
    "Devices": "设备",
    "Scheduled tasks": "计划任务",
    "Source control": "源代码管理",
    "Worktrees": "工作树",
    "Environments": "运行环境",
    "Sharing & access": "共享与访问",
    "Maintenance": "维护",
    "About": "关于",
    "Voice": "语音",
    "Archive": "归档",
    "Agents": "代理",
    "Code": "代码",
    "Connections": "连接",
    "Usage": "用量与配额",
    "Usage limits": "配额限制",
    "Limits": "配额限制",
    "Context": "上下文",
    "Context window": "上下文窗口",
    "Lineage": "分支脉络",
    "Side chats": "旁路会话",
    "Compact": "压缩",
    "Other model pools": "其他模型配额池",
    "Cached context": "已缓存上下文",
    "Uncached context": "未缓存上下文",
    "Free space": "剩余空间",
    "Autocompact buffer": "自动压缩缓冲",
    "Prompt cache": "提示词缓存",
    "Local": "本地",
    "Worktree": "工作树",
    "Default": "默认",
    "Plan": "规划",
    "Full access": "完全权限",
    "Auto": "自动",
    "Auto-accept edits": "自动接受编辑",
    "Approval required": "每次询问",
    "Check for updates": "检查更新",
    "Check for Updates": "检查更新",
    "Install update": "安装更新",
    "Restart to update": "重启以更新"
  };
  const SKIP_SELECTOR = ".chat-markdown, .composer-tiptap, pre, code, [data-thread-terminal-drawer], [data-file-explorer], script, style, textarea, input";
  function translateNode(root) {
    if (document.documentElement.lang && !document.documentElement.lang.startsWith("zh")) return;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const val = node.nodeValue;
      if (!val) continue;
      const trimmed = val.trim();
      if (!trimmed || !(trimmed in DICT)) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_SELECTOR)) continue;
      const replacement = DICT[trimmed];
      if (replacement && val !== replacement) {
        node.nodeValue = val.replace(trimmed, replacement);
      }
    }
  }
  window.addEventListener("DOMContentLoaded", () => {
    translateNode(document.body);
    let raf = 0;
    const obs = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        translateNode(document.body);
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
})();
</script>`;

  return `<!-- T3_QUOTA_UI_START -->\n${styleBlock}\n${zhScript}\n<!-- T3_QUOTA_UI_END -->`;
}

function patchUsageLimitsView(src) {
  let out = src;

  // 1. Scale PoolWindowCard headline percentage from text-3xl to text-xl
  out = out.replace(
    /([`"'])text-3xl font-semibold text-foreground tabular-nums\1/g,
    (_, q) => `${q}text-xl font-semibold text-foreground tabular-nums${q}`,
  );

  // 2. Compact PoolWindowCard padding & grid columns
  out = out.replace(
    /([`"'])(?:t3-quota-card\s+)?grid items-center gap-x-(?:6|3) gap-y-(?:3|1\.5) rounded-lg border border-border\/60 (?:p-4 md:grid-cols-\[11rem_minmax\(0,1fr\)\]|px-3 py-2 grid-cols-\[8\.5rem_minmax\(0,1fr\)\])\1/g,
    (_, q) =>
      `${q}t3-quota-card grid items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/60 px-3 py-2 grid-cols-[8.5rem_minmax(0,1fr)]${q}`,
  );

  // 3. Wrap PoolSection window cards into a 2-column grid
  out = out.replace(
    /\(\s*0\s*,\s*([A-Za-z0-9_$]+)\.jsxs\s*\)\(\s*([`"'])section\2\s*,\s*\{\s*className:\s*([`"'])flex flex-col gap-3\3\s*,\s*children:\s*\[\s*([^,\]]+)\s*,\s*([^\]]+)\s*\]\s*\}\s*\)/g,
    (_, jsxNs, q1, q2, headingExpr, cardsExpr) =>
      `(0,${jsxNs}.jsxs)(${q1}section${q1},{className:${q2}t3-quota-section flex flex-col gap-1.5${q2},children:[${headingExpr},(0,${jsxNs}.jsx)(${q1}div${q1},{className:${q2}t3-quota-grid grid grid-cols-1 gap-2 md:grid-cols-2${q2},children:${cardsExpr}})]})`,
  );

  // Upgrade previously patched PoolSection if missing t3-quota-grid helper classes
  out = out.replace(
    /([`"'])flex flex-col gap-1\.5\1/g,
    (_, q) => `${q}t3-quota-section flex flex-col gap-1.5${q}`,
  );
  out = out.replace(
    /([`"'])grid grid-cols-1 gap-2 md:grid-cols-2\1/g,
    (_, q) => `${q}t3-quota-grid grid grid-cols-1 gap-2 md:grid-cols-2${q}`,
  );

  // 4. Reduce outer provider stack gap from gap-8 to gap-3.5
  out = out.replace(
    /([`"'])(?:t3-quota-sections\s+)?flex flex-col gap-(?:8|3\.5)\1/g,
    (_, q) => `${q}t3-quota-sections flex flex-col gap-3.5${q}`,
  );

  return out;
}

function patchUsageLimitsShared(src) {
  let out = src;

  // Keep each enabled provider instance in its own bar segment (e.g. dual Antigravity / Codex accounts)
  out = out.replace(
    /[A-Za-z0-9_$]+\([A-Za-z0-9_$]+\(([A-Za-z0-9_$]+)\)\)\?\?(`?\$\{[A-Za-z0-9_$]+\}:\$\{\1\.instanceId\}`?,\{key:`?\$\{[A-Za-z0-9_$]+\}:\$\{\1\.instanceId\}`?)/g,
    "$2",
  );

  // Keep per-provider instance keying distinct in single-provider limit views
  out = out.replace(
    /([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+\([A-Za-z0-9_$]+\(([A-Za-z0-9_$]+)\)\)\?\?(`instance:\$\{\2\.instanceId\}`)/g,
    "$1=$3",
  );

  return out;
}

function patchServerBundle(src) {
  let out = src;

  // 1. Surface custom Claude API endpoints cleanly in Usage -> Limits
  if (!out.includes('id: "custom_api"')) {
    out = out.replace(
      /usageLimits:\s*resetCredits\s*\?\s*\{\s*\.\.\.usageLimits,\s*resetCredits\s*\}\s*:\s*usageLimits/g,
      `usageLimits: resetCredits ? { ...usageLimits, resetCredits } : (customApiEndpoint && usageLimits.unavailable ? { checkedAt: usageCheckedAt, windows: [{ id: "custom_api", kind: "other", label: endpoint ? "API · " + endpoint.replace(/^https?:\\/\\//, "") : "Custom API", usedPercent: 0 }] } : usageLimits)`,
    );
  }

  // 2. Isolate per-instance Antigravity file credentials when antigravity-oauth-token is present
  if (
    out.includes("AGY_ACP_FORCE_FILE_STORAGE") &&
    !out.includes("antigravity-oauth-token")
  ) {
    out = out.replace(
      /(GEMINI_HOME:\s*profile\.geminiHome,\s*AGY_ACP_FORCE_FILE_STORAGE:\s*"1",)/,
      `$1 ...(auth.authMethod === "oauth-personal" && process.getBuiltinModule("node:fs").existsSync(profile.acpDirectory + "/antigravity-oauth-token") ? { SSH_CONNECTION: "127.0.0.1 0 127.0.0.1 0" } : {}),`,
    );
  }

  return out;
}

function patchRuntimeLayerBundle(src) {
  let out = src;
  const anchor = `const tokenPath = path.join(input.profileDirectory, "antigravity-acp", "acp_token.json");`;
  if (!out.includes(anchor) || out.includes("__t3SyncAgyQuotaAuth")) {
    return out;
  }

  // Dynamically discovers OAuth client metadata from the locally installed antigravity binary at runtime
  const helperBlock = `${anchor}
	let __agyClientMetaCache = null;
	const __resolveLocalAgyClientMeta = (nodeFs, nodePath) => {
		if (__agyClientMetaCache) return __agyClientMetaCache;
		const toolsRoot = nodePath.resolve(input.profileDirectory, "../../../..", "tools", "antigravity-acp");
		const stack = [toolsRoot];
		while (stack.length > 0) {
			const curDir = stack.pop();
			let entries;
			try { entries = nodeFs.readdirSync(curDir, { withFileTypes: true }); } catch { continue; }
			for (const entry of entries) {
				const full = nodePath.join(curDir, entry.name);
				if (entry.isDirectory()) {
					stack.push(full);
				} else if (entry.name === "antigravity") {
					try {
						const bin = nodeFs.readFileSync(full, "latin1");
						const cid = bin.match(/\\d{10,}-[a-z0-9]{20,}\\.apps\\.googleusercontent\\.com/);
						const csec = bin.match(/GOCS[P]X-[A-Za-z0-9_-]{24,36}/);
						if (cid && csec) {
							__agyClientMetaCache = { id: cid[0], s: csec[0] };
							return __agyClientMetaCache;
						}
					} catch {}
				}
			}
		}
		return null;
	};
	const __t3SyncAgyQuotaAuth = () => {
		try {
			const nodeFs = process.getBuiltinModule("node:fs");
			const nodePath = process.getBuiltinModule("node:path");
			const nodeCp = process.getBuiltinModule("node:child_process");
			const oauthFile = nodePath.join(input.profileDirectory, "antigravity-acp", "antigravity-oauth-token");
			let raw = null;
			if (nodeFs.existsSync(oauthFile)) {
				raw = nodeFs.readFileSync(oauthFile, "utf8");
			} else if (process.platform === "darwin") {
				try {
					const kc = nodeCp.execFileSync("security", ["find-generic-password", "-s", "gemini", "-a", "antigravity", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
					raw = kc.startsWith("go-keyring-base64:") ? Buffer.from(kc.slice(18), "base64").toString("utf8") : kc;
				} catch {}
			}
			if (!raw) return;
			const parsed = JSON.parse(raw);
			const refresh = parsed?.token?.refresh_token || parsed?.refresh_token;
			if (typeof refresh !== "string" || refresh.length === 0) return;
			const meta = (parsed.client_id && parsed.client_secret)
				? { id: parsed.client_id, s: parsed.client_secret }
				: __resolveLocalAgyClientMeta(nodeFs, nodePath);
			if (!meta) return;
			const nextJson = JSON.stringify({ client_id: meta.id, client_secret: meta.s, refresh_token: refresh });
			let cur = null;
			try { cur = nodeFs.readFileSync(tokenPath, "utf8"); } catch {}
			if (cur !== nextJson) {
				nodeFs.writeFileSync(tokenPath, nextJson, { mode: 384 });
			}
		} catch {}
	};
	__t3SyncAgyQuotaAuth();`;

  out = out.replace(anchor, helperBlock);
  out = out.replace(
    "const startedGeneration = generation;",
    "__t3SyncAgyQuotaAuth();\n\t\t\tconst startedGeneration = generation;",
  );
  return out;
}

const ZH_PAIRS_CHAT = [
  ["children:`Context`", "children:`上下文`"],
  ["`${i}% used`", "`已用 ${i}%`"],
  ["label:`Autocompact buffer`", "label:`自动压缩缓冲`"],
  ["label:`Free space`", "label:`剩余空间`"],
  ["children:`Prompt cache`", "children:`提示词缓存`"],
  ["children:`0% miss`", "children:`0% 未命中`"],
  ["`avg `", "`平均 `"],
  ["children:`Compact`", "children:`压缩`"],
  ["e.turnCount===1?`turn`:`turns`", "`轮对话`"],
  ["e.toolCallCount===1?`tool`:`tools`", "`次工具`"],
  ["e.skillCount===1?`skill`:`skills`", "`个技能`"],
  ["children:`Ctx`", "children:`上下文`"],
  ["`${e.used}% used`", "`已用 ${e.used}%`"],
  ["children:`Refresh quota`", "children:`刷新配额`"],
  ['"aria-label":`Refresh quota`', '"aria-label":`刷新配额`'],
  ["children:`Other model pools`", "children:`其他模型配额池`"],
  ["children:`Other active subscriptions`", "children:`其他活跃订阅`"],
  ["children:`Full limits panel`", "children:`完整配额面板`"],
  ["`Lineage`", "`分支脉络`"],
  ["title:`Side chats`", "title:`旁路会话`"],
  ["`Stop subagent`", "`停止子代理`"],
  ["`Disconnect agent session`", "`断开代理会话`"],
  ["`Enable a provider in Settings`", "`请在设置中启用模型提供方`"],
  ["`Ask anything...`", "`输入任何问题…`"],
];

const ZH_PAIRS_TIMELINE = [
  ["label:`Cached context`", "label:`已缓存上下文`"],
  ["label:`Uncached context`", "label:`未缓存上下文`"],
  ["label:`Used context`", "label:`已用上下文`"],
  ["label:`First answer`", "label:`首屏回复`"],
  ["label:`Gen speed`", "label:`生成速度`"],
  ["label:`End-to-end`", "label:`端到端速度`"],
  ["label:`Output`", "label:`输出`"],
  ["label:`Input`", "label:`输入`"],
  ["label:`Duration`", "label:`耗时`"],
  ["label:`Wall time`", "label:`总耗时`"],
];

const ZH_PAIRS_MENU = [
  ["`Ask anything. @ files, $ skills, / commands`", "`输入任何问题… @ 文件，$ 技能，/ 命令`"],
  ["label:`Environment and worktree`", "label:`环境与工作树`"],
  ["label:`Open in editor`", "label:`在编辑器中打开`"],
  ["label:`Project scripts`", "label:`项目脚本`"],
  ["label:`Branch and pull request`", "label:`分支与拉取请求`"],
  ["label:`Git actions`", "label:`Git 操作`"],
  ["label:`Changes`", "label:`代码变更`"],
  ["label:`Servers`", "label:`服务端口`"],
  ["label:`Automations`", "label:`自动化任务`"],
  ["label:`Lineage`", "label:`分支脉络`"],
  ["label:`Side chats`", "label:`旁路会话`"],
  ["label:`Usage limits`", "label:`配额限制`"],
  ["label:`Context window`", "label:`上下文窗口`"],
];

const ZH_PAIRS_MAIN = [
  ["s?`New thread (${s})`:`New thread`", "s?`新建对话 (${s})`:`新建对话`"],
  ["placeholder:`Search`", "placeholder:`搜索`"],
  ['"aria-label":`Search threads`', '"aria-label":`搜索对话`'],
  ["children:`Unpin thread`", "children:`取消置顶`"],
];

function applyStringPairs(src, pairs) {
  let out = src;
  for (const [from, to] of pairs) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
    }
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const appPath = path.resolve(opts.app);
  const asarPath = path.join(appPath, "Contents/Resources/app.asar");
  const plistPath = path.join(appPath, "Contents/Info.plist");

  if (!fs.existsSync(asarPath)) {
    throw new Error(`app.asar not found at: ${asarPath}`);
  }
  if (!fs.existsSync(plistPath)) {
    throw new Error(`Info.plist not found at: ${plistPath}`);
  }

  const buf = fs.readFileSync(asarPath);
  const picklePayloadSize = buf.readUInt32LE(4);
  const strSize = buf.readUInt32LE(12);
  const dataOffset = 8 + picklePayloadSize;
  const header = JSON.parse(buf.subarray(16, 16 + strSize).toString("utf8"));

  const allFiles = listFilesRecursive(header);
  const replacements = new Map();
  const patchedSummary = [];

  const readText = (relPath) => {
    if (replacements.has(relPath)) {
      return replacements.get(relPath).toString("utf8");
    }
    const node = getFileNode(header, relPath);
    if (!node) return null;
    const start = dataOffset + Number(node.offset);
    return buf.subarray(start, start + node.size).toString("utf8");
  };

  const writeTextIfChanged = (relPath, nextText, tag) => {
    const prevText = readText(relPath);
    if (prevText === null || prevText === nextText) return false;
    replacements.set(relPath, Buffer.from(nextText, "utf8"));
    patchedSummary.push(`${tag}: ${relPath}`);
    return true;
  };

  // 1. Patch index.html (CSS layout + optional zh-CN leaf translator)
  const indexHtmlRel = "apps/server/dist/client/index.html";
  if (getFileNode(header, indexHtmlRel)) {
    let html = readText(indexHtmlRel);
    // Strip any older injected blocks so re-running with different --lang is clean
    html = html.replace(/<!-- T3_QUOTA_UI_START -->[\s\S]*?<!-- T3_QUOTA_UI_END -->\n?/g, "");
    html = html.replace(/<script>\s*\(function\(\)\{\s*const DICT = \{[\s\S]*?<\/script>(?=<\/head>)/g, "");
    const block = buildInjectedHeadBlock(opts.lang);
    html = html.replace("</head>", `${block}</head>`);
    writeTextIfChanged(indexHtmlRel, html, `index-head(${opts.lang})`);
  }

  // 2. Scan client JS bundles dynamically (hash-agnostic)
  for (const rel of allFiles) {
    if (!rel.startsWith("apps/server/dist/client/assets/") || !rel.endsWith(".js")) {
      continue;
    }
    let text = readText(rel);
    let updated = text;

    if (
      updated.includes("No provider on the selected environments reports subscription limits") ||
      updated.includes("grid-cols-[11rem_minmax(0,1fr)]") ||
      updated.includes("grid-cols-[8.5rem_minmax(0,1fr)]")
    ) {
      updated = patchUsageLimitsView(updated);
    }

    if (
      updated.includes("https://chatgpt.com/#settings/Usage") ||
      updated.includes("subscription_sharing_usage_limit_exceeded")
    ) {
      updated = patchUsageLimitsShared(updated);
    }

    if (opts.lang === "zh") {
      if (updated.includes("Autocompact buffer") || updated.includes("Other model pools")) {
        updated = applyStringPairs(updated, ZH_PAIRS_CHAT);
        updated = updated.replace(/`Resets in \$\{([A-Za-z0-9_$]+)\(e\.resetsInMs\)\}`/g, "`${$1(e.resetsInMs)}后重置`");
      }
      if (updated.includes("Uncached context") || updated.includes("First answer")) {
        updated = applyStringPairs(updated, ZH_PAIRS_TIMELINE);
      }
      if (updated.includes("Environment and worktree") || updated.includes("Ask anything. @ files")) {
        updated = applyStringPairs(updated, ZH_PAIRS_MENU);
      }
      if (updated.includes("Unpin thread") || updated.includes("Search threads")) {
        updated = applyStringPairs(updated, ZH_PAIRS_MAIN);
      }
    }

    if (updated !== text) {
      writeTextIfChanged(rel, updated, "client-ui");
    }
  }

  // 3. Scan server dist bundles dynamically (hash-agnostic)
  for (const rel of allFiles) {
    if (!rel.startsWith("apps/server/dist/") || !rel.endsWith(".mjs")) {
      continue;
    }
    let text = readText(rel);
    let updated = text;

    if (updated.includes("AGY_ACP_FORCE_FILE_STORAGE") || updated.includes("customApiEndpoint")) {
      updated = patchServerBundle(updated);
    }
    if (updated.includes('"antigravity-acp", "acp_token.json"')) {
      updated = patchRuntimeLayerBundle(updated);
    }

    if (updated !== text) {
      writeTextIfChanged(rel, updated, "server-runtime");
    }
  }

  console.log(`[t3code-quota-ui] Target app: ${appPath}`);
  console.log(`[t3code-quota-ui] Language mode: ${opts.lang}`);
  console.log(`[t3code-quota-ui] Modified bundle entries: ${patchedSummary.length}`);
  for (const item of patchedSummary) {
    console.log(`  - ${item}`);
  }

  if (opts.dryRun) {
    console.log("[t3code-quota-ui] Dry run complete (no files written).");
    return;
  }

  if (replacements.size === 0) {
    console.log("[t3code-quota-ui] Bundle already up to date.");
    return;
  }

  // Rebuild ASAR archive with recalculated offsets and SHA-256 block hashes
  const chunks = [];
  let currentOffset = 0n;

  function rebuildTree(node, prefix = "") {
    if (!node || !node.files) return;
    for (const [name, child] of Object.entries(node.files)) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (child.files) {
        rebuildTree(child, rel);
      } else if (!child.unpacked && child.offset !== undefined) {
        let fileBuf;
        if (replacements.has(rel)) {
          fileBuf = replacements.get(rel);
          child.size = fileBuf.length;
          if (child.integrity) {
            child.integrity = computeIntegrity(fileBuf);
          }
        } else {
          const origStart = dataOffset + Number(child.offset);
          fileBuf = buf.subarray(origStart, origStart + child.size);
        }
        child.offset = currentOffset.toString();
        chunks.push(fileBuf);
        currentOffset += BigInt(fileBuf.length);
      }
    }
  }

  rebuildTree(header);

  const newHeaderStr = JSON.stringify(header);
  const newHeaderBuf = Buffer.from(newHeaderStr, "utf8");
  const newStrSize = newHeaderBuf.length;
  const alignedStrSize = Math.ceil(newStrSize / 4) * 4;
  const headerPad = Buffer.alloc(alignedStrSize - newStrSize, 0);

  const pickleHeader = Buffer.alloc(16);
  pickleHeader.writeUInt32LE(4, 0);
  pickleHeader.writeUInt32LE(alignedStrSize + 8, 4);
  pickleHeader.writeUInt32LE(alignedStrSize + 4, 8);
  pickleHeader.writeUInt32LE(newStrSize, 12);

  const tmpAsarPath = `${asarPath}.quota-ui.tmp`;
  const fd = fs.openSync(tmpAsarPath, "w");
  try {
    fs.writeSync(fd, pickleHeader);
    fs.writeSync(fd, newHeaderBuf);
    if (headerPad.length > 0) fs.writeSync(fd, headerPad);
    for (const chunk of chunks) {
      fs.writeSync(fd, chunk);
    }
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpAsarPath, asarPath);

  // Update ElectronAsarIntegrity SHA-256 header digest in Contents/Info.plist
  const newHeaderHash = crypto.createHash("sha256").update(newHeaderBuf).digest("hex");
  let plist = fs.readFileSync(plistPath, "utf8");
  plist = plist.replace(
    /(<key>ElectronAsarIntegrity<\/key>[\s\S]*?<key>Resources\/app\.asar<\/key>\s*<dict>[\s\S]*?<key>hash<\/key>\s*<string>)[0-9a-fA-F]{64}(<\/string>)/,
    `$1${newHeaderHash}$2`,
  );
  fs.writeFileSync(plistPath, plist, "utf8");
  console.log(`[t3code-quota-ui] Updated ElectronAsarIntegrity: ${newHeaderHash}`);
}

main();
