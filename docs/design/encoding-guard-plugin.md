# 设计：project-coding-profiles 插件（编码守护首例）

> 轻量设计文档。范围：本插件第一个迭代——「编码守护核心 + Yoooni 首例」。

## 1. 背景与问题

- 团队部分老项目（首例 Yoooni：Spring+Struts2 的 Java Web）大量源码是 **GBK** 编码（`src` 为主），`WebRoot` 又以 **UTF-8** 为主，整体是混合编码。
- vibe coding 时，模型/编辑工具（含 Claude Code 的 Write/Edit）默认以 **UTF-8(无 BOM)** 写盘。一旦把含中文的内容写进存量 GBK 文件，磁盘字节就成了 UTF-8，被编译器/应用按 GBK 读时即**乱码**。
- 这属于**项目专属**的编码约定，不适合塞进 team-standards（团队通用标准）。需要一个「按项目触发」的承载体。

## 2. 定位（与既有插件的分工）

| 插件 | 定位 |
|---|---|
| `team-standards` | 团队**通用**编码/文档/流程标准（跨项目，不变） |
| `yoooni-daily-plugin` | Yoooni **日常作业**（入职/SMB/IDEA 导入/启动），与编码无关 |
| **`project-coding-profiles`（本插件）** | **项目级编码画像**：为单个项目声明专属编码约定，通过 skill+hook 在该项目内触发 |

## 3. 核心抽象：项目编码画像（profile）

- `profiles/<project>/profile.json`：声明该项目的 `encoding`（default + rules + exceptions）、`rootMarkers`（用于零侵入识别项目，无需改业务仓库），并预留 `codingMode` / `scaffold` 扩展点。
- 项目本地可放 `.coding-profile.json` 覆盖/`extends` bundled profile（可选）。
- 首例 `profiles/yoooni/`：`src/**`→gbk、`WebRoot/**`→utf-8、`**/*.properties`→gbk，default=gbk。

## 4. 机械兜底：check-file-encoding.js（PreToolUse Write/Edit/MultiEdit）

判定策略（压低误报）：

- **仅在已登记 profile 的项目内触发**（按 rootMarkers / `.coding-profile.json` 向上查找）；其它项目放行。
- **纯 ASCII 内容**：UTF-8 与 GBK 字节一致，零风险，放行。
- **存量文件**：以**磁盘实际编码**为准（探测字节，不靠 glob 猜）。实际是 GBK + 新增含非 ASCII → 命中（写 UTF-8 必乱码）。混合编码项目里少数 UTF-8 例外文件因此不会误报。
- **新建文件**：用 profile 规则得到期望编码；期望 GBK/遗留编码 + 含非 ASCII → 提示创建后转码。
- 默认 `warn`（exit 0 + stderr）；`PCP_ENCODING_HOOK=block` 升级硬阻断、`=off` 关闭。
- 编码探测：BOM 嗅探 + UTF-8 合法性扫描（非法 → 判 GBK；合法且有多字节 → UTF-8；纯 ASCII → ascii）。无第三方依赖，跨平台 Node。

## 5. 人读指引：skills/encoding-guard

- 说明 GBK/UTF-8 vibe coding 陷阱与 Yoooni 编码地图。
- 提供 `detect-encoding.ps1`：探测单文件编码 + 「转 UTF-8 → 编辑 → 转回 GBK」安全回环（未改的行原样还原，git diff 只剩真实改动）。
- 红线：不批量转码（丢数据 + 污染 git）。

## 6. 本次不做（预留扩展点）

- `codingMode`：项目整体编码模式（分层/命名/框架约定）。
- `scaffold`：基于项目规范生成接口代码框架（Action/Service/DAO 模板）。
- 两者在 profile schema 中以 `_reserved` 占位，后续迭代填充。
