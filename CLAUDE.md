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

能力（profile.json 字段）：**encoding** 编码守护（首例 Yoooni，src=GBK / WebRoot=UTF-8）、**codingMode** 分层编码规范（`profiles/yoooni/coding-mode.md`，含 §7 URL→模块定位）、**frontendControls** 前端公共控件红线、**scaffold** 新增模块脚手架（范本 `erp/allcost`）、**URL 定位** 预生成 `url-route-map.md`（贴 URL 直达前后端代码，skill `url-locate`）。

## 三工具适配（核心前提）

本插件**必须在 Claude Code / Codex / Cursor 三者下都可用**，采用「一份规则，三种投递」：

| 工具 | 机械兜底（hook） | 规则指引 | 安装/生效方式 |
|---|---|---|---|
| **Claude Code** | `hooks/hooks.json` → `check-file-encoding.js` + `check-frontend-controls.js`（PreToolUse 自动） | `skills/*/SKILL.md` | `/plugin install` |
| **Codex** | `.codex-plugin/plugin.json` 的 `hooks` 指针引用同一份 hooks.json | `AGENTS.md` 入口 | Codex 插件机制 |
| **Cursor** | ❌ 无 PreToolUse hook；可选 **git pre-commit**（`install-git-hooks.ps1` 装入目标项目 `.git/hooks/`） | `AGENTS.md` / `.cursor/rules/encoding-guard.mdc` | 把规则放进目标项目的 `.cursor/rules/`，或项目根放 `AGENTS.md`；确定性兜底另跑安装器 |

> 关键：PreToolUse hook 只是「能用时的写盘前加固」。Cursor 没有它，所以 **skill / 规则的指引必须自洽**，能在没有 hook 的前提下独立守护编码——改 skill 内容时务必保持这一点。
>
> 两类 hook 别混淆：**PreToolUse hook** 在 Claude Code/Codex 内部、写盘前拦；**git pre-commit hook** 由 git 执行、与编辑器无关，在提交前拦，是给 Cursor 这类无 PreToolUse 工具补的确定性防线。git 钩子必须落在目标项目 `.git/hooks/`（不进版本库），故本仓库只提供脚本 + 安装器，由 `hooks/install-git-hooks.ps1` 种入目标项目。

## 目录结构

```
project-coding-profiles/
├── .claude-plugin/{plugin.json, marketplace.json}   # Claude Code 清单
├── .codex-plugin/plugin.json                         # Codex 清单（skills/hooks 指针 + interface）
├── .cursor/rules/encoding-guard.mdc                  # Cursor 原生规则
├── hooks/
│   ├── hooks.json                                    # PreToolUse 注册（Claude + Codex 共用）
│   ├── encoding-core.js                              # 可复用核心：profile 解析 + 编码探测（两钩子共用）
│   ├── check-file-encoding.js                        # PreToolUse 钩子：写盘前编码判定（Claude/Codex）
│   ├── check-frontend-controls.js                    # PreToolUse 钩子：拦原生 alert/confirm/prompt（前端红线）
│   ├── pre-commit-encoding.js                        # git 提交前钩子：核对暂存区编码（给 Cursor 等补确定性兜底）
│   ├── install-git-hooks.ps1                         # 把 pre-commit 钩子种入目标项目 .git/hooks/（ASCII-only）
│   ├── import-encoding-map.js                        # 从项目 .idea/encodings.xml 导入权威编码表
│   ├── generate-url-route-map.js                     # 解析 struts+spring 生成 URL→模块映射表
│   └── package.json
├── profiles/
│   └── yoooni/
│       ├── profile.json                              # 首例：Yoooni 编码画像（encoding/codingMode/frontendControls/scaffold）
│       ├── encoding-map.json                         # 逐文件权威编码表（authorityMap）
│       ├── coding-mode.md                            # 分层编码规范 + §7 URL→模块定位（codingMode）
│       ├── common-capabilities.md                    # 前后端公共能力清单（优先复用）
│       ├── url-route-map.md                          # URL→模块映射表（generate-url-route-map.js 生成）
│       └── scaffold/new-module.md                    # 新增模块脚手架 playbook（范本 erp/allcost）
├── skills/
│   ├── encoding-guard/{SKILL.md, detect-encoding.ps1}
│   ├── module-scaffold/SKILL.md                      # 新增模块脚手架（按范本生成纵向切片）
│   └── url-locate/SKILL.md                           # 贴 URL → 查 url-route-map → 直达前后端
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

## hook 行为（check-frontend-controls.js）

- 触发：PreToolUse `Write|Edit|MultiEdit`，目标是前端扩展名（`.jsp/.js/...`）且在 `WebRoot/` 下。
- 仅在「已登记 profile 且 `profile.frontendControls.banNativeDialogs=true`」的项目内生效；只查**本次新增内容**，不动存量历史。
- 命中原生 `alert()/confirm()/prompt()`（排除 `layer.confirm`、`winAlert`、`$.xxx` 等带前缀的）→ 提示改用公共控件（`profile.frontendControls.replacements`）。规则见 `coding-mode.md §4.1`。
- 默认 `warn`。`PCP_FRONTEND_HOOK=block` 硬阻断（exit 2）、`=off` 关闭。

## git pre-commit 钩子（pre-commit-encoding.js）

- 给 Cursor 这类**无 PreToolUse hook** 的工具补确定性兜底；由 git 执行，与编辑器无关。
- 判定：对暂存区 ACM 文本文件，探测**暂存内容实际编码**并与 profile 期望编码比对，编码族不符即报（典型：`src/**` 期望 GBK 却被写成 UTF-8 提交）。纯 ASCII 放行；仅在已登记 profile 的项目内生效。
- 安装：在目标项目上跑 `hooks/install-git-hooks.ps1 -ProjectRoot <项目> -Mode block`，它把调用本脚本的 sh shim（LF 行尾）写入目标项目 `.git/hooks/pre-commit`，已存在的非本插件钩子会备份为 `.pre-pcp.bak`。
- 默认 `block`（exit 2 拦提交）。`PCP_ENCODING_HOOK=warn` 只提示 / `=off` 关闭 / `git commit --no-verify` 单次跳过。

## 登记新项目

在 `profiles/<name>/profile.json` 加一份画像（schema 见 [skills/encoding-guard/SKILL.md](skills/encoding-guard/SKILL.md) §6）。`rootMarkers` 选该项目独有的相对路径文件用于零侵入识别；也可在目标项目根放 `.coding-profile.json`（可 `extends`）。

## 维护约定

- **版本号三处同步**：`.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`、`.codex-plugin/plugin.json`。
- **AGENTS.md 与 CLAUDE.md 同步**：CLAUDE.md 为准，AGENTS.md 是面向 Codex/Cursor 的派生入口；改触发规则两处都要改。
- **JSON 无 BOM**：PowerShell 5.1 写 JSON 用 `[System.IO.File]::WriteAllText($f,$t,(New-Object System.Text.UTF8Encoding($false)))`，否则 `/plugin marketplace add` 报 `Invalid JSON`。
- **.ps1 保持 ASCII-only**：避免 PS 5.1 无 BOM 读中文乱码（`detect-encoding.ps1` 即如此）。
- Node hook **无第三方依赖**，跨平台（`node >= 18`）。
- 提交：`feat/fix/docs(scope): 标题`，中文 body；仅在用户要求时提交。
