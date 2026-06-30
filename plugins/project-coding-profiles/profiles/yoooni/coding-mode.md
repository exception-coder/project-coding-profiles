# Yoooni 分层编码规范（codingMode）

> 本项目特有的「怎么写代码」约定，供 AI 在改/写 Yoooni 代码时遵循。通用编码铁律在 team-standards，本文件只放 Yoooni 专属分层/命名/框架约定。
> 技术栈：Spring + Struts2 + DWR + iBatis(sqlmap)，JDK1.8 / Resin4。`src`=GBK / `WebRoot`=UTF-8（编码守护见 encoding-guard）。
> 来源：扫描既有最佳实践模块归纳（范本 `erp/allcost`）。
> **编码前必读**：[common-capabilities.md](common-capabilities.md)（公共能力包，前后端）——能复用就别自撸、别用原生。

## 1. 红线：公共层只调用不改

| 目录 | 性质 | 规则 |
|---|---|---|
| `src/com/maxtile/common` | 公共工具/常量/注解/VO/redis/dwr | **只 import 使用，不改**（改动影响全项目） |
| `src/com/maxtile/framework` | 框架基类（BaseAction/ServiceImpl/BaseDao） | **只继承使用，不改** |
| `WebRoot/public` | 前端公共组件/公共 js | **只引用，不改** |

新增模块的代码一律放进 `application/<领域>/<模块>` 自己的包，不往 common/framework 塞业务。

### 1.1 红线：跨业务模块不得直接复用对方「私有」组件/端点（要复用就下沉公共层）

§1 管纵向分层；本条管**横向的兄弟业务模块之间**。一个业务模块（如 `crm/lead`）需要另一个模块（如 `crm/customer`、`cust`）的能力时，**只能走两条合规路径**：① 后端注入对方 `Manage`（§2 已允许 Manage 横向依赖）；② 把要共享的前端件**下沉到真正的公共层**再各自引用。**禁止本模块的页面直接引用/硬编码另一个业务模块的私有资源**。

| 复用对象 | 正确做法 | 禁止（直接耦合） |
|---|---|---|
| 后端业务逻辑 | 注入对方 `Manage`，走接口调用 | 在本模块页面写死调对方的私有 action URL |
| 前端脚本/组件 | 真·通用件下沉到 `/public/js/common/**` 等公共目录，各模块引用公共件 | 本模块 jsp 直接 `src=`/`include` 兄弟模块的页面脚本（如 `/public/js/cust/customer/show.js`） |
| 取数端点（下拉/联动） | 本模块提供自己的端点，或调下沉到公共/baseinfo 的通用端点 | 下拉 `url=` 直接打兄弟模块 action 并写死对方魔数（如 `/cust/common_selectCommon.action?obj.modelid=57`） |
| 表单/页面结构 | 可参考其布局，但要独立成本模块自己的 jsp | 整段抄对方页面、并保留对它脚本/端点的运行期引用 |

**判据（写 `WebRoot/<本模块>/**` 时自检）**：页面里出现指向**另一个业务模块**的 `src=` / `<%@ include %>` / `xxx.action` 硬编码即判耦合。注意 `/public/js/<模块名>/**`（如 `/public/js/cust/...`）虽落在 `/public` 下，但属该模块的**页面私有脚本**，**不算通用件**；只有 `/public/js/common/**`、easyui、layui、jedate 等才是 §4 认可的公共件。

**为什么**：被引模块的私有 js / action / 魔数是它的内部实现，对方重构（改 `show.js`、改 action 入参、改 `modelid` 语义）时**不会知道你在用**，你的页面会静默坏掉；且模块职责边界被打穿，后续难维护、难拆分。

**真实反例**（提交 `2165e63b2`，`crm/lead` 工商查询/录入表单）：`WebRoot/crm/lead/enterpriseBase.jsp` 直接 `src="/public/js/cust/customer/show.js"` 引客户模块私有脚本；`add.jsp`/`show.jsp` 的下拉直接 `url:'/cust/common_selectCommon.action?obj.modelid=57'`、`url:'/cust/crg_selectDataType.action?dataType=3'`，并照抄「客户新增 custAdd」表单。结果 `crm/lead` 运行期硬依赖 `cust` 模块，客户模块一改即连带坏。**正确做法**：lead 复用客户的工商查询逻辑应在后端注入 `CustomerManage`，前端共享件下沉到 `/public/js/common/**`，下拉用 lead 自己的（或通用的）端点，而非直引 `/cust/*`。

> 本条由 PreToolUse hook `check-cross-module-coupling.js` 在写 `WebRoot/**` 前端文件时机械提醒（profile `crossModuleCoupling.enabled`，默认 warn）：扫到本模块页面 `src=`/`include`/`url=` 指向另一个业务模块的私有 js/jsp/action 即告警。判据为启发式（业务模块集 = `WebRoot` 顶层 ∪ `WebRoot/erp` 子目录），公认共享模块可加进 `crossModuleCoupling.sharedModules`；`PCP_CROSSMODULE_HOOK=block` 可升级硬阻断。仍以本节语义为准，hook 只兜底提醒。

## 2. 后端四层（一个模块的纵向切片）

包根：`com.maxtile.application.<领域>.<模块>`（领域如 erp/crm/cust）。`<E>` = 实体名（如 Ordercost）。

| 层 | 包 | 基类/接口 | 命名 | 职责 |
|---|---|---|---|---|
| Action | `.action` | `extends BaseAction` | `<E>Action` | 收请求、绑参、调 Manage、返回 JSP |
| Manage 接口 | `.manage` | `extends IService<<E>>` | `I<E>Manage` | 业务接口 |
| Manage 实现 | `.manage.impl` | `extends ServiceImpl<<E>Dao,<E>>` | `<E>Manage` | 业务逻辑、事务、可注入多 Dao/跨模块 Manage |
| Dao 接口 | `.dao` | `extends IBaseDao<<E>,Integer>` | `I<E>Dao` | 数据访问接口 |
| Dao 实现 | `.dao.impl` | `extends BaseDao<<E>,Integer>` | `<E>Dao` | 走 sqlMapClient 执行 sqlmap |
| Model | `.model` / `.model.vo` / `.model.param` | — | `<E>`(PO) / `<E>Vo` / `<E>Param` | PO=表映射，VO=展示，Param=查询入参 |
| SqlMap | `.model.maps` | — | `<E>.xml` | iBatis CRUD SQL |

依赖方向：Action → Manage → Dao → SqlMap，单向向下；Manage 之间可横向依赖（注入其它模块 Manage）。

## 3. 接线（三处配置 + sqlmap）

| 配置 | 文件 | 关键写法 |
|---|---|---|
| Action Bean | `config/spring/<领域>/<模块>/applicationContext-action.xml` | `<bean name="<e>Action" class="...action.<E>Action" scope="prototype"><property name="<e>Manage" ref="<e>Manage"/></bean>` |
| Manage Bean | 同目录 `applicationContext-business.xml` | `<bean name="<e>Manage" class="...manage.impl.<E>Manage"><property name="<e>Dao" ref="<e>Dao"/></bean>` |
| Dao Bean | 同目录 `applicationContext-dao.xml` | `<bean name="<e>Dao" class="...dao.impl.<E>Dao"><property name="sqlMapClient" ref="sqlMapClient"/></bean>` |
| Struts action | `config/struts/struts-<模块>.xml` | `<package name="<模块>" extends="maxtileERP" namespace="/<模块>"><action name="<e>_*" class="<e>Action" method="{1}"><result name="...">/erp/<领域>/<模块>/<e>/xxx.jsp</result></action></package>` |
| SqlMap | `...model/maps/<E>.xml` | `typeAlias` + `<E>Insert/Select/Update/DeleteByObj` + 公共字段 `<sql id="<E>Colum_Sql">` |

- Action Bean 必须 `scope="prototype"`（Struts2 多例）。
- 路由：`<e>_listLeft` → `/<模块>/<e>_listLeft.action`。

## 4. 前端结构

路径 `WebRoot/<领域>/<模块>/<e>/`：
- 列表/查询页 `listLeft.jsp`（查询条件 + easyui DataGrid + 批量操作）；编辑/详情 `show.jsp`/`add.jsp`；报表 `*Report.jsp`。
- jsp 管结构与表单，js 管事件/ajax/校验/DOM。
- **必引公共组件**（在 `WebRoot/public`，只引用不改）：

| 资源 | 路径 | 用途 |
|---|---|---|
| 公共配置 | `/public/config.jsp`（jsp include） | 环境/头 |
| 公共工具 js | `/public/js/common/maxtile/common.js`、`pub.js`、`check.js`、`core.js` | 工具/提交/校验 |
| easyui | `/public/jquery-easyui-1.5.5.4/` | DataGrid/ComboBox |
| layui | `/public/layui/` | 弹窗/分页 |
| 日期 | `/public/js/jedate/jedate.js` | 日期选择 |
| 图表 | `/public/ECharts/` | 报表 |

- 表单提交走 `pub.js` 的 `btnCommit(this)`（`forms=...` `action=...`）。

### 4.1 红线：公共能力必须用公共控件，禁用浏览器原生控件

最基本的前端要求。**禁止 `alert()` / `confirm()` / `prompt()` 原生控件**（样式不统一、阻塞 UI、无法定制），一律用公共封装：

| 能力 | 用公共控件 | 禁止 |
|---|---|---|
| 确认（删除/提交前确认） | `layer.confirm(title,{btn:['确认','取消']},fn)`；列表场景可用 pub.js `mainConfirm/itemConfirm` | `confirm(...)` |
| 提示/告警 | `layer.msg(...)` / `layer.alert(...)` / common.js `winAlert(msg)` / select.js `tipWindow(msg)` | `alert(...)` |
| 输入弹框 | `layer.prompt(...)` | `prompt(...)` |
| 打开页面弹层 | `layer.open(...)` / select.js `openShowMsg(url,...)` | `window.open` 简易窗 |
| 日期 / 下拉 / 表格 / 文件上传 | jedate / select.js / easyui DataGrid / 公共上传组件 | 自撸原生实现 |

**删除确认范例**（正确写法，参考 `WebRoot/erp/baseinfo/newcarrylog/loadLogisticsAttachments.jsp`）：
```js
function deleteImage(id){
  layer.confirm('确认删除该文件吗？', {btn:['确认','取消']}, function(index){
    $.ajax({ type:'POST', dataType:'json', url:ctx+'/binfo/attachment_delete.action',
      data:{'obj.id':id}, success:function(r){ layer.alert(r.msg,{icon:5}); /* ... */ } });
  });
}
```
反例（禁止）：`if (confirm('确认删除该文件吗？')) { ... }`。

> 本红线由 PreToolUse hook `check-frontend-controls.js` 在写 `WebRoot/**.{jsp,js}` 时机械拦截（profile `frontendControls.banNativeDialogs`）。

### 4.2 红线：调整表格/表单/各类控件，用组件自身能力，别直接动原生 JS/CSS

调整**已有组件**（easyui DataGrid / layui form·laypage / ComboBox / jedate 等）的外观或行为时，**一律走组件自身的 API 与配置项**；**禁止用原生 jQuery/JS 直接操作其 DOM、或覆盖其内部 CSS class 来"硬掰"**。

| 调整对象 | 用组件自身能力 | 禁止（原生硬改） |
|---|---|---|
| easyui DataGrid（列/宽度/隐藏/排序/冻结/刷新/工具栏） | `columns` 配置 + `$(dg).datagrid('reload'/'hideColumn'/'fixColumnSize'/'loadData'/...)` | 直接 `$('.datagrid-* / td').hide()/css()`、改 DataGrid 生成的 DOM、覆盖 `.datagrid-*` 样式 |
| layui 表单/分页/弹窗 | `form`/`laypage`/`layer` 的 API 与参数（改完字段调 `form.render()`） | 改 layui 生成的 DOM/样式、绕过 `form.render()` 直接塞 DOM |
| 下拉 / 联动（ComboBox / select.js） | 组件 options + `combobox('setValue'/'loadData')` / select.js 提供的方法 | 手拼 `<option>`、原生操作 `<select>` DOM |
| 日期（jedate） | jedate 初始化参数 / 其 API | 原生 input + 自撸日历/格式化 |
| 表单提交/校验 | `pub.js` `btnCommit(this)` + 组件校验规则 | 原生 `onsubmit` + 手写 DOM 取值 / 原生校验 |
| 布局/样式微调 | 组件配置项 / `WebRoot/public` 公共样式类 | 给组件元素加 inline style、为微调覆盖组件内部 class 的 CSS |

**为什么**：① 组件会重渲染/重排（reload、resize、翻页），你直接改的 DOM 与 inline 样式会被**覆盖失效**；② 升级组件版本时原生 hack **悄悄失效**、难排查；③ 绕过 API 易**破坏组件内部状态**（选中/分页/数据绑定错乱）；④ 与全站样式**不统一**。

前端页面控件较多、出现错位/不显示/宽度异常/滚动追加后错位等展示异常时，**先检查组件本身的配置缺失、列结构不一致、初始化顺序、重复渲染、父子容器冲突**，不要一上来用额外 JS/CSS 硬修。只有确认组件配置和数据结构都正确、且公共组件没有可用能力后，才考虑最小范围样式补丁。

**范例**（easyui 隐藏列并刷新）——正确：`$('#dg').datagrid('hideColumn','col'); $('#dg').datagrid('reload');`；禁止：`$('#dg td[field=col]').hide(); $('.datagrid-body').css(...)`。

> 确需组件没有的能力：先查 [common-capabilities.md](common-capabilities.md) 是否已封装；仍没有则按 §1 红线走公共层维护（`WebRoot/public` 只引用不改），**不要在业务页用原生硬改**。
> 本条偏语义、形态多，不做机械 hook 拦截——由 coding-mode skill 与代码评审把关。

### 4.3 红线：列表/看板字段变更必须同步核对导出链路

Yoooni 大量页面带 Excel 导出，**看板/列表展示和导出不一定走同一条实现路径**。改页面列、查询字段、日期口径、状态文案、金额计算等展示逻辑时，必须同步检查导出能力。

| 页面链路 | 常见实现 | 风险 |
|---|---|---|
| 看板/列表 | `Action/Manage` 查询 → `objList` → JSP 直接渲染 | 改了 JSP 或查询字段后，页面正确 |
| 导出 | 可能复用同一查询，也可能走单独导出 SQL / 单独查询方法 → `convert*EP()` 转 Excel 行模型 → `*EP.java` 字段 → `headers[]` 表头 → `ExportExcel` | 转换层、EP 模型、表头数组没同步，导出缺列或取值口径不一致 |

编码前自检：
1. 定位页面按钮/方法时同时搜：`export`、`ExportExcel`、`headers`、`convert`、`EP`、`download`、`excel`。
2. 不要默认导出复用列表 SQL；必须确认导出是同一查询、单独 SQL，还是同查询 + 转换层。
3. 新增/调整展示列时，同步检查并更新：查询字段、`convert*EP()`、`*EP.java`、`headers[]`、Excel 列顺序。
4. 页面有特殊展示口径（如版次日期、状态翻译、金额格式化、组合字段）时，导出转换层必须复用同一口径，禁止 JSP 和 Java 各算各的。
5. 若看板与导出确实有意不同，必须在代码附近或提交说明中写明差异原因，避免后续误判为漏改。

典型坑：页面新增「工艺师」列时，SQL 已查出 `checkname` 并进入 `objList`，但导出还会因为 `convertMainEP()` 未映射、`NewMdevelopMainEP` 无字段、`headers[]` 无表头而缺列；页面「需求单日期」按版次逻辑展示时，导出也必须在转换层同步同一逻辑。

## 5. 新增菜单/权限（DB 驱动）

菜单由 `application/sys` 的 `Right` 管，表 `CRM_RIGHT`（菜单项）+ `CRM_ROLERIGHT`（角色授权）。DDL 在 `数据库脚本/01系统权限与客户管理脚本.sql`。

新增一个菜单 = 在该脚本插一条 `CRM_RIGHT`（`CODE`/`NAME`/`URL=/<模块>/<e>_listLeft.action`/`MODELNAME`=父节点/`NOTES='menu'`/`ISNODE`/`LEVELS`/`ICON`/`STATUS=1`），再按角色插 `CRM_ROLERIGHT`。

## 6. 范本与脚手架

最佳实践范本模块 = `erp/allcost`。「新增一个模块」的完整文件清单 + 占位符骨架 + 生成步骤见 [scaffold/new-module.md](scaffold/new-module.md)。

## 7. URL ↔ 模块快速定位（拿到 URL 反查前后端代码）

线上 / 菜单 URL 形如 `/{namespace}/{action}_{method}.action?...`。

**第一步永远先查映射表，别现扫项目**：

```
grep "<action名 / \"/namespace\" / jsp名>" profiles/yoooni/url-route-map.md
```

一次拿到「后端类 + 前端 result→jsp」。该表由 `hooks/generate-url-route-map.js` 预解析 `config/struts/*.xml` + `config/spring/**/applicationContext-action.xml` 生成（40 namespace / 1000+ action），路由变更后重跑刷新。拿到类后：打开后端类读 `{method}()` 看 `return` 哪个 result 名 → 对应表里那条 jsp；业务往下 Action → `{action}Manage` → `{action}Dao`（见 §2 / §3）。

**解码规则**（表没命中或想手推时的兜底，Struts 是路由权威源）：

| URL 片段 | 映射到 | 定位 |
|---|---|---|
| `/{namespace}/` | Struts 包 | `config/struts/struts-{namespace}.xml` 的 `<package namespace="/{namespace}">` |
| `{action}_{method}` | `<action name="{action}_*" class="{bean}" method="{1}">` | method = 下划线后那段 |
| `{bean}` | Spring action bean → Java 类 | `config/spring/**/applicationContext-action.xml` 里 `<bean name="{bean}" class="FQN">`（class 不能靠 namespace 猜领域，必经 spring） |
| 方法 `return "X"` | `<result name="X">/erp/.../xxx.jsp</result>` | 前端 JSP |

**实例**：`/develop/newMdevelop_developWorkbenches.action`
→ `NewMdevelopAction`（`src/com/maxtile/application/erp/develop/action/NewMdevelopAction.java`）的 `developWorkbenches()`
→ result `developWorkbenches` → `/erp/search/develop/workbenches.jsp`（表直接给出，省去逐层猜——注意 jsp 在 `search/develop/` 而非 `newmdevelop/`）。

> 映射表是**实现级、随路由变**的派生索引，**存在本 profile（编码画像 = 代码结构导航），不进 domain-knowledge（业务认知）**。少量 action 的 bean 未登记在 action xml（表中标「未解析」）→ 按上面规则手 grep 兜底。重跑生成器即刷新。
