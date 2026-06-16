---
name: module-scaffold
description: 在「已登记编码画像且定义了 scaffold 的项目」里，用户要新增一个模块/功能时触发，按该项目的最佳实践范本生成新模块的纵向切片代码框架（前端到后端 + 接线 + 菜单），不必反复问怎么写。触发短语："新增一个模块"、"新增菜单"、"加个 XX 功能/页面"、"搭一个 CRUD"、"按最佳实践生成模块"、"scaffold a module"。识别项目靠 profiles/<project>/profile.json 的 rootMarkers（首例 Yoooni，范本模块 erp/allcost）。生成前以 profiles/<project>/{coding-mode.md, scaffold/new-module.md} 为唯一规则源。
---

# 新增模块脚手架（项目级）

> 适用范围：**已在本插件登记 profile、且该 profile 含 `scaffold` 字段的项目**（靠 `profiles/<project>/profile.json` 的 `rootMarkers` 零侵入识别）。首例 **Yoooni**。其它项目不归本 skill 管。
>
> 与 team-standards 分工：通用编码铁律在 team-standards；本 skill 按**项目特有**的分层与范本生成脚手架。与 [encoding-guard](../encoding-guard/SKILL.md) 配合：生成 `src` 下 GBK 文件时走它的编码回环。

## 0. 触发即做什么（总览）

用户要新增模块/菜单/功能时：
1. **识别项目** → 找到命中的 `profiles/<project>/`。
2. **读规则源**（不要凭记忆）：`profiles/<project>/coding-mode.md`（分层/命名/红线/接线/前端/菜单）+ `profiles/<project>/scaffold/new-module.md`（范本 + 占位符骨架 + 生成步骤）。
3. **收集参数**（见 §2），缺就先问。
4. **按 playbook 顺序生成**纵向切片（见 §3）。
5. **守编码红线**（见 §4）。
6. **输出「需人工确认」清单**（见 §5）。

> 本 skill 只负责「触发 + 编排」；具体骨架与步骤的**唯一来源是该项目的 `scaffold/new-module.md`**，不在此重写，避免两处分叉。

## 1. 三工具下的生效方式

| 工具 | 生效 |
|---|---|
| **Claude Code** | 本 SKILL.md 自动触发（按 description 的短语/场景） |
| **Codex** | 经 `.codex-plugin/plugin.json` 的 `skills` 指针纳入；入口见 AGENTS.md |
| **Cursor** | 无 skill 机制 → 投影规则 `.cursor/rules/module-scaffold.mdc` + AGENTS.md，靠 AI 自觉走流程 |

## 2. 必收集参数（缺则先问用户，别擅自编）

| 参数 | 含义 | 例（Yoooni） |
|---|---|---|
| `<领域>` | 已有业务领域目录 | erp / crm / cust |
| `<模块>` | 新模块名（小写） | sample |
| `<E>` / `<e>` | 实体名（大驼峰 / 小写首字母） | Sample / sample |
| `<表名>` + 字段 | 数据库表与列 | ERP_SAMPLE + 字段集（没有就先问，或给最小集让用户确认） |

参数不全时，**先问清再生成**——尤其表字段、菜单挂在哪个父节点、授权给哪些角色。

## 3. 生成顺序

严格按该项目 `scaffold/new-module.md` 的清单与顺序（Yoooni 为 A→E）：
**A** 后端四层类（Action/Manage(I+impl)/Dao(I+impl)/Model）→ **B** iBatis sqlmap → **C** 接线（Spring 三个 xml + Struts xml，并确认被主配置 include）→ **D** 前端页面（列表 + 编辑，复用公共组件）→ **E** 菜单/权限 DDL。

占位符（`<领域>/<模块>/<E>/<e>/<表名>`）全局替换。基类/公共组件**只引用**，按 coding-mode.md 的红线。

## 4. 编码红线（与 encoding-guard 协同）

- `src` 下新建 `.java/.xml` **含中文**时按 **GBK** 落地：走 encoding-guard 的「建好 → `detect-encoding.ps1 convert -From utf-8 -To gbk` → 复核」回环；纯 ASCII 文件无所谓。
- `WebRoot` 下文件 **UTF-8**。
- 不批量转码、不动 `common`/`framework`/`WebRoot/public`。

## 5. 生成后必须输出「需人工确认」清单

至少列：(1) 表名与字段是否最终确认；(2) 菜单父节点 `MODELNAME` 取值与图标；(3) 授权哪些角色（`CRM_ROLERIGHT`）；(4) 新增的 spring/struts/sqlmap 是否已被主配置 include；(5) 生成的 GBK 文件已复核编码。

## 6. 红线

- **不动公共层**：`com/maxtile/common`、`com/maxtile/framework`、`WebRoot/public` 只调用/继承/引用，绝不改。
- **不脱离范本臆造**：分层、命名、接线一律照该项目 `coding-mode.md` / `scaffold/new-module.md`；范本之外的写法先与用户确认。
- 规则源唯一：以项目的两份 md 为准，本 skill 不重复定义骨架。
