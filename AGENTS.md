<!--
本文件是 Codex / Cursor 的入口，与 CLAUDE.md 保持同步。
改触发规则请同时改 CLAUDE.md（以 CLAUDE.md 为准）。
-->
# project-coding-profiles（Codex / Cursor 入口）

> 每次在已登记编码画像的项目里改文件前，先读本文件。

## 这是什么

为**单个项目**承载专属编码约定的插件，按项目触发。与团队通用标准 `team-standards` 分工：通用规范在 team-standards，**项目专属编码约定在本插件**。当前能力：编码守护（首例 Yoooni，src=GBK / WebRoot=UTF-8 混合编码）。

## Skill 主动触发规范

**Skill 必须主动触发，不等用户显式调用。** 在以下场景第一时间识别并应用 `encoding-guard`：

| 场景 | 必须触发 |
|---|---|
| 即将 Write/Edit 一个**已登记编码画像项目**下的源码/文本文件 | `encoding-guard` |
| 用户说「这个项目用 GBK 不是 UTF-8」「改完中文乱码了」「文件编码不对」「vibe coding 把编码写坏了」 | `encoding-guard` |
| 要给新项目登记编码画像 | `encoding-guard`（§6 登记流程） |
| 用户说「新增一个模块/新增菜单/加个 XX 功能/搭个 CRUD/按最佳实践生成模块」（项目 profile 含 scaffold） | `module-scaffold` |

## 三工具适配（重要前提）

| 工具 | 机械兜底 | 规则指引 |
|---|---|---|
| Claude Code | `hooks/hooks.json` PreToolUse 自动跑 `check-file-encoding.js` | `skills/encoding-guard/SKILL.md` |
| **Codex** | `.codex-plugin/plugin.json` 引用同一份 hooks.json | 本文件 + SKILL.md |
| **Cursor** | ❌ 无 PreToolUse hook；可选 **git pre-commit**（见下） | 本文件 + `.cursor/rules/encoding-guard.mdc` |

> **Cursor 没有 PreToolUse hook，运行时完全靠你按规则自觉守护编码。** 即使没有 hook，也要按下面的流程手动做。
>
> 确定性兜底（强烈建议在重度用 Cursor 的项目装）：git pre-commit 钩子由 git 执行、与编辑器无关，在 `git commit` 前核对暂存区编码。在目标项目上跑一次安装器即可：
> ```
> powershell -ExecutionPolicy Bypass -File hooks\install-git-hooks.ps1 -ProjectRoot "D:\path\to\项目" -Mode block
> ```
> 之后乱码提交会被拦下；单次放行用 `git commit --no-verify`。

## 守护流程（核心）

1. **改文件前先探测编码**：
   ```
   powershell -ExecutionPolicy Bypass -File skills/encoding-guard/detect-encoding.ps1 -Action detect -Path "src\Foo.java"
   ```
   - `ascii` / `utf-8` / `utf-8-bom` → 正常改。
   - `gbk` 且涉及中文 → 走第 2 步安全回环。
2. **改 GBK 文件的安全回环**（转 UTF-8 → 编辑 → 转回 GBK）：
   ```
   ... -Action convert -Path "src\Foo.java" -From gbk -To utf-8   # 改前
   # 用 Codex / Cursor 正常编辑
   ... -Action convert -Path "src\Foo.java" -From utf-8 -To gbk   # 改后
   ... -Action detect  -Path "src\Foo.java"                       # 复核应为 gbk
   ```
   未触碰的行 GBK→UTF-8→GBK 往返字节不变，`git diff` 只剩真实改动。
3. **新建文件**若按 profile 期望是 GBK（如 `src/**`）→ 创建后 `convert -From utf-8 -To gbk`。

## 红线

- **禁止把 GBK 文件转成 UTF-8 后不复原**（`iconv -f GBK -t UTF-8` / 编辑器"以 UTF-8 另存"都算）——头号事故。编辑器视图编码 ≠ 文件应有编码;要转就按 SKILL §3 转回来 + detect 复核,不确定跑 `node hooks/encoding-doctor.js <项目根>`。优先 ASCII 锚点编辑(中文只进 new_string)少转码。
- **不要为统一而批量转码**（丢数据 + 污染 git diff）。改哪个文件只保证哪个文件改完仍是原编码。
- 整库统一编码是团队决策，不在日常编辑里顺手做。
- **前端公共能力必须用公共控件**：禁止原生 `alert()/confirm()/prompt()`，一律用公共封装（Yoooni：确认 `layer.confirm`、提示 `layer.msg`/`winAlert`、输入 `layer.prompt`）。Claude/Codex 有 PreToolUse hook（`check-frontend-controls.js`）拦，**Cursor 没有 hook，靠你自觉**——写 `WebRoot/**.{jsp,js}` 时务必检查。映射与范例见 `profiles/<project>/coding-mode.md §4.1`。

详见 [skills/encoding-guard/SKILL.md](skills/encoding-guard/SKILL.md)。
