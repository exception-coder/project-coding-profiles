#!/usr/bin/env node
// =============================================================
// 编码体检 / 修复器：扫描已登记 profile 的项目，把每个文本文件的
//   「磁盘实际编码」与「权威期望编码」(encoding-map.json → expectedEncoding)
//   逐一比对，列出不一致；--fix 时复原到权威编码。
//
// 用途：捕获并修复「被 iconv / 编辑器另存 / sed 在 Claude 之外转坏」的文件
//   （PreToolUse hook 只在写时拦本次新增，doctor 是全量兜底网）。
//
// 实际转码复用 skills/encoding-guard/detect-encoding.ps1（Windows，成熟、
//   utf-8→gbk 不可表示即抛错，不静默丢字符），不引入第三方依赖。
//
// 用法：
//   扫描： node hooks/encoding-doctor.js <projectRoot>
//   修复： node hooks/encoding-doctor.js <projectRoot> --fix
//   纯 ASCII 文件零风险跳过；utf-16 等不自动碰，只报告。
// =============================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveProfile, expectedEncoding, detectEncoding, normalizeEnc, toPosix, TEXT_EXT } = require('./encoding-core');

const projectRoot = process.argv[2];
const FIX = process.argv.includes('--fix');
if (!projectRoot) {
  console.error('用法: node hooks/encoding-doctor.js <projectRoot> [--fix]');
  process.exit(1);
}

const resolved = resolveProfile(path.resolve(projectRoot));
if (!resolved) {
  console.error('该目录未命中任何已登记 profile 的 rootMarkers：' + projectRoot);
  process.exit(1);
}

const IGNORE_DIRS = new Set(['.git', '.idea', '.svn', 'node_modules', 'out', 'build', 'dist', 'target', '.kai-chat-attachments']);
const PS1 = path.join(__dirname, '..', 'skills', 'encoding-guard', 'detect-encoding.ps1');
const CONVERTIBLE = new Set(['gbk', 'utf-8', 'utf-8-bom']); // 能安全自动转的源/目标

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (e.isFile() && TEXT_EXT.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

function convert(file, from, to) {
  // 调成熟的 ps1；utf-8→gbk 遇不可表示字符会抛错（非零退出），doctor 据此判定为有损
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1,
    '-Action', 'convert', '-Path', file, '-From', from, '-To', to], { stdio: 'pipe' });
}

const files = walk(resolved.root);
const mism = [];
let total = 0, ascii = 0, ok = 0;
for (const f of files) {
  const rel = toPosix(path.relative(resolved.root, f));
  const expected = normalizeEnc(expectedEncoding(resolved.profile, rel));
  let actual;
  try { actual = detectEncoding(fs.readFileSync(f)); } catch (e) { continue; }
  total++;
  if (actual === 'ascii') { ascii++; continue; }
  if (normalizeEnc(actual) === expected) { ok++; continue; }
  mism.push({ file: f, rel, actual, expected });
}

console.log(`[encoding-doctor] 项目：${resolved.profile.displayName || resolved.profile.name}  根：${resolved.root}`);
console.log(`扫描 ${total} 个文本文件：纯ASCII ${ascii}（零风险跳过）· 与权威一致 ${ok} · 不一致 ${mism.length}`);

if (mism.length === 0) { console.log('✓ 无编码漂移。'); process.exit(0); }

let fixed = 0, lossy = 0, skipped = 0;
for (const m of mism) {
  const fixable = CONVERTIBLE.has(m.actual) && CONVERTIBLE.has(m.expected);
  const tag = fixable ? '可修复' : '需人工';
  if (!FIX) { console.log(`  [${tag}] ${m.actual} → 应为 ${m.expected} | ${m.rel}`); if (!fixable) skipped++; continue; }
  if (!fixable) { console.log(`  [跳过·需人工] ${m.actual} → ${m.expected}（非 gbk/utf-8 互转） | ${m.rel}`); skipped++; continue; }
  try {
    convert(m.file, m.actual, m.expected);
    console.log(`  [已修复] ${m.actual} → ${m.expected} | ${m.rel}`);
    fixed++;
  } catch (e) {
    // utf-8→gbk 抛错 = 含 GBK 无法表示的字符（有损），不强转，留给人工决策
    console.log(`  [有损·跳过] ${m.actual} → ${m.expected}（含目标编码无法表示的字符，需人工） | ${m.rel}`);
    lossy++;
  }
}

if (FIX) {
  console.log(`\n修复完成：已修复 ${fixed} · 有损跳过 ${lossy} · 需人工 ${skipped}。`);
  if (lossy) console.log('有损文件：内容含目标编码（如 GBK）无法表示的字符，请人工确认是否该改内容或登记为 UTF-8 例外。');
} else {
  console.log(`\n（只读扫描。加 --fix 自动复原可修复项；有损项会安全跳过。）`);
  if (skipped) console.log(`其中 ${skipped} 项非 gbk/utf-8 互转，需人工。`);
}
