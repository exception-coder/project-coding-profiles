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

**范例**（easyui 隐藏列并刷新）——正确：`$('#dg').datagrid('hideColumn','col'); $('#dg').datagrid('reload');`；禁止：`$('#dg td[field=col]').hide(); $('.datagrid-body').css(...)`。

> 确需组件没有的能力：先查 [common-capabilities.md](common-capabilities.md) 是否已封装；仍没有则按 §1 红线走公共层维护（`WebRoot/public` 只引用不改），**不要在业务页用原生硬改**。
> 本条偏语义、形态多，不做机械 hook 拦截——由 coding-mode skill 与代码评审把关。

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
