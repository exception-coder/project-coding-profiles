#!/usr/bin/env node
// =============================================================
// PreToolUse hook: 源码 / 文本文件 Write/Edit/MultiEdit 之前
//   按「项目级编码画像（profile）」检查本次写入是否会破坏文件编码。
//
// 背景：Claude Code 的 Write/Edit 工具把文件以 UTF-8(无 BOM) 写盘。
//   对于 GBK 编码的存量文件，一旦写入含中文（非 ASCII）的内容，
//   磁盘上就变成 UTF-8 字节，被编译器/应用按 GBK 读时即乱码。
//   这正是「项目大量用 GBK，vibe coding 时却写出 UTF-8」的根因。
//
// 仅在「已登记 profile 的项目内」触发（按 rootMarkers / .coding-profile.json
//   向上查找）。其它项目一律放行，绝不全局打扰。
//
// 判定策略（把误报压到最低）：
//   - 存量文件：以『磁盘实际编码』为准（探测字节，不靠 glob 猜）。
//       实际是 GBK + 本次新增含非 ASCII → 命中（写 UTF-8 必乱码）。
//       这样即便项目是混合编码，对 src 里少数 UTF-8 例外文件也不会误报。
//   - 新建文件：用 profile 规则得到『期望编码』。
//       期望是 GBK/遗留编码 + 内容含非 ASCII → 提示创建后需转码。
//   - 纯 ASCII 内容：UTF-8 与 GBK 字节一致，零风险，直接放行。
//
// 默认 block 模式（exit 2 硬阻断）：与提交前钩子 pre-commit-encoding.js 对齐。
//   写入闸门若只 warn，坏内容会先落盘、只能等提交时才拦（且需装 git hook），
//   实践中导致 GBK 文件被 UTF-8 写坏反复发生，故默认即硬阻断。
//   PCP_ENCODING_HOOK=warn → 只提示不拦（exit 0 + stderr），评估期可用
//   PCP_ENCODING_HOOK=off  → 完全跳过
//
// 编码探测 / profile 解析等纯逻辑统一放在 encoding-core.js，与 git
//   提交前钩子 pre-commit-encoding.js 共用。
// =============================================================

const path = require('path');
const {
  TEXT_EXT, detectEncoding, isLegacy, expectedEncoding,
  resolveProfile, hasNonAscii, toPosix, safeExists, safeRead,
} = require('./encoding-core');
const { logHookEvent } = require('./event-log');
const { normalizeChanges } = require('./change-input');

const MODE = (process.env.PCP_ENCODING_HOOK || 'block').toLowerCase();
if (MODE === 'off') process.exit(0);

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
    if (change.operation === 'delete' || !TEXT_EXT.test(filePath)) continue;
    if (!hasNonAscii(change.addedText)) continue; // 纯 ASCII：写 UTF-8 / GBK 字节相同，零风险

    // 只在已登记 profile 的项目内触发
    const resolved = resolveProfile(path.dirname(path.resolve(filePath)));
    if (!resolved) continue;

    const rel = toPosix(path.relative(resolved.root, path.resolve(filePath)));
    const finding = assess(filePath, rel, resolved.profile);
    if (finding) matches.push({ filePath, rel, profile: resolved.profile, finding });
  }
  if (matches.length === 0) process.exit(0);

  const lines = ['[project-coding-profiles] 检测到文件编码风险：'];
  for (const match of matches) {
    lines.push(`  项目：${match.profile.displayName || match.profile.name}`);
    lines.push(`  文件：${match.rel}`);
    lines.push(`  ${match.finding.msg}`);
    if (match.finding.detail) lines.push(`  ${match.finding.detail}`);
  }
  lines.push('  处置：');
  lines.push('    1) 用 skills/encoding-guard 的 detect-encoding.ps1 先探测，再以正确编码写入；');
  lines.push('    2) GBK 文件推荐「转 UTF-8 → 编辑 → 转回 GBK」回环，未改的行字节会原样还原，git diff 只剩真实改动；');
  lines.push('    3) 切勿为统一而批量转码（丢数据 + 污染 git）。详见 encoding-guard SKILL。');
  lines.push('  旁路：PCP_ENCODING_HOOK=warn 只提示不拦 / =off 完全关闭（默认 block 硬阻断）。');

  for (const match of matches) {
    logHookEvent({ plugin: 'project-coding-profiles', hook: 'check-file-encoding', rule: 'file-encoding', mode: MODE, tool, file: match.filePath });
  }
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(MODE === 'block' ? 2 : 0);
});

// ---- 写前风险判定（PreToolUse 专属） --------------------------

function assess(absLikePath, rel, profile) {
  const expected = expectedEncoding(profile, rel); // 权威期望编码（已接 encoding-map.json）
  const exists = safeExists(absLikePath);
  if (exists) {
    const actual = detectEncoding(safeRead(absLikePath));
    if (isLegacy(actual)) {
      return {
        msg: `存量文件磁盘实际编码为 ${actual.toUpperCase()}，但 Write/Edit 会以 UTF-8 重存——含中文将变乱码。`,
      };
    }
    if (actual === 'utf-8' && isLegacy(expected)) {
      // 磁盘已是 UTF-8 但权威期望 GBK → 文件被 iconv/编辑器在 Claude 之外转码改坏，不是登记在案的 UTF-8 例外
      return {
        msg: `该文件权威编码应为 ${expected.toUpperCase()}，但磁盘上已是 UTF-8——疑似被 iconv/编辑器在 Claude 之外转码改坏（不是登记在案的 UTF-8 例外）。`,
        detail: '先复原再改：encoding-doctor --fix（或 detect-encoding.ps1 -From utf-8 -To gbk）；勿在坏状态上直接 Write/Edit（会把它固化进库）。该文件若确应为 UTF-8，请登记进 encoding-map.json 后重跑 import-encoding-map.js。',
      };
    }
    if (actual === 'utf-8-bom') {
      return {
        msg: '存量文件带 UTF-8 BOM，Write/Edit 会去掉 BOM。',
        detail: '若该文件类型依赖 BOM（如 PS 5.1 读 .ps1），重存后中文可能读乱——写完用 detect-encoding.ps1 以带 BOM 方式回写。',
      };
    }
    return null; // 实际已是 UTF-8 / ASCII，工具写 UTF-8 不破坏
  }

  // 新建文件：用权威期望编码判定
  if (isLegacy(expected)) {
    return {
      msg: `新建文件按项目 profile 期望编码为 ${expected.toUpperCase()}，但工具会写 UTF-8。`,
      detail: '创建后用 detect-encoding.ps1 转成目标编码，或在 IDEA 中以该编码另存。',
    };
  }
  if (expected === 'utf-8-bom') {
    return {
      msg: '新建文件按 profile 期望 UTF-8(带 BOM)，但工具默认写无 BOM。',
      detail: '写完用 detect-encoding.ps1 以带 BOM 方式回写。',
    };
  }
  return null;
}
