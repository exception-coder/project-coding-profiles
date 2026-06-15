# CLAUDE.md

本文件指导 Claude Code 在本仓库工作。Codex / Cursor 入口见 [AGENTS.md](AGENTS.md)（与本文件保持同步）。

## 这是什么

`project-coding-profiles` 是一个 **Claude Code / Codex / Cursor 通用插件的源码仓库**——为**单个项目**承载专属编码约定，按项目触发 skill + hook。

定位区分（别混淆）：

| 仓库 | 定位 |
|---|---|
| `team-standards` | 团队**通用**编码/文档/流程标准（跨项目） |
| `yoooni-daily-plugin` | Yoooni **日常作业**（入职/SMB/IDEA/启动），与编码无关 |
| **本仓库 `project-coding-profiles`** | **项目级编码画像**：某项目用 GBK 还是 UTF-8、整体编码模式、接口脚手架，按项目触发 |

当前能力：**编码守护**（首例 Yoooni，src=GBK / WebRoot=UTF-8 混合编码）。`codingMode` / `scaffold` 为后续迭代预留。

## 三工具适配（核心前提）

本插件**必须在 Claude Code / Codex / Cursor 三者下都可用**，采用「一份规则，三种投递」：

| 工具 | 机械兜底（hook） | 规则指引 | 安装/生效方式 |
|---|---|---|---|
| **Claude Code** | `hooks/hooks.json` → `check-file-encoding.js`（PreToolUse 自动） | `skills/*/SKILL.md` | `/plugin install` |
| **Codex** | `.codex-plugin/plugin.json` 的 `hooks` 指针引用同一份 hooks.json | `AGENTS.md` 入口 | Codex 插件机制 |
| **Cursor** | ❌ 无等价 PreToolUse hook | `AGENTS.md` / `.cursor/rules/encoding-guard.mdc` | 把规则放进目标项目的 `.cursor/rules/`，或项目根放 `AGENTS.md` |

> 关键：hook 只是「能用时的加固」。Cursor 没有 hook，所以 **skill / 规则的指引必须自洽**，能在没有 hook 的前提下独立守护编码。改 skill 内容时务必保持这一点。

## 目录结构

```
project-coding-profiles/
├── .claude-plugin/{plugin.json, marketplace.json}   # Claude Code 清单
├── .codex-plugin/plugin.json                         # Codex 清单（skills/hooks 指针 + interface）
├── .cursor/rules/encoding-guard.mdc                  # Cursor 原生规则
├── hooks/
│   ├── hooks.json                                    # PreToolUse 注册（Claude + Codex 共用）
│   ├── check-file-encoding.js                        # 编码守护脚本（跨平台 Node，无依赖）
│   └── package.json
├── profiles/
│   └── yoooni/profile.json                           # 首例：Yoooni 编码画像
├── skills/
│   └── encoding-guard/{SKILL.md, detect-encoding.ps1}
├── docs/design/encoding-guard-plugin.md              # 设计文档
├── AGENTS.md                                          # Codex / Cursor 入口（与 CLAUDE.md 同步）
├── CLAUDE.md
└── README.md
```

## hook 行为（check-file-encoding.js）

- 触发：PreToolUse `Write|Edit|MultiEdit`，目标是文本扩展名。
- 仅在「已登记 profile 的项目内」生效（按 `profiles/*/profile.json` 的 `rootMarkers` 或项目本地 `.coding-profile.json` 向上查找）；其它项目放行。
- 纯 ASCII 内容直接放行（写 UTF-8/GBK 字节一致，零风险）。
- 存量文件：以**磁盘实际编码**为准（探测字节）。实际 GBK + 新增含非 ASCII → 提示（写 UTF-8 必乱码）。这样混合编码项目里的 UTF-8 例外文件不会误报。
- 新建文件：用 profile 规则推期望编码；期望 GBK/遗留编码 + 含非 ASCII → 提示创建后转码。
- 默认 `warn`（exit 0 + stderr）。`PCP_ENCODING_HOOK=block` 升级硬阻断（exit 2）、`=off` 关闭。

## 登记新项目

在 `profiles/<name>/profile.json` 加一份画像（schema 见 [skills/encoding-guard/SKILL.md](skills/encoding-guard/SKILL.md) §6）。`rootMarkers` 选该项目独有的相对路径文件用于零侵入识别；也可在目标项目根放 `.coding-profile.json`（可 `extends`）。

## 维护约定

- **版本号三处同步**：`.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`、`.codex-plugin/plugin.json`。
- **AGENTS.md 与 CLAUDE.md 同步**：CLAUDE.md 为准，AGENTS.md 是面向 Codex/Cursor 的派生入口；改触发规则两处都要改。
- **JSON 无 BOM**：PowerShell 5.1 写 JSON 用 `[System.IO.File]::WriteAllText($f,$t,(New-Object System.Text.UTF8Encoding($false)))`，否则 `/plugin marketplace add` 报 `Invalid JSON`。
- **.ps1 保持 ASCII-only**：避免 PS 5.1 无 BOM 读中文乱码（`detect-encoding.ps1` 即如此）。
- Node hook **无第三方依赖**，跨平台（`node >= 18`）。
- 提交：`feat/fix/docs(scope): 标题`，中文 body；仅在用户要求时提交。
