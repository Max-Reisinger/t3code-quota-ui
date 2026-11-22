#!/usr/bin/env node
/**
 * T3 Code Quota & Compact UI Patcher v1.1.0 (macOS app.asar in-place enhancer)
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
 * 5. Instant Currency Switcher (¥ CNY / $ USD): one-click toolbar toggle with localStorage persistence & real-time FX conversion across totals, providers, chart Y-axis & hover tooltips, cache savings, category/speed bars, and breakdown tables.
 * 6. Instant Language Switcher (中 / EN) + Full Usage (Cost / Tokens / Limits) Localization: complete runtime bilingual switching without app restart.
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

export function buildInjectedHeadBlock(defaultLang = "zh") {
  const safeDefaultLang = defaultLang === "en" ? "en" : "zh";
  const styleBlock = `<style id="t3-quota-ui-styles">
/* T3 Code Quota UI v1.1.0 — Compact 2-Column Limits Grid & Usage Toolbar */
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
.t3-usage-yaxis {
  width: 4.25rem !important;
}
.t3-usage-xaxis {
  padding-left: 4.75rem !important;
}
</style>`;

  const runtimeScript = `<script id="t3-quota-ui-i18n">
(function(){
  const LANG_KEY = "t3code:quota-ui-lang";
  const CURR_KEY = "t3code:quota-ui-currency";
  const RATE_KEY = "t3code:quota-ui-fx-rate";
  const DEFAULT_LANG = "${safeDefaultLang}";
  const DEFAULT_RATE = 7.25;

  const EN_TO_ZH = {
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
    "Secrets": "密钥",
    "Maintenance": "维护",
    "About": "关于",
    "Voice": "语音",
    "Archive": "归档",
    "Agents": "代理",
    "Code": "代码",
    "Connections": "连接",
    "Usage": "用量与配额",
    "Usage limits": "配额限制",
    "Limits": "限额",
    "Context": "上下文",
    "Context window": "上下文窗口",
    "Lineage": "分支脉络",
    "Side chats": "旁路会话",
    "Compact": "压缩",
    "Other model pools": "其他模型配额池",
    "Other active subscriptions": "其他活跃订阅",
    "Full limits panel": "完整配额面板",
    "Refresh quota": "刷新配额",
    "Cached context": "已缓存上下文",
    "Uncached context": "未缓存上下文",
    "Used context": "已用上下文",
    "Free space": "剩余空间",
    "Autocompact buffer": "自动压缩缓冲",
    "Prompt cache": "提示词缓存",
    "First answer": "首屏回复",
    "Gen speed": "生成速度",
    "End-to-end": "端到端速度",
    "Duration": "耗时",
    "Wall time": "总耗时",
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
    "Restart to update": "重启以更新",
    "All environments": "全部环境",
    "All providers": "全部厂商"
  };

  const ZH_TO_EN = {};
  for (const [en, zh] of Object.entries(EN_TO_ZH)) {
    if (!(zh in ZH_TO_EN)) ZH_TO_EN[zh] = en;
  }

  const WINDOW_LABELS_ZH = {
    "Session": "当前会话",
    "Weekly": "每周额度",
    "Monthly": "每月额度",
    "Monthly spend": "月度消费",
    "Monthly credit limit": "月度额度上限",
    "Overall": "总配额",
    "Cursor Models": "Cursor 模型",
    "Other Models": "第三方模型",
    "Custom API": "自定义 API",
    "Go · Session": "Go · 当前会话",
    "Go · Weekly": "Go · 每周额度",
    "Go · Monthly": "Go · 每月额度",
    "5-hour window": "5小时窗口",
    "7-day window": "7天窗口",
    "5-hour reset": "5小时重置券",
    "Weekly reset": "每周重置券",
    "Full reset": "全量重置券"
  };

  function getLang() {
    try {
      const v = window.localStorage.getItem(LANG_KEY);
      if (v === "zh" || v === "en") return v;
    } catch {}
    return DEFAULT_LANG;
  }

  function getCurrency() {
    try {
      const v = window.localStorage.getItem(CURR_KEY);
      if (v === "CNY" || v === "USD") return v;
    } catch {}
    return "USD";
  }

  function getRate() {
    try {
      const raw = window.localStorage.getItem(RATE_KEY);
      if (raw !== null) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) return n;
      }
    } catch {}
    return DEFAULT_RATE;
  }

  function translateWindowLabel(label) {
    if (!label || typeof label !== "string" || getLang() !== "zh") return label;
    if (label in WINDOW_LABELS_ZH) return WINDOW_LABELS_ZH[label];
    let out = label;
    out = out.replace(/^Weekly\\s*·\\s*/, "每周额度 · ");
    out = out.replace(/^Session\\s*·\\s*/, "当前会话 · ");
    out = out.replace(/\\s*·\\s*5h$/i, " · 5小时");
    out = out.replace(/\\s*·\\s*7d$/i, " · 7天");
    out = out.replace(/\\s*·\\s*Weekly$/i, " · 每周");
    out = out.replace(/\\s*·\\s*Monthly$/i, " · 每月");
    return out;
  }

  const SKIP_SELECTOR = "[data-quota-ui-managed], .chat-markdown, .composer-tiptap, pre, code, [data-thread-terminal-drawer], [data-file-explorer], script, style, textarea, input";
  const origNodeMap = new WeakMap();

  function applyDomI18n(root) {
    if (!root) return;
    const zhMode = getLang() === "zh";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const val = node.nodeValue;
      if (!val) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_SELECTOR)) continue;
      const trimmed = val.trim();
      if (!trimmed) continue;
      if (zhMode) {
        if (trimmed in EN_TO_ZH) {
          const replacement = EN_TO_ZH[trimmed];
          if (replacement && trimmed !== replacement) {
            if (!origNodeMap.has(node)) origNodeMap.set(node, val);
            node.nodeValue = val.replace(trimmed, replacement);
          }
        }
      } else {
        if (origNodeMap.has(node)) {
          const orig = origNodeMap.get(node);
          origNodeMap.delete(node);
          if (val !== orig) node.nodeValue = orig;
        } else if (trimmed in ZH_TO_EN) {
          const replacement = ZH_TO_EN[trimmed];
          if (replacement && trimmed !== replacement) {
            origNodeMap.set(node, val);
            node.nodeValue = val.replace(trimmed, replacement);
          }
        }
      }
    }
  }

  function syncDataset() {
    const lang = getLang();
    const curr = getCurrency();
    document.documentElement.dataset.quotaUiLang = lang;
    document.documentElement.dataset.quotaUiCurrency = curr;
  }

  function emitChange() {
    syncDataset();
    if (document.body) applyDomI18n(document.body);
    window.dispatchEvent(
      new CustomEvent("t3-quota-ui:change", {
        detail: { lang: getLang(), currency: getCurrency(), rate: getRate() }
      })
    );
  }

  const api = {
    getLang,
    isZh: () => getLang() === "zh",
    setLang: (next) => {
      const v = next === "en" ? "en" : "zh";
      try { window.localStorage.setItem(LANG_KEY, v); } catch {}
      emitChange();
    },
    toggleLang: () => {
      api.setLang(getLang() === "zh" ? "en" : "zh");
    },
    getCurrency,
    isCny: () => getCurrency() === "CNY",
    getRate,
    setCurrency: (next) => {
      const v = next === "CNY" ? "CNY" : "USD";
      try { window.localStorage.setItem(CURR_KEY, v); } catch {}
      emitChange();
    },
    toggleCurrency: () => {
      api.setCurrency(getCurrency() === "CNY" ? "USD" : "CNY");
    },
    translateWindowLabel,
    subscribe: (listener) => {
      const onUpdate = () => listener({ lang: getLang(), currency: getCurrency(), rate: getRate() });
      window.addEventListener("t3-quota-ui:change", onUpdate);
      window.addEventListener("storage", onUpdate);
      return () => {
        window.removeEventListener("t3-quota-ui:change", onUpdate);
        window.removeEventListener("storage", onUpdate);
      };
    }
  };

  window.__t3QuotaUi = api;
  syncDataset();

  window.addEventListener("DOMContentLoaded", () => {
    applyDomI18n(document.body);
    let raf = 0;
    const obs = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        applyDomI18n(document.body);
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
})();
</script>`;

  return `<!-- T3_QUOTA_UI_START -->\n${styleBlock}\n${runtimeScript}\n<!-- T3_QUOTA_UI_END -->`;
}

function patchUsageFormatBundle(src) {
  if (src.includes("__t3CnyFmt")) return src;
  let out = src;

  const usdFmtMatch = out.match(
    /([A-Za-z0-9_$]+)=new Intl\.NumberFormat\([`"']en-US[`"'],\{style:[`"']currency[`"'],currency:[`"']USD[`"'],minimumFractionDigits:2,maximumFractionDigits:2\}\)/,
  );
  if (!usdFmtMatch) return out;
  const usdFmtVar = usdFmtMatch[1];

  // 1. Dynamic USD <-> CNY currency formatter
  const fnRe = new RegExp(
    `function ([A-Za-z0-9_$]+)\\(([A-Za-z0-9_$]+)\\)\\{return ${usdFmtVar.replace(/\$/g, "\\$")}\\.format\\(\\2\\)\\}`,
  );
  out = out.replace(
    fnRe,
    (_, fnName, argName) =>
      `var __t3CnyFmt=new Intl.NumberFormat("zh-CN",{style:"currency",currency:"CNY",minimumFractionDigits:2,maximumFractionDigits:2});function __t3Zh(){return globalThis.__t3QuotaUi?globalThis.__t3QuotaUi.isZh():!0}function __t3Cny(){return globalThis.__t3QuotaUi?globalThis.__t3QuotaUi.isCny():!1}function __t3Rate(){return globalThis.__t3QuotaUi?globalThis.__t3QuotaUi.getRate():7.25}function ${fnName}(${argName}){const __v=Number.isFinite(${argName})?${argName}:0;return __t3Cny()?__t3CnyFmt.format(__v*__t3Rate()):${usdFmtVar}.format(__v)}`,
  );

  // 2. Malformed records notice
  out = out.replace(
    /`\$\{([A-Za-z0-9_$]+)\} malformed or inconsistent usage record\(s\) were skipped; usage may be incomplete\.`/g,
    (_, nVar) =>
      `(__t3Zh()?\`已跳过 \${${nVar}} 条格式异常或不完整的用量记录，统计可能不完整。\`: \`\${${nVar}} malformed or inconsistent usage record(s) were skipped; usage may be incomplete.\`)`,
  );

  // 3. Server/client version mismatch notice
  out = out.replace(
    /([A-Za-z0-9_$]+)\.direction===[`"']serverBehind[`"']\?`\$\{([A-Za-z0-9_$]+)\} runs an older server version and is excluded from totals\.`:`This client is older than the server on \$\{\2\}; its usage is excluded from totals\.`/g,
    (_, tVar, eVar) =>
      `(__t3Zh()?(${tVar}.direction==="serverBehind"?\`\${${eVar}} 运行的服务端版本较旧，未计入总计。\`: \`当前客户端版本低于 \${${eVar}} 服务端，其用量未计入总计。\`):(${tVar}.direction==="serverBehind"?\`\${${eVar}} runs an older server version and is excluded from totals.\`: \`This client is older than the server on \${${eVar}}; its usage is excluded from totals.\`))`,
  );

  // 4. Day label (e.g. "Nov 22" <-> "11月22日")
  out = out.replace(
    /`\$\{\[[`"']Jan[`"'],[`"']Feb[`"'],[`"']Mar[`"'],[`"']Apr[`"'],[`"']May[`"'],[`"']Jun[`"'],[`"']Jul[`"'],[`"']Aug[`"'],[`"']Sep[`"'],[`"']Oct[`"'],[`"']Nov[`"'],[`"']Dec[`"']\]\[([A-Za-z0-9_$]+)-1\]\?\?[`"'][`"']\} \$\{([A-Za-z0-9_$]+)\}`/g,
    (_, mVar, dVar) =>
      `(__t3Zh()?\`\${${mVar}}月\${${dVar}}日\`: \`\${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][${mVar}-1]??""} \${${dVar}}\`)`,
  );

  // 5. Relative hour ("today" / "yesterday" <-> "今日" / "昨日")
  out = out.replace(
    /([A-Za-z0-9_$]+)===0\?`\$\{([A-Za-z0-9_$]+)\} today`:\1===1\?`\$\{\2\} yesterday`:/g,
    (_, diffVar, hrVar) =>
      `${diffVar}===0?(__t3Zh()?\`今日 \${${hrVar}}\`:\`\${${hrVar}} today\`):${diffVar}===1?(__t3Zh()?\`昨日 \${${hrVar}}\`:\`\${${hrVar}} yesterday\`):`,
  );

  // 6. Month-day-hour DateTimeFormat locale
  out = out.replace(
    /([A-Za-z0-9_$]+)\([`"']en-US[`"'],(\{\.\.\.[A-Za-z0-9_$]+===void 0\?\{\}:\{timeZone:[A-Za-z0-9_$]+\},month:[`"']short[`"'],day:[`"']numeric[`"'])/g,
    (_, gFn, rest) => `${gFn}(__t3Zh()?"zh-CN":"en-US",${rest}`,
  );

  return out;
}

function patchUsageShortcutsBundle(src) {
  if (src.includes("__t3ShortcutZh")) return src;
  let out = src;

  const pairs = [
    [/label:[`"']Cost[`"'],command:[`"']usage\.cost[`"']/, 'get label(){return __t3ShortcutZh()?"费用":"Cost"},command:"usage.cost"'],
    [/label:[`"']Tokens[`"'],command:[`"']usage\.tokens[`"']/, 'get label(){return __t3ShortcutZh()?"Token":"Tokens"},command:"usage.tokens"'],
    [/label:[`"']Limits[`"'],command:[`"']usage\.limits[`"']/, 'get label(){return __t3ShortcutZh()?"限额":"Limits"},command:"usage.limits"'],
    [/label:[`"']Past 24h[`"'],command:[`"']usage\.period\.day[`"']/, 'get label(){return __t3ShortcutZh()?"24小时":"Past 24h"},command:"usage.period.day"'],
    [/label:[`"']7 days[`"'],command:[`"']usage\.period\.week[`"']/, 'get label(){return __t3ShortcutZh()?"7天":"7 days"},command:"usage.period.week"'],
    [/label:[`"']30 days[`"'],command:[`"']usage\.period\.month[`"']/, 'get label(){return __t3ShortcutZh()?"30天":"30 days"},command:"usage.period.month"'],
    [/label:[`"']90 days[`"'],command:[`"']usage\.period\.quarter[`"']/, 'get label(){return __t3ShortcutZh()?"90天":"90 days"},command:"usage.period.quarter"'],
  ];

  let matched = false;
  for (const [re, rep] of pairs) {
    if (re.test(out)) {
      out = out.replace(re, rep);
      matched = true;
    }
  }
  if (matched) {
    out += `\nfunction __t3ShortcutZh(){return globalThis.__t3QuotaUi?globalThis.__t3QuotaUi.isZh():!0}\n`;
  }
  return out;
}

function patchUsageLimitsShared(src) {
  let out = src;

  // 1. Keep each enabled provider instance in its own bar segment (e.g. dual Antigravity / Codex accounts)
  out = out.replace(
    /[A-Za-z0-9_$]+\([A-Za-z0-9_$]+\(([A-Za-z0-9_$]+)\)\)\?\?(`?\$\{[A-Za-z0-9_$]+\}:\$\{\1\.instanceId\}`?,\{key:`?\$\{[A-Za-z0-9_$]+\}:\$\{\1\.instanceId\}`?)/g,
    "$2",
  );

  // 2. Keep per-provider instance keying distinct in single-provider limit views
  out = out.replace(
    /([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+\([A-Za-z0-9_$]+\(([A-Za-z0-9_$]+)\)\)\?\?(`instance:\$\{\2\.instanceId\}`)/g,
    "$1=$3",
  );

  if (out.includes("__t3LimSharedZh")) return out;

  // 3. Localize Cursor pool metadata, reset timers, and limit notices dynamically
  out = out.replace(
    /\{id:[`"']totalPercentUsed[`"'],label:[`"']Overall[`"'],description:[`"']All usage on your plan this billing cycle\.[`"']\}/,
    '{id:"totalPercentUsed",get label(){return __t3LimSharedZh()?"总配额":"Overall"},get description(){return __t3LimSharedZh()?"当前计费周期内套餐的总可用额度。":"All usage on your plan this billing cycle."}}',
  );
  out = out.replace(
    /\{id:[`"']autoPercentUsed[`"'],label:[`"']Cursor Models[`"'],description:[`"']Grok, Composer, and Auto use this allowance\.[`"']\}/,
    '{id:"autoPercentUsed",get label(){return __t3LimSharedZh()?"Cursor 模型":"Cursor Models"},get description(){return __t3LimSharedZh()?"Grok、Composer 与 Auto 模式共用此额度池。":"Grok, Composer, and Auto use this allowance."}}',
  );
  out = out.replace(
    /\{id:[`"']apiPercentUsed[`"'],label:[`"']Other Models[`"'],description:[`"']Usage allowance for third-party models such as Claude, GPT, and Gemini\.[`"']\}/,
    '{id:"apiPercentUsed",get label(){return __t3LimSharedZh()?"第三方模型":"Other Models"},get description(){return __t3LimSharedZh()?"Claude、GPT、Gemini 等第三方模型的可用额度。":"Usage allowance for third-party models such as Claude, GPT, and Gemini."}}',
  );

  // Duration formatter: 3d 5h / 2h 15m / 45m <-> 3天5小时 / 2小时15分 / 45分
  out = out.replace(
    /([A-Za-z0-9_$]+)>0\?`\$\{\1\}d \$\{([A-Za-z0-9_$]+)\}h`:\2>0\?`\$\{\2\}h \$\{([A-Za-z0-9_$]+)\}m`:`\$\{\3\}m`/g,
    (_, dVar, hVar, mVar) =>
      `(__t3LimSharedZh()?(${dVar}>0?\`\${${dVar}}天\${${hVar}}小时\`:${hVar}>0?\`\${${hVar}}小时\${${mVar}}分\`:\`\${${mVar}}分\`):(${dVar}>0?\`\${${dVar}}d \${${hVar}}h\`:${hVar}>0?\`\${${hVar}}h \${${mVar}}m\`:\`\${${mVar}}m\`))`,
  );

  // Reset countdown string: resets now / Resets momentarily / resets in X
  out = out.replace(
    /([A-Za-z0-9_$]+)<=([A-Za-z0-9_$]+)\?[`"']resets now[`"']:\1-\2<([A-Za-z0-9_$]+)\?[`"']Resets momentarily[`"']:`resets in \$\{([A-Za-z0-9_$]+)\(\1-\2\)\}`/g,
    (_, endVar, nowVar, minVar, fmtFn) =>
      `(${endVar}<=${nowVar}?(__t3LimSharedZh()?"即将重置":"resets now"):${endVar}-${nowVar}<${minVar}?(__t3LimSharedZh()?"片刻后重置":"Resets momentarily"):(__t3LimSharedZh()?\`\${${fmtFn}(${endVar}-${nowVar})}后重置\`:\`resets in \${${fmtFn}(${endVar}-${nowVar})}\`))`,
  );

  // Limit error / fallback strings
  out = out.replace(
    /([`"'])This account has no subscription limits\.\1/g,
    '(__t3LimSharedZh()?"该账号无订阅配额限制。":"This account has no subscription limits.")',
  );
  out = out.replace(
    /([`"'])Could not read limits\.\1/g,
    '(__t3LimSharedZh()?"无法读取配额限制。":"Could not read limits.")',
  );
  out = out.replace(
    /([`"'])No limits reported\.\1/g,
    '(__t3LimSharedZh()?"未上报配额数据。":"No limits reported.")',
  );
  out = out.replace(
    /:[`"']No reset credits banked[`"']/g,
    ':(__t3LimSharedZh()?"暂无可用重置券":"No reset credits banked")',
  );
  out = out.replace(
    /actionLabel:[`"']Use reset[`"']/g,
    'actionLabel:(__t3LimSharedZh()?"使用重置券":"Use reset")',
  );
  out = out.replace(
    /actionLabel:[`"']Use[`"']/g,
    'actionLabel:(__t3LimSharedZh()?"使用":"Use")',
  );

  out += `\nfunction __t3LimSharedZh(){return globalThis.__t3QuotaUi?globalThis.__t3QuotaUi.isZh():!0}\n`;
  return out;
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

  if (out.includes("__t3LimViewZh")) return out;

  // 5. Full Limits tab localization (dynamic zh/en + CNY/USD $0 cap)
  // Window labels
  out = out.replace(
    /className:[`"']text-sm font-medium text-foreground[`"'],children:([A-Za-z0-9_$]+\?\?[A-Za-z0-9_$]+\.label)/g,
    'className:"text-sm font-medium text-foreground",children:__t3WinLbl($1)',
  );
  out = out.replace(
    /className:[`"']truncate text-muted-foreground[`"'],children:([A-Za-z0-9_$]+\.label)/g,
    'className:"truncate text-muted-foreground",children:__t3WinLbl($1)',
  );

  // "left" label under percentage in PoolWindowCard
  out = out.replace(
    /\(([`"'])span\1,\{children:\1left\1\}\)/g,
    '("span",{children:__t3LimViewZh()?"剩余":"left"})',
  );

  // Compact bar reset badge ("resets in X" / "X后重置" -> "↻ X")
  out = out.replace(
    /([A-Za-z0-9_$]+)\?\.replace\([`"']resets in [`"'],[`"']↻ [`"']\)/g,
    '(__t3LimViewZh()?($1?.replace(/^(.+)后重置$/,"↻ $1")):($1?.replace("resets in ","↻ ")))',
  );

  // Zero spend cap
  out = out.replace(
    /([`"'])\$0 cap\1/g,
    '(__t3LimViewZh()?(__t3LimViewCny()?"¥0 限额":"$0 限额"):"$0 cap")',
  );

  // Account hover popover fields
  out = out.replace(
    /label:[`"']Plan[`"'],children:([A-Za-z0-9_$]+\.plan)/g,
    'label:__t3LimViewZh()?"套餐":"Plan",children:$1',
  );
  out = out.replace(
    /([A-Za-z0-9_$]+\.environments\.length)>0\?[`"']Signed in[`"']:[`"']Via[`"']/g,
    '$1>0?(__t3LimViewZh()?"登录环境":"Signed in"):(__t3LimViewZh()?"来源":"Via")',
  );
  out = out.replace(
    /label:[`"']Left[`"'],children:\[([A-Za-z0-9_$]+),[`"']%[`"']\]/g,
    'label:__t3LimViewZh()?"剩余额度":"Left",children:[$1,"%"]',
  );
  out = out.replace(
    /label:[`"']Resets[`"'],children:\[/g,
    'label:__t3LimViewZh()?"重置时间":"Resets",children:[',
  );
  out = out.replace(
    /label:[`"']Even pace[`"'],children:\[([A-Za-z0-9_$]+),[`"']% left by now[`"']\]/g,
    'label:__t3LimViewZh()?"均衡水位":"Even pace",children:__t3LimViewZh()?["匀速应剩 ",$1,"%"]:[$1,"% left by now"]',
  );
  out = out.replace(
    /label:[`"']Restores[`"'],children:\[[`"']\+[`"'],([A-Za-z0-9_$]+\.restoresPercent),[`"']% of pool[`"']\]/g,
    'label:__t3LimViewZh()?"重置恢复":"Restores",children:__t3LimViewZh()?["恢复总池 +",$1,"%"]:["+",$1,"% of pool"]',
  );
  out = out.replace(
    /ariaLabel:[`"']Toggle account email visibility[`"'],revealTooltip:[`"']Click to reveal email[`"'],hideTooltip:[`"']Click to hide email[`"']/g,
    'ariaLabel:__t3LimViewZh()?"切换账号邮箱显示":"Toggle account email visibility",revealTooltip:__t3LimViewZh()?"点击显示邮箱":"Click to reveal email",hideTooltip:__t3LimViewZh()?"点击隐藏邮箱":"Click to hide email"',
  );

  // Pace indicator tooltips
  out = out.replace(
    /label:[`"']Ahead of pace: spending faster than the window elapses[`"']/g,
    'get label(){return __t3LimViewZh()?"消耗偏快：当前消耗速度高于时间窗口流逝速度":"Ahead of pace: spending faster than the window elapses"}',
  );
  out = out.replace(
    /label:[`"']On pace with the window[`"']/g,
    'get label(){return __t3LimViewZh()?"进度均衡：消耗速度与时间窗口基本同步":"On pace with the window"}',
  );
  out = out.replace(
    /label:[`"']Under pace: headroom left for the rest of the window[`"']/g,
    'get label(){return __t3LimViewZh()?"余量充裕：消耗速度低于时间流逝，剩余额度充足":"Under pace: headroom left for the rest of the window"}',
  );

  // Compact window rows & tooltips
  out = out.replace(
    /children:\[([A-Za-z0-9_$]+\([A-Za-z0-9_$]+\)),[`"']% left[`"']\]/g,
    'children:__t3LimViewZh()?["剩余 ",$1,"%"]:[$1,"% left"]',
  );
  out = out.replace(
    /children:\[([A-Za-z0-9_$]+),[`"']% left[`"'],([A-Za-z0-9_$]+)\]/g,
    'children:__t3LimViewZh()?["剩余 ",$1,"%",$2]:[$1,"% left",$2]',
  );
  out = out.replace(
    /` · \$\{([A-Za-z0-9_$]+)\}% of the window left`/g,
    '(__t3LimViewZh()?` · 窗口剩余 ${$1}%`:` · ${$1}% of the window left`)',
  );
  out = out.replace(
    /([`"'])The line is where even spending would be\.\1/g,
    '(__t3LimViewZh()?"竖线代表按时间匀速消耗的参考水位。":"The line is where even spending would be.")',
  );
  out = out.replace(
    /children:\[[`"']Resets [`"'],/g,
    'children:[__t3LimViewZh()?"重置于 ":"Resets ",',
  );

  // Empty, external & credit confirmation dialogs
  out = out.replace(
    /([`"'])No provider on the selected environments reports subscription limits\.\1/g,
    '(__t3LimViewZh()?"当前所选环境中暂无上报订阅配额的模型厂商。":"No provider on the selected environments reports subscription limits.")',
  );
  out = out.replace(
    /([`"'])View usage in ChatGPT with your connected account\.\1/g,
    '(__t3LimViewZh()?"使用已关联账号前往 ChatGPT 查看用量详情。":"View usage in ChatGPT with your connected account.")',
  );
  out = out.replace(
    /children:\[[`"']Manage usage[`"'],/g,
    'children:[__t3LimViewZh()?"管理用量":"Manage usage",',
  );
  out = out.replace(
    /\?[`"']Using…[`"']:/g,
    '?(__t3LimViewZh()?"使用中…":"Using…"):',
  );
  out = out.replace(
    /\?[`"']Using reset credit…[`"']:/g,
    '?(__t3LimViewZh()?"正在使用重置券…":"Using reset credit…"):',
  );
  out = out.replace(
    /children:[`"']Use a reset credit\?[`"']/g,
    'children:__t3LimViewZh()?"确认使用重置券？":"Use a reset credit?"',
  );
  out = out.replace(
    /children:[`"']Cancel[`"']/g,
    'children:__t3LimViewZh()?"取消":"Cancel"',
  );
  out = out.replace(
    /children:[`"']Use credit[`"']/g,
    'children:__t3LimViewZh()?"确认使用":"Use credit"',
  );

  out += `\nfunction __t3LimViewZh(){return globalThis.__t3QuotaUi?globalThis.__t3QuotaUi.isZh():!0}function __t3LimViewCny(){return globalThis.__t3QuotaUi?globalThis.__t3QuotaUi.isCny():!1}function __t3WinLbl(e){return globalThis.__t3QuotaUi?.translateWindowLabel?globalThis.__t3QuotaUi.translateWindowLabel(e):e}\n`;
  return out;
}

function patchChatUsageBundle(src) {
  if (src.includes("__T3UsageRootWrapper")) return src;
  let out = src;

  // Dynamically discover minified identifiers in _chat.usage-*.js
  const reactNsMatch = out.match(/\(\s*0\s*,\s*([A-Za-z0-9_$]+)\.useState\s*\)\([`"']model[`"']\)/);
  const segMatch = out.match(
    /\.map\([A-Za-z0-9_$]+=>\(0,([A-Za-z0-9_$]+)\.jsx\)\(([A-Za-z0-9_$]+),\{value:[A-Za-z0-9_$]+\.value,title:[A-Za-z0-9_$]+\([A-Za-z0-9_$]+\),children:[A-Za-z0-9_$]+\.label\}[\s\S]{0,160}?\(0,\1\.jsx\)\(([A-Za-z0-9_$]+),\{"aria-label":[`"']Usage metric[`"']/,
  );
  const fmtUsdMatch = out.match(
    /import\{[^}]*\bd as ([A-Za-z0-9_$]+)[^}]*\}from[`"']\.\/usageFormat-[^`"']+[`"']/,
  );
  const tooltipMatch = out.match(
    /\(0,[A-Za-z0-9_$]+\.jsxs\)\(([A-Za-z0-9_$]+),\{children:\[\(0,[A-Za-z0-9_$]+\.jsx\)\(([A-Za-z0-9_$]+),\{render:\(0,[A-Za-z0-9_$]+\.jsx\)\([`"']div[`"'],\{className:[`"']h-full min-w-1[\s\S]{0,220}?\(0,[A-Za-z0-9_$]+\.jsxs\)\(([A-Za-z0-9_$]+),\{/,
  );

  if (!reactNsMatch || !segMatch || !fmtUsdMatch) {
    return out;
  }

  const reactNs = reactNsMatch[1];
  const jsxNs = segMatch[1];
  const toggleItemIdent = segMatch[2];
  const toggleGroupIdent = segMatch[3];
  const fmtUsdIdent = fmtUsdMatch[1];
  const tooltipRootIdent = tooltipMatch ? tooltipMatch[1] : null;
  const tooltipTriggerIdent = tooltipMatch ? tooltipMatch[2] : null;
  const tooltipPopupIdent = tooltipMatch ? tooltipMatch[3] : null;

  // 1. Preserve selectedEnvironmentIds & breakdown mode ("model" | "time") across instant currency/lang re-keying
  out = out.replace(
    new RegExp(
      `\\[([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\\]=\\(0,${reactNs.replace(/\$/g, "\\$")}\\.useState\\)\\(null\\),([A-Za-z0-9_$]+);([A-Za-z0-9_$]+\\[\\d+\\]===[A-Za-z0-9_$]+\\.hiddenProviders)`,
    ),
    (_, cVar, wVar, tVar, rest) => `[${cVar},${wVar}]=__t3UseSavedEnvIds(),${tVar};${rest}`,
  );
  out = out.replace(
    new RegExp(
      `\\[([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\\]=\\(0,${reactNs.replace(/\$/g, "\\$")}\\.useState\\)\\([\`"']model[\`"']\\)`,
    ),
    (_, hVar, gVar) => `[${hVar},${gVar}]=__t3UseSavedBreakdown()`,
  );

  // 2. Inject Currency (¥ CNY | $ USD) & Language (中 | EN) segmented toggles into wide & compact toolbars
  out = out.replace(
    /className:[`"']ms-auto hidden shrink-0 items-center justify-end gap-2 @4xl\/usage-header:flex[`"'],children:\[([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\]/,
    (_, periodEl, metricEl, refreshEl) =>
      `className:"ms-auto hidden shrink-0 items-center justify-end gap-2 @4xl/usage-header:flex",children:[${periodEl},${metricEl},__t3RenderToolbarToggles(!1),${refreshEl}]`,
  );
  out = out.replace(
    /className:[`"']ms-auto flex shrink-0 items-center justify-end gap-1 @4xl\/usage-header:hidden[`"'],children:\[([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\]/,
    (_, periodEl, metricEl, refreshEl) =>
      `className:"ms-auto flex shrink-0 items-center justify-end gap-1 @4xl/usage-header:hidden",children:[${periodEl},${metricEl},__t3RenderToolbarToggles(!0),${refreshEl}]`,
  );

  // 3. Chart Y-axis clean RMB tick scaling (computes round RMB ticks then maps back to USD scale so nothing double-multiplies)
  out = out.replace(
    /function ([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{let ([A-Za-z0-9_$]+)=\2\.reduce\(\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)=>\6\.bands\.reduce\(\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)=>Math\.max\(\7,\8\.value\),\5\),0\);return \4===0&&\3\.size>0\?\{max:([A-Za-z0-9_$]+),ticks:([A-Za-z0-9_$]+),labeled:!1\}:\{\.\.\.([A-Za-z0-9_$]+)\(\4,\9\),labeled:!0\}\}/,
    (_, fnName, colsArg, loadArg, maxVar, a1, b1, a2, b2, wnIdent, pnIdent, nnIdent) =>
      `function ${fnName}(${colsArg},${loadArg},__metric){let ${maxVar}=${colsArg}.reduce((${a1},${b1})=>${b1}.bands.reduce((${a2},${b2})=>Math.max(${a2},${b2}.value),${a1}),0);if(${maxVar}===0&&${loadArg}.size>0)return{max:${wnIdent},ticks:${pnIdent},labeled:!1};if(__metric==="cost"&&__t3UsageCny()&&${maxVar}>0){const __r=__t3UsageRate(),__sc=${nnIdent}(${maxVar}*__r,${wnIdent});return{max:__sc.max/__r,ticks:__sc.ticks.map(v=>v/__r),labeled:!0}}return{...${nnIdent}(${maxVar},${wnIdent}),labeled:!0}}`,
  );
  out = out.replace(
    /function ([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{let ([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+)\(\2,\3,\4\),([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+)\(\7,\6\)/,
    (_, lnName, pArg, mArg, metricArg, provArg, loadArg, aVar, onFn, oVar, fnFn) =>
      `function ${lnName}(${pArg},${mArg},${metricArg},${provArg},${loadArg}){let ${aVar}=${onFn}(${pArg},${mArg},${metricArg}),${oVar}=${fnFn}(${aVar},${loadArg},${metricArg})`,
  );

  // Widen Y-axis label column slightly so ¥1,234.50 fits cleanly
  out = out.replace(
    /className:[`"']relative h-56 w-14 shrink-0[`"']/g,
    'className:"t3-usage-yaxis relative h-56 w-14 shrink-0"',
  );
  out = out.replace(
    /className:[`"']flex justify-between pl-16 text-3xs text-muted-foreground uppercase[`"']/g,
    'className:"t3-usage-xaxis flex justify-between pl-16 text-3xs text-muted-foreground uppercase"',
  );

  // 4. Chart Hover Tooltip: localize "Total" -> "合计" & display reference FX rate note in CNY mode
  out = out.replace(
    /function ([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+)\)\{let ([A-Za-z0-9_$]+)=\(0,[A-Za-z0-9_$]+\.c\)\(\d+\),\{tooltipRef:([A-Za-z0-9_$]+),label:([A-Za-z0-9_$]+),column:([A-Za-z0-9_$]+),providers:([A-Za-z0-9_$]+),loadingProviders:([A-Za-z0-9_$]+),format:([A-Za-z0-9_$]+)\}=\2([\s\S]*?)className:[`"']text-muted-foreground[`"'],children:[`"']Total[`"']([\s\S]*?)className:[`"']surface-glass pointer-events-none absolute z-10 min-w-36 max-w-full rounded-xl border border-border\/50 px-2\.5 py-2 text-xs shadow-lg[`"'],style:([A-Za-z0-9_$]+),children:\[([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\]/,
    (
      _,
      rnFn,
      eArg,
      tMemo,
      refVar,
      lblVar,
      colVar,
      provVar,
      loadVar,
      fmtVar,
      mid1,
      mid2,
      styleVar,
      uChild,
      dChild,
      totChild,
    ) =>
      `function ${rnFn}(${eArg}){let ${tMemo}=(0,${
        out.match(/var [A-Za-z0-9_$]+=e\(t\(\),1\),([A-Za-z0-9_$]+)=n\(\)/)?.[1] ?? "Q"
      }.c)(26),{tooltipRef:${refVar},label:${lblVar},column:${colVar},providers:${provVar},loadingProviders:${loadVar},format:${fmtVar}}=${eArg}${mid1}className:"text-muted-foreground",children:__t3UsageZh()?"合计":"Total"${mid2}className:"surface-glass pointer-events-none absolute z-10 min-w-36 max-w-full rounded-xl border border-border/50 px-2.5 py-2 text-xs shadow-lg",style:${styleVar},children:[${uChild},${dChild},${totChild},${fmtVar}===${fmtUsdIdent}&&__t3UsageCny()?(0,${jsxNs}.jsx)("div",{className:"mt-1 text-3xs text-muted-foreground/80 tabular-nums",children:__t3UsageZh()?"参考汇率 $1 = ¥"+__t3UsageRate():"Ref: $1 = ¥"+__t3UsageRate()}):null]`,
  );

  // 5. Complete Localization of Cost / Tokens / Breakdown / Filter / Modals in _chat.usage-*.js
  // Breadcrumb h1 "Usage"
  out = out.replace(
    /\(([`"'])h1\1,\{children:\1Usage\1\}\)/g,
    '("h1",{children:__t3UsageZh()?"用量与配额":"Usage"})',
  );

  // Header date range "X to Y" -> "X 至 Y"
  out = out.replace(
    /`\$\{([A-Za-z0-9_$]+\([^)]+\))\} to \$\{([A-Za-z0-9_$]+\([^)]+\))\}`/g,
    '(__t3UsageZh()?`${$1} 至 ${$2}`:`${$1} to ${$2}`)',
  );

  // All environments & N environments
  out = out.replace(
    /\?[`"']All environments[`"']:/g,
    '?(__t3UsageZh()?"全部环境":"All environments"):',
  );
  out = out.replace(
    /children:[`"']All environments[`"']/g,
    'children:__t3UsageZh()?"全部环境":"All environments"',
  );
  out = out.replace(
    /`\$\{([A-Za-z0-9_$]+\.length)\} environments`/g,
    '(__t3UsageZh()?`${$1} 个环境`:`${$1} environments`)',
  );

  // All providers / No providers / N providers
  out = out.replace(
    /\?[`"']All providers[`"']:/g,
    '?(__t3UsageZh()?"全部厂商":"All providers"):',
  );
  out = out.replace(
    /children:[`"']All providers[`"']/g,
    'children:__t3UsageZh()?"全部厂商":"All providers"',
  );
  out = out.replace(
    /\?[`"']No providers[`"']:/g,
    '?(__t3UsageZh()?"未选厂商":"No providers"):',
  );
  out = out.replace(
    /`\$\{([A-Za-z0-9_$]+\.length)\} providers`/g,
    '(__t3UsageZh()?`${$1} 个厂商`:`${$1} providers`)',
  );

  // Refresh aria-labels
  out = out.replace(
    /\?[`"']Refresh limits[`"']:[`"']Refresh usage[`"']/g,
    '?(__t3UsageZh()?"刷新限额":"Refresh limits"):(__t3UsageZh()?"刷新用量":"Refresh usage")',
  );

  // Environment scan status badges
  out = out.replace(
    /`Updating \$\{([A-Za-z0-9_$]+\([A-Za-z0-9_$]+\[0\]\))\}…`:`Updating \$\{([A-Za-z0-9_$]+\.length)\} providers…`/g,
    '(__t3UsageZh()?`正在更新 ${$1}…`:`Updating ${$1}…`):(__t3UsageZh()?`正在更新 ${$2} 个厂商…`:`Updating ${$2} providers…`)',
  );
  out = out.replace(
    /\?[`"']Update required[`"']:/g,
    '?(__t3UsageZh()?"需更新":"Update required"):',
  );
  out = out.replace(
    /\?[`"']Scanning…[`"']:/g,
    '?(__t3UsageZh()?"扫描中…":"Scanning…"):',
  );
  out = out.replace(
    /\?[`"']Refreshing…[`"']:/g,
    '?(__t3UsageZh()?"刷新中…":"Refreshing…"):',
  );
  out = out.replace(
    /:[`"']Ready[`"']:/g,
    ':(__t3UsageZh()?"就绪":"Ready"):',
  );
  out = out.replace(
    /:[`"']Connecting…[`"']:/g,
    ':(__t3UsageZh()?"连接中…":"Connecting…"):',
  );
  out = out.replace(
    /:[`"']Unavailable[`"']/g,
    ':(__t3UsageZh()?"不可用":"Unavailable")',
  );
  out = out.replace(
    /children:[`"']No environments connected\.[`"']/g,
    'children:__t3UsageZh()?"暂无已连接的运行环境。":"No environments connected."',
  );
  out = out.replace(
    /children:[`"']Totals are partial while selected environments scan\.[`"']/g,
    'children:__t3UsageZh()?"所选环境正在扫描，当前汇总为部分数据。":"Totals are partial while selected environments scan."',
  );
  out = out.replace(
    /\[([A-Za-z0-9_$]+),[`"']Model prices[`"']\]/g,
    '[$1,__t3UsageZh()?"自定义模型单价":"Model prices"]',
  );
  out = out.replace(
    /\?[`"']This environment could not report usage\.[`"']:/g,
    '?(__t3UsageZh()?"该运行环境无法上报用量数据。":"This environment could not report usage."):',
  );
  out = out.replace(
    /`Connect an environment to see \$\{([A-Za-z0-9_$]+)\?[`"']limits[`"']:[`"']usage[`"']\}\.`:`Select an environment to see \$\{\1\?[`"']limits[`"']:[`"']usage[`"']\}\.`/g,
    '(__t3UsageZh()?`请先连接运行环境以查看${$1?"限额":"用量"}。`:`Connect an environment to see ${$1?"limits":"usage"}.`):(__t3UsageZh()?`请至少选择一个运行环境以查看${$1?"限额":"用量"}。`:`Select an environment to see ${$1?"limits":"usage"}.`)',
  );

  // Sessions & API estimate & Provider breakdown rows
  out = out.replace(
    /children:\[([A-Za-z0-9_$]+),[`"'] sessions[`"']\]/g,
    'children:[$1,__t3UsageZh()?" 次会话":" sessions"]',
  );
  out = out.replace(
    /([A-Za-z0-9_$]+)===[`"']cost[`"']&&[`"'] · API estimate[`"']/g,
    '($1==="cost"&&(__t3UsageZh()?(__t3UsageCny()?" · 按官方 API 单价估算 (汇率 "+__t3UsageRate()+")":" · 按官方 API 单价估算"):(__t3UsageCny()?" · API estimate ($1 = ¥"+__t3UsageRate()+")":" · API estimate")))',
  );
  out = out.replace(
    /children:\[[`"']API estimate excludes [`"'],([A-Za-z0-9_$]+\([A-Za-z0-9_$.]+\)),[`"'] unpriced records\.[`"']\]/g,
    'children:__t3UsageZh()?["估算结果不含 ",$1," 的未定价记录。"]:["API estimate excludes ",$1," unpriced records."]',
  );
  out = out.replace(
    /children:[`"']ChatGPT shared usage[`"']/g,
    'children:__t3UsageZh()?"ChatGPT 共享用量":"ChatGPT shared usage"',
  );
  out = out.replace(
    /`\$\{([A-Za-z0-9_$]+\([A-Za-z0-9_$]+\))\} \$\{([A-Za-z0-9_$]+)===1\?[`"']session[`"']:[`"']sessions[`"']\}`/g,
    '(__t3UsageZh()?`${$1} 次会话`:`${$1} ${$2===1?"session":"sessions"}`)',
  );
  out = out.replace(
    /([A-Za-z0-9_$]+)===[`"']cost[`"']\?`\$\{([A-Za-z0-9_$]+\([A-Za-z0-9_$]+\))\} of cost · \$\{([A-Za-z0-9_$]+\([^)]+\))\} tokens`:`\$\{\2\} of tokens · \$\{([A-Za-z0-9_$]+\([^)]+\))\}`/g,
    '($1==="cost"?(__t3UsageZh()?`${$2} 费用占比 · ${$3} Token`:`${$2} of cost · ${$3} tokens`):(__t3UsageZh()?`${$2} Token 占比 · ${$4}`:`${$2} of tokens · ${$4}`))',
  );

  // Daily / Hourly cost & processed tokens heading
  out = out.replace(
    /let ([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+)\?[`"']Hourly[`"']:[`"']Daily[`"'],([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+)===[`"']tokens[`"']\?[`"']processed tokens[`"']:[`"']cost[`"'],([A-Za-z0-9_$]+);([A-Za-z0-9_$]+\[\d+\])!==\1\|\|([A-Za-z0-9_$]+\[\d+\])!==\3\?\(\5=\(0,([A-Za-z0-9_$]+)\.jsxs\)\([`"']h2[`"'],\{className:[`"']text-sm font-medium text-foreground[`"'],children:\[\1,[`"'] [`"'],\3\]\}\)/g,
    (_, peVar, isHrVar, meVar, metricVar, qVar, m1, m2, jNs) =>
      `let ${peVar}=${isHrVar}?"Hourly":"Daily",${meVar}=${metricVar}==="tokens"?"processed tokens":"cost",${qVar};${m1}!==${peVar}||${m2}!==${meVar}?(${qVar}=(0,${jNs}.jsxs)("h2",{className:"text-sm font-medium text-foreground",children:__t3UsageZh()?[${metricVar}==="tokens"?(${isHrVar}?"每小时处理 Token":"每日处理 Token"):(${isHrVar}?"每小时估算费用":"每日估算费用")]:[${peVar}," ",${meVar}]})`,
  );

  // Totals section & skeleton labels
  out = out.replace(
    /children:[`"']Totals[`"']/g,
    'children:__t3UsageZh()?"总计":"Totals"',
  );
  out = out.replace(
    /label:[`"']Processed tokens[`"']/g,
    'label:__t3UsageZh()?"总处理 Token":"Processed tokens"',
  );
  out = out.replace(
    /label:[`"']Cached input[`"']/g,
    'label:__t3UsageZh()?"缓存命中输入":"Cached input"',
  );
  out = out.replace(
    /label:[`"']Uncached input[`"']/g,
    'label:__t3UsageZh()?"未命中输入":"Uncached input"',
  );
  out = out.replace(
    /label:[`"']Cache savings[`"']/g,
    'label:__t3UsageZh()?"缓存节省":"Cache savings"',
  );
  out = out.replace(
    /labels:\[[`"']Processed tokens[`"'],[`"']Cached input[`"'],[`"']Uncached input[`"'],[`"']Output[`"'],[`"']Cache savings[`"']\]/g,
    'labels:__t3UsageZh()?["总处理 Token","缓存命中输入","未命中输入","输出","缓存节省"]:["Processed tokens","Cached input","Uncached input","Output","Cache savings"]',
  );

  // Cost by type / Cost by speed / Tokens by type & segment labels
  out = out.replace(
    /label:[`"']Cost by type[`"']/g,
    'label:__t3UsageZh()?"按类型费用":"Cost by type"',
  );
  out = out.replace(
    /label:[`"']Cost by speed[`"']/g,
    'label:__t3UsageZh()?"按速度费用":"Cost by speed"',
  );
  out = out.replace(
    /label:[`"']Tokens by type[`"']/g,
    'label:__t3UsageZh()?"按类型 Token":"Tokens by type"',
  );
  out = out.replace(
    /\{key:[`"']inputCostPerMillionTokens[`"'],label:[`"']Input[`"'],optional:!1\},\{key:[`"']outputCostPerMillionTokens[`"'],label:[`"']Output[`"'],optional:!1\},\{key:[`"']cacheReadCostPerMillionTokens[`"'],label:[`"']Cache read[`"'],optional:!0\},\{key:[`"']cacheWriteCostPerMillionTokens[`"'],label:[`"']Cache write[`"'],optional:!0\}/g,
    '{key:"inputCostPerMillionTokens",get label(){return __t3UsageZh()?"输入":"Input"},optional:!1},{key:"outputCostPerMillionTokens",get label(){return __t3UsageZh()?"输出":"Output"},optional:!1},{key:"cacheReadCostPerMillionTokens",get label(){return __t3UsageZh()?"缓存读取":"Cache read"},optional:!0},{key:"cacheWriteCostPerMillionTokens",get label(){return __t3UsageZh()?"缓存写入":"Cache write"},optional:!0}',
  );
  out = out.replace(
    /label:[`"']Input[`"'],value:/g,
    'label:__t3UsageZh()?"输入":"Input",value:',
  );
  out = out.replace(
    /label:[`"']Cache read[`"'],value:/g,
    'label:__t3UsageZh()?"缓存读取":"Cache read",value:',
  );
  out = out.replace(
    /label:[`"']Cache write[`"'],value:/g,
    'label:__t3UsageZh()?"缓存写入":"Cache write",value:',
  );
  out = out.replace(
    /label:[`"']Output[`"'],value:/g,
    'label:__t3UsageZh()?"输出":"Output",value:',
  );
  out = out.replace(
    /label:[`"']Other[`"'],value:/g,
    'label:__t3UsageZh()?"其他":"Other",value:',
  );
  out = out.replace(
    /label:[`"']Standard[`"'],value:/g,
    'label:__t3UsageZh()?"标准":"Standard",value:',
  );
  out = out.replace(
    /label:[`"']Fast[`"'],value:/g,
    'label:__t3UsageZh()?"极速":"Fast",value:',
  );
  out = out.replace(
    /label:[`"']Ultrafast[`"'],value:/g,
    'label:__t3UsageZh()?"超极速":"Ultrafast",value:',
  );
  out = out.replace(
    /children:\[[`"']Premium [`"'],/g,
    'children:[__t3UsageZh()?"溢价 ":"Premium ",',
  );

  // Breakdown section, segmented switch (Model / Day / Hour) & table columns
  out = out.replace(
    /children:[`"']Breakdown[`"']/g,
    'children:__t3UsageZh()?"消耗明细":"Breakdown"',
  );
  out = out.replace(
    /\{value:[`"']model[`"'],label:[`"']Model[`"']\}/g,
    '{value:"model",get label(){return __t3UsageZh()?"按模型":"Model"}}',
  );
  out = out.replace(
    /let ([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+)\?[`"']Hour[`"']:[`"']Day[`"'],([A-Za-z0-9_$]+);([A-Za-z0-9_$]+\[\d+\])===\1\?\3=([A-Za-z0-9_$]+\[\d+\]):\(\3=\[([A-Za-z0-9_$]+),\{value:[`"']time[`"'],label:\1\}\]/g,
    (_, leVar, isHrVar, reVar, c1, c2, ieVar) =>
      `let ${leVar}=${isHrVar}?(__t3UsageZh()?"按小时":"Hour"):(__t3UsageZh()?"按日期":"Day"),${reVar};${c1}===${leVar}?${reVar}=${c2}:(${reVar}=[${ieVar},{value:"time",label:${leVar}}]`,
  );
  out = out.replace(
    /className:[`"']w-full py-2 text-left font-normal[`"'],children:[`"']Model[`"']/g,
    'className:"w-full py-2 text-left font-normal",children:__t3UsageZh()?"模型":"Model"',
  );
  out = out.replace(
    /className:[`"']py-2 pl-6 font-normal[`"'],children:[`"']Cost[`"']/g,
    'className:"py-2 pl-6 font-normal",children:__t3UsageZh()?"费用":"Cost"',
  );
  out = out.replace(
    /className:[`"']hidden py-2 pl-6 font-normal sm:table-cell[`"'],children:[`"']Share[`"']/g,
    'className:"hidden py-2 pl-6 font-normal sm:table-cell",children:__t3UsageZh()?"占比":"Share"',
  );
  out = out.replace(
    /className:[`"']py-2 pr-2 pl-6 font-normal[`"'],children:[`"']Tokens[`"']/g,
    'className:"py-2 pr-2 pl-6 font-normal",children:__t3UsageZh()?"Token":"Tokens"',
  );
  out = out.replace(
    /className:[`"']py-2 pl-2 font-normal[`"'],children:([A-Za-z0-9_$]+)\?[`"']Hour[`"']:[`"']Day[`"']/g,
    'className:"py-2 pl-2 font-normal",children:$1?(__t3UsageZh()?"时间":"Hour"):(__t3UsageZh()?"日期":"Day")',
  );
  out = out.replace(
    /className:[`"']py-2 pl-4 text-right font-normal[`"'],children:[`"']Total[`"']/g,
    'className:"py-2 pl-4 text-right font-normal",children:__t3UsageZh()?"合计":"Total"',
  );
  out = out.replace(
    /className:[`"']py-2 pr-2 pl-4 text-right font-normal[`"'],children:[`"']Tokens[`"']/g,
    'className:"py-2 pr-2 pl-4 text-right font-normal",children:__t3UsageZh()?"Token":"Tokens"',
  );
  out = out.replace(
    /children:[`"']No activity in this window\.[`"']/g,
    'children:__t3UsageZh()?"当前时间范围内暂无消耗记录。":"No activity in this window."',
  );
  out = out.replace(
    /children:[`"']Unpriced[`"']/g,
    'children:__t3UsageZh()?"未定价":"Unpriced"',
  );
  out = out.replace(
    /\?[`"']Unpriced[`"']:/g,
    '?(__t3UsageZh()?"未定价":"Unpriced"):',
  );

  // Model detail modal & custom model prices modal
  out = out.replace(
    /label:[`"']Cost[`"'],value:([A-Za-z0-9_$]+)/g,
    'label:__t3UsageZh()?"费用":"Cost",value:$1',
  );
  out = out.replace(
    /label:[`"']Tokens[`"'],value:([A-Za-z0-9_$]+)/g,
    'label:__t3UsageZh()?"Token":"Tokens",value:$1',
  );
  out = out.replace(
    /label:[`"']Per 1M tokens[`"'],value:/g,
    'label:__t3UsageZh()?"每百万 Token 均价":"Per 1M tokens",value:',
  );
  out = out.replace(
    /label:[`"']Cache hit[`"'],value:/g,
    'label:__t3UsageZh()?"缓存命中率":"Cache hit",value:',
  );
  out = out.replace(
    /[`"']{2}:` · \$\{([A-Za-z0-9_$]+\([A-Za-z0-9_$.]+\))\} of cost`/g,
    '"":(__t3UsageZh()?` · ${$1} 费用占比`:` · ${$1} of cost`)',
  );
  out = out.replace(
    /\[([A-Za-z0-9_$]+\([A-Za-z0-9_$.]+\)),[`"'] tokens have no known price[`"']\]/g,
    '[$1,__t3UsageZh()?" Token 暂无已知单价":" tokens have no known price"]',
  );
  out = out.replace(
    /children:[`"']Set price[`"']/g,
    'children:__t3UsageZh()?"设置单价":"Set price"',
  );
  out = out.replace(
    /children:[`"']Custom model prices[`"']/g,
    'children:__t3UsageZh()?"自定义模型单价":"Custom model prices"',
  );
  out = out.replace(
    /children:[`"']Prices and mappings apply to all past and future usage on the environments you select\.[`"']/g,
    'children:__t3UsageZh()?"自定义单价与模型映射将应用于所选环境的全部历史与未来用量估算。":"Prices and mappings apply to all past and future usage on the environments you select."',
  );
  out = out.replace(
    /children:[`"']Apply to[`"']/g,
    'children:__t3UsageZh()?"应用于":"Apply to"',
  );
  out = out.replace(
    /children:[`"']USD \/ million tokens[`"']/g,
    'children:__t3UsageZh()?"USD / 百万 Token（按美元配置）":"USD / million tokens"',
  );
  out = out.replace(
    /children:[`"']Model ID[`"']/g,
    'children:__t3UsageZh()?"模型 ID":"Model ID"',
  );
  out = out.replace(
    /children:[`"']Map to[`"']/g,
    'children:__t3UsageZh()?"映射至":"Map to"',
  );
  out = out.replace(
    /\?[`"']Saving…[`"']:([A-Za-z0-9_$.]+)>0\?[`"']Retry failed saves[`"']:[`"']Save changes[`"']/g,
    '?(__t3UsageZh()?"保存中…":"Saving…"):$1>0?(__t3UsageZh()?"重试失败项":"Retry failed saves"):(__t3UsageZh()?"保存修改":"Save changes")',
  );
  out = out.replace(
    /\?[`"']Discard pending changes[`"']:[`"']Discard changes[`"']/g,
    '?(__t3UsageZh()?"放弃待定修改":"Discard pending changes"):(__t3UsageZh()?"放弃修改":"Discard changes")',
  );

  // 6. Build toolbar control renderer + reactive root key wrapper at module footer
  const currButtonExpr =
    tooltipRootIdent && tooltipTriggerIdent && tooltipPopupIdent
      ? `(0,${jsxNs}.jsxs)(${tooltipRootIdent},{children:[(0,${jsxNs}.jsx)(${tooltipTriggerIdent},{render:(0,${jsxNs}.jsx)("span",{className:"inline-flex"}),children:__currSeg}),(0,${jsxNs}.jsx)(${tooltipPopupIdent},{side:"bottom",children:__fxTip})]})`
      : `__currSeg`;

  const helperFooter = `
var __t3SavedEnvIds=null,__t3SavedBreakdown="model";
function __t3UsageZh(){return globalThis.__t3QuotaUi?globalThis.__t3QuotaUi.isZh():!0}
function __t3UsageCny(){return globalThis.__t3QuotaUi?globalThis.__t3QuotaUi.isCny():!1}
function __t3UsageRate(){return globalThis.__t3QuotaUi?globalThis.__t3QuotaUi.getRate():7.25}
function __t3UseSavedEnvIds(){
  const [s,setS]=(0,${reactNs}.useState)(()=>__t3SavedEnvIds);
  const update=(0,${reactNs}.useCallback)(v=>{
    const next=typeof v==="function"?v(__t3SavedEnvIds):v;
    __t3SavedEnvIds=next;
    setS(next);
  },[]);
  return [s,update];
}
function __t3UseSavedBreakdown(){
  const [s,setS]=(0,${reactNs}.useState)(()=>__t3SavedBreakdown);
  const update=(0,${reactNs}.useCallback)(v=>{
    const next=typeof v==="function"?v(__t3SavedBreakdown):v;
    __t3SavedBreakdown=next;
    setS(next);
  },[]);
  return [s,update];
}
function __t3RenderToolbarToggles(compact){
  const isZh=__t3UsageZh();
  const isCny=__t3UsageCny();
  const rate=__t3UsageRate();
  const __fxTip=isZh?\`切换人民币 / 美元实时换算（参考汇率 1 USD = \${rate} CNY）\`:\`Toggle CNY / USD conversion (Ref rate: 1 USD = \${rate} CNY)\`;
  const __langTip=isZh?"切换中 / 英文界面（立即生效）":"Toggle Chinese / English UI (Instant)";
  const __currSeg=(0,${jsxNs}.jsxs)(${toggleGroupIdent},{
    "aria-label":isZh?"计价货币":"Currency",
    variant:"segmented",
    value:[isCny?"CNY":"USD"],
    onValueChange:vals=>{
      const cur=__t3UsageCny()?"CNY":"USD";
      const next=vals[0]||(cur==="CNY"?"USD":"CNY");
      globalThis.__t3QuotaUi?.setCurrency(next);
    },
    children:[
      (0,${jsxNs}.jsx)(${toggleItemIdent},{value:"CNY",title:__fxTip,children:compact?"¥":"¥ CNY"},"CNY"),
      (0,${jsxNs}.jsx)(${toggleItemIdent},{value:"USD",title:__fxTip,children:compact?"$":"$ USD"},"USD")
    ]
  });
  const __langSeg=(0,${jsxNs}.jsxs)(${toggleGroupIdent},{
    "aria-label":isZh?"界面语言":"Language",
    variant:"segmented",
    value:[isZh?"zh":"en"],
    onValueChange:vals=>{
      const cur=__t3UsageZh()?"zh":"en";
      const next=vals[0]||(cur==="zh"?"en":"zh");
      globalThis.__t3QuotaUi?.setLang(next);
    },
    children:[
      (0,${jsxNs}.jsx)(${toggleItemIdent},{value:"zh",title:__langTip,children:"中"},"zh"),
      (0,${jsxNs}.jsx)(${toggleItemIdent},{value:"en",title:__langTip,children:"EN"},"en")
    ]
  });
  return (0,${jsxNs}.jsxs)(${jsxNs}.Fragment,{children:[${currButtonExpr},__langSeg]});
}
`;

  out = out.replace(
    /var ([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+);export\{\1 as component\};/,
    (_, expVar, innerComp) => `${helperFooter}
function __T3UsageRootWrapper(props){
  const [snap,setSnap]=(0,${reactNs}.useState)(()=>({
    lang:__t3UsageZh()?"zh":"en",
    curr:__t3UsageCny()?"CNY":"USD",
    rate:__t3UsageRate()
  }));
  (0,${reactNs}.useEffect)(()=>{
    if(!globalThis.__t3QuotaUi?.subscribe)return;
    return globalThis.__t3QuotaUi.subscribe(next=>{
      setSnap({lang:next.lang,curr:next.currency,rate:next.rate});
    });
  },[]);
  return (0,${jsxNs}.jsx)("div",{"data-quota-ui-managed":"true",className:"contents",children:(0,${jsxNs}.jsx)(${innerComp},{...props},\`\${snap.lang}:\${snap.curr}:\${snap.rate}\`)});
}
var ${expVar}=__T3UsageRootWrapper;export{${expVar} as component};`,
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

  // 1. Patch index.html (CSS layout + runtime currency & bilingual switcher)
  const indexHtmlRel = "apps/server/dist/client/index.html";
  if (getFileNode(header, indexHtmlRel)) {
    let html = readText(indexHtmlRel);
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
      updated.includes("malformed or inconsistent usage record") &&
      updated.includes("minimumFractionDigits:2,maximumFractionDigits:2")
    ) {
      updated = patchUsageFormatBundle(updated);
    }

    if (updated.includes("usage.cost") && updated.includes("usage.period.day")) {
      updated = patchUsageShortcutsBundle(updated);
    }

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

    if (
      updated.includes("usage-page-preferences:v1") &&
      (updated.includes("Cost by type") || updated.includes("按类型费用"))
    ) {
      updated = patchChatUsageBundle(updated);
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
  console.log(`[t3code-quota-ui] Default language mode: ${opts.lang}`);
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

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  main();
}
