# Builtin Activity 设计式样书

> **版本**: v3.1  
> **适用范围**: `apps/backend/core/platform/src/modules/temporal-workflow/`  
> **设计前提**: 不修改现有 Workflow 功能，不削弱现有 AI 模版生成工作流主入口  
> **目标**: 基于 Temporal 官方模型与企业场景，重构 builtin 能力体系，使其成为 AI 生成 workflow 的标准能力池、稳定执行层与治理边界  
> **核心原则**: `workflow` 负责确定性编排，`activity` 负责外部副作用，`AI` 负责生成、验证、诊断与修复建议

---

## 一、文档目的

本设计式样书用于在不破坏当前项目主流程的前提下，重新定义 builtin 体系，使其同时满足：

1. 与 Temporal 官方 Workflow / Activity 模型一致。
2. 适用于企业流程固化、复用、审计和治理。
3. 保留当前“AI 模版生成 workflow”这一高价值入口能力。
4. 让 AI 生成 workflow 时优先使用标准 builtin，而不是每次临时发明逻辑。
5. 为后续 deterministic builder、静态校验、权限控制、失败诊断提供统一基础。
6. 为 workflow 的最终结果输出、聊天窗口接入、执行详情页展示和定时任务通知定义统一 output 协议。

---

## 二、与 Temporal 官方模型的对齐结论

### 2.1 官方模型的核心边界

根据 Temporal 官方 Python SDK 文档，以下边界是明确的：

1. `Workflow` 必须保持确定性，不能直接执行网络 I/O、文件 I/O、外部进程、随机数、系统时间等非确定性逻辑。
2. `Activity` 用于执行外部副作用和单一、清晰、可定义的外部动作。
3. `Activity` 应尽量具备幂等性，并结合 timeout、retry、heartbeat 设计。
4. 长时间等待优先使用 Workflow 级 durable timer，而不是把等待做成真正阻塞的 Activity。
5. Activity 入参与返回值会进入执行历史，必须严格控制体积，避免把大文件、大数组、大 Base64 直接塞进 history。
6. 异步 Activity 中不应执行阻塞型库调用；若必须阻塞，应考虑同步执行模型或隔离执行方式。

### 2.2 对本项目方向的判断

上述官方边界并不反对 builtin，相反非常支持“标准化 Activity 能力池”这种平台化设计。

因此，本项目的正确方向应是：

- 保留 `AI 生成 workflow` 作为主入口。
- 把 builtin 作为 AI 的标准能力池和 workflow 的稳定执行积木。
- 把企业高频、明确、可治理的能力沉淀为 builtin。
- 把等待、轮询这类更偏编排语义的能力重定义为 `workflow-native builtin`。
- 把高风险能力降级为 `restricted builtin`，而不是默认开放。

### 2.3 本次重设计的核心结论

本次重设计后，builtin 不再被简单理解为“全部都是 Activity”。

在产品和 DSL 层面，builtin 统一表现为平台内置能力；在运行语义层面，分为两类：

1. `activity builtin`
   - 最终落为 Temporal Activity。
   - 负责外部副作用和单一动作。
2. `workflow-native builtin`
   - 最终编译为 Workflow 级能力，如 timer、轮询编排。
   - 不应被实现为真正的阻塞外部 Activity。

---

## 三、当前项目中的不变前提

### 3.1 必须保持不变

以下能力和流程必须保持：

| 项目                       | 要求                                  |
| -------------------------- | ------------------------------------- | --------- | --------- | --------- |
| AI 模版生成 workflow       | 保留，继续作为主入口                  |
| 现有 Workflow DSL 主体结构 | 保留                                  |
| custom activity CRUD       | 保留                                  |
| workflow codegen 总入口    | 继续“deterministic 优先，AI fallback” |
| `GET /activities/builtin`  | 保留                                  |
| 现有 handler 枚举          | 不新增新值，继续沿用 `'api'           | 'carbone' | 'browser' | 'script'` |

### 3.2 本次设计不做的事

1. 不改现有 workflow 产品功能。
2. 不取消 AI 自动生成 workflow。
3. 不要求用户必须手工拼 workflow。
4. 不用 builtin 替代 custom activity。
5. 不让 AI 退出流程设计与错误诊断链路。

---

## 四、项目总体定位

### 4.1 三层模型

本项目后续应明确为三层结构：

| 层级                        | 职责                                                           |
| --------------------------- | -------------------------------------------------------------- |
| `Workflow`                  | 企业流程编排层，承载流程资产、顺序、条件、等待、调用关系       |
| `Builtin / Custom Activity` | 能力执行层，承载标准动作与业务动作                             |
| `AI`                        | 辅助层，负责 workflow 草稿生成、参数补全、校验、诊断、修复建议 |

### 4.2 正式产品定位

可将系统正式定位为：

> 面向企业业务流程固化的 Temporal 编排平台。  
> `AI` 用于生成与修复，`workflow` 用于编排，`builtin` 用于稳定执行与复用。

### 4.3 Builtin 的正式定位

builtin 是平台内置、只读、可复用、可被 UI、AI、codegen 和治理层共同消费的标准能力资源。

其职责不是替代 workflow，而是：

- 作为 AI 生成 workflow 时的首选能力池
- 作为企业高频能力的稳定执行积木
- 作为治理、权限、安全和版本演进的边界对象

---

## 五、Builtin 的新分类模型

### 5.1 分类总览

本项目 builtin 统一分为四类：

| 分类                           | 含义                               | 运行方式             |
| ------------------------------ | ---------------------------------- | -------------------- |
| `core activity builtin`        | 企业高频、通用、稳定、推荐优先使用 | Activity             |
| `specialized activity builtin` | 特定场景可用，但不是默认首选       | Activity             |
| `restricted activity builtin`  | 高风险或高治理成本能力             | Activity             |
| `workflow-native builtin`      | 本质属于编排能力，而不是外部动作   | 编译为 Workflow 能力 |

### 5.2 设计原则

1. 默认只把最稳定、最通用的能力放入 `core activity builtin`。
2. 不把所有“有用功能”都塞进核心 builtin 池。
3. 高风险能力必须降级到 `restricted`。
4. 本质属于 timer / polling orchestration 的能力不得继续被视为普通 Activity。

---

## 六、基于企业场景和官方文档的重新评估

### 6.1 评估标准

本次对现有 builtin 的重新评估，统一按以下标准进行：

1. 是否符合 Temporal 对 Workflow / Activity 的边界定义。
2. 是否适合企业中的高频、重复、可参数化流程。
3. 是否容易被 AI 稳定选中并生成正确 DSL。
4. 是否易于治理、审计、权限控制与调试。
5. 是否会导致 history 过大、重试副作用或阻塞执行问题。

### 6.2 评估结论

#### A. 保留为核心 builtin

这些能力应继续作为默认首选能力池：

| key                     | 结论 | 原因                                           |
| ----------------------- | ---- | ---------------------------------------------- |
| `documentRender`        | 保留 | 企业文档自动化核心能力，边界清晰               |
| `httpRequest`           | 保留 | API 驱动流程的基础能力                         |
| `structuredTransform`   | 保留 | 可替代大量临时 AI 逻辑，适合企业规则化场景     |
| `aiStructuredTransform` | 保留 | 作为规则无法覆盖时的补位能力                   |
| `fileRead`              | 保留 | 企业文件型流程常用，但需控制 payload           |
| `fileWrite`             | 保留 | 企业文件输出型流程常用，但需强化幂等与路径限制 |
| `templateRender`        | 保留 | 文本、正文、配置、报表模板生成的核心能力       |
| `webhookNotify`         | 保留 | 通用通知和系统回调能力                         |
| `emailSend`             | 保留 | 企业最常见输出方式之一                         |

#### B. 保留但降为 specialized builtin

这些能力有价值，但不应作为默认主推：

| key             | 结论       | 原因                                                      |
| --------------- | ---------- | --------------------------------------------------------- |
| `imNotify`      | 保留但降级 | 本质上是特定渠道通知，很多场景可由 `webhookNotify` 覆盖   |
| `csvParse`      | 保留但降级 | 有价值，但应受行数和 payload 控制，不宜成为默认转换主轴   |
| `jsonTransform` | 保留但降级 | 价值存在，但与 `structuredTransform` 在产品语义上部分重叠 |

#### C. 保留但列为 restricted builtin

这些能力有企业价值，但必须受治理约束：

| key             | 结论       | 原因                             |
| --------------- | ---------- | -------------------------------- |
| `databaseQuery` | restricted | 数据权限、SQL 安全、连接治理复杂 |
| `shellCommand`  | restricted | 系统执行风险最高，不适合默认开放 |

#### D. 重新定义为 workflow-native builtin

这些能力不应继续被视为普通 Activity：

| key              | 结论            | 原因                                       |
| ---------------- | --------------- | ------------------------------------------ |
| `waitDelay`      | workflow-native | 官方推荐以 Workflow timer 实现等待         |
| `conditionCheck` | workflow-native | 本质是轮询编排，建议 Workflow 负责编排节奏 |

### 6.3 重设计后的 builtin 池

#### Core Activity Builtins

- `documentRender`
- `httpRequest`
- `structuredTransform`
- `aiStructuredTransform`
- `fileRead`
- `fileWrite`
- `templateRender`
- `webhookNotify`
- `emailSend`

#### Specialized Activity Builtins

- `imNotify`
- `csvParse`
- `jsonTransform`

#### Restricted Activity Builtins

- `databaseQuery`
- `shellCommand`

#### Workflow-Native Builtins

- `waitDelay`
- `conditionCheck`

---

## 七、Builtin 标准模型重定义

### 7.1 统一资源模型

后续 builtin 应统一抽象为 `BuiltinCapabilityDefinition`，逻辑字段至少包括：

| 字段                       | 说明                                             |
| -------------------------- | ------------------------------------------------ |
| `key`                      | 唯一标识                                         |
| `ref`                      | 对外引用，如 `builtin:httpRequest`               |
| `version`                  | 语义版本                                         |
| `name`                     | 展示名                                           |
| `kind`                     | `activity` / `workflow-native`                   |
| `tier`                     | `core` / `specialized` / `restricted`            |
| `handler`                  | 仅对 activity builtin 生效                       |
| `timeout`                  | 默认超时                                         |
| `retryPolicy`              | 默认重试策略                                     |
| `config.stepConfigKey`     | DSL 配置注入 key                                 |
| `config.defaultStepConfig` | 默认配置                                         |
| `config.configSchema`      | 表单 schema                                      |
| `generatedCode`            | 固定 Activity 模板代码，仅 activity builtin 使用 |
| `description`              | 说明                                             |
| `recommendedUseCases`      | 推荐场景                                         |
| `riskLevel`                | `low` / `medium` / `high`                        |

### 7.2 兼容实现策略

由于当前代码里 `BuiltinActivityDefinition` 已存在，兼容策略为：

1. 短期内保持现有 registry 结构可运行。
2. 新增字段时优先以可选字段追加，不破坏现有消费方。
3. `workflow-native builtin` 可以先在文档和 AI 资源池中引入，再逐步落实到 deterministic builder。
4. 对于当前已经注册成 activity 的 `waitDelay` / `conditionCheck`，中期目标是保留兼容但改用 workflow-native 编译语义。

### 7.3 DTO 输出要求

`GET /activities/builtin` 建议统一对外返回如下逻辑字段：

| 字段                  | 说明                                  |
| --------------------- | ------------------------------------- |
| `key`                 | builtin key                           |
| `ref`                 | builtin ref                           |
| `name`                | 展示名                                |
| `description`         | 简介                                  |
| `kind`                | `activity` / `workflow-native`        |
| `tier`                | `core` / `specialized` / `restricted` |
| `handler`             | activity 执行类型                     |
| `inputSchema`         | UI 表单 schema                        |
| `defaultConfig`       | 默认配置                              |
| `riskLevel`           | 风险级别                              |
| `recommendedUseCases` | 推荐使用场景                          |

---

## 八、Temporal 官方约束下的强制设计规则

### 8.1 Workflow 约束

1. Workflow 中不允许直接执行网络 I/O、文件 I/O、系统命令、数据库查询。
2. Workflow 只负责：
   - 读取参数
   - 渲染模板变量
   - 调用 Activity
   - 进行条件、顺序、等待等确定性编排
3. 任何外部副作用必须下沉到 Activity。

### 8.2 Activity 约束

每个 activity builtin 必须满足：

1. `@activity.defn(name="...")`
2. 严格输入验证
3. 返回值必须可序列化
4. 超时必须显式设置
5. 长耗时步骤必须 heartbeat
6. 错误必须使用 `ApplicationError`
7. 对明确配置错误使用 `non_retryable=True`

### 8.3 幂等性规则

以下 builtin 必须显式考虑幂等性：

| builtin          | 幂等性要求                             |
| ---------------- | -------------------------------------- |
| `fileWrite`      | 路径冲突、覆盖策略、重复写入结果需可控 |
| `webhookNotify`  | 推荐支持幂等键或去重标识               |
| `emailSend`      | 推荐支持 message key / job key 去重    |
| `documentRender` | 结果文件命名与重复调用结果需可预期     |
| `shellCommand`   | 默认不假设幂等，重试应极为谨慎         |

### 8.4 Payload 与 History 约束

这是本次重设计的强制红线：

1. 不鼓励把大文件原文、大 Base64、大数组直接作为 Activity 返回值。
2. 优先返回：
   - 文件路径
   - 对象存储 key
   - download URL
   - 结构摘要
   - 小体积处理结果
3. `fileRead`、`csvParse`、`documentRender`、`templateRender` 必须控制返回体积。
4. `maxSizeKb`、`maxRows` 等限制必须被设计成真正的运行时约束，而不是仅配置项展示。

### 8.5 异步 Activity 与阻塞调用约束

根据官方 Python SDK 文档，异步 Activity 中不应大量使用阻塞库调用。

因此：

1. 大量阻塞 I/O 的 builtin 应评估是否改为同步执行模型。
2. `shellCommand` 不应通过简单 async 包装阻塞执行。
3. `databaseQuery`、`fileRead`、`fileWrite`、`emailSend` 的实现必须明确其并发与阻塞策略。

### 8.6 等待类能力约束

1. `waitDelay` 必须以 Workflow timer 语义实现。
2. `conditionCheck` 应优先设计为：
   - Workflow 负责轮询节奏与终止条件
   - Activity 负责单次外部检查
3. 不应让 `conditionCheck` 长时间占住一个 Activity 执行槽位进行阻塞轮询。

---

## 九、AI 自动生成 Workflow 中的 builtin 备选池规则

### 9.1 总原则

AI 生成 workflow 时，应把 builtin 作为首选能力池，但不改变当前 AI 生成 workflow 的产品入口。

即：

- 保留 AI 生成 workflow 的主体验
- 只增强 AI 背后的能力池和选择约束

### 9.2 AI 选择顺序

AI 在生成 workflow 草稿时的优先顺序应为：

1. `core activity builtin`
2. `workflow-native builtin`
3. `specialized activity builtin`
4. `custom activity`
5. `restricted activity builtin` 仅在明确必要且允许时使用

### 9.3 AI 选择规则

1. 不允许发明不存在的 `activityRef`。
2. 对规则型转换优先 `structuredTransform`。
3. 只有规则无法表达时才使用 `aiStructuredTransform`。
4. 对等待场景优先 `waitDelay`。
5. 对异步状态轮询优先 `conditionCheck`。
6. 默认避免 `shellCommand`。
7. 默认避免 `databaseQuery`，除非用户目标明确是企业数据库查询流程。

### 9.4 AI 资源池应包含的信息

AI 使用 builtin 资源时，至少要感知：

- `ref`
- `name`
- `description`
- `kind`
- `tier`
- `handler`
- `timeout`
- `retryPolicy`
- `defaultConfig`
- `configSchema`
- `riskLevel`
- `recommendedUseCases`

---

## 十、重设计后的 builtin 详细说明

## 10.1 `documentRender`

**分类**

- `kind`: `activity`
- `tier`: `core`

**功能描述**

- 基于 Carbone 模板执行文档渲染。

**企业价值**

- 合同、报告、函件、审批材料等文档自动化是高频企业场景。

**设计约束**

- 输出优先返回 `downloadUrl`、对象存储地址或文件路径。
- 不建议直接把大二进制内容返回给 Workflow。

## 10.2 `httpRequest`

**分类**

- `kind`: `activity`
- `tier`: `core`

**功能描述**

- 发起标准 HTTP 请求，作为企业流程的数据入口和系统连接器。

**企业价值**

- 是绝大多数系统集成流程的基础能力。

**设计约束**

- 必须支持 timeout、success code、headers 白名单或脱敏。
- 应避免把超大响应体直接传入后续 history。

## 10.3 `structuredTransform`

**分类**

- `kind`: `activity`
- `tier`: `core`

**功能描述**

- 通过固定规则完成结构化提取、映射和格式化。

**企业价值**

- 能大幅减少对 AI 的依赖，是企业“流程固化”最关键的 builtin 之一。

**设计约束**

- 优先服务于固定规则场景。
- 对 AI 来说应始终高于 `aiStructuredTransform` 优先级。

## 10.4 `aiStructuredTransform`

**分类**

- `kind`: `activity`
- `tier`: `core`

**功能描述**

- 对规则无法覆盖的内容进行 AI 提取、归纳、摘要或分类。

**企业价值**

- 保留必要灵活性，解决非结构化场景。

**设计约束**

- 不是默认首选。
- 仅在规则型 builtin 不足时使用。

## 10.5 `fileRead`

**分类**

- `kind`: `activity`
- `tier`: `core`

**功能描述**

- 读取本地或对象存储中的文件。

**企业价值**

- 文件处理是企业流程中的常见入口。

**设计约束**

- 本地路径必须白名单化。
- 必须控制返回体积。
- 优先返回摘要、小文本或对象引用，而不是大文件原文。

## 10.6 `fileWrite`

**分类**

- `kind`: `activity`
- `tier`: `core`

**功能描述**

- 把内容写入本地或对象存储。

**企业价值**

- 是结果物化、结果留存、对外输出的关键能力。

**设计约束**

- 需要明确幂等策略。
- 路径、覆盖和目录创建必须受控。

## 10.7 `templateRender`

**分类**

- `kind`: `activity`
- `tier`: `core`

**功能描述**

- 渲染文本模板或 JSON 模板字符串。

**企业价值**

- 适合作为邮件正文、CSV 文本、配置片段、通知内容生成能力。

**设计约束**

- 模板渲染结果应控制体积。

## 10.8 `webhookNotify`

**分类**

- `kind`: `activity`
- `tier`: `core`

**功能描述**

- 向外部 webhook 推送结构化消息。

**企业价值**

- 适合作为系统回调、自动化桥接和统一通知能力。

**设计约束**

- 需要域名控制、敏感头脱敏、幂等或去重策略。

## 10.9 `emailSend`

**分类**

- `kind`: `activity`
- `tier`: `core`

**功能描述**

- 通过 SMTP 或受控邮件网关发送邮件。

**企业价值**

- 邮件仍是企业正式交付与通知的重要渠道。

**设计约束**

- 应支持附件引用，不推荐直接把大附件内容塞进 history。
- 必须考虑重复发送的幂等问题。

## 10.10 `imNotify`

**分类**

- `kind`: `activity`
- `tier`: `specialized`

**功能描述**

- 发送飞书、钉钉、企业微信消息。

**设计判断**

- 保留，但默认优先级低于 `webhookNotify`。
- 若平台层已有统一消息网关，可进一步收敛为通知模板能力。

## 10.11 `csvParse`

**分类**

- `kind`: `activity`
- `tier`: `specialized`

**功能描述**

- 把 CSV 内容解析为结构化数据。

**设计判断**

- 保留，但必须增加 `maxRows`、列数、结果体积限制。
- 更适合作为文件处理流程中的辅助 builtin，而不是主入口 builtin。

## 10.12 `jsonTransform`

**分类**

- `kind`: `activity`
- `tier`: `specialized`

**功能描述**

- 做 JSON 到 JSON 的字段重组。

**设计判断**

- 价值成立，但与 `structuredTransform` 有产品语义重叠。
- 建议保留为“面向 JSON-only 场景的轻量专业 builtin”。

## 10.13 `databaseQuery`

**分类**

- `kind`: `activity`
- `tier`: `restricted`

**功能描述**

- 执行参数化只读查询。

**企业价值**

- 很高，但治理成本也高。

**设计约束**

- 仅允许只读。
- 限连接源。
- 限返回行数。
- 限单语句。
- 应受权限或租户级开关控制。

## 10.14 `shellCommand`

**分类**

- `kind`: `activity`
- `tier`: `restricted`

**功能描述**

- 受控执行系统工具命令。

**企业价值**

- 在特定行业场景有价值，但风险极高。

**设计约束**

- 不应作为默认 builtin 主推。
- 默认禁止 AI 主动选择。
- 应逐步从“前缀白名单”升级为“命令模板白名单”。

## 10.15 `waitDelay`

**分类**

- `kind`: `workflow-native`
- `tier`: `core`

**功能描述**

- 在 workflow 中插入持久化等待。

**设计判断**

- 保留，但不再视为普通 Activity。
- 最终应编译为 Workflow timer。

## 10.16 `conditionCheck`

**分类**

- `kind`: `workflow-native`
- `tier`: `core`

**功能描述**

- 以 Workflow 编排方式做等待条件达成。

**设计判断**

- 保留，但从“单个长轮询 Activity”重构为“Workflow 轮询编排 + 单次检查动作”。

---

## 十一、推荐的企业流程组合

### 11.1 API 获取 -> 固定规则转换 -> 通知

```
httpRequest -> structuredTransform -> webhookNotify / emailSend
```

适用：

- 日报
- 监控摘要
- 业务状态同步

### 11.2 API 获取 -> AI 转换 -> 文档输出

```
httpRequest -> aiStructuredTransform -> documentRender
```

适用：

- 非结构化文本生成正式文档

### 11.3 文件读取 -> 规则处理 -> 文件输出

```
fileRead -> structuredTransform / csvParse -> fileWrite
```

适用：

- 文件清洗
- 数据中间产物加工

### 11.4 数据获取 -> 模板渲染 -> 邮件发送

```
httpRequest / databaseQuery -> templateRender -> emailSend
```

适用：

- 定时报表
- 汇总投递

### 11.5 异步任务触发 -> 等待 -> 条件轮询 -> 拉取结果

```
httpRequest -> waitDelay -> conditionCheck -> httpRequest
```

适用：

- 外部异步任务
- AI 任务回收
- 审批状态等待

---

## 十二、Workflow Output 设计式样

### 12.1 设计目标

由于本项目中的 workflow 不仅会被聊天窗口即时触发，也可能被：

- 定时任务调度触发
- 后台系统接口触发
- 审批后恢复执行
- 用户在执行详情页查看结果

因此，workflow output 不能只按“聊天回答文本”设计，而应作为平台级标准结果协议存在。

本章节目标是：

1. 让不同业务流程的最终结果具有统一外层结构。
2. 让聊天窗口、执行详情页、通知渠道与外部 API 能统一对接。
3. 让 AI 只负责“最后一公里的人话整形”，而不是承担底层结果协议定义。
4. 让定时任务在无人在线时也能稳定沉淀结果、通知和审计信息。

### 12.2 核心原则

workflow output 的设计应遵循：

1. `workflow` 负责产出结构化业务结果，不负责直接生成聊天文案。
2. `chat` 只是 workflow 结果的一个消费端，不应反向定义 workflow 的输出结构。
3. output 必须同时适配：
   - 聊天窗口
   - 执行详情页
   - 定时任务通知
   - 外部系统 API / webhook
4. 结构统一靠规则，表达友好可由 AI 补充。
5. 原始执行结果、业务结果、展示结果必须分层，不能混在一起。

### 12.3 输出分层模型

建议将 workflow output 拆成四层：

| 层级           | 职责                                             | 使用方                          |
| -------------- | ------------------------------------------------ | ------------------------------- |
| `execution`    | 执行状态、耗时、执行单标识、调度信息             | control-plane、执行详情页、审计 |
| `result`       | 业务语义结果，如报表、同步、通知、导入导出结果   | 聊天、前端、外部 API            |
| `artifacts`    | 文件、链接、文档、附件、下载入口                 | 聊天、执行详情页、通知          |
| `presentation` | 面向渠道的展示提示，如摘要偏好、是否建议 AI 总结 | chat adapter、通知 adapter      |

### 12.4 标准结果协议

建议所有 workflow 最终输出统一封装为 `WorkflowResultEnvelope`：

```json
{
  "execution": {
    "status": "success",
    "executionId": "exec_123",
    "startedAt": "2026-06-15T09:00:01Z",
    "finishedAt": "2026-06-15T09:00:13Z",
    "durationMs": 12000
  },
  "trigger": {
    "type": "manual"
  },
  "result": {
    "resultType": "report",
    "title": "销售日报任务",
    "summary": "已生成 2026-06-15 销售日报，并发送给 3 位收件人。",
    "businessData": {
      "reportDate": "2026-06-15",
      "orderCount": 182,
      "salesAmount": 356000,
      "recipientCount": 3
    },
    "metrics": {
      "successCount": 1,
      "failureCount": 0
    },
    "nextActions": [
      {
        "type": "open_execution",
        "label": "查看执行详情",
        "value": "exec_123"
      }
    ]
  },
  "artifacts": [
    {
      "type": "file",
      "name": "sales-report-2026-06-15.pdf",
      "downloadUrl": "https://example.com/file.pdf"
    }
  ],
  "presentation": {
    "preferAiSummary": true,
    "preferStructuredView": false
  }
}
```

### 12.5 字段设计要求

#### A. `execution`

用于表达系统级执行结果，推荐字段：

| 字段          | 说明                                                   |
| ------------- | ------------------------------------------------------ |
| `status`      | `success` / `partial_success` / `failed` / `cancelled` |
| `executionId` | 执行单 ID                                              |
| `startedAt`   | 开始时间                                               |
| `finishedAt`  | 结束时间                                               |
| `durationMs`  | 执行耗时                                               |

说明：

- `execution` 服务系统、审计和详情页，不等于业务结果。

#### B. `trigger`

用于表达本次 workflow 的触发方式，推荐字段：

| 字段          | 说明                                     |
| ------------- | ---------------------------------------- |
| `type`        | `manual` / `schedule` / `api` / `resume` |
| `scheduleId`  | 定时任务标识，可选                       |
| `scheduledAt` | 计划触发时间，可选                       |
| `windowStart` | 本次任务处理的数据窗口起点，可选         |
| `windowEnd`   | 本次任务处理的数据窗口终点，可选         |

说明：

- 对企业定时任务来说，`trigger` 不是附属信息，而是 output 的关键组成部分。

#### C. `result`

用于表达业务语义结果，推荐字段：

| 字段           | 说明                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `resultType`   | `report` / `sync` / `document` / `notification` / `import` / `export` / `generic` |
| `title`        | 结果标题                                                                          |
| `summary`      | 规则化简述                                                                        |
| `businessData` | 业务结构化数据                                                                    |
| `metrics`      | 业务统计信息                                                                      |
| `nextActions`  | 可供后续操作的建议动作                                                            |

说明：

- `businessData` 可以按业务不同而变化，但 `result` 外层结构应稳定。

#### D. `artifacts`

用于表达与本次 workflow 相关的文件和外部成果物：

| 字段          | 说明                                       |
| ------------- | ------------------------------------------ |
| `type`        | `file` / `url` / `document` / `attachment` |
| `name`        | 展示名称                                   |
| `downloadUrl` | 下载地址                                   |
| `path`        | 内部文件路径，可选                         |
| `mimeType`    | 文件类型，可选                             |

说明：

- `artifacts` 是聊天窗口“下载结果”、执行详情页“查看产物”的统一来源。

#### E. `presentation`

用于给 chat / notification adapter 提供展示提示：

| 字段                   | 说明                           |
| ---------------------- | ------------------------------ |
| `preferAiSummary`      | 是否建议由 AI 生成自然语言摘要 |
| `preferStructuredView` | 是否优先展示结构化结果         |
| `chatSummary`          | 可选的规则摘要                 |
| `notificationSummary`  | 可选的通知摘要                 |

说明：

- `presentation` 是提示层，不应承载核心业务数据。

### 12.6 builtin、step 与 workflow final output 的关系

后续结果设计应明确分层：

1. `builtin` 返回步骤级结果，推荐统一结构：

```json
{
  "status": "success",
  "output": {},
  "meta": {
    "builtinKey": "httpRequest"
  }
}
```

2. `workflow` 负责把多个步骤结果汇总成最终 `WorkflowResultEnvelope`。
3. 不要求每个 builtin 直接输出聊天文案。
4. 不要求每个 step 都理解最终展示渠道。

也就是说：

- builtin 解决“步骤结果标准化”
- workflow 解决“业务结果汇总”
- chat adapter 解决“聊天消费”
- AI 解决“自然语言表达”

### 12.7 定时任务场景的特殊要求

由于 workflow 可能被 schedule 驱动，定时任务必须补充以下信息：

1. 本次处理的数据窗口。
2. 本次计划触发时间与实际完成时间。
3. 是否成功投递通知。
4. 投递到了哪些渠道或对象。
5. 是否存在部分成功、部分失败。

建议在 `result` 或扩展字段中补充：

```json
{
  "delivery": {
    "channels": ["email", "webhook"],
    "sent": true,
    "recipients": ["ops@example.com", "finance@example.com"]
  }
}
```

说明：

- 对定时任务，单纯返回“任务成功”没有业务价值。
- 应尽量表达“处理了什么、产出了什么、发给了谁、是否有异常”。

### 12.8 聊天窗口接入原则

聊天窗口不应直接消费任意 shape 的 `execution.resultJson`。

正确做法应为：

1. workflow 输出标准 `WorkflowResultEnvelope`
2. chat 后端适配层进行统一归一化
3. 前端聊天窗口只消费归一化后的结果结构
4. 若需要更自然的表述，再由 AI 基于标准结构生成聊天态摘要

当前项目中，后端聊天链路的统一收口点应放在：

- `apps/backend/intelligence/ai-orchestrator/src/modules/chat/`

特别是：

- `chat-execution-stream.service.ts`

该层应负责：

1. 从 execution 原始结果中提取统一字段
2. 兼容历史字段，如 `summary`、`message`、`output`、`result`
3. 生成聊天窗口可直接使用的 normalized result
4. 在必要时调用 AI 生成更友好的 `chatSummary`

### 12.9 AI 整形的边界

AI 在结果整形中的职责应被限制为“最后一公里增强”，而不是基础协议本身。

AI 适合做：

1. 把结构化结果转成自然语言总结
2. 根据用户角色调整表达重点
3. 给出下一步建议
4. 对失败结果给出原因解释和修复建议

AI 不应做：

1. 定义底层 output 协议
2. 作为唯一结果解析器
3. 取代结构化业务结果
4. 在前端浏览器侧独自承担结果统一逻辑

### 12.10 兼容策略

考虑当前项目中已有不同 workflow 返回不同结构，兼容策略建议为：

1. 新增 workflow 按 `WorkflowResultEnvelope` 输出。
2. 已有 workflow 可保留现状，但 chat adapter 需兼容旧字段。
3. 旧结果字段优先映射：
   - `finalAnswer`
   - `formatted_output`
   - `summary`
   - `message`
   - `text`
   - `content`
   - `output`
   - `result`
4. 中期逐步推动 builtin workflow helper 和 fixed workflow code 输出统一 envelope。

### 12.11 实施建议

建议按以下顺序落地：

1. 定义 `WorkflowResultEnvelope` DTO。
2. 在 workflow codegen / fixed helper 中支持 final output 封装。
3. 在 chat adapter 中增加结果归一化服务。
4. 前端聊天窗口和执行详情页优先消费统一字段。
5. 最后再补 AI 聊天态摘要增强。

---

## 十三、安全、验证与治理要求

### 12.1 通用要求

所有 builtin 必须具备：

1. 输入校验
2. 敏感信息脱敏
3. 超时控制
4. 重试边界
5. 可观测性
6. 大 payload 限制

### 12.2 风险分级

| 风险级别 | builtin                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| `low`    | `httpRequest`、`structuredTransform`、`templateRender`、`waitDelay`                                              |
| `medium` | `fileRead`、`fileWrite`、`webhookNotify`、`emailSend`、`imNotify`、`csvParse`、`jsonTransform`、`conditionCheck` |
| `high`   | `databaseQuery`、`shellCommand`                                                                                  |

### 12.3 AI 介入点

AI 的正确介入方式是：

1. 生成 workflow 草稿
2. 补全参数和字段映射
3. 静态校验 DSL
4. 运行失败诊断
5. 输出修复建议或修正版草稿

AI 不应替代 builtin 的稳定执行。

---

## 十四、实施建议

### 13.1 第一阶段实施重点

优先把以下能力做强，而不是继续扩大 builtin 数量：

1. `httpRequest`
2. `structuredTransform`
3. `aiStructuredTransform`
4. `fileRead`
5. `fileWrite`
6. `templateRender`
7. `webhookNotify`
8. `emailSend`
9. `waitDelay`
10. `conditionCheck`

### 13.2 第一阶段代码工作

1. 收敛 builtin 对外 DTO。
2. 在 AI draft 资源池中补充 `kind`、`tier`、`riskLevel`、`recommendedUseCases`。
3. 将 `waitDelay` 标记为 workflow-native 语义。
4. 将 `conditionCheck` 设计为 workflow-native 编排能力。
5. 增加 payload 大小、行数、返回体积控制。
6. 为高风险 builtin 增加权限和校验。

### 13.3 测试要求

至少补齐：

1. builtin registry 完整性测试
2. builtin DTO 映射测试
3. AI draft 选择 builtin 优先级测试
4. deterministic builder 命中测试
5. workflow-native builtin 编译测试
6. 高风险 builtin 安全测试
7. 大 payload 限制测试

---

## 十五、最终结论

本次基于 Temporal 官方文档和企业场景的重新评估后，可以得出以下结论：

1. `AI 生成 workflow` 这条主路径应保留，而且是本项目的重要优势能力。
2. builtin 的作用不是替代 AI 生成 workflow，而是作为 AI 背后的标准能力池。
3. builtin 不应再被简单理解为“一组 Activity 列表”，而应区分：
   - `activity builtin`
   - `workflow-native builtin`
4. 当前导入的 builtin 中，大部分方向正确，但必须重分类、收紧边界、控制 payload、强化幂等，并重新定义等待类能力。
5. 在企业场景下，最合适的最终模式是：
   - `workflow` 负责流程资产和确定性编排
   - `builtin` 负责稳定执行和复用
   - `AI` 负责生成、验证、诊断和修复建议

这一路线既符合 Temporal 官方模型，也更适合企业真正需要的“流程固化 + 灵活辅助”模式。
