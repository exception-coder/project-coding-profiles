#!/usr/bin/env node
// =============================================================
// git pre-commit 钩子：提交前对暂存区里的文本文件做编码核对。
//
// 用途：给「没有 PreToolUse 钩子」的工具（典型是 Cursor）补一道
//   确定性防线。git 钩子由 git 自己执行，与用哪个编辑器无关——
//   只要 `git commit`，不管文件是 Cursor / 记事本 / 谁写的都会跑。
//
// 与 check-file-encoding.js 的区别：
//   - 那个在「写盘前」拦（PreToolUse），文件还没被写坏。
//   - 本钩子在「提交前」拦，文件可能已落盘乱码，提交前最后一道闸——
//     防止乱码进入 git 历史，让你回去修。
//
// 判定：对每个暂存(ACM)文本文件，探测『暂存内容实际编码』并与 profile
//   『期望编码』比对，编码族不符即报（典型：src/** 期望 GBK，却被写成
//   UTF-8 提交）。纯 ASCII 内容零风险，直接放行。仅在已登记 profile 的
//   项目内生效。
//
//   PCP_ENCODING_HOOK=block（安装器默认） → 发现问题 exit 2 拦下提交
//   PCP_ENCODING_HOOK=warn                → 只提示，不拦（exit 0）
//   PCP_ENCODING_HOOK=off                 → 完全跳过
// =============================================================

const path = require('path');
const { execFileSync } = require('child_process');
const {
  TEXT_EXT, detectEncoding, normalizeEnc, isLegacy,
  expectedEncoding, resolveProfile, toPosix,
} = require('./encoding-core');

const MODE = (process.env.PCP_ENCODING_HOOK || 'block').toLowerCase();
if (MODE === 'off') process.exit(0);

function git(args, opts) {
  return execFileSync('git', args, Object.assign({ encoding: 'buffer' }, opts || {}));
}

let repoRoot;
try {
  repoRoot = git(['rev-parse', '--show-toplevel']).toString('utf8').trim();
} catch (e) { process.exit(0); } // 不在 git 仓库里：放行

// 暂存区里新增/复制/修改的文件（-z 防路径含空格/特殊字符）
let staged = [];
try {
  const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z']).toString('utf8');
  staged = out.split('\0').filter(Boolean);
} catch (e) { process.exit(0); }

const findings = [];
for (const rel of staged) {
  if (!TEXT_EXT.test(rel)) continue;

  const abs = path.join(repoRoot, rel);
  const resolved = resolveProfile(path.dirname(abs));
  if (!resolved) continue; // 未登记 profile 的项目，放行

  // 读「暂存版本」的字节（而非工作区），核对真正要提交进去的内容
  let buf;
  try { buf = git(['show', ':' + rel]); } catch (e) { continue; }

  const actual = detectEncoding(buf);
  if (actual === 'ascii') continue; // 纯 ASCII：UTF-8/GBK 字节一致，零风险

  const relToProfile = toPosix(path.relative(resolved.root, abs));
  const expected = expectedEncoding(resolved.profile, relToProfile);
  const finding = assessCommit(expected, actual);
  if (finding) {
    findings.push({
      project: resolved.profile.displayName || resolved.profile.name,
      file: rel,
      msg: finding.msg,
    });
  }
}

if (findings.length === 0) process.exit(0);

const out = [];
out.push(`[project-coding-profiles] 暂存区编码核对发现 ${findings.length} 处风险：`);
for (const f of findings) {
  out.push(`  • ${f.file}（项目：${f.project}）`);
  out.push(`    ${f.msg}`);
}
out.push('  处置：');
out.push('    1) 用 skills/encoding-guard 的 detect-encoding.ps1 把文件转回期望编码（如 -To gbk），再 git add 重新暂存；');
out.push('    2) GBK 文件推荐「转 UTF-8 → 编辑 → 转回 GBK」回环，未改的行字节原样还原；');
out.push('    3) 切勿为统一而批量转码（丢数据 + 污染 git）。');
out.push('  旁路：PCP_ENCODING_HOOK=warn 只提示不拦 / =off 关闭 / git commit --no-verify 跳过本次。');

process.stderr.write(out.join('\n') + '\n');
process.exit(MODE === 'block' ? 2 : 0);

// ---- 提交时风险判定：期望编码 vs 暂存内容实际编码 ------------

function assessCommit(expected, actual) {
  const exp = normalizeEnc(expected);
  const act = normalizeEnc(actual);

  if (isLegacy(exp)) {
    if (act === exp) return null;            // 同族（都 GBK 等）→ 正常
    if (isLegacy(act)) {
      return { msg: `项目 profile 期望 ${exp.toUpperCase()}，暂存内容探测为 ${actual.toUpperCase()}（编码族不符）。` };
    }
    // 实际是 utf-8 / utf-8-bom —— 典型「GBK 文件被写成 UTF-8」
    return { msg: `项目 profile 期望 ${exp.toUpperCase()}，暂存内容探测为 ${actual.toUpperCase()}——含中文将按 ${exp.toUpperCase()} 读成乱码。` };
  }

  if (exp === 'utf-8') {
    if (isLegacy(act)) {
      return { msg: `项目 profile 期望 UTF-8，暂存内容探测为 ${actual.toUpperCase()}。` };
    }
    return null; // utf-8 / utf-8-bom 都可接受
  }

  if (exp === 'utf-8-bom') {
    if (act !== 'utf-8-bom') {
      return { msg: `项目 profile 期望 UTF-8(带 BOM)，暂存内容探测为 ${actual.toUpperCase()}。` };
    }
    return null;
  }

  return null;
}
