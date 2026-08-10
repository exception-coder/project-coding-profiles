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
const { normalizeChanges } = require('./change-input');

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
  const matches = [];
  for (const change of normalizeChanges(payload)) {
    const filePath = change.filePath;
    if (change.operation === 'delete' || !FRONTEND_EXT.test(filePath) || !change.addedText) continue;

    const resolved = resolveProfile(path.dirname(path.resolve(filePath)));
    if (!resolved) continue;
    const fc = resolved.profile.frontendControls;
    if (!fc || !fc.banNativeDialogs) continue;

    const rel = toPosix(path.relative(resolved.root, path.resolve(filePath)));
    if (!/(^|\/)WebRoot\//.test(rel + '')) continue;
    const hits = findNativeCalls(change.addedText);
    if (hits.length > 0) matches.push({ filePath, rel, profile: resolved.profile, fc, hits: [...new Set(hits)] });
  }
  if (matches.length === 0) process.exit(0);

  const lines = ['[project-coding-profiles] 前端红线：禁用浏览器原生控件'];
  for (const match of matches) {
    lines.push(`  项目：${match.profile.displayName || match.profile.name}`);
    lines.push(`  文件：${match.rel}`);
    lines.push(`  本次新增用了原生：${match.hits.map((hit) => hit + '()').join('、')}`);
    const repl = match.fc.replacements || {};
    for (const hit of match.hits) {
      if (repl[hit]) lines.push(`  改用：${hit}() → ${repl[hit]}`);
    }
  }
  lines.push('  规则与范例见 profiles/<project>/coding-mode.md §4.1（公共能力必须用公共控件）。');
  lines.push('  旁路：PCP_FRONTEND_HOOK=off 关闭 / =block 升级硬阻断。');

  for (const match of matches) {
    logHookEvent({ plugin: 'project-coding-profiles', hook: 'check-frontend-controls', rule: 'frontend-controls', mode: MODE, tool, file: match.filePath });
  }
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
