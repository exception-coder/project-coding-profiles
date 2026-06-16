#!/usr/bin/env node
// =============================================================
// 从某项目的 .idea/encodings.xml 导入「逐文件权威编码表」到
//   profiles/<project>/encoding-map.json。
//
// 目的：把 IDEA 维护的逐文件编码真值，沉淀为本仓库集中维护的「权威编码源」，
//   运行时不再依赖各人机器上的 .idea 状态（更可靠、可评审、可版本化）。
//   首次 = 种子导入；之后项目里新增/调整文件编码后可重跑刷新，PR 评审差异。
//
// 用法：node hooks/import-encoding-map.js <projectRoot> <profileName>
//   例： node hooks/import-encoding-map.js "D:\yoooni\yoooniCodeSpace\yoooni" yoooni
// =============================================================

const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[2];
const profileName = process.argv[3];
if (!projectRoot || !profileName) {
  console.error('用法: node hooks/import-encoding-map.js <projectRoot> <profileName>');
  process.exit(1);
}

const xmlPath = path.join(projectRoot, '.idea', 'encodings.xml');
let xml;
try { xml = fs.readFileSync(xmlPath, 'utf8'); }
catch (e) { console.error('读不到 ' + xmlPath + '：' + e.message); process.exit(1); }

function normEnc(c) {
  const s = String(c || '').toLowerCase().replace(/_/g, '-');
  if (s === 'gb2312' || s === 'gb18030' || s === 'gbk' || s === 'cp936' || s === 'ms936') return 'gbk';
  if (s === 'utf8') return 'utf-8';
  return s || 'utf-8';
}

// <file url="file://$PROJECT_DIR$/相对路径" charset="GBK" />
const re = /<file\s+url="file:\/\/\$PROJECT_DIR\$\/?([^"]*)"\s+charset="([^"]+)"\s*\/>/g;
const entries = [];
let m;
while ((m = re.exec(xml)) !== null) {
  const p = m[1].replace(/\\/g, '/').replace(/\/+$/, ''); // 相对项目根的 posix 路径（去尾斜杠）
  entries.push({ path: p, charset: normEnc(m[2]) });
}

if (entries.length === 0) {
  console.error('未解析到任何 <file> 条目，检查 encodings.xml 格式');
  process.exit(1);
}

const counts = entries.reduce((a, e) => ((a[e.charset] = (a[e.charset] || 0) + 1), a), {});

const out = {
  _comment: '项目逐文件权威编码表（集中维护，单一可信源）。解析规则：取与目标文件相对路径最长前缀匹配的 entry 的 charset；都不匹配用 default。优先级 本表 > profile.json 的 encoding.rules > default。由 hooks/import-encoding-map.js 从项目 .idea/encodings.xml 导入/刷新，之后在本仓库维护与 PR 评审。',
  source: profileName + ' .idea/encodings.xml',
  importedAt: new Date().toISOString().slice(0, 10),
  default: 'gbk',
  entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
};

const outPath = path.join(__dirname, '..', 'profiles', profileName, 'encoding-map.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('写入 ' + path.relative(path.join(__dirname, '..'), outPath));
console.log('条目数: ' + entries.length + '  分布: ' + JSON.stringify(counts));
