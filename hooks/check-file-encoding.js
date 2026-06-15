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
// 默认 warn 模式（exit 0 + stderr 提示），评估期降低打断。
//   PCP_ENCODING_HOOK=block → 硬阻断（exit 2）
//   PCP_ENCODING_HOOK=off   → 完全跳过
// =============================================================

const fs = require('fs');
const path = require('path');

const MODE = (process.env.PCP_ENCODING_HOOK || 'warn').toLowerCase();
if (MODE === 'off') process.exit(0);

// 文本类扩展名（编码风险只对文本文件有意义；二进制直接放行）
const TEXT_EXT = /\.(java|jsp|js|jsx|ts|tsx|kt|kts|py|go|rs|c|cc|cpp|cxx|h|hpp|cs|scala|rb|php|swift|m|mm|vue|lua|sql|xml|html|htm|css|less|scss|properties|txt|md|json|yml|yaml|sh|bat|ps1)$/i;

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
  if (typeof filePath !== 'string' || !filePath) process.exit(0);
  if (!TEXT_EXT.test(filePath)) process.exit(0);

  const added = extractAddedText(tool, input);
  if (!hasNonAscii(added)) process.exit(0); // 纯 ASCII：写 UTF-8 / GBK 字节相同，零风险

  // 只在已登记 profile 的项目内触发
  const resolved = resolveProfile(path.dirname(path.resolve(filePath)));
  if (!resolved) process.exit(0);

  const rel = toPosix(path.relative(resolved.root, path.resolve(filePath)));
  const finding = assess(filePath, rel, resolved.profile);
  if (!finding) process.exit(0);

  const lines = [
    `[project-coding-profiles] 编码风险（项目：${resolved.profile.displayName || resolved.profile.name}）`,
    `  文件：${rel}`,
    `  ${finding.msg}`,
  ];
  if (finding.detail) lines.push(`  ${finding.detail}`);
  lines.push('  处置：');
  lines.push('    1) 用 skills/encoding-guard 的 detect-encoding.ps1 先探测，再以正确编码写入；');
  lines.push('    2) GBK 文件推荐「转 UTF-8 → 编辑 → 转回 GBK」回环，未改的行字节会原样还原，git diff 只剩真实改动；');
  lines.push('    3) 切勿为统一而批量转码（丢数据 + 污染 git）。详见 encoding-guard SKILL。');
  lines.push('  旁路：PCP_ENCODING_HOOK=off 关闭 / =block 升级硬阻断。');

  process.stderr.write(lines.join('\n') + '\n');
  process.exit(MODE === 'block' ? 2 : 0);
});

// ---- 风险判定 -------------------------------------------------

function assess(absLikePath, rel, profile) {
  const exists = safeExists(absLikePath);
  if (exists) {
    const actual = detectEncoding(safeRead(absLikePath));
    if (isLegacy(actual)) {
      return {
        msg: `存量文件磁盘实际编码为 ${actual.toUpperCase()}，但 Write/Edit 会以 UTF-8 重存——含中文将变乱码。`,
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

  // 新建文件：用 profile 规则推期望编码
  const expected = expectedEncoding(profile, rel);
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

// ---- profile 解析（向上查找） --------------------------------

const PROFILES_DIR = path.join(__dirname, '..', 'profiles');

function loadBundledProfiles() {
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(PROFILES_DIR, { withFileTypes: true }); } catch (e) { return out; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const p = path.join(PROFILES_DIR, d.name, 'profile.json');
    try { out.push(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch (e) {}
  }
  return out;
}

function loadBundledByName(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, name, 'profile.json'), 'utf8'));
  } catch (e) { return null; }
}

function resolveProfile(startDir) {
  const bundled = loadBundledProfiles();
  let dir = startDir;
  while (true) {
    // 1) 项目本地覆盖：.coding-profile.json（可 extends 某 bundled profile）
    const localPath = path.join(dir, '.coding-profile.json');
    if (safeExists(localPath)) {
      try {
        const local = JSON.parse(safeRead(localPath).toString('utf8'));
        const base = local.extends ? loadBundledByName(local.extends) : null;
        return { root: dir, profile: mergeProfile(base, local) };
      } catch (e) { /* 坏文件忽略，继续按 rootMarkers 匹配 */ }
    }
    // 2) bundled profile 的 rootMarkers 全部命中
    for (const prof of bundled) {
      const markers = Array.isArray(prof.rootMarkers) ? prof.rootMarkers : [];
      if (markers.length && markers.every((m) => safeExists(path.join(dir, m.replace(/\//g, path.sep))))) {
        return { root: dir, profile: prof };
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function mergeProfile(base, local) {
  if (!base) return local;
  const merged = Object.assign({}, base, local);
  merged.encoding = Object.assign({}, base.encoding || {}, local.encoding || {});
  return merged;
}

// ---- 期望编码（仅用于新建文件） ------------------------------

function expectedEncoding(profile, rel) {
  const enc = (profile && profile.encoding) || {};
  const exceptions = Array.isArray(enc.exceptions) ? enc.exceptions : [];
  for (const ex of exceptions) {
    const pat = ex.path || ex.glob;
    if (pat && globToRe(pat).test(rel)) return normalizeEnc(ex.encoding);
  }
  const rules = Array.isArray(enc.rules) ? enc.rules : [];
  for (const r of rules) {
    if (r.glob && globToRe(r.glob).test(rel)) return normalizeEnc(r.encoding);
  }
  return normalizeEnc(enc.default || 'utf-8');
}

function globToRe(glob) {
  const g = String(glob).replace(/\\/g, '/');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        re += '.*';
        i++;
        if (g[i + 1] === '/') i++; // **/ 可匹配零层目录
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.indexOf(c) !== -1) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

// ---- 编码探测 -------------------------------------------------

function detectEncoding(buf) {
  if (!buf || buf.length === 0) return 'ascii';
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return 'utf-8-bom';
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return 'utf-16le';
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return 'utf-16be';
  const r = scanUtf8(buf);
  if (!r.valid) return 'gbk';          // 非法 UTF-8 序列 → 视作遗留 GBK
  return r.hadMultibyte ? 'utf-8' : 'ascii';
}

// 扫描是否为合法 UTF-8，并记录是否出现多字节序列
function scanUtf8(buf) {
  let i = 0, hadMultibyte = false;
  const n = buf.length;
  while (i < n) {
    const b = buf[i];
    if (b < 0x80) { i++; continue; }
    let extra;
    if ((b & 0xE0) === 0xC0) extra = 1;
    else if ((b & 0xF0) === 0xE0) extra = 2;
    else if ((b & 0xF8) === 0xF0) extra = 3;
    else return { valid: false, hadMultibyte };
    if (i + extra >= n) return { valid: false, hadMultibyte };
    for (let j = 1; j <= extra; j++) {
      if ((buf[i + j] & 0xC0) !== 0x80) return { valid: false, hadMultibyte };
    }
    hadMultibyte = true;
    i += extra + 1;
  }
  return { valid: true, hadMultibyte };
}

function normalizeEnc(e) {
  const s = String(e || '').toLowerCase().replace(/_/g, '-');
  if (s === 'gb2312' || s === 'gb18030' || s === 'gbk' || s === 'cp936' || s === 'ms936') return 'gbk';
  if (s === 'utf8') return 'utf-8';
  if (s === 'utf-8-bom' || s === 'utf8-bom') return 'utf-8-bom';
  return s || 'utf-8';
}

// 遗留（非 UTF-8 / 非 ASCII）编码 —— 写 UTF-8 会破坏
function isLegacy(enc) {
  const e = normalizeEnc(enc);
  return e === 'gbk' || e === 'utf-16le' || e === 'utf-16be' || e === 'big5' || e === 'shift-jis' || e === 'euc-kr';
}

// ---- 工具 -----------------------------------------------------

function extractAddedText(tool, input) {
  if (tool === 'Write') return typeof input.content === 'string' ? input.content : '';
  if (tool === 'Edit') return typeof input.new_string === 'string' ? input.new_string : '';
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    return input.edits.map((e) => (e && typeof e.new_string === 'string' ? e.new_string : '')).join('\n');
  }
  return '';
}

function hasNonAscii(s) {
  if (typeof s !== 'string') return false;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) return true;
  return false;
}

function toPosix(p) { return String(p).replace(/\\/g, '/'); }
function safeExists(p) { try { return fs.existsSync(p); } catch (e) { return false; } }
function safeRead(p) { try { return fs.readFileSync(p); } catch (e) { return Buffer.alloc(0); } }
