#!/usr/bin/env node
// =============================================================
// 解析业务项目的 Struts2 + Spring 配置，生成「URL → 模块」路由映射表到
//   profiles/<project>/url-route-map.md。
//
// 定位：这是「代码结构导航」派生索引（路由面 → 后端类 + 前端 jsp），属
//   project-coding-profiles（编码画像）而非 domain-knowledge（业务认知）。
//   与 import-encoding-map.js 同构：解析业务项目产物 → 落成本 profile 的派生索引。
//
// 数据来源（权威）：
//   - config/struts/struts-*.xml : <package namespace="/ns"> + <action name="x_*" class="bean" method="{1}"> + <result name="R">/path.jsp</result>
//   - config/spring/**/applicationContext-action.xml : <bean name="bean" class="FQN"> —— 用来把 struts 的 class（bean 名）解析成真实 Java 类
//
// 输出是「大资产、按 key grep」：用 grep <action名 / /namespace / jsp名> 即定位。
//   路由变更后重跑本脚本覆盖。
//
// 用法：node hooks/generate-url-route-map.js <projectRoot> <profileName>
//   例： node hooks/generate-url-route-map.js "D:\yoooni\yoooniCodeSpace\yoooni" yoooni
// =============================================================

const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[2];
const profileName = process.argv[3];
if (!projectRoot || !profileName) {
  console.error('用法: node hooks/generate-url-route-map.js <projectRoot> <profileName>');
  process.exit(1);
}

// src 多为 GBK；用 latin1 逐字节读，保证 ASCII 属性（namespace/class/jsp/result）正确解析，
// 不关心被 latin1 还原的中文注释（不参与解析）。
function readBin(f) { try { return fs.readFileSync(f, 'latin1'); } catch (e) { return ''; } }

function walk(dir, filter, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, filter, out);
    else if (e.isFile() && filter(e.name)) out.push(full);
  }
  return out;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"'));
  return m ? m[1] : '';
}

// ---- 1) Spring：bean 名 → 类 FQN ----------------------------
const springDir = path.join(projectRoot, 'src', 'config', 'spring');
const beanToClass = new Map();
for (const f of walk(springDir, (n) => /applicationContext-action\.xml$/i.test(n))) {
  const xml = readBin(f);
  const re = /<bean\b([^>]*)>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const name = attr(m[1], 'name') || attr(m[1], 'id');
    const cls = attr(m[1], 'class');
    if (name && cls) beanToClass.set(name, cls);
  }
}

// ---- 2) Struts：namespace + action + result→jsp -------------
const strutsDir = path.join(projectRoot, 'src', 'config', 'struts');
const packages = []; // { ns, file, actions: [{ name, prefix, dynamic, bean, class, file, results: [{name,jsp}] }] }

for (const f of walk(strutsDir, (n) => /^struts.*\.xml$/i.test(n))) {
  const rel = path.relative(projectRoot, f).split(path.sep).join('/');
  const xml = readBin(f);
  // 按 <package ...> 切块（package 不嵌套 package）
  const pkgRe = /<package\b([^>]*)>([\s\S]*?)<\/package>/g;
  let pm;
  while ((pm = pkgRe.exec(xml)) !== null) {
    const ns = attr(pm[1], 'namespace') || '';
    const body = pm[2];
    const actions = [];
    // action 可能带 results（成对）或自闭合
    const actRe = /<action\b([^>]*?)(?:\/>|>([\s\S]*?)<\/action>)/g;
    let am;
    while ((am = actRe.exec(body)) !== null) {
      const aAttr = am[1];
      const inner = am[2] || '';
      const name = attr(aAttr, 'name');
      const bean = attr(aAttr, 'class');
      if (!name) continue;
      const dynamic = /_\*$/.test(name);
      const prefix = dynamic ? name.replace(/_\*$/, '') : name;
      const results = [];
      const rRe = /<result\b([^>]*?)(?:>([\s\S]*?)<\/result>|\/>)/g;
      let rm;
      while ((rm = rRe.exec(inner)) !== null) {
        const rname = attr(rm[1], 'name') || 'success';
        const jsp = (rm[2] || attr(rm[1], 'location') || '').trim();
        if (jsp) results.push({ name: rname, jsp });
      }
      const cls = beanToClass.get(bean) || '';
      const classFile = cls ? 'src/' + cls.replace(/\./g, '/') + '.java' : '';
      actions.push({ name, prefix, dynamic, bean, class: cls, classFile, results });
    }
    if (actions.length) packages.push({ ns, file: rel, actions });
  }
}

packages.sort((a, b) => a.ns.localeCompare(b.ns));

// ---- 3) 输出 markdown（grep 友好） --------------------------
const lines = [];
const totalActions = packages.reduce((n, p) => n + p.actions.length, 0);
const unresolved = packages.reduce((n, p) => n + p.actions.filter((a) => !a.class).length, 0);

lines.push('# Yoooni URL → 模块路由映射（自动生成，勿手改）');
lines.push('');
lines.push('> 由 `project-coding-profiles/hooks/generate-url-route-map.js` 解析 `config/struts/*.xml` + `config/spring/**/applicationContext-action.xml` 生成。路由变更后重跑刷新。');
lines.push('> **用法**：`grep <action名 / "/namespace" / jsp名>` 本文件即定位后端类 + 前端 jsp。');
lines.push('> URL 形如 `/{ns}/{action}_{method}.action` → 打开「后端类」读 `{method}()` 看 `return` 的 result 名 → 对应下面的 jsp。');
lines.push(`> 统计：${packages.length} 个 namespace / ${totalActions} 个 action（${unresolved} 个未解析到 Spring bean 类）。`);
lines.push('');

for (const p of packages) {
  lines.push(`## ${p.ns || '(无 namespace)'}  ·  ${p.file}`);
  lines.push('');
  for (const a of p.actions.sort((x, y) => x.name.localeCompare(y.name))) {
    const url = a.dynamic ? `/${stripSlash(p.ns)}/${a.prefix}_<method>.action` : `/${stripSlash(p.ns)}/${a.name}.action`;
    lines.push(`- \`${url}\`  →  ${a.class || '(bean: ' + a.bean + ' 未解析)'}`);
    if (a.classFile) lines.push(`  - 后端：${a.classFile}`);
    if (a.results.length) {
      lines.push('  - 前端 result→jsp：' + a.results.map((r) => `${r.name}=${r.jsp}`).join(' · '));
    }
  }
  lines.push('');
}

function stripSlash(ns) { return String(ns).replace(/^\/+/, ''); }

const outPath = path.join(__dirname, '..', 'profiles', profileName, 'url-route-map.md');
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log('写入 ' + path.relative(path.join(__dirname, '..'), outPath));
console.log(`namespace: ${packages.length}  action: ${totalActions}  未解析类: ${unresolved}  spring bean: ${beanToClass.size}`);
