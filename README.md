# project-coding-profiles

**项目级编码画像**插件——为单个项目承载专属编码约定，按项目触发 skill + hook。适配 **Claude Code / Codex / Cursor**。

> 与 `team-standards`（团队通用标准）、`yoooni-daily-plugin`（日常作业）分工：本插件只管**项目专属的编码约定**。

能力（按 `profile.json` 字段）：
- **编码守护（encoding）**——防止 AI 把存量 **GBK** 文件以 UTF-8 写坏（中文乱码）。首例 **Yoooni**（`src`=GBK / `WebRoot`=UTF-8）。
- **分层编码规范（codingMode）**——项目特有的分层/命名/框架约定 + `common`/`framework` 红线。Yoooni 见 [profiles/yoooni/coding-mode.md](profiles/yoooni/coding-mode.md)。
- **前端公共控件红线（frontendControls）**——禁止原生 `alert/confirm/prompt`，强制用公共控件（Yoooni：`layer.confirm`/`layer.msg`/`winAlert`）。PreToolUse hook `check-frontend-controls.js` 写 `WebRoot/**.{jsp,js}` 时拦截。
- **新增模块脚手架（scaffold）**——照最佳实践范本模块生成「新增模块/菜单」的纵向切片骨架。Yoooni 见 [profiles/yoooni/scaffold/new-module.md](profiles/yoooni/scaffold/new-module.md)（范本 `erp/allcost`）。

## 为什么需要

AI 编辑工具（Claude Code 的 Write/Edit、Codex、Cursor）默认以 **UTF-8（无 BOM）** 写盘。老项目大量源码是 GBK，一旦把含中文的内容写进 GBK 文件，磁盘字节变 UTF-8，被编译器/应用按 GBK 读时即乱码。这是 vibe coding 在这类项目里最常见的「改完中文全乱」根因。

> 纯 ASCII 内容无风险（UTF-8/GBK 字节一致）；守护只盯写入中文等非 ASCII 的情况。

## 三工具适配：一份规则，三种投递

| 工具 | 机械兜底（hook） | 规则指引 |
|---|---|---|
| **Claude Code** | `hooks/hooks.json` → `check-file-encoding.js`（PreToolUse 自动） | `skills/encoding-guard/SKILL.md` |
| **Codex** | `.codex-plugin/plugin.json` 引用同一份 hooks.json | `AGENTS.md` 入口 |
| **Cursor** | ❌ 无 PreToolUse hook；可选 **git pre-commit**（见下） | `AGENTS.md` / `.cursor/rules/encoding-guard.mdc` |

PreToolUse hook 是「能用时的写盘前加固」；Cursor 没有它，靠 skill / 规则的流程自洽守护。若要给 Cursor 补一道**确定性**防线，可装 git pre-commit 钩子——它由 git 执行、与编辑器无关，在**提交前**拦下乱码。

## Cursor 的确定性兜底：git pre-commit

git 钩子只能放在**目标项目**的 `.git/hooks/`（git 唯一会执行的位置，且不进版本库）。本仓库提供检查脚本 [pre-commit-encoding.js](hooks/pre-commit-encoding.js) + 安装器 [install-git-hooks.ps1](hooks/install-git-hooks.ps1)，把一段调用本脚本的 shim 种进去：

```powershell
# 在目标项目（如 Yoooni）上安装
powershell -ExecutionPolicy Bypass -File hooks\install-git-hooks.ps1 -ProjectRoot "D:\path\to\yoooni" -Mode block
```

之后该项目里**任何编辑器**（含 Cursor）`git commit` 都会按 profile 核对暂存内容编码，发现「期望 GBK 却写成 UTF-8」等不符即拦下。

- 与 PreToolUse 的区别：PreToolUse 在**写盘前**拦（文件从不被写坏）；pre-commit 在**提交前**拦（文件可能已落盘乱码，最后一道闸防止进入 git 历史）。
- 旁路：`PCP_ENCODING_HOOK=warn` 只提示不拦 / `=off` 关闭 / 单次 `git commit --no-verify`。

## 安装

### Claude Code

```
/plugin marketplace add https://gitee.com/wyoooni/project-coding-profiles.git
/plugin install project-coding-profiles@project-coding-profiles
/reload-plugins
```

### Codex

按 Codex 插件机制装入本仓库（读取 `.codex-plugin/plugin.json` + `AGENTS.md`）。

### Cursor

Cursor 无插件市场。两种接法：
- 把 `.cursor/rules/encoding-guard.mdc` 复制到**目标项目**的 `.cursor/rules/`；或
- 把 `AGENTS.md` 放到目标项目根（Cursor 会读）。
- 编码探测/转码脚本 `skills/encoding-guard/detect-encoding.ps1` 可直接在终端调用。

## 用法

改一个疑似 GBK 项目里的文件时：

```powershell
# 1) 探测编码
powershell -ExecutionPolicy Bypass -File skills/encoding-guard/detect-encoding.ps1 -Action detect -Path "src\Foo.java"

# 2) 若是 gbk 且要写中文：转 UTF-8 → 编辑 → 转回 GBK
powershell ... detect-encoding.ps1 -Action convert -Path "src\Foo.java" -From gbk -To utf-8
#    （用 AI 工具正常编辑）
powershell ... detect-encoding.ps1 -Action convert -Path "src\Foo.java" -From utf-8 -To gbk

# 3) 复核
powershell ... detect-encoding.ps1 -Action detect -Path "src\Foo.java"   # 应为 gbk
```

未触碰的行 GBK→UTF-8→GBK 往返字节不变，`git diff` 只剩真实改动。**切勿为统一而批量转码**（丢数据 + 污染 git）。

## hook 开关

| 环境变量 | 效果 |
|---|---|
| `PCP_ENCODING_HOOK=warn` | 默认。提示但不阻断（exit 0 + stderr） |
| `PCP_ENCODING_HOOK=block` | 硬阻断（exit 2），回灌提示给 AI |
| `PCP_ENCODING_HOOK=off` | 完全关闭 |

> **命中事件登记**：`check-file-encoding`（`rule: file-encoding`）/ `check-frontend-controls`（`rule: frontend-controls`）命中时，经 `hooks/event-log.js` best-effort 追加一行 `{ts,user,host,plugin,hook,rule,mode,tool,file}` 到 `~/.kai-toolbox/hook-events.jsonl`，供统计"规则命中频率 / 升不升 block"。**只写本地、绝不碰网络；登记失败不影响放行/拦截**。同步到 `\\IT01` 共享 + 周报统计在 `yoooni-daily-plugin`。详见 `docs/design/hook-event-logging.md`。

## 登记新项目

在 `profiles/<name>/profile.json` 加一份画像：

```jsonc
{
  "name": "<name>",
  "displayName": "<可读名>",
  "rootMarkers": ["该项目独有的相对路径文件，零侵入识别项目根"],
  "encoding": {
    "default": "gbk",
    "rules": [
      { "glob": "src/**", "encoding": "gbk" },
      { "glob": "WebRoot/**", "encoding": "utf-8" }
    ],
    "exceptions": [{ "path": "src/特例/X.java", "encoding": "utf-8" }],
    "notes": ["编码备注"]
  }
}
```

详见 [skills/encoding-guard/SKILL.md](skills/encoding-guard/SKILL.md)。

## 目录结构

```
project-coding-profiles/
├── .claude-plugin/{plugin.json, marketplace.json}
├── .codex-plugin/plugin.json
├── .cursor/rules/encoding-guard.mdc
├── hooks/{hooks.json, encoding-core.js, check-file-encoding.js, check-frontend-controls.js, event-log.js, pre-commit-encoding.js, install-git-hooks.ps1, package.json}
├── profiles/yoooni/{profile.json, coding-mode.md, scaffold/new-module.md}
├── skills/encoding-guard/{SKILL.md, detect-encoding.ps1}
├── docs/design/{encoding-guard-plugin.md, hook-event-logging.md}
├── AGENTS.md / CLAUDE.md / README.md
```
