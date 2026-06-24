# Yoooni 公共能力包（编码前必读）

> **编码前先读本清单**：能用公共能力就别自撸、别用原生。`common`/`framework`/`WebRoot/public` 只复用不改（红线见 [coding-mode.md](coding-mode.md) §1）。
> 分层规范见 [coding-mode.md](coding-mode.md)；新增模块脚手架见 [scaffold/new-module.md](scaffold/new-module.md)。
> 本清单整理自源码扫描，类名/方法名以源码为准（`src` 为 GBK，注释乱码不影响 ASCII 标识符）。

## 一、后端公共能力

### 1. 框架基类（`com.maxtile.framework`，业务类继承即得）

| 基类 | 继承后白拿 |
|---|---|
| `action.BaseAction` | `getJsonToObject(Class)` 反序列化入参 / `setJsonObjectOK(body,msg)`·`setJsonObjectERROR(msg)` 标准返回 `{code,body,msg}` / `getUserId()` / `isRepeatSubmit()` / `billLock·billUnLock` 单据锁 / 分页拼装 |
| `manage.IService<T>` + `manage.impl.ServiceImpl<Dao,T>` | `save/saveBatch/saveOrUpdate/updateById/deleteById/deleteByIds` / `getById/getOne` / `list(obj)`·`list(obj,PageInfo)`·`listPageRePage(obj,PageInfo)` / `count` / `getDaoBean()` |
| `dao.IBaseDao<T,PK>` + `dao.impl.BaseDao<T,PK>` | `select(sqlId,obj)` 自定义 SQL / `get(pk)` / `insert/insertBatch` / `update/updateBatch` / `deleteByObj` / `sortList`（配 `@Sorter`） |
| `page.PageInfo` | 分页容器：`currentPage/pageSize/totalSize/totalPage`、`getBegin()` 算 OFFSET |

### 2. 工具类（`com.maxtile.common.utils`）

| 类 | 常用 | 用途 |
|---|---|---|
| `SecurityUtils` | `getUserId()`·`getRequest()`·`getSession()` | 当前用户/HTTP 对象、权限 |
| `TransactionUtil` | `start()`·`commit()`·`rollback()` | 编程式事务（复杂多步） |
| `RedisUtils` | `getJedis()`·`serialize/unserialize` | Redis 连接池 + 序列化 |
| `DateUtil` | `stringChange(Date)`·`getDatePoor()` | 日期格式化/时间差 |
| `JsonUtils` | `jsonGetString/jsonChangeInteger/...` | JSON 字段安全取值 |
| `StringUtil` | `isNil()`·`isChinaPhoneLegal()` | 空判/校验 |
| `MapUtil` | `copyObjectValue()`·`removeNullValue()` | 对象/Map 字段处理 |
| `SpringBeanUtil` | `getBean(name)`·`getSqlMapClient()` | 取 Spring Bean |
| `ExportExcel<T>` | `exportToFile()` | POI 导出 Excel |

> 还有 FileUtils / IPHelper / ImageUtils / MD5 / DES / AESTools / ListUtil 等，需要时先翻 utils 包再自撸。

### 3. 注解（`com.maxtile.common.annotation`，加注解即生效，由全局拦截器统一处理）

| 注解 | 效果 |
|---|---|
| `@RequestForJson` | 自动把 request JSON 解析为入参（替代手工 `getJson()`）；`onlyData=true` 只返回数据体 |
| `@RedisActionLock` | 分布式锁防重复提交（`targetName`/`tableId`/`expireTime`/`onlyThisUser`），**不用手写锁** |
| `@Sorter` | 列表排序（前端传 `sortFlag=1`） |
| `@UnAuthentication` | 免登白名单 |
| `@PubApi`/`@IPWhite`/`@TokenDecide`/`@SecretKeyDecide`/`@LimitIPRequest` | 开放 API 签名/IP 白名单/Token/密钥/限流 |

### 4. 常量与枚举（`common/constant`、`common/emun`）

- `Constant`：环境标志、路径、Redis 配置、单据状态常量（`EDIT(0)/SUBCHECK(1)/CHECKING(2)/CHECKFED(3)/DELETE(4)/COLSE(5)`）。
- `ConstantMsg`：标准提示语（`HANDLE_SUCCESS`/`AddTip`/`DelTip`/`ErrorTip`/`PARAMSERROR`…）。
- `emun` 包：`PayTypeEnum`/`PayStatusEnum`/`BankEnum` 等——**用枚举别写魔数**。

### 5. 缓存 / 推送 / 返回 / 异常

- 缓存：`RedisUtils`（业务缓存）。推送：`common.dwr.NotifyDWR#sendMessage(eventid,objectid)`。
- 统一返回：`BaseAction.setJsonObjectOK/ERROR/OnlyData`，格式 `{code,body,msg}`；分页 `getBodyPageList(key,json,PageInfo)`。
- 异常：直接 `throw new ERPException(msg)` 或 `new ERPException(httpCode,msg,data)`——**拦截器统一兜，不用 try-catch**。

### 6. 横切（自动生效，业务零处理）

`common.intercept.ActionAnnotationIntercept` 全局拦截：跨域→IP白名单→签名→Token→限流→`@RedisActionLock`→`@RequestForJson`→`@PubApi` 顺序处理。业务代码**不手动调**。

### 后端 Top 10 优先复用

`BaseAction` · `IService/ServiceImpl` · `@RequestForJson` · `@RedisActionLock` · `RedisUtils` · `SecurityUtils` · `TransactionUtil` · `PageInfo` · `ERPException` · `ActionAnnotationIntercept`。

### 新建 Action 编码前自检

1. 继承 `BaseAction`；2. 方法标 `@RequestForJson`(+`@RedisActionLock` 防重复)；3. 注入的 Service 继承 `ServiceImpl`；4. 异常抛 `ERPException` 不 try-catch；5. 分页用 `PageInfo` + `service.list(obj,pageInfo)`；6. 缓存 `RedisUtils`、当前用户 `SecurityUtils.getUserId()`；7. 多步事务 `TransactionUtil`。

## 二、前端公共能力（`WebRoot/public`，只引用不改）

| 能力 | 用公共控件 | 禁止 |
|---|---|---|
| 确认 | `layer.confirm(title,{btn:['确认','取消']},fn)`；列表场景 pub.js `mainConfirm/itemConfirm` | 原生 `confirm()` |
| 提示/告警 | `layer.msg` / `layer.alert` / common.js `winAlert` / select.js `tipWindow` | 原生 `alert()` |
| 输入弹框 | `layer.prompt` | 原生 `prompt()` |
| 打开页面弹层 | `layer.open` / select.js `openShowMsg(url,...)` | 简易 `window.open` |
| 表单提交 | pub.js `btnCommit(this)`（`forms=` `action=`） | 自撸提交 |
| 校验 | check.js | 自撸校验 |
| 日期 / 下拉 / 表格 / 图表 | jedate / select.js / easyui DataGrid / ECharts | 自撸 |
| 公共 js | `common.js`·`pub.js`·`check.js`·`core.js`（`/public/js/common/maxtile/`） | — |

> 前端「禁原生弹框」是红线，详见 [coding-mode.md](coding-mode.md) §4.1；Claude/Codex 由 hook `check-frontend-controls.js` 机械拦截，Cursor 靠规则自觉。
