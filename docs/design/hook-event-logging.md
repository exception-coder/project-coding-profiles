# 设计：hook 命中事件本地登记（hook-event-logging）

与 `team-standards` 同一套机制（见该仓 `docs/design/hook-event-logging.md`）。本插件侧接入两道 warn hook：

- `check-file-encoding.js` → `rule: file-encoding`
- `check-frontend-controls.js` → `rule: frontend-controls`

命中时调用 `hooks/event-log.js` 的 `logHookEvent`，best-effort 追加一行
`{ts,user,host,plugin,hook,rule,mode,tool,file}` 到本地 `~/.kai-toolbox/hook-events.jsonl`。

## 红线

- **只写本地、绝不在 hook 热路径里碰网络**；全程 try/catch，**登记失败绝不影响放行/拦截判定**。
- 只用 node 内置 `fs/os/path`，不引第三方依赖。
- 本插件与 team-standards 各自带一份 `event-log.js`（独立安装、不能共享模块），但写**同一个** jsonl。

## 边界

同步到 `\\IT01\版本更新\vibecoding` + 周报统计在 `yoooni-daily-plugin`，本插件不感知公司内网基础设施。
