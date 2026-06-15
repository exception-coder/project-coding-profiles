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

## 3. 改 GBK 文件的安全写入：转 UTF-8 → 编辑 → 转回 GBK

直接 Edit 一个 GBK 文件有两个问题：① 读取时中文可能已经是乱码，old_string 难匹配；② 写回时变 UTF-8。安全做法是临时转码回环：

```powershell
# 1) 转成 UTF-8（此后 Read/Edit 看到的中文是正确的）
powershell -ExecutionPolicy Bypass -File detect-encoding.ps1 -Action convert -Path "src\...\Foo.java" -From gbk -To utf-8

# 2) 用 Claude/Codex/Cursor 正常编辑该文件（工具写 UTF-8，此时正确）

# 3) 改完转回 GBK（未改的行字节会原样还原）
powershell -ExecutionPolicy Bypass -File detect-encoding.ps1 -Action convert -Path "src\...\Foo.java" -From utf-8 -To gbk
```

- **为什么 git diff 干净**：未触碰的行 GBK→UTF-8→GBK 往返得到完全相同的 GBK 字节，只有你真正改动的行是新字节。所以这个回环**不会**把整文件标成改动。
- 改完务必 `-Action detect` 复核一次编码已回到 `gbk`，并 `git diff` 确认只剩真实改动。

## 4. 新建文件：按 profile 期望编码落地

新建文件时工具会写 UTF-8。若该路径按 profile 期望是 GBK（如 Yoooni 的 `src/**`），创建后转码：

```powershell
powershell -ExecutionPolicy Bypass -File detect-encoding.ps1 -Action convert -Path "src\...\NewFoo.java" -From utf-8 -To gbk
```

> 期望编码来自 `profiles/<project>/profile.json` 的 `encoding.rules`（按 glob 匹配）+ `default`。

## 5. 红线（务必遵守）

- **不要为了"统一编码"批量转换文件**：会丢数据（GBK 无法表示的字符）、并把 git diff 搞成全量变更，淹没真实改动。**改哪个文件，只保证哪个文件改完仍是它原本的编码。**
- 仓库整体统一编码是**团队决策**，不在 vibe coding 里顺手做。
- 存量逐文件编码真值以项目自己的 IDEA `.idea/encodings.xml` 为权威（Yoooni 由 `yoooni-daily-plugin` 的 `setup-idea-config.ps1` 生成）。

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
- `codingMode` / `scaffold` 为后续迭代预留（项目整体编码模式、接口脚手架），当前留空。

## 7. 自检清单

- [ ] 改文件前探测过编码了吗？（`-Action detect`）
- [ ] 改的是 GBK 文件且涉及中文吗？走转 UTF-8→编辑→转回 GBK 回环了吗？
- [ ] 改完复核编码回到原编码、`git diff` 只剩真实改动了吗？
- [ ] 没有顺手批量转码、没有污染未涉及的文件吗？
- [ ] Cursor 下（没有 hook）有没有靠本 skill 的流程手动守护？
