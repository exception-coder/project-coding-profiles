#!/usr/bin/env node
// =============================================================
// PreToolUse hook：前端文件 Write/Edit/MultiEdit 之前，拦截「原生浏览器控件」。
//   最基本的前端要求——公共能力必须用公共控件。禁止 alert()/confirm()/prompt()
//   原生写法，一律用项目公共封装（Yoooni：layer.confirm / layer.msg / winAlert …）。
//
// 仅在「已登记 profile 且 profile.frontendControls.banNativeDialogs=true」的项目内、
//   对 WebRoot 下的 .jsp/.js 生效。其它一律放行。只检查「本次新增内容」——
//   不动存量历史（存量上千处原生调用是历史欠债，改到哪条才管哪条）。
//
//   默认 warn（exit 0 + stderr 提示）。PCP_FRONTEND_HOOK=block 升级硬阻断（exit 2）、=off 关闭。
//
// 编码探测 / profile 解析复用 encoding-core.js。
// =============================================================

const path = require('path');
const { resolveProfile, toPosix } = require('./encoding-core');
const { logHookEvent } = require('./event-log');

const MODE = (process.env.PCP_FRONTEND_HOOK || 'warn').toLowerCase();
if (MODE === 'off') process.exit(0);

const FRONTEND_EXT = /\.(jsp|js|jsx|ts|tsx|vue|html|htm)$/i;

// 原生弹框调用：前面不是 . / 字母数字 / $ / _（排除 layer.confirm、winAlert、$.xxx、myconfirm 等）
const NATIVE_DIALOG = /(^|[^.\w$])(alert|confirm|prompt)\s*\(/;

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

  const fc = resolved.profile.frontendControls;
  if (!fc || !fc.banNativeDialogs) process.exit(0);

  const rel = toPosix(path.relative(resolved.root, path.resolve(filePath)));
  // 只管前端目录（默认 WebRoot/；没有 WebRoot 约定的项目此 hook 也不误伤后端同名文件）
  if (!/(^|\/)WebRoot\//.test(rel + '')) process.exit(0);

  const hits = findNativeCalls(added);
  if (hits.length === 0) process.exit(0);

  const repl = fc.replacements || {};
  const lines = [
    `[project-coding-profiles] 前端红线：禁用浏览器原生控件（项目：${resolved.profile.displayName || resolved.profile.name}）`,
    `  文件：${rel}`,
    `  本次新增用了原生：${[...new Set(hits)].map((h) => h + '()').join('、')}`,
  ];
  for (const h of [...new Set(hits)]) {
    if (repl[h]) lines.push(`  改用：${h}() → ${repl[h]}`);
  }
  lines.push('  规则与范例见 profiles/<project>/coding-mode.md §4.1（公共能力必须用公共控件）。');
  lines.push('  旁路：PCP_FRONTEND_HOOK=off 关闭 / =block 升级硬阻断。');

  logHookEvent({ plugin: 'project-coding-profiles', hook: 'check-frontend-controls', rule: 'frontend-controls', mode: MODE, tool, file: filePath });
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(MODE === 'block' ? 2 : 0);
});

function findNativeCalls(text) {
  const out = [];
  const re = new RegExp(NATIVE_DIALOG.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[2]);
  return out;
}

function extractAddedText(tool, input) {
  if (tool === 'Write') return typeof input.content === 'string' ? input.content : '';
  if (tool === 'Edit') return typeof input.new_string === 'string' ? input.new_string : '';
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    return input.edits.map((e) => (e && typeof e.new_string === 'string' ? e.new_string : '')).join('\n');
  }
  return '';
}
