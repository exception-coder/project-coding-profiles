# Yoooni 新增模块脚手架（scaffold）

> 用户说「新增一个模块 / 新增菜单 / 加个 XX 功能」时，按本 playbook 生成代码框架——**照最佳实践范本 `erp/allcost` 的纵向切片**，把占位符按新模块替换，再做接线 + 菜单。
> 分层规范见 [../coding-mode.md](../coding-mode.md)。红线：`common`/`framework`/`WebRoot/public` 只调用不改。

## 占位符

| 占位符 | 含义 | 例 |
|---|---|---|
| `<领域>` | 业务领域（已有目录） | `erp` |
| `<模块>` | 新模块名（小写） | `sample` |
| `<E>` | 实体名（首字母大写驼峰） | `Sample` |
| `<e>` | 实体名（首字母小写，Bean/路由名用） | `sample` |
| `<表名>` | 数据库表 | `ERP_SAMPLE` |

## 要生成的纵向切片（13 个骨架 + 接线 + 菜单）

### A. 后端类（`src/com/maxtile/application/<领域>/<模块>/`）

**1. action/`<E>Action`.java**
```java
package com.maxtile.application.<领域>.<模块>.action;
import com.maxtile.framework.action.BaseAction;     // 框架基类，只继承
public class <E>Action extends BaseAction {
    private I<E>Manage <e>Manage;                    // Spring 注入
    private <E> obj;
    private java.util.List<<E>> objList;
    public String listLeft() {           // 列表页
        // this.objList = <e>Manage.queryList(...);
        return "listLeft";
    }
    public String save() {               // 新增/编辑
        // <e>Manage.saveOrUpdate(obj);
        return "success";
    }
    // getter/setter: <e>Manage / obj / objList
}
```

**2. manage/`I<E>Manage`.java**
```java
package com.maxtile.application.<领域>.<模块>.manage;
import com.maxtile.framework.manage.IService;
public interface I<E>Manage extends IService<<E>> { /* 业务方法 */ }
```

**3. manage/impl/`<E>Manage`.java**
```java
package com.maxtile.application.<领域>.<模块>.manage.impl;
import com.maxtile.framework.manage.impl.ServiceImpl;
public class <E>Manage extends ServiceImpl<<E>Dao, <E>> implements I<E>Manage {
    // 继承自带 add/update/delete/get；复杂逻辑在此加，可注入其它 Manage/Dao
}
```

**4. dao/`I<E>Dao`.java**
```java
package com.maxtile.application.<领域>.<模块>.dao;
import com.maxtile.framework.dao.IBaseDao;
public interface I<E>Dao extends IBaseDao<<E>, Integer> { }
```

**5. dao/impl/`<E>Dao`.java**
```java
package com.maxtile.application.<领域>.<模块>.dao.impl;
import com.maxtile.framework.dao.impl.BaseDao;
public class <E>Dao extends BaseDao<<E>, Integer> implements I<E>Dao {
    // 自定义查询：super.getSqlMapClientTemplate().queryForList("<E>Select", param)
}
```

**6. model/`<E>`.java（PO）** — 字段与 `<表名>` 列一一对应 + getter/setter。
**7. model/vo/、model/param/** — 按需加 `<E>Vo` / `<E>Param`。

### B. iBatis SqlMap（`...model/maps/<E>.xml`）
```xml
<sqlMap namespace="<E>">
  <typeAlias alias="<e>" type="com.maxtile.application.<领域>.<模块>.model.<E>"/>
  <sql id="<E>Colum_Sql"> id, /* 字段 */ </sql>
  <insert id="<E>Insert" parameterClass="<e>"> insert into <表名>(...) values(...) </insert>
  <select id="<E>Select" resultClass="<e>"> select <include refid="<E>Colum_Sql"/> from <表名> ... </select>
  <select id="<E>GetBean" parameterClass="int" resultClass="<e>"> ... where id=#id# </select>
  <update id="<E>Update" parameterClass="<e>"> update <表名> set ... where id=#id# </update>
  <delete id="<E>DeleteByObj" parameterClass="<e>"> delete from <表名> where id=#id# </delete>
</sqlMap>
```

### C. 接线（按 coding-mode.md §3）
- `config/spring/<领域>/<模块>/applicationContext-action.xml` — 注册 `<e>Action`（`scope="prototype"`，注入 `<e>Manage`）
- 同目录 `applicationContext-business.xml` — 注册 `<e>Manage`（注入 `<e>Dao`）
- 同目录 `applicationContext-dao.xml` — 注册 `<e>Dao`（注入 `sqlMapClient`）
- `config/struts/struts-<模块>.xml` — `<package name="<模块>" extends="maxtileERP" namespace="/<模块>">` + `<action name="<e>_*" class="<e>Action" method="{1}">` + result→jsp
- 确认新 sqlmap、新 spring xml、新 struts xml 已被主配置 include（参照 allcost 的登记位置）

### D. 前端（`WebRoot/<领域>/<模块>/<e>/`）
- `listLeft.jsp`：include `/public/config.jsp` + 引 `common.js`/`pub.js` + easyui DataGrid 遍历 `objList` + 查询表单。
- `add.jsp`/`show.jsp`：表单 + `btnCommit(this)` 提交到 `<e>_save`。
- 复用 §4 公共组件，禁原生 alert/confirm/prompt。

### E. 菜单/权限（DB，按 coding-mode.md §5）
- 在 `数据库脚本/01系统权限与客户管理脚本.sql` 插 `CRM_RIGHT`（URL=`/<模块>/<e>_listLeft.action`，`NOTES='menu'`）+ 按角色插 `CRM_ROLERIGHT`。

## 生成步骤（AI 执行顺序）
1. 跟用户确认：`<领域>`、`<模块>`、`<E>`、`<表名>` 及表字段（没有就先问字段或给最小集）。
2. 按 A→B→C→D→E 顺序生成上述文件，占位符全局替换。
3. **编码**：`src` 下新建的 .java/.xml 含中文时按 GBK 写（走 encoding-guard 的转码回环），`WebRoot` 下 UTF-8。
4. 生成后列出「需人工确认」清单：表字段、菜单父节点 MODELNAME、角色授权、主配置 include 是否已挂上。
5. 不动 `common`/`framework`/`public`。

## 范本参考
原始最佳实践模块：`src/com/maxtile/application/erp/allcost/`（action/manage/dao/model/maps 齐全）+ `config/spring/erp/allcost/` + `config/struts/struts-allcost.xml` + `WebRoot/erp/allcost/`。需要更复杂示例（子表/报表/批量）时对照它。
