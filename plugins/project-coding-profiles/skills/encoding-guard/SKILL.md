---
name: encoding-guard
description: 在「已登记编码画像的项目」里写代码/改文件时触发，防止把存量 GBK 文件以 UTF-8 写坏（中文乱码）。当你即将 Write/Edit 该项目下的源码/文本文件、或用户说"这个项目用 GBK 不是 UTF-8"、"改完中文乱码了"、"文件编码不对"、"vibe coding 把编码写坏了"时触发。识别项目靠 profiles/<project>/profile.json 的 rootMarkers（首例 Yoooni：src=GBK / WebRoot=UTF-8 混合编码）。给出探测编码、安全写入（转 UTF-8→编辑→转回 GBK 回环）、不批量转码的红线。
---

# 编码守护（项目级编码画像）

> 适用范围：**已在本插件登记 profile 的项目**（`profiles/<project>/profile.json`，靠 `rootMarkers` 零侵入识别）。其它项目不归本 skill 管。
>
> 与 team-standards 分工：team-standards 是团队**通用**标准；本 skill 是**项目专属**编码约定，按项目触发。

## 0. 为什么需要它（根因）

AI 编辑工具（Claude Code 的 Write/Edit、Codex、Cursor）默认以 **UTF-8（无 BOM）** 写盘。
但部分老项目（首例 **Yoooni**）大量源码是 **GBK** 编码。把含中文的内容写进存量 GBK 文件后，磁盘字节变成 UTF-8，被编译器/应用按 GBK 读时即**乱码**。

> 关键认知：**纯 ASCII（英文/数字/符号）内容写 UTF-8 还是 GBK，字节完全一致，没有风险。** 只有当写入**含中文等非 ASCII 字符**时才会坏。守护只盯这种情况。

## 1. 三种工具下的生效方式（重要前提：适配 Claude / Codex / Cursor）

| 工具 | 机械兜底（hook） | 规则指引（本 skill） |
|---|---|---|
| **Claude Code** | ✅ `hooks/hooks.json` 的 PreToolUse 自动跑 `check-file-encoding.js` | ✅ 读本 SKILL.md |
| **Codex** | ✅ `.codex-plugin/plugin.json` 引用同一份 `hooks.json` | ✅ 读 `AGENTS.md` 入口 |
| **Cursor** | ❌ 无等价 PreToolUse hook | ✅ 读 `AGENTS.md` / `.cursor/rules/encoding-guard.mdc` |

**因此本 skill 的指引必须自洽**：即使没有 hook（Cursor），你也要按下面的流程手动守护编码。hook 只是能用时的加固，不是唯一防线。

## 2. 动手前：先探测编码（一切的第一步）

改任何疑似 GBK 项目里的文件**之前**，先确认它的真实编码。用本目录的 `detect-encoding.ps1`：

```powershell
# 探测单个文件的编码（输出 gbk / utf-8 / utf-8-bom / ascii / utf-16le）
powershell -ExecutionPolicy Bypass -File detect-encoding.ps1 -Action detect -Path "src\com\xxx\FooService.java"
```

- 结果 `ascii` → 随便改（写 UTF-8/GBK 字节一致）。
- 结果 `utf-8` / `utf-8-bom` → 正常改（工具写 UTF-8 不破坏）。
- 结果 `gbk` → **走第 3 节的安全回环**，不要直接写中文进去。

## 3. 改 GBK 文件：优先 ASCII 锚点；要转码就**必须转回来**

> ⚠️ **头号事故**：把 GBK 文件 `iconv -f GBK -t UTF-8`（或编辑器"以 UTF-8 重新打开/保存"）转成 UTF-8 去编辑，然后**没转回 GBK**——文件就以错误编码留在磁盘/进了库。**"用户用 UTF-8 视图打开" ≠ "这文件该是 UTF-8"**；编码以本插件权威表为准，不以编辑器视图为准。

**首选：ASCII 锚点编辑，根本不转码。** GBK 文件里的 ASCII（Java 代码骨架、标签、英文）读出来是好的，乱的只有中文。所以：

- Edit 时让 `old_string` 落在**纯 ASCII 的代码行**上（方法签名、`<result name=...>`、英文标识符），中文只放进 `new_string`。
- 这样 `old_string` 不含乱码、匹配稳；`new_string` 的中文先写成 UTF-8，**之后必须把该文件转回 GBK**（见下）。
- 纯 ASCII 改动（不含中文）随便改，UTF-8/GBK 字节一致，零风险。

**必须匹配中文 old_string 时**，才走临时转码回环——但**转回来不是可选项**：

```powershell
# 1) 转成 UTF-8（此后 Read/Edit 看到的中文正确、old_string 可匹配）
powershell -ExecutionPolicy Bypass -File detect-encoding.ps1 -Action convert -Path "src\...\Foo.java" -From gbk -To utf-8
# 2) 用 Claude/Codex/Cursor 编辑
# 3) 【强制】转回 GBK——这一步漏了 = 把源码改坏。未触碰的行往返字节不变，git diff 只剩真实改动
powershell -ExecutionPolicy Bypass -File detect-encoding.ps1 -Action convert -Path "src\...\Foo.java" -From utf-8 -To gbk
# 4) 【强制】复核：detect 应回到 gbk
powershell -ExecutionPolicy Bypass -File detect-encoding.ps1 -Action detect -Path "src\...\Foo.java"
```

- **绝不允许停在第 2 步**（文件 UTF-8 态）就去做别的、结束会话、或提交。第 3 步是回环的一部分，不是收尾的可选动作。
- 不确定有没有漏转 / 改了一批文件，跑全项目体检兜底：`node hooks/encoding-doctor.js <项目根>`（`--fix` 复原可修复项；utf-8→gbk 遇不可表示字符会安全跳过不丢数据）。
- 机械兜底：写时 PreToolUse `check-file-encoding.js` 现已**接权威表**——既拦"往 GBK 写 UTF-8"，也拦"该文件权威=GBK 但磁盘已是 UTF-8（被外部转坏）"；提交时 `pre-commit-encoding.js` 按权威编码再卡一道。但**别依赖兜底**，转回来是你的责任。

## 4. 新建文件：按 profile 期望编码落地

新建文件时工具会写 UTF-8。若该路径按 profile 期望是 GBK（如 Yoooni 的 `src/**`），创建后转码：

```powershell
powershell -ExecutionPolicy Bypass -File detect-encoding.ps1 -Action convert -Path "src\...\NewFoo.java" -From utf-8 -To gbk
```

> 期望编码来自 `profiles/<project>/profile.json` 的 `encoding.rules`（按 glob 匹配）+ `default`。

## 5. 红线（务必遵守）

- **禁止把 GBK 文件转成 UTF-8 后不复原**（`iconv -f GBK -t UTF-8`、编辑器"以 UTF-8 重新打开/保存"都算）——这是把源码改坏的**头号事故**。要转就按 §3 转回来 + `detect` 复核；不确定就跑 `encoding-doctor`。**编辑器视图编码 ≠ 文件应有的编码**。
- **不要为了"统一编码"批量转换文件**：会丢数据（GBK 无法表示的字符）、并把 git diff 搞成全量变更，淹没真实改动。**改哪个文件，只保证哪个文件改完仍是它原本的编码。**
- 仓库整体统一编码是**团队决策**，不在 vibe coding 里顺手做。
- 逐文件权威编码真值 = 本插件 `profiles/<project>/encoding-map.json`（集中维护、可 PR 评审；由 `hooks/import-encoding-map.js` 从项目 `.idea/encodings.xml` 一次性导入，之后在本仓库维护、运行时不再依赖各人机器的 `.idea`）。hook 与 `encoding-doctor` 都以它为准；新增合法 UTF-8 例外要登记进它并重跑导入。

## 6. profile 怎么登记新项目

新项目要纳入守护，在本插件加一份 `profiles/<name>/profile.json`：

```jsonc
{
  "name": "<name>",
  "displayName": "<可读名>",
  "rootMarkers": ["独一无二的相对路径文件，用于零侵入识别项目根"],
  "encoding": {
    "default": "gbk",
    "rules": [
      { "glob": "src/**", "encoding": "gbk" },
      { "glob": "WebRoot/**", "encoding": "utf-8" }
    ],
    "exceptions": [{ "path": "src/特例/File.java", "encoding": "utf-8" }],
    "notes": ["项目编码备注"]
  }
}
```

- `rootMarkers`：选该项目**独有**的文件（如 Yoooni 用 `WebRoot/WEB-INF/web.xml` + `src/jdbc.properties`），hook 从被改文件向上找到同时满足这些标记的目录，即认定为项目根并启用该 profile。
- 也可在目标项目根放 `.coding-profile.json`（可 `"extends": "<name>"`）做本地覆盖。
- `encoding.authorityMap` 指向同目录逐文件权威表（如 `encoding-map.json`）；hook/doctor 取它做最长前缀匹配，优先级高于 `rules`。`rules` 只作未覆盖路径的兜底。
- `codingMode`（分层编码规范 + URL→模块定位）、`scaffold`（新增模块脚手架）已在 Yoooni 落地（见 `coding-mode.md` / `scaffold/new-module.md`），不再是预留。

## 7. 自检清单

- [ ] 优先用 **ASCII 锚点编辑**（old_string 落 ASCII 行、中文只进 new_string），尽量不转码？
- [ ] 若为匹配中文转了 UTF-8——**转回 GBK 了吗？**（§3 第 3 步,头号事故就是漏这步）并 `detect` 复核回到原编码？
- [ ] 没有用 `iconv` / 编辑器另存把 GBK 转成 UTF-8 后留着不复原？
- [ ] `git diff` 只剩真实改动、没顺手批量转码污染未涉及文件？
- [ ] 拿不准是否有文件被改坏 → 跑了 `node hooks/encoding-doctor.js <项目根>` 体检？
- [ ] Cursor 下（没有 hook）有没有靠本 skill 的流程手动守护？
