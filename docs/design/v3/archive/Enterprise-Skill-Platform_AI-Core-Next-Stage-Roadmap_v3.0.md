# Enterprise Skill Platform AI Core Next-Stage Roadmap v3.0

## 1. 本次路线调整的核心结论

当前最应该优先补的不是继续叠加更多 AI Core 能力，而是先把 `工具治理面` 补成正式系统能力。

原因很直接：

- 现在系统已经有运行时白名单和 `CapabilitySnapshot.visibleTools`
- 但还没有“工具本身可查看、可配置、可授权、可禁用”的正式门控平面
- `Skill.tools` 目前只是 `auth` 里的一个 JSON 字段，还不是正式可校验、可审计、可发布阻断的治理对象
- 一旦 Skill 引用了用户无权使用的工具，当前只能依赖运行时分散校验，缺少发布前阻断和统一拒绝语义

因此本阶段优先级应调整为：

1. 先补 `工具可见与可配置门控`
2. 再补 `Skill -> Tool 授权闭环`
3. 然后再继续推进上下文治理、错误恢复、路由和成本治理

---

## 2. 当前项目现状判断

### 2.1 已经有的基础

- `ai-orchestrator` 已有工具执行总入口：
  - `services/ai-orchestrator/src/modules/react-engine/tool-executor.ts`
- 已有能力快照：
  - `services/ai-orchestrator/src/modules/react-engine/capability-resolver.ts`
- 已有运行时拒绝：
  - `allowedToolNames`
  - `visibleTools`
  - `BaseTool.isAuthorized(userRoles)`
- `auth` 已有：
  - `Skill`
  - `SkillPermission`
  - `Capability Release`

### 2.2 当前真正缺的东西

#### 缺口 A：没有正式的工具目录与设置面

当前工具来源主要还是代码注册，而不是后台治理对象。

这意味着目前缺少：

- 工具列表查看入口
- 工具状态管理入口
- 工具风险级别设置
- 工具 exposure 策略设置
- 工具是否允许进入 prompt / runtime 的配置
- 工具是否允许被 Skill 绑定的配置

#### 缺口 B：`Skill.tools` 不是强约束

当前 `services/auth/prisma/schema.prisma` 中 `SkillConfig.tools` 只是一个 JSON 数组。

问题在于：

- 它没有和正式工具目录做外键级或等价约束
- 保存 Skill 时不会校验工具是否真实存在
- 发布 Skill 时不会阻断“引用了未授权工具”的情况
- 运行时也没有形成“当前 Skill 只允许调用这一组工具”的硬约束闭环

#### 缺口 C：运行时白名单不等于治理面

`CapabilitySnapshot.visibleTools` 目前是运行时推导结果，但它不是工具治理的正式来源。

问题在于：

- 它更像“当前 session 的裁剪结果”
- 不是管理员可以直接查看和设置的对象
- 不足以表达工具级状态、风险、环境限制、审批要求

#### 缺口 D：Skill 可能在链路内越权调用工具

当前虽然已有部分防御性校验，但仍缺少下面这条正式规则：

> 一旦进入某个 Skill 绑定执行上下文，该上下文内的工具集合必须是“当前用户有权执行的 Skill 所声明的工具集合”的子集。

这条规则目前没有被完整落实在：

- Skill 保存
- Skill 验证
- Skill 发布
- Prompt 暴露
- Runtime 执行
- Flow 内部工具步骤执行

---

## 3. 本阶段目标

本阶段只解决两个核心问题，并做到能上线：

### 3.1 目标一：工具需要可查看、可设置

要把“工具”从代码内部枚举，升级为后台可治理对象。

最低可用标准：

- 管理员能查看所有内置工具
- 管理员能设置工具状态
- 管理员能设置工具风险级别
- 管理员能设置工具是否允许被 Skill 使用
- 管理员能设置工具是否允许进入 prompt
- 管理员能设置工具是否默认允许 runtime 执行

### 3.2 目标二：Skill 调用未授权工具必须拒绝

拒绝必须形成完整闭环，而不是仅靠某一层兜底。

最低可用标准：

- Skill 保存时发现非法工具，给出错误
- Skill 验证时发现工具越界，给出明确问题列表
- Skill 发布时发现工具越界，直接阻断发布
- Skill 运行时若调用未授权工具，明确拒绝并返回标准错误码

---

## 4. 设计原则

### 4.1 工具是治理对象，不只是代码类

- 代码注册解决“系统里有什么工具”
- 工具目录解决“哪些工具当前被允许出现”
- 工具门控解决“哪些工具当前能被谁看到、谁能用、在哪能用”

### 4.2 Skill 不得扩大用户能力边界

- 用户是否能执行 Skill，由 `SkillPermission` 决定
- Skill 能调用哪些工具，由 `SkillToolBinding` 决定
- 本次执行真正可用哪些工具，由 `CapabilitySnapshot` 决定
- 最终运行时只允许取三者交集，而不是任意一层单独放行

### 4.3 发布阻断优先于运行时报错

优先顺序必须是：

1. 保存时发现问题
2. 验证时明确暴露问题
3. 发布时硬阻断
4. 运行时再做最后兜底拒绝

### 4.4 Prompt 暴露与 Runtime 执行必须分开治理

有些工具：

- 可以存在于系统中
- 但不应该暴露给模型
- 或只允许在人工确认后执行

因此必须区分：

- `prompt_exposure`
- `runtime_exposure`
- `requires_confirmation`
- `requires_approval`

---

## 5. 目标架构

推荐形成三层门控：

### 5.1 G1 工具目录门控

由 `auth` 维护正式工具目录。

决定：

- 工具是否存在于治理面
- 工具当前是否启用
- 工具是否允许被 Skill 绑定
- 工具是否允许进入 prompt
- 工具默认风险等级
- 工具默认审批策略

### 5.2 G2 Skill 工具绑定门控

由 `auth` 维护 `Skill -> Tool` 显式绑定关系。

决定：

- 某个 Skill 声明能使用哪些工具
- 某个 Skill 是否引用了未注册工具
- 某个 Skill 是否引用了已禁用工具
- 某个 Skill 的执行流是否越过了工具边界

### 5.3 G3 运行时快照门控

由 `ai-orchestrator` 在每次执行时生成最终快照。

决定：

- 当前用户在本次会话下看到哪些工具
- 当前已选 Skill 下最终允许执行哪些工具
- 哪些工具虽然可见但必须确认
- 哪些工具虽然存在但本轮绝对不能执行

---

## 6. 数据模型增补建议

### 6.1 新增 `ToolCatalog`

建议放在 `services/auth/prisma/schema.prisma`。

最小字段：

- `id`
- `name`
- `displayName`
- `description`
- `category`
- `runtimeType`
- `status`
  - `active`
  - `disabled`
  - `deprecated`
- `riskLevel`
  - `L0`
  - `L1`
  - `L2`
  - `L3`
- `allowSkillBinding`
- `promptExposure`
  - `hidden`
  - `prompt_only`
  - `runtime_only`
  - `prompt_and_runtime`
- `defaultRequiresConfirmation`
- `defaultRequiresApproval`
- `metadataJson`
- `createdAt`
- `updatedAt`

说明：

- 这张表不是替代代码注册，而是给已注册工具增加“治理属性”
- `name` 必须和 `ToolDefinition.name` 一致

### 6.2 新增 `SkillToolBinding`

建议也放在 `auth`。

最小字段：

- `id`
- `skillId`
- `toolName`
- `bindingSource`
  - `declared`
  - `inferred_from_flow`
  - `system_required`
- `createdAt`
- `updatedAt`

说明：

- 第一版可以不做复杂版本树，先绑定到 `SkillConfig`
- 第二版再升级为 `SkillVersion / Release` 级绑定

### 6.3 `SkillConfig` 保留 `tools`，但语义要变化

`SkillConfig.tools` 第一版继续保留，作用调整为：

- 作为编辑态输入字段
- 保存时写入 `SkillToolBinding`
- 不再作为运行时唯一可信来源

也就是说：

- 编辑态读写仍可沿用现有接口
- 正式运行与发布校验以后都以 `SkillToolBinding` 为准

---

## 7. 能力快照需要补的字段

当前 `CapabilitySnapshot` 已有 `visibleTools`，但不够。

建议最小增补：

- `selectedSkillId?: string`
- `skillScopedToolNames?: string[]`
- `deniedToolNames?: string[]`
- `toolPolicyHints`
  - `requireConfirmToolNames`
  - `requireApprovalToolNames`
  - `hiddenFromPromptToolNames`

运行时含义：

- `visibleTools` 表示本轮可暴露工具
- `skillScopedToolNames` 表示已进入 Skill 上下文后真正允许执行的工具
- 如果 `selectedSkillId` 存在，则 `executeTool()` 必须优先检查 `skillScopedToolNames`

---

## 8. 执行链路上的正式规则

### 8.1 保存 Skill 时

保存阶段必须做：

1. 工具名是否存在于 `ToolCatalog`
2. 工具是否 `status = active`
3. 工具是否 `allowSkillBinding = true`
4. `executionFlow` 中引用的工具是否都包含在 `tools`
5. `executionFlowTemplateIds` 推导出的工具是否都被声明

如果任一不满足：

- 保存可以失败
- 或保存成功但打上 `invalid_config`

第一版建议：

- 编辑保存允许草稿存在
- 但验证和发布必须阻断

### 8.2 验证 Skill 时

`SkillService.validateSkill()` 必须增加正式工具校验阶段：

- 校验 `Skill.tools`
- 校验 `executionFlow`
- 校验 `executionFlowTemplateIds`
- 产出 `missingTools`
- 产出 `disabledTools`
- 产出 `undeclaredFlowTools`
- 产出 `forbiddenSkillTools`

这部分不能只写 warning，必须形成结构化验证结果。

### 8.3 发布 Skill 时

`capability-release` 必须增加发布前阻断：

只要存在以下任一情况，发布直接失败：

- Skill 引用了不存在的工具
- Skill 引用了已禁用工具
- Skill 引用了不允许 Skill 绑定的工具
- Flow 模板里存在未声明工具
- 生成的发布快照里工具集合为空但执行流要求非空

### 8.4 生成运行时快照时

`CapabilityResolver` 需要从“只看当前代码工具 + 用户角色”改为“取交集”：

最终工具集合 = `ToolCatalog.active`
∩ `用户当前模式允许的工具`
∩ `用户可访问 Skill 所绑定的工具并集`
∩ `当前 request.config.tools` 可选限定

如果已经选中某个 Skill：

最终工具集合 = 上述结果
∩ `selectedSkillId` 对应绑定工具集合

### 8.5 执行工具时

`ToolExecutor.executeTool()` 检查顺序建议固定为：

1. 工具是否存在
2. 工具是否在 `ToolCatalog` 中处于 `active`
3. 工具是否在 `allowedToolNames`
4. 工具是否在 `visibleTools`
5. 如果当前已选 Skill，工具是否在 `skillScopedToolNames`
6. 工具自身角色要求是否满足
7. 是否需要确认 / 审批
8. 参数校验
9. 真实执行

新增标准错误码建议：

- `tool_disabled`
- `tool_not_registered_in_catalog`
- `tool_not_allowed_for_user`
- `tool_not_bound_to_skill`
- `tool_hidden_by_policy`
- `tool_requires_confirmation`
- `tool_requires_approval`

### 8.6 Flow 内部工具步骤时

这是最容易漏的地方，必须单独强调。

`flow_execute` 在执行模板步骤时，不能只校验“模板能不能跑”，还要校验：

- 模板中的工具步骤是否属于当前 Skill 绑定工具集合
- 若某步骤工具不在授权范围，整条 flow 必须立即中止
- 中止结果要记录具体步骤和工具名

---

## 9. 模块级落地方案

### 9.1 `auth` 服务负责什么

#### 新增内容

- `ToolCatalog` 元数据维护
- `SkillToolBinding` 维护
- Skill 验证时的工具闭环校验
- Capability Release 发布前工具闭环阻断

#### 建议新增 API

- `GET /tools/catalog`
- `GET /tools/catalog/:name`
- `PATCH /tools/catalog/:name`
- `GET /skills/:id/tool-bindings`
- `PUT /skills/:id/tool-bindings`
- `POST /skills/:id/validate-tools`
- `GET /capabilities/tool-snapshot`

#### 第一版可接受的实现方式

- 不需要先做复杂前端
- 先把 API、数据库、验证、发布阻断做出来
- 管理台可以先用简易页面或内部接口调试

### 9.1.1 最小可用工具管理页面

虽然本阶段不做“完整工具治理后台”，但建议明确提供一个最小可用管理页面，否则管理员只能直接调接口，实际落地成本仍然偏高。

第一版页面目标不是做复杂平台，而是满足下面 3 件事：

1. 看见系统里有哪些工具
2. 修改工具的门控状态
3. 排查为什么某个 Skill 或用户当前看不到某个工具

建议页面入口：

- `control-plane` 管理台新增 `工具管理 / Tool Catalog`
- 若当前管理台接入成本过高，第一版也可先挂在 `auth` 的内部管理页

建议页面拆成两个最小页面：

- `工具目录列表页`
- `工具详情/设置页`

#### 列表页最小能力

- 展示所有工具
- 支持按 `status` 筛选
- 支持按 `category` 筛选
- 支持按 `runtimeType` 筛选
- 支持按 `allowSkillBinding` 筛选
- 支持关键字搜索 `name / displayName`

建议列表字段：

- `name`
- `displayName`
- `category`
- `runtimeType`
- `status`
- `riskLevel`
- `allowSkillBinding`
- `promptExposure`
- `defaultRequiresConfirmation`
- `defaultRequiresApproval`
- `updatedAt`

建议列表操作：

- 进入详情
- 快速启用 / 禁用
- 快速切换是否允许 Skill 绑定

#### 详情页最小能力

建议分成 4 个区块：

1. 基础信息
2. 暴露与执行策略
3. 风险与审批策略
4. 影响面与调试信息

基础信息区：

- `name`
- `displayName`
- `description`
- `category`
- `runtimeType`

暴露与执行策略区：

- `status`
- `allowSkillBinding`
- `promptExposure`

风险与审批策略区：

- `riskLevel`
- `defaultRequiresConfirmation`
- `defaultRequiresApproval`
- `metadataJson`

影响面与调试信息区建议展示：

- 当前有多少个 Skill 绑定该工具
- 最近一次更新时间
- 最近一次修改人
- 当前是否出现在最新工具快照中

#### 第一版交互要求

- 修改配置后给出明确保存结果
- 若修改会影响已发布 Skill，页面要给出提示
- 禁用工具前，若存在绑定中的 Skill，页面要提示影响数量
- 不要求第一版就做复杂 diff 审计页，但至少要记录操作日志

#### 第一版不做的页面能力

- 不做复杂审批流页面
- 不做工具调用实时监控大盘
- 不做工具版本管理页面
- 不做多环境可视化差异对比

也就是说，本阶段“没有完整后台”不等于“没有页面”，而是只做一个可支撑管理员日常操作的最小管理页。

### 9.1.2 工具管理页面 PRD

本节把“最小可用工具管理页面”进一步写成页面需求说明，便于产品、前端、后端直接对齐。

#### 页面定位

页面名称建议为：

- `工具管理`
- 英文可对应 `Tool Catalog`

目标用户：

- 平台管理员
- 权限与发布链路维护人员
- 联调与排障人员

核心目标：

1. 查看系统中已注册工具
2. 修改工具治理策略
3. 判断某个工具为什么不能被 Skill 使用
4. 判断某个工具为什么没有出现在 prompt 或 runtime 中

#### 页面结构

第一版建议只做两个页面：

1. `工具目录列表页`
2. `工具详情页`

若需要更快落地，也可以做成：

- 左侧列表
- 右侧详情抽屉

但无论具体 UI 形态如何，能力范围应保持一致。

#### 页面一：工具目录列表页

页面目标：

- 让管理员快速总览当前全部工具
- 让管理员快速筛选风险工具、禁用工具、不可绑定工具
- 让管理员进入详情页做配置修改

页面区块建议：

1. 页面标题区
2. 筛选区
3. 工具列表区
4. 分页区

标题区建议展示：

- 页面标题：`工具管理`
- 副标题：`查看并配置 Tool Catalog 中的治理策略`

筛选区建议包含：

- 搜索框：按 `name / displayName` 搜索
- `status` 筛选
- `category` 筛选
- `runtimeType` 筛选
- `allowSkillBinding` 筛选
- `promptExposure` 筛选

列表字段建议包含：

- `name`
- `displayName`
- `category`
- `runtimeType`
- `status`
- `riskLevel`
- `allowSkillBinding`
- `promptExposure`
- `defaultRequiresConfirmation`
- `defaultRequiresApproval`
- `updatedAt`

列表交互建议包含：

- 点击行进入详情页
- 行内快速开关 `status`
- 行内快速开关 `allowSkillBinding`
- 支持刷新列表

列表状态要求：

- 首次加载中状态
- 无结果空状态
- 接口失败错误状态

#### 页面二：工具详情页

页面目标：

- 查看单个工具的全部治理属性
- 修改工具门控配置
- 识别该工具会影响哪些 Skill 和运行链路

页面区块建议：

1. 基础信息区
2. 策略配置区
3. 影响面区
4. 操作区

基础信息区字段：

- `name`
- `displayName`
- `description`
- `category`
- `runtimeType`
- `createdAt`
- `updatedAt`

策略配置区字段：

- `status`
- `riskLevel`
- `allowSkillBinding`
- `promptExposure`
- `defaultRequiresConfirmation`
- `defaultRequiresApproval`
- `metadataJson`

影响面区建议展示：

- 已绑定该工具的 Skill 数量
- 最近绑定该工具的 Skill 列表
- 当前工具是否出现在最新快照
- 若 `status = disabled`，提示“新快照将不再暴露该工具”
- 若 `allowSkillBinding = false`，提示“新 Skill 或新发布 Skill 不可继续绑定”

操作区建议包含：

- `保存`
- `取消`
- `启用 / 禁用`

详情页状态要求：

- 初始加载状态
- 保存中状态
- 保存成功提示
- 保存失败提示

#### 字段交互规则

第一版建议明确以下交互规则：

- `name` 不可编辑
- `status = disabled` 后，运行时快照不再暴露该工具
- `allowSkillBinding = false` 后，新绑定和新发布必须被阻断
- `promptExposure = runtime_only` 后，Prompt 中隐藏，但 Runtime 仍可在授权范围内使用
- `promptExposure = hidden` 后，Prompt 中不展示，Runtime 默认也不应直接暴露给模型

#### 提示与确认文案

为了降低误操作，页面建议增加最小确认提示。

当管理员禁用工具时：

- 提示该操作会影响新快照、Skill 发布与运行时执行

当管理员关闭 `allowSkillBinding` 时：

- 提示该操作不会立刻删除历史绑定
- 但会影响后续保存、验证和发布

当管理员调整 `promptExposure` 时：

- 提示该修改会影响模型可见工具集合

#### 对应 API

页面第一版只依赖以下接口：

- `GET /tools/catalog`
- `GET /tools/catalog/:name`
- `PATCH /tools/catalog/:name`

若影响面区要展示绑定 Skill 数量，可追加：

- `GET /skills/:id/tool-bindings`
- 或新增 `GET /tools/catalog/:name/usage`

第一版建议：

- 可以先返回绑定数量
- Skill 详情列表可放到第二版

#### 权限要求

页面必须限制为管理员可访问。

第一版最小权限要求：

- 普通用户不可见
- 管理员可查看
- 具备配置权限的管理员可编辑

若当前权限系统还未细拆，第一版可先统一收口到管理员角色。

#### 埋点与审计要求

页面第一版至少记录：

- 谁查看了工具详情
- 谁修改了工具配置
- 修改前后的关键字段差异
- 修改时间

最小审计字段建议：

- `operatorUserId`
- `toolName`
- `changedFields`
- `before`
- `after`
- `timestamp`

#### 验收标准

页面 PRD 完成后的第一版验收标准建议为：

- 管理员可以在页面看到全部工具
- 管理员可以通过筛选快速找到禁用或高风险工具
- 管理员可以修改工具核心治理字段
- 修改后能持久化到 `ToolCatalog`
- 修改后会影响后续快照、绑定校验和发布阻断
- 页面能对高影响修改给出明确提示

### 9.1.3 页面字段与 API 映射

为了让前端和后端接口尽快对齐，第一版建议明确页面展示字段和 API 字段映射关系。

#### 列表页字段映射

建议 `GET /tools/catalog` 返回每条记录至少包含：

- `name`
- `displayName`
- `description`
- `category`
- `runtimeType`
- `status`
- `riskLevel`
- `allowSkillBinding`
- `promptExposure`
- `defaultRequiresConfirmation`
- `defaultRequiresApproval`
- `updatedAt`

页面字段与接口字段关系建议如下：

| 页面字段        | API 字段                      | 用途               |
| --------------- | ----------------------------- | ------------------ |
| 工具名称        | `name`                        | 唯一标识，跳转详情 |
| 展示名称        | `displayName`                 | 列表主显示文案     |
| 类别            | `category`                    | 列表展示与筛选     |
| 运行类型        | `runtimeType`                 | 列表展示与筛选     |
| 状态            | `status`                      | 列表展示与快速启停 |
| 风险等级        | `riskLevel`                   | 风险识别           |
| 可绑定 Skill    | `allowSkillBinding`           | 列表展示与快速切换 |
| Prompt 暴露策略 | `promptExposure`              | 列表展示           |
| 需确认          | `defaultRequiresConfirmation` | 策略展示           |
| 需审批          | `defaultRequiresApproval`     | 策略展示           |
| 最后更新时间    | `updatedAt`                   | 排查变更           |

#### 详情页字段映射

建议 `GET /tools/catalog/:name` 返回：

```json
{
  "name": "document_render",
  "displayName": "Document Render",
  "description": "Render document from prepared parameters",
  "category": "document",
  "runtimeType": "document",
  "status": "active",
  "riskLevel": "L1",
  "allowSkillBinding": true,
  "promptExposure": "prompt_and_runtime",
  "defaultRequiresConfirmation": false,
  "defaultRequiresApproval": false,
  "metadataJson": {},
  "createdAt": "2026-04-30T10:00:00.000Z",
  "updatedAt": "2026-04-30T10:00:00.000Z",
  "usageSummary": {
    "boundSkillCount": 12,
    "visibleInLatestSnapshot": true
  }
}
```

其中：

- `usageSummary` 第一版不是绝对必需
- 但如果能提供，将显著降低页面侧拼装难度

#### 更新接口字段约束

建议 `PATCH /tools/catalog/:name` 请求体允许：

```json
{
  "displayName": "Document Render",
  "description": "Render document from prepared parameters",
  "status": "disabled",
  "riskLevel": "L2",
  "allowSkillBinding": false,
  "promptExposure": "runtime_only",
  "defaultRequiresConfirmation": true,
  "defaultRequiresApproval": false,
  "metadataJson": {
    "owner": "platform-team"
  }
}
```

约束建议：

- 未传字段保持原值
- `name` 不允许在更新接口修改
- 非法枚举值直接返回 `400`
- 若修改会影响存量 Skill，响应体建议附带 `impactSummary`

建议响应示例：

```json
{
  "success": true,
  "tool": {
    "name": "document_render",
    "status": "disabled",
    "allowSkillBinding": false,
    "promptExposure": "runtime_only",
    "updatedAt": "2026-04-30T10:05:00.000Z"
  },
  "impactSummary": {
    "boundSkillCount": 12,
    "message": "该工具已被 12 个 Skill 绑定，后续发布将受到影响"
  }
}
```

### 9.1.4 页面状态机建议

第一版虽然页面不复杂，但状态切换必须统一，否则很容易出现保存后视图不同步。

#### 列表页状态

建议列表页只保留以下状态：

- `idle`
- `loading`
- `loaded`
- `empty`
- `error`

状态流转建议：

1. 首次进入页面：`idle -> loading`
2. 请求成功且有数据：`loading -> loaded`
3. 请求成功但无数据：`loading -> empty`
4. 请求失败：`loading -> error`
5. 修改筛选项后：重新进入 `loading`

#### 详情页状态

建议详情页区分：

- 页面加载状态
- 表单脏状态
- 保存状态

建议最小状态集合：

- `loading`
- `ready`
- `dirty`
- `saving`
- `save_success`
- `save_error`

行为建议：

- 任一字段变化后从 `ready` 进入 `dirty`
- 点击保存后进入 `saving`
- 保存成功回到 `ready`
- 保存失败进入 `save_error`，同时保留表单值

#### 危险操作确认

以下操作建议二次确认：

- 将 `status` 从 `active` 改为 `disabled`
- 将 `allowSkillBinding` 从 `true` 改为 `false`
- 将 `promptExposure` 改为 `hidden`

确认框至少展示：

- 变更字段
- 变更前值
- 变更后值
- 影响提示

### 9.1.5 前端实现建议

本节不强制具体技术栈，只定义实现约束。

建议前端第一版遵循：

- 列表页和详情页使用同一份类型定义
- 所有枚举字段在前端做显式字典映射
- 保存前做基础表单校验
- 保存后以接口返回值回填视图，而不是本地盲更新

枚举字典至少包含：

- `status`
- `riskLevel`
- `promptExposure`
- `runtimeType`

建议前端避免：

- 在页面里硬编码工具业务规则
- 根据字符串模糊判断接口错误
- 将影响提示完全写死在前端

更推荐：

- 由后端返回稳定枚举和值
- 由后端返回结构化 `impactSummary`
- 前端只负责展示

### 9.1.6 前端任务拆分建议

为了方便直接进入排期，本节给出可拆工单的页面开发任务。

#### 页面开发任务

- `UI-TOOL-01` 新增工具目录列表页
- `UI-TOOL-02` 新增工具详情页
- `UI-TOOL-03` 对接 `GET /tools/catalog`
- `UI-TOOL-04` 对接 `GET /tools/catalog/:name`
- `UI-TOOL-05` 对接 `PATCH /tools/catalog/:name`
- `UI-TOOL-06` 新增危险变更确认弹窗
- `UI-TOOL-07` 新增列表筛选与搜索
- `UI-TOOL-08` 新增页面权限拦截

#### 类型与状态管理任务

- `UI-TOOL-09` 新增 `ToolCatalogItem` 前端类型
- `UI-TOOL-10` 新增 `ToolCatalogDetail` 前端类型
- `UI-TOOL-11` 新增页面状态机与保存态管理
- `UI-TOOL-12` 新增枚举字段字典映射

#### 测试任务

- `UI-TEST-01` 列表页加载、空态、错误态测试
- `UI-TEST-02` 详情页保存成功与失败测试
- `UI-TEST-03` 高影响变更确认弹窗测试
- `UI-TEST-04` 管理员权限拦截测试

#### 联调任务

- `UI-INT-01` 联调工具目录筛选参数
- `UI-INT-02` 联调详情页字段回填
- `UI-INT-03` 联调更新接口错误提示与影响摘要
- `UI-INT-04` 联调高影响变更后的快照生效链路

### 9.2 `ai-orchestrator` 负责什么

#### 需要改造

- `CapabilityResolver`
- `ToolExecutor`
- `prompt-builder`
- `flow-execute.tool.ts`
- `react-engine.service.ts`
- `interfaces.ts`

#### 目标

- 从 `auth` 拉取正式工具快照
- 让 prompt 只暴露本轮真正允许的工具
- 进入 Skill 上下文后进一步缩窄到 `skillScopedToolNames`
- 运行时统一返回标准拒绝结果

### 9.3 `control-plane` 当前阶段先不做重心

本阶段不要求把“工具审批中心”完整做在 `control-plane`。

当前阶段只需要：

- 在 `CapabilitySnapshot.policies` 中表达审批与确认提示
- 运行时先能拒绝或要求确认

后续再把真正审批流迁入 `control-plane`

---

## 10. 分阶段实施计划

### 10.1 P0-A 工具目录与门控最小版

#### 目标

把工具变成后台可治理对象，并提供最小可用管理页面。

#### 工作项

1. `auth` 新增 `ToolCatalog` 表
2. 增加工具目录初始化同步逻辑
3. 把 `ai-orchestrator` 当前内置工具注册为目录记录
4. 增加工具查询与更新 API
5. 增加最小可用工具管理页面
6. 让管理员可设置：
   - `status`
   - `riskLevel`
   - `allowSkillBinding`
   - `promptExposure`
   - `defaultRequiresConfirmation`
   - `defaultRequiresApproval`

#### 代码落点

- `services/auth/prisma/schema.prisma`
- `services/auth/src/modules/skill`
- 新增 `services/auth/src/modules/tool-catalog`
- `services/control-plane` 或内部管理台页面

#### 验收标准

- 可以通过 API 查看全部内置工具
- 可以通过页面查看全部内置工具
- 可以禁用某个工具
- 可以设置某个工具不允许被 Skill 绑定
- 禁用后新快照不再暴露该工具

### 10.2 P0-B Skill 工具绑定闭环

#### 目标

让 `Skill.tools` 从“描述字段”升级为“正式约束”。

#### 工作项

1. 新增 `SkillToolBinding`
2. 保存 Skill 时同步绑定
3. 校验 `executionFlow` 引用工具
4. 校验 `executionFlowTemplateIds` 推导工具
5. 将工具校验结果接入 `validateSkill()`
6. 将工具校验结果接入发布阻断

#### 代码落点

- `services/auth/src/modules/skill/skill.service.ts`
- `services/auth/src/modules/skill/interfaces.ts`
- `services/auth/src/modules/capability-release/capability-release.service.ts`

#### 验收标准

- Skill 声明未注册工具时，验证结果明确报错
- Flow 模板引用未声明工具时，发布被阻断
- 已禁用工具无法出现在新发布版本中

### 10.3 P0-C 运行时 Skill 作用域硬拒绝

#### 目标

进入 Skill 上下文后，只允许执行该 Skill 绑定工具。

#### 工作项

1. `CapabilitySnapshot` 增加 `selectedSkillId` 和 `skillScopedToolNames`
2. `CapabilityResolver` 增加基于 Skill 的工具收窄逻辑
3. `ToolExecutor.executeTool()` 增加 `tool_not_bound_to_skill` 校验
4. `flow_execute` 内部步骤执行前也做同样校验
5. 统一错误码和用户提示文案

#### 代码落点

- `services/ai-orchestrator/src/modules/react-engine/interfaces.ts`
- `services/ai-orchestrator/src/modules/react-engine/capability-resolver.ts`
- `services/ai-orchestrator/src/modules/react-engine/tool-executor.ts`
- `services/ai-orchestrator/src/modules/react-engine/tools/flow-execute.tool.ts`

#### 验收标准

- 用户执行有权限 Skill 时，只能使用该 Skill 绑定工具
- 模型若尝试调用额外工具，运行时明确拒绝
- Flow 内部越界工具步骤会立刻中止

### 10.4 P0-D Prompt 暴露收口

#### 目标

不要把模型不该看到的工具继续写进 prompt。

#### 工作项

1. `prompt-builder` 只暴露当前快照可见工具
2. 选中 Skill 后，只暴露 `skillScopedToolNames`
3. 对隐藏工具和审批工具加 section 说明

#### 验收标准

- Prompt 中的工具列表与 runtime 允许集合一致
- 不允许的工具不会出现在模型可见列表里

---

## 11. 本阶段后再继续的 AI Core 项

工具治理闭环完成后，再继续以下能力：

### 11.1 P1 上下文治理闭环

- 工具输出预裁剪
- 滚动摘要
- Prompt 摘要注入

### 11.2 P1 错误分层与恢复策略统一

- 用 `ToolResult.code` 驱动恢复
- 替换文本模糊判断

### 11.3 P2 模型路由与回退链

- 引入 `model-router.service.ts`
- provider fallback

### 11.4 P2 Prompt 工程升级

- section 化
- 输入过滤

### 11.5 P3 成本与辅助模型治理

- token / cost 记录
- 辅助 LLM 分层

---

## 12. 建议实施顺序

### 第 1 周

- 完成 `ToolCatalog` 数据模型
- 完成工具目录同步与查询 API
- 完成工具状态和绑定能力设置 API

### 第 2 周

- 完成 `SkillToolBinding`
- 完成 Skill 保存/验证工具校验
- 完成 Capability Release 发布阻断

### 第 3 周

- 完成 `CapabilitySnapshot` 字段扩展
- 完成 `CapabilityResolver` 的 Skill 级收窄
- 完成 `ToolExecutor` 统一拒绝码

### 第 4 周

- 完成 `flow_execute` 内部步骤越权校验
- 完成 prompt 工具暴露收口
- 完成 E2E 和回归测试

### 第 5 周

- 再进入上下文治理和错误恢复统一

---

## 13. 测试与验收计划

### 13.1 单元测试

至少新增：

- `ToolCatalog` 状态切换测试
- `SkillToolBinding` 校验测试
- `ToolExecutor` 的 `tool_not_bound_to_skill` 测试
- `flow_execute` 的越界工具拒绝测试

### 13.2 集成测试

至少覆盖：

1. 用户有 Skill 权限且 Skill 工具合法，可以成功执行
2. 用户有 Skill 权限但 Skill 引用了禁用工具，发布失败
3. 用户通过 prompt 诱导模型调用未绑定工具，运行时拒绝
4. Flow 模板内部包含越界工具，执行中止

### 13.3 验收口径

本阶段完成的标志不是“代码里多了几层 if”，而是：

- 工具有正式目录
- 工具有正式设置面
- Skill 有正式工具绑定
- 发布前能阻断工具越权
- 运行时能拒绝 Skill 越权工具调用
- Prompt 与 Runtime 的工具集合一致

---

## 14. 非目标

本阶段不做：

- 完整的可视化工具治理后台
- 复杂多级审批工作流
- 工具版本化市场
- 动态 AST 自发现工具注册
- MCP 工具目录统一接管

这些能力可以在本阶段稳定后继续推进。

---

## 15. 一句话总结

本阶段的重点不是“让 Agent 多会几个工具”，而是先把下面这件事做实：

> 工具必须先成为正式治理对象，Skill 必须只能调用被声明、被授权、被当前用户允许的工具；任何越界调用，都要在保存、验证、发布、运行四个阶段中至少一个阶段被明确阻断。

---

## 16. 数据库变更清单

本节用于指导 `auth` 服务的 Prisma 变更与迁移拆分。

### 16.1 新增表：`tool_catalogs`

建议结构：

- `id`
  - `uuid`
  - 主键
- `name`
  - `varchar(100)`
  - 唯一
  - 对应 `ToolDefinition.name`
- `display_name`
  - `varchar(100)`
- `description`
  - `varchar(500)`
- `category`
  - `varchar(50)`
- `runtime_type`
  - `varchar(50)`
  - 例如 `document / flow / browser / api / utility`
- `status`
  - `varchar(20)`
  - `active / disabled / deprecated`
- `risk_level`
  - `varchar(10)`
  - `L0 / L1 / L2 / L3`
- `allow_skill_binding`
  - `boolean`
  - 默认 `true`
- `prompt_exposure`
  - `varchar(30)`
  - `hidden / prompt_only / runtime_only / prompt_and_runtime`
- `default_requires_confirmation`
  - `boolean`
  - 默认 `false`
- `default_requires_approval`
  - `boolean`
  - 默认 `false`
- `metadata_json`
  - `jsonb`
  - 默认 `{}`
- `created_at`
  - `timestamptz`
- `updated_at`
  - `timestamptz`

建议索引：

- 唯一索引：`(name)`
- 普通索引：`(status)`
- 普通索引：`(category, status)`
- 普通索引：`(runtime_type, status)`

### 16.2 新增表：`skill_tool_bindings`

建议结构：

- `id`
  - `uuid`
  - 主键
- `skill_id`
  - `uuid`
  - 外键到 `skill_configs.id`
- `tool_name`
  - `varchar(100)`
  - 第一版可不强制外键到 `tool_catalogs.name`
  - 但保存逻辑必须做等价校验
- `binding_source`
  - `varchar(30)`
  - `declared / inferred_from_flow / system_required`
- `created_at`
  - `timestamptz`
- `updated_at`
  - `timestamptz`

建议索引：

- 唯一索引：`(skill_id, tool_name)`
- 普通索引：`(tool_name)`

### 16.3 现有表增补建议

#### `skill_configs`

建议保留现有字段：

- `tools`
- `execution_flow`
- `execution_flow_template_ids`

第一版不删这些字段，原因：

- 避免一次性把前后端 DTO 全部打碎
- 便于兼容现有创建和编辑流程
- 可作为草稿态输入来源

建议新增字段：

- `config_status`
  - `draft / valid / invalid`
- `last_validation_summary`
  - `jsonb`

#### `capability_releases` 或关联发布快照对象

建议为发布快照增加：

- `tool_snapshot_json`
- `policy_snapshot_json`

用于记录本次发布时：

- Skill 绑定的工具集合
- 这些工具对应的风险和暴露策略

### 16.4 迁移顺序

建议拆成两个 migration：

1. `add_tool_catalog_and_skill_tool_bindings`
2. `add_skill_config_status_and_release_tool_snapshot`

原因：

- 第一批先让对象存在
- 第二批再把发布与验证状态接进去

---

## 17. API 清单

本节定义第一版必须补齐的接口，不要求一次就做完整管理后台。

### 17.1 Tool Catalog API

#### `GET /tools/catalog`

用途：

- 查看工具目录
- 支持后台管理和快照调试

建议 query：

- `status`
- `category`
- `runtimeType`
- `allowSkillBinding`
- `keyword`

返回最小字段：

- `name`
- `displayName`
- `description`
- `category`
- `runtimeType`
- `status`
- `riskLevel`
- `allowSkillBinding`
- `promptExposure`
- `defaultRequiresConfirmation`
- `defaultRequiresApproval`

#### `GET /tools/catalog/:name`

用途：

- 查看单个工具详情
- 用于设置页

#### `PATCH /tools/catalog/:name`

用途：

- 修改工具状态和门控策略

建议允许更新字段：

- `displayName`
- `description`
- `status`
- `riskLevel`
- `allowSkillBinding`
- `promptExposure`
- `defaultRequiresConfirmation`
- `defaultRequiresApproval`
- `metadataJson`

建议拒绝更新字段：

- `name`

### 17.2 Skill Tool Binding API

#### `GET /skills/:id/tool-bindings`

返回：

- `declaredTools`
- `inferredTools`
- `effectiveTools`
- `problems`

其中 `problems` 建议结构：

- `toolName`
- `code`
- `message`
- `severity`

#### `PUT /skills/:id/tool-bindings`

用途：

- 显式设置 Skill 声明工具集合

请求体建议：

```json
{
  "tools": ["skill_match", "flow_execute", "document_render"]
}
```

行为要求：

- 先校验工具是否可绑定
- 再全量覆盖 `SkillToolBinding`
- 最后回写 `skill_configs.tools`

### 17.3 Skill 验证 API

#### `POST /skills/:id/validate-tools`

用途：

- 单独执行工具闭环校验
- 不依赖完整 AI 验证链

返回建议：

```json
{
  "isValid": false,
  "declaredTools": ["flow_execute"],
  "inferredTools": ["flow_execute", "api_call"],
  "missingTools": ["api_call"],
  "disabledTools": [],
  "forbiddenSkillTools": [],
  "undeclaredFlowTools": ["api_call"],
  "messages": [
    {
      "code": "undeclared_flow_tool",
      "toolName": "api_call",
      "severity": "error",
      "message": "Flow 模板中引用了未在 Skill 中声明的工具"
    }
  ]
}
```

### 17.4 Capability Snapshot API

#### `GET /capabilities/tool-snapshot`

用途：

- 给 `ai-orchestrator` 拉取正式工具快照
- 给管理侧调试当前用户/Skill 下的有效工具集

建议 query：

- `userId`
- `skillId`
- `mode`

返回建议：

- `visibleTools`
- `skillScopedToolNames`
- `deniedToolNames`
- `toolPolicyHints`

---

## 18. 代码改造清单

本节按服务拆成可直接开工的工程任务。

### 18.1 `auth` 服务

#### 任务 A1：新增 `tool-catalog` 模块

建议目录：

- `services/auth/src/modules/tool-catalog/tool-catalog.module.ts`
- `services/auth/src/modules/tool-catalog/tool-catalog.service.ts`
- `services/auth/src/modules/tool-catalog/tool-catalog.controller.ts`
- `services/auth/src/modules/tool-catalog/interfaces.ts`

职责：

- 工具目录查询
- 工具目录更新
- 初始化同步

#### 任务 A2：启动时同步内置工具目录

建议方式：

- 由 `ai-orchestrator` 提供只读工具清单接口
- 或在 `auth` 内维护一份系统工具种子

第一版推荐：

- 先在 `auth` 内维护系统工具种子
- 避免跨服务启动顺序耦合

种子至少包含当前这些工具：

- `skill_match`
- `param_collect`
- `document_gen`
- `user_ask`
- `file_parse`
- `generate_parameters`
- `document_render`
- `document_intake`
- `document_param_recover`
- `preview_params`
- `api_call`
- `flow_execute`
- `browser_step`

#### 任务 A3：改造 `skill.service.ts`

必须新增能力：

1. 保存 Skill 时校验工具名是否存在
2. 保存 Skill 时同步 `SkillToolBinding`
3. 提供 `getSkillToolBindings()`
4. 提供 `setSkillToolBindings()`
5. 提供 `validateSkillTools()`

现有 [skill.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/services/auth/src/modules/skill/skill.service.ts) 需要重点改动的方法：

- `createSkill()`
- `updateSkill()`
- `validateSkill()`
- `applyGeneratedSkillAdjustment()`

#### 任务 A4：改造 Capability Release 发布阻断

重点改造 [capability-release.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/services/auth/src/modules/capability-release/capability-release.service.ts)

要求：

- 发布前调用 `validateSkillTools()`
- 若存在 `error` 级问题，直接阻断
- 将工具验证结果写入 release audit log

### 18.2 `ai-orchestrator` 服务

#### 任务 B1：扩展接口定义

重点改造 [interfaces.ts](file:///Users/chain/Documents/MyProject/ops-automation/services/ai-orchestrator/src/modules/react-engine/interfaces.ts)

建议新增字段：

- `CapabilitySnapshot.selectedSkillId?: string`
- `CapabilitySnapshot.skillScopedToolNames?: string[]`
- `CapabilitySnapshot.deniedToolNames?: string[]`
- `CapabilityPolicies.requireApprovalToolNames?: string[]`
- `ExecutionContext.selectedSkillToolNames?: string[]`

#### 任务 B2：改造 `CapabilityResolver`

重点改造 [capability-resolver.ts](file:///Users/chain/Documents/MyProject/ops-automation/services/ai-orchestrator/src/modules/react-engine/capability-resolver.ts)

新增职责：

- 从 `auth` 拉取工具目录快照
- 从 `auth` 拉取用户当前 Skill 的绑定工具
- 计算最终交集
- 生成：
  - `visibleTools`
  - `skillScopedToolNames`
  - `deniedToolNames`

#### 任务 B3：改造 `ToolExecutor`

重点改造 [tool-executor.ts](file:///Users/chain/Documents/MyProject/ops-automation/services/ai-orchestrator/src/modules/react-engine/tool-executor.ts)

新增检查顺序：

1. 工具是否存在
2. 工具是否已启用
3. 是否在本轮允许集合
4. 若在 Skill 上下文，是否在 `skillScopedToolNames`
5. 是否要求确认/审批
6. 参数校验
7. 执行

建议新增私有方法：

- `isToolActiveInCatalog()`
- `isToolAllowedInSkillScope()`
- `buildPolicyDeniedResult()`

#### 任务 B4：改造 `flow-execute.tool.ts`

要求：

- 每个工具步骤执行前调用统一工具授权检查
- 若步骤工具越权，立即中止整个 flow
- 错误结果中必须带：
  - `stepId`
  - `stepName`
  - `toolName`
  - `code`

#### 任务 B5：改造 `prompt-builder.ts`

要求：

- Prompt 中只展示当前最终可见工具
- 若已经选中 Skill，则只展示 Skill 作用域工具
- 若某些工具需要确认，可在 Prompt 中提示“可见但需确认”

---

## 19. 测试用例清单

本节用于直接拆测试任务。

### 19.1 `auth` 单元测试

#### 用例 T1：工具目录禁用

前置：

- `document_render` 存在于 `tool_catalogs`
- `status = disabled`

断言：

- `PATCH` 更新成功
- `validateSkillTools()` 返回 `tool_disabled`

#### 用例 T2：Skill 绑定不存在工具

前置：

- Skill 提交 `tools = ["unknown_tool"]`

断言：

- `validateSkillTools()` 返回 `tool_not_registered_in_catalog`

#### 用例 T3：Flow 模板推导出未声明工具

前置：

- Skill 声明 `tools = ["flow_execute"]`
- 关联流程模板内部使用 `api_call`

断言：

- `missingTools` 包含 `api_call`
- `undeclaredFlowTools` 包含 `api_call`

#### 用例 T4：发布阻断

前置：

- Skill 工具校验存在 `error`

断言：

- 发布接口失败
- 审计日志记录阻断原因

### 19.2 `ai-orchestrator` 单元测试

#### 用例 T5：Skill 作用域外工具拒绝

前置：

- `selectedSkillId` 存在
- `skillScopedToolNames = ["flow_execute"]`

行为：

- 尝试执行 `api_call`

断言：

- 返回 `tool_not_bound_to_skill`

#### 用例 T6：禁用工具不进入快照

前置：

- `tool_catalogs.document_render.status = disabled`

断言：

- `CapabilitySnapshot.visibleTools` 不包含该工具

#### 用例 T7：Prompt 工具与 Runtime 一致

断言：

- Prompt 输出中的工具集合等于快照最终允许集合

#### 用例 T8：Flow 步骤内越权工具中止

前置：

- Flow 步骤 3 使用 `browser_step`
- 当前 Skill 未绑定 `browser_step`

断言：

- Flow 在步骤 3 中止
- Observation 中返回标准错误码

### 19.3 集成测试

#### 用例 T9：合法 Skill 成功执行

链路：

- 用户有 Skill 权限
- Skill 绑定工具合法
- Flow 使用工具均已授权

断言：

- 请求成功
- 无权限拒绝错误

#### 用例 T10：模型诱导越权失败

链路：

- Prompt 中故意引导模型调用 `api_call`
- 当前 Skill 未绑定 `api_call`

断言：

- Runtime 拒绝
- 错误码稳定

#### 用例 T11：工具被禁用后旧 Skill 失效

链路：

- 先有已存在 Skill 绑定 `document_render`
- 后台将该工具设为 `disabled`

断言：

- 新发布失败
- 运行时也拒绝继续执行

#### 用例 T12：管理员修改工具暴露策略生效

链路：

- 将 `promptExposure` 从 `prompt_and_runtime` 改为 `runtime_only`

断言：

- Prompt 中不再展示该工具
- Runtime 仍可在明确授权时执行

---

## 20. 可直接拆工单的任务列表

### 20.1 后端任务

- `AUTH-TOOL-01` 新增 `ToolCatalog` Prisma 模型与 migration
- `AUTH-TOOL-02` 新增 `SkillToolBinding` Prisma 模型与 migration
- `AUTH-TOOL-03` 新增 `tool-catalog` 模块及查询/更新 API
- `AUTH-TOOL-04` 在 `skill.service.ts` 中接入绑定同步与工具校验
- `AUTH-TOOL-05` 在 `capability-release.service.ts` 中接入发布阻断
- `ORCH-TOOL-01` 扩展 `CapabilitySnapshot` 和 `ExecutionContext`
- `ORCH-TOOL-02` 改造 `CapabilityResolver` 以生成最终工具快照
- `ORCH-TOOL-03` 改造 `ToolExecutor` 统一拒绝逻辑
- `ORCH-TOOL-04` 改造 `flow-execute.tool.ts` 做步骤级越权中止
- `ORCH-TOOL-05` 改造 `prompt-builder.ts` 收口工具暴露

### 20.2 测试任务

- `TEST-AUTH-01` 工具目录与绑定校验单测
- `TEST-AUTH-02` 发布阻断单测
- `TEST-ORCH-01` `tool_not_bound_to_skill` 单测
- `TEST-ORCH-02` Flow 越权步骤中止单测
- `TEST-E2E-01` 合法 Skill 成功执行链路
- `TEST-E2E-02` 模型诱导越权失败链路

### 20.3 建议负责人

- `auth` 相关：权限与发布链路负责人
- `ai-orchestrator` 相关：运行时与 prompt 负责人
- E2E：联调负责人

---

## 21. 本轮建议的实施边界

如果要控制第一批范围，建议只做以下闭环，不要扩张：

- 数据库对象：`ToolCatalog`、`SkillToolBinding`
- `auth`：工具目录 API、Skill 工具校验、发布阻断
- `ai-orchestrator`：Skill 作用域工具收窄、统一拒绝码、Prompt 收口
- 测试：单测 + 2 条核心 E2E

先不要在本轮引入：

- 审批中心
- 工具级 UI 后台
- 复杂规则 DSL
- 动态工具发现

这样第一批上线目标会非常清晰：

> 管理员能设置工具，Skill 不能绑定非法工具，运行时不能执行越权工具，模型也看不到不该看到的工具。

---

## 22. 跨服务契约约定

为了避免 `auth` 和 `ai-orchestrator` 在第一版就出现字段漂移，本节明确最小契约。

### 22.1 `auth -> ai-orchestrator` 的工具快照响应

建议 `GET /capabilities/tool-snapshot` 第一版稳定返回：

```json
{
  "userId": "user_xxx",
  "skillId": "skill_xxx",
  "visibleTools": ["flow_execute", "document_render"],
  "skillScopedToolNames": ["flow_execute"],
  "deniedToolNames": ["api_call", "browser_step"],
  "toolPolicyHints": {
    "requireConfirmToolNames": [],
    "requireApprovalToolNames": ["document_render"],
    "hiddenFromPromptToolNames": []
  },
  "toolCatalogVersion": "2026-04-30T10:00:00.000Z"
}
```

字段约束：

- `visibleTools` 是 prompt 可暴露工具集
- `skillScopedToolNames` 是当前已选 Skill 下真正可执行工具集
- `deniedToolNames` 用于日志、诊断和调试页
- `toolCatalogVersion` 用于排查“快照和目录不同步”问题

### 22.2 `ai-orchestrator` 的缓存策略

第一版建议：

- 工具目录快照允许短 TTL 本地缓存
- `skillId` 维度快照不建议长时间缓存
- 管理员修改工具状态后，最多允许 `30-60s` 生效延迟

原因：

- 工具目录变更频率低
- Skill 绑定和权限变化更敏感
- 第一版优先保证正确性，再做复杂缓存优化

### 22.3 错误码契约必须稳定

`auth` 与 `ai-orchestrator` 都应围绕同一组错误码工作，避免前端和日志系统重复适配。

建议保留以下稳定错误码：

- `tool_not_registered_in_catalog`
- `tool_disabled`
- `tool_forbidden_for_skill_binding`
- `undeclared_flow_tool`
- `tool_not_allowed_for_user`
- `tool_not_bound_to_skill`
- `tool_hidden_by_policy`
- `tool_requires_confirmation`
- `tool_requires_approval`

---

## 23. 灰度与发布策略

### 23.1 建议灰度顺序

第一版不要一次全量切换，建议按以下顺序灰度：

1. 先上线 `ToolCatalog` 和只读查询接口
2. 再上线 `SkillToolBinding` 和验证结果输出
3. 再开启发布阻断，但先只阻断新建或新发布 Skill
4. 最后开启运行时 `tool_not_bound_to_skill` 强拒绝

这样可以避免一开始就把历史 Skill 全部打挂。

### 23.2 历史数据兼容策略

第一版必须考虑已有 Skill 的存量数据。

建议兼容规则：

- 历史 Skill 首次读取时，若 `SkillToolBinding` 不存在，则从 `SkillConfig.tools` 回填
- 回填后立即执行一次 `validateSkillTools()`
- 若存在问题，标记为 `invalid`，但不自动删除原数据
- 仅在重新发布时执行强阻断

### 23.3 Feature Flag 建议

建议至少保留 4 个开关：

- `tool_catalog_enforced`
- `skill_tool_binding_enforced`
- `release_tool_validation_enforced`
- `runtime_skill_tool_scope_enforced`

这样在联调期可以分层打开，降低回滚成本。

---

## 24. 观测与告警指标

如果没有观测，本阶段即使上线，也很难判断治理闭环是否真的生效。

### 24.1 最低必须埋点

`auth` 侧：

- `tool_catalog_update_total`
- `skill_tool_validation_total`
- `skill_tool_validation_failed_total`
- `capability_release_blocked_total`

`ai-orchestrator` 侧：

- `tool_execution_denied_total`
- `tool_execution_denied_by_code_total`
- `skill_scoped_tool_miss_total`
- `prompt_visible_tools_count`

### 24.2 关键日志字段

所有拒绝事件建议统一记录：

- `requestId`
- `userId`
- `skillId`
- `toolName`
- `code`
- `reason`
- `stepId`
- `stepName`
- `toolCatalogVersion`

其中：

- 普通工具执行失败时，`stepId` 和 `stepName` 可为空
- Flow 内部步骤拒绝时，这两个字段必须存在

### 24.3 告警建议

至少增加以下告警：

- `capability_release_blocked_total` 在短时间内异常激增
- `tool_not_bound_to_skill` 在某个 Skill 上连续出现
- `tool_catalog_update_total` 后 `tool_execution_denied_total` 激增

这些信号通常代表：

- 配置更新误伤
- Skill 声明与 Flow 实际工具不一致
- 灰度策略切换后存在兼容性问题

---

## 25. 风险清单与回滚预案

### 25.1 风险一：历史 Skill 大面积变成无效

风险来源：

- 旧数据里的工具名不规范
- `executionFlow` 实际引用工具比 `tools` 更多

应对：

- 上线前先跑离线校验脚本
- 先生成问题清单，再决定是否开启发布阻断
- 第一批仅阻断“新发布”，不阻断“旧运行”

### 25.2 风险二：Prompt 收口后模型表现波动

风险来源：

- 过去模型依赖了本不该暴露的工具
- Prompt 中工具减少后，策略链会变化

应对：

- 对比上线前后工具调用分布
- 对关键 Skill 做回归对话集
- 保留 `runtime_skill_tool_scope_enforced` 的开关回退能力

### 25.3 风险三：跨服务快照不一致

风险来源：

- `auth` 已更新目录
- `ai-orchestrator` 仍在使用旧缓存

应对：

- 返回 `toolCatalogVersion`
- 为目录更新事件增加缓存失效机制
- 在拒绝日志中记录快照版本

### 25.4 回滚顺序

若上线后出现问题，建议按以下顺序回滚，而不是直接回滚数据库结构：

1. 关闭 `runtime_skill_tool_scope_enforced`
2. 关闭 `release_tool_validation_enforced`
3. 保留 `ToolCatalog` 和 `SkillToolBinding` 数据结构
4. 排查数据问题后再重新开启开关

第一版尽量做到：

- 数据结构上线可保留
- 行为开关可关闭
- 不依赖删除 migration 完成回滚

---

## 26. Definition Of Done

本阶段完成不能只看“代码合并”，必须满足下面这些可验证条件。

### 26.1 工程完成标准

- `auth` 已有 `ToolCatalog` 与 `SkillToolBinding`
- 关键 API 可用并有最小权限控制
- `ai-orchestrator` 已按 Skill 作用域收窄工具集合
- Prompt 暴露与 Runtime 执行集合一致
- 统一错误码在日志、接口、测试中都能看到

### 26.2 测试完成标准

- `auth` 单测覆盖目录禁用、非法绑定、发布阻断
- `ai-orchestrator` 单测覆盖 Skill 越权工具拒绝
- 至少 2 条核心 E2E 通过
- 至少 1 条历史 Skill 兼容回填用例通过

### 26.3 发布完成标准

- Feature Flag 已接入
- 灰度策略已确认
- 观测指标已接入
- 回滚预案已演练
- 负责人和值班窗口已明确

---

## 27. 最终落地结论

如果只保留一句实施指令，建议团队统一对齐为：

> 第一批不要继续扩 AI 能力面，而是先补齐 Tool Catalog、Skill Tool Binding、发布阻断、运行时 Skill 作用域拒绝这 4 个闭环点，并通过灰度开关和观测指标确保可以稳态上线。

这样做的直接收益是：

- 工具第一次成为正式治理对象
- Skill 第一次具备正式工具边界
- Prompt 与 Runtime 第一次形成一致门控
- 后续上下文治理、错误恢复、模型路由才有稳定底座
