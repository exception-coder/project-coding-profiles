#!/usr/bin/env node
// =============================================================
// PreToolUse hook：前端文件 Write/Edit/MultiEdit 之前，拦截「跨业务模块直接复用
//   对方私有组件/端点」的耦合写法（coding-mode.md §1.1）。
//
//   本模块（如 crm/lead）需要别的业务模块（如 cust）的能力时，只能：① 后端注入
//   对方 Manage；② 前端共享件下沉到 /public/js/common 等公共层再引用。禁止本模块
//   的页面直接 src=/include/url= 指向另一个业务模块的私有 js/jsp/action（含落在
//   /public/js/<别的模块>/ 下的「页面私有脚本」——它在 /public 下但不是通用件）。
//
// 仅在「已登记 profile 且 profile.crossModuleCoupling.enabled=true」的项目内、对
//   WebRoot 下的前端文件生效；只检查「本次新增内容」，不动存量历史。
//
//   默认 warn（exit 0 + stderr 提示）。PCP_CROSSMODULE_HOOK=block 升级硬阻断(exit 2)、=off 关闭。
//
// 判据是启发式（warn 为主）：业务模块集 = WebRoot 顶层目录 ∪ WebRoot/erp 下子目录，
//   减去公共/资源目录；引用的首模块 token 命中该集合且 ≠ 本文件所属模块即告警。
//   未知 token（jedate 等库、/public/config.jsp、/public/js/common）一律放行，避免误伤。
//
// profile 解析复用 encoding-core.js。
// =============================================================

const fs = require('fs');
const path = require('path');
const { resolveProfile, toPosix, safeExists } = require('./encoding-core');
const { logHookEvent } = require('./event-log');

const MODE = (process.env.PCP_CROSSMODULE_HOOK || 'warn').toLowerCase();
if (MODE === 'off') process.exit(0);

const FRONTEND_EXT = /\.(jsp|jspx|js|jsx|ts|tsx|vue|html|htm)$/i;

// 永不当作「业务模块」的公共/资源/库目录（大小写不敏感）
const NON_MODULE = new Set([
  'public', 'common', 'web-inf', 'meta-inf', 'images', 'image', 'img', 'css',
  'style', 'styles', 'js', 'plug-in', 'plugin', 'plugins', 'fonts', 'font',
  'ueditor', 'editor', 'kindeditor', 'skin', 'skins', 'themes', 'theme', 'layui',
  'echarts', 'scripts', 'lib', 'libs', 'jedate', 'jquery-easyui-1.5.5.4',
]);

// 候选引用路径：src=/href=/action= 属性、<%@ include %>、以及任意被引号/括号包住的
//   绝对路径（.action/.jsp/.js）。统一抓出形如 /a/b/....{action|jsp|js} 的绝对路径。
const REF_RE = /["'(]\s*(\/[A-Za-z0-9_./\-]+?\.(?:action|jsp|jspx|js))\b/g;

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); } catch (e) { process.exit(0); }

  const tool = payload.tool_name;
  if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit') process.exit(0);

  const input = payload.tool_input || {};
  const filePath = input.file_path;
  if (typeof filePath !== 'string' || !filePath || !FRONTEND_EXT.test(filePath)) process.exit(0);

  const added = extractAddedText(tool, input);
  if (!added) process.exit(0);

  const resolved = resolveProfile(path.dirname(path.resolve(filePath)));
  if (!resolved) process.exit(0);

  const cm = resolved.profile.crossModuleCoupling;
  if (!cm || !cm.enabled) process.exit(0);

  const rel = toPosix(path.relative(resolved.root, path.resolve(filePath)));
  const m = /(?:^|\/)WebRoot\/(.+)$/.exec(rel);
  if (!m) process.exit(0); // 只管 WebRoot 前端
  const innerSegs = m[1].split('/').filter(Boolean);
  const owner = ownerToken(innerSegs);
  if (!owner) process.exit(0);

  const modules = businessModules(resolved.root);
  if (!modules.size) process.exit(0);
  const shared = new Set((cm.sharedModules || []).map((s) => String(s).toLowerCase()));

  const hits = []; // { path, mod }
  let r;
  REF_RE.lastIndex = 0;
  while ((r = REF_RE.exec(added)) !== null) {
    const p = r[1];
    const mod = refModule(p);
    if (!mod) continue;
    const lc = mod.toLowerCase();
    if (lc === owner.toLowerCase()) continue;       // 本模块自己的资源
    if (shared.has(lc)) continue;                   // 项目登记的公认共享模块
    if (!modules.has(lc)) continue;                 // 未知 token（库/通用件）放行
    hits.push({ path: p, mod });
  }
  if (hits.length === 0) process.exit(0);

  const byMod = new Map();
  for (const h of hits) {
    if (!byMod.has(h.mod)) byMod.set(h.mod, new Set());
    byMod.get(h.mod).add(h.path);
  }

  const lines = [
    `[project-coding-profiles] 跨模块耦合红线 §1.1（项目：${resolved.profile.displayName || resolved.profile.name}）`,
    `  文件：${rel}  （所属模块：${owner}）`,
    `  本次新增直接引用了别的业务模块的私有资源：`,
  ];
  for (const [mod, set] of byMod) {
    lines.push(`  · 模块 [${mod}]：${[...set].join('、')}`);
  }
  lines.push('  正确做法：① 后端复用→注入对方 Manage；② 前端共享件→下沉 /public/js/common 再引用；③ 取数→用本模块自己的端点。');
  lines.push('  规则与真实反例见 profiles/<project>/coding-mode.md §1.1。');
  lines.push('  旁路：PCP_CROSSMODULE_HOOK=off 关闭 / =block 升级硬阻断；公认共享模块可加进 profile.crossModuleCoupling.sharedModules。');

  logHookEvent({ plugin: 'project-coding-profiles', hook: 'check-cross-module-coupling', rule: 'cross-module-coupling', mode: MODE, tool, file: filePath });
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(MODE === 'block' ? 2 : 0);
});

// 本文件所属模块：WebRoot/erp/<m>/... → m；否则取 WebRoot 下第一段
function ownerToken(segs) {
  if (!segs.length) return '';
  if (segs[0].toLowerCase() === 'erp' && segs[1]) return segs[1];
  return segs[0];
}

// 引用路径的首模块 token：/public/js/<X>/ → X；/erp/<X>/ → X；否则 /<X>/ → X
function refModule(p) {
  const segs = p.split('/').filter(Boolean);
  if (!segs.length) return '';
  const s0 = segs[0].toLowerCase();
  if (s0 === 'public') {
    return segs[1] && segs[1].toLowerCase() === 'js' ? (segs[2] || '') : '';
  }
  if (s0 === 'erp') return segs[1] || '';
  return segs[0];
}

// 业务模块集合 = WebRoot 顶层目录 ∪ WebRoot/erp 子目录，减去公共/资源/库目录（小写）
function businessModules(root) {
  const set = new Set();
  const add = (dir) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const lc = e.name.toLowerCase();
      if (NON_MODULE.has(lc)) continue;
      set.add(lc);
    }
  };
  const wr = path.join(root, 'WebRoot');
  if (safeExists(wr)) { add(wr); add(path.join(wr, 'erp')); }
  return set;
}

function extractAddedText(tool, input) {
  if (tool === 'Write') return typeof input.content === 'string' ? input.content : '';
  if (tool === 'Edit') return typeof input.new_string === 'string' ? input.new_string : '';
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    return input.edits.map((e) => (e && typeof e.new_string === 'string' ? e.new_string : '')).join('\n');
  }
  return '';
}
