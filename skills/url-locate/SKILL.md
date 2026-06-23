---
name: url-locate
description: 在「已登记编码画像且有 url-route-map 的项目」里，用户给出 URL（*.action / localhost 链接 / 菜单 URL）或「URL+截图」要定位、分析、修改某页面对应的前后端模块代码时触发。先 grep 该项目 profile 的 url-route-map.md 直达后端 Action 类 + 前端 jsp，只读相关文件，避免全项目重扫。触发短语：贴一个 URL 让分析/定位模块、"这个页面/action 在哪"、"定位这个 URL 的代码"、"xxx.action 对应哪个类/jsp"、"这个菜单怎么实现的"、URL+截图分析逻辑。识别项目靠 profiles/<project>/profile.json 的 rootMarkers + codingMode.urlLocator。
---

# URL → 模块快速定位（先查表，别重扫项目）

用户给出 URL / `*.action` / 菜单链接（常配截图）要定位或分析对应模块时：**第一步永远是查预生成的映射表**，不要从头扫项目。

## 步骤

1. **解析 URL** 取关键 key：`/{namespace}/{action}_{method}.action` → 拿 `action` 名（下划线前段）、`namespace`、必要时 `method`（下划线后段）。
2. **grep 映射表**（项目 profile 下，单一来源）：
   ```
   grep "{action}" profiles/<project>/url-route-map.md
   ```
   （命中不到就 grep `"/{namespace}"` 或猜测的 jsp 名。）一次拿到：**后端类 FQN + src 文件路径 + 该 action 所有 result→jsp**。
3. **读后端类的 `{method}()`**：看它 `return` 哪个 result 名 → 对应表里那条 jsp，即本 URL 实际渲染的前端页面。
4. **按需向下追**：Action → `{action}Manage` → `{action}Dao` → sqlmap（分层见 coding-mode.md §2/§3），只读这条链上的文件来分析逻辑。

## 红线

- **先查表，不全扫**：`url-route-map.md` 由 `hooks/generate-url-route-map.js` 解析 struts+spring 预生成，是路由→代码的权威派生索引。别绕过它去逐个 grep 整个 `WebRoot` / `src`。
- **表没命中再手推**：少量 action 的 bean 未登记（表中标「未解析」），或表过期（近期改过路由）→ 按 coding-mode.md §7 的解码规则手 grep `config/struts/*.xml` + `config/spring/**/applicationContext-action.xml` 兜底；必要时提示重跑生成器刷新表。
- **改代码**仍走既有守护：编辑 jsp/js 受 `check-frontend-controls`（禁原生弹框）、编辑 src 受编码守护约束。

## 规则与数据来源

- 解码规则 + 实例：`profiles/<project>/coding-mode.md §7`。
- 映射表：`profiles/<project>/url-route-map.md`（重生成：`node hooks/generate-url-route-map.js <项目根> <project>`）。
- 首例 Yoooni（范本 URL `/develop/newMdevelop_developWorkbenches.action` → `NewMdevelopAction#developWorkbenches()` → `/erp/search/develop/workbenches.jsp`）。
