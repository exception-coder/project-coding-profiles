// =============================================================
// 编码守护的可复用核心：profile 解析 + 编码探测 + glob 匹配。
//   被 check-file-encoding.js（Claude Code/Codex 的 PreToolUse 钩子）
//   与 pre-commit-encoding.js（git 提交前钩子）共用，单一实现避免分叉。
//
// 这里只放「与触发方式无关」的纯逻辑；各入口的差异（stdin 解析 / 读暂存区、
//   写前判定 vs 提交时判定、提示文案）留在各自的入口文件里。
// =============================================================

const fs = require('fs');
const path = require('path');

// 文本类扩展名（编码风险只对文本文件有意义；二进制直接放行）
const TEXT_EXT = /\.(java|jsp|js|jsx|ts|tsx|kt|kts|py|go|rs|c|cc|cpp|cxx|h|hpp|cs|scala|rb|php|swift|m|mm|vue|lua|sql|xml|html|htm|css|less|scss|properties|txt|md|json|yml|yaml|sh|bat|ps1)$/i;

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

// ---- 期望编码（按 profile 规则推断） -------------------------

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

// ---- 通用工具 -------------------------------------------------

function hasNonAscii(s) {
  if (typeof s !== 'string') return false;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) return true;
  return false;
}

function toPosix(p) { return String(p).replace(/\\/g, '/'); }
function safeExists(p) { try { return fs.existsSync(p); } catch (e) { return false; } }
function safeRead(p) { try { return fs.readFileSync(p); } catch (e) { return Buffer.alloc(0); } }

module.exports = {
  TEXT_EXT,
  detectEncoding,
  normalizeEnc,
  isLegacy,
  expectedEncoding,
  globToRe,
  resolveProfile,
  hasNonAscii,
  toPosix,
  safeExists,
  safeRead,
};
