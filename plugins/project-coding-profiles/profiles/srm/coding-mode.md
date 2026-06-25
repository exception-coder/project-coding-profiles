# SRM 分层编码规范（codingMode）

> SRM 是基于**芋道(yudao)框架**的 Spring Cloud 微服务项目。编码前先认清框架,遵循其分层/命名/租户/权限约定,优先复用框架能力,**禁止绕过框架自造轮子**。
>
> 与 yoooni profile 的根本区别:① 全仓 **UTF-8**(无 GBK 编码风险);② 微服务 + 芋道框架(不是 Struts2 单体)。编码守护对本项目基本是 no-op。

## 0. 工程结构（Maven 多模块微服务）

```
srm/(后端)
├── scm-gateway          网关
├── scm-infra-service    基础设施服务(infra:文件/配置/任务/代码生成)
│   ├── scm-infra-api / scm-infra-biz
└── scm-srm-service      SRM 业务服务
    ├── scm-srm-api      对外 API(Feign 接口/DTO/枚举)
    └── scm-srm-biz      业务实现(controller/service/dal/convert)
        └── src/main/java/com/ruicheng/scm/srm/module/system/...

srm-admin-front-end/(前端) yudao-ui-admin · Vue2.7 + Element-UI
```

> 注意:SRM 业务代码挂在 `module/system` 下(芋道把业务塞进 system module),业务 Controller 在 `module/system/controller/admin/srm/`。

## 1. 红线：框架层只用不改

- `yudao-spring-boot-starter-*` / `framework` 包:**只用不改**。
- 多租户:DO 默认带 `tenant_id`,查询由框架自动注入租户条件,**勿手写租户过滤绕过**。
- 权限:`@PreAuthorize("@ss.hasPermission('xxx')")` + 权限标识,**勿自造鉴权**。
- 统一返回 `CommonResult<T>`、统一异常 `ServiceException` + 错误码(errorcode),**勿裸抛异常 / 裸返回对象**。
- 分页用 `PageResult<T>` / `PageParam`,**勿自造分页**。

## 2. 后端分层（一个业务对象的纵向切片）

芋道标准五层,以 `Supplier` 为例:

```
controller/admin/srm/SupplierController.java      @RestController, 返回 CommonResult
controller/admin/srm/vo/SupplierSaveReqVO.java    入参(Save/Page/Resp VO 分开)
                       SupplierRespVO.java
                       SupplierPageReqVO.java
service/.../SupplierService.java + SupplierServiceImpl.java   业务逻辑
dal/dataobject/SupplierDO.java     @TableName("srm_supplier"), 继承 BaseDO(含 tenant_id/创建审计)
dal/mysql/SupplierMapper.java      extends BaseMapperX<SupplierDO>
convert/SupplierConvert.java       MapStruct, DO <-> VO 互转
```

- 命名严格按 `<E>Controller / <E>Service / <E>ServiceImpl / <E>DO / <E>Mapper / <E>Convert`。
- DO 用 MyBatis-Plus 注解(`@TableName`/`@TableId`),Mapper 继承 `BaseMapperX`(芋道增强)。
- DO↔VO 一律走 MapStruct Convert,**勿手写 BeanUtils.copyProperties**。

## 3. 新增业务对象（推荐用 codegen）

<!-- APPEND-MARKER -->

- 优先用芋道**代码生成器(codegen,在 infra)** 生成 DO+Mapper+Service+Controller+VO 骨架,再填业务。
- 手写时按第 2 节五层逐一补齐,保持命名一致。
- 涉及审批的单据:接 **Flowable** 工作流,DO 带 `approval_status`(字典 `bpm_process_instance_result`:0已保存/1审批中/2通过/3不通过/4撤销),提交后由流程驱动状态。

## 4. 字典与状态（重要）

- 状态等枚举走**数据字典**,字典名形如 `srm_*_status`(如 `srm_send_status`/`srm_contract_status`)。
- DO 存**码值**(tinyint),前端用 `dict` 组件按字典翻译展示,**勿在代码里硬编码中文状态**。
- 各单据的状态机枚举见 domain-knowledge MCP(project=srm)对应 state 知识点,与 DDL 字典一致。

## 5. 前端结构（Vue2.7 + Element-UI）

```
srm-admin-front-end/src/
├── views/<业务域>/        provider(供应商) / purchasing(采购) / procurement(采购计划)
│                          / price(批价) / contract(合同) / quality(质量) / weighing(称重) ...
├── api/                   后端接口封装(按域)
├── components/            复用组件
└── store/ router/ utils/
```

- 复用 Element-UI 与框架已封装组件;**禁止自造与框架重复的弹窗/表格/分页封装**。
- API 统一放 `src/api/`,走框架 axios 封装(带 token/租户头)。
- 字典用框架 dict 组件;权限用框架指令控制按钮可见性。

## 6. 业务认知在哪查

编码前先查 **domain-knowledge MCP(project=srm)**:供应商生命周期、采购下单到收货流程、各单据状态机(采购订单/送货/退货/调拨/合同/试样/称重)、批价分品类、供应商评估。

```
search_knowledge(query="送货状态", project="srm")
get_knowledge(id="srm-delivery-send-state")
```

模块↔代码目录映射见 domain-knowledge 仓库 `knowledge/srm/impl/modules.json`。

## 7. 一句话决策

- 改后端 → 先认芋道分层(controller/service/dal/convert/vo),按命名补齐,复用框架(租户/权限/返回/分页/异常)。
- 改前端 → Vue2 选项式 + Element-UI,复用 `src/api` 与框架组件。
- 不懂业务 → 查 domain-knowledge(project=srm)。
- 编码无需担心 GBK——全仓 UTF-8。
