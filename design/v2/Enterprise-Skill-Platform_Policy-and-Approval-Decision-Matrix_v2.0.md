# 企业级 Skill 平台 Policy 与 Approval 决策矩阵

**Policy and Approval Decision Matrix v2.0**  
日期：2026-04-19

> 本文补充 `Runtime and Policy`、`MVP Scope and Acceptance`、`Execution API Spec`，专门定义第一阶段治理判断规则，包括风险等级、审批要求、人工接管条件、默认决策矩阵和实现约束。

---

## 1. 文档目标

本文聚焦以下问题：

- 什么样的 Execution 可以直接执行
- 什么样的 Execution 必须审批
- 什么样的 step 必须进入人工接管
- 第一阶段策略判断最少需要考虑哪些维度
- Policy、Approval、Takeover 三者如何分工

---

## 2. 核心原则

### 2.1 Policy 负责判断，不直接执行

- `policy-service` 负责计算风险和给出决策建议
- `skill-control-plane` 持有正式审批对象和执行状态
- `runtime-manager` 负责接管所需的运行时冻结与恢复

### 2.2 审批和接管不是同一件事

- 审批解决“这件事是否允许做”
- 接管解决“这一步现在是否必须由人来做”

### 2.3 先保守，后放开

第一阶段默认采用偏保守策略：

- 可疑高风险任务宁可多进审批，也不要直接放行
- 页面结构不确定宁可多进接管，也不要让 Agent 猜测提交

### 2.4 决策必须可解释

每次进入以下状态时，都必须能解释原因：

- `pending_approval`
- `human_control`
- `cancelled`

---

## 3. 决策输入维度

第一阶段建议至少使用以下 6 类输入维度。

### 3.1 Skill 维度

- Skill 分类
- Skill 默认风险等级
- Skill 可用 Runtime
- Skill 是否允许外发

### 3.2 用户维度

- 发起人身份
- 发起人角色
- 发起人是否具备 execute 权限
- 发起人是否具备高风险授权

### 3.3 输入内容维度

- 是否包含外部接收方
- 是否包含敏感字段
- 是否是批量操作
- 是否指向生产环境对象

### 3.4 Capability 维度

- 当前 step 调用的 capability 名称
- capability 风险等级
- capability 是否可逆
- capability 是否幂等

### 3.5 Runtime 维度

- Runtime 类型
- Profile 类型
- 是否持久化 profile
- 是否是生产环境 session

### 3.6 执行上下文维度

- 当前 Execution 状态
- 当前 Step 类型
- 当前页面是否可验证
- 是否已发生重试

---

## 4. 风险等级定义

第一阶段沿用 4 档风险等级。

### `L0`

适用：

- 查询
- 草稿生成
- 页面读取

默认策略：

- 允许直接执行
- 不要求审批
- 不要求人工接管

### `L1`

适用：

- 填表但不提交
- 生成内部文档草稿
- 低影响字段更新

默认策略：

- 允许直接执行
- 默认不要求审批
- 若页面不确定可触发接管

### `L2`

适用：

- 提交内部审批
- 更新主数据
- 对外发送文档
- 批量操作

默认策略：

- 默认要求审批
- 若步骤不可验证或需要人工确认，可进入接管

### `L3`

适用：

- 财务确认
- 删除关键数据
- 不可逆外发
- 高影响批量修改

默认策略：

- 原则上不得全自动
- 必须审批
- 通常需要人工接管或双人确认

---

## 5. 第一阶段默认决策矩阵

## 5.1 Execution 级决策

| 风险等级 | 默认是否允许创建 Execution | 默认是否要求审批 | 默认是否允许自动进入 running |
|---|---|---|---|
| `L0` | 是 | 否 | 是 |
| `L1` | 是 | 否 | 是 |
| `L2` | 是 | 是 | 否 |
| `L3` | 视策略 | 是 | 否 |

说明：

- `L2` 默认创建后进入 `pending_approval`
- `L3` 在第一阶段可以允许创建，但不应直接自动执行

## 5.2 Step 级决策

| 条件 | 默认动作 |
|---|---|
| 页面只读提取 | 直接执行 |
| 填写表单但未提交 | 直接执行 |
| 点击提交且影响内部对象 | 依据风险进入审批 |
| 点击提交且页面结构不确定 | 进入接管 |
| 出现验证码 | 进入接管 |
| 定位失败但页面仍可见 | 优先接管 |
| 对外发送动作 | 高风险，默认审批 |
| 删除不可逆对象 | 高风险，审批 + 人工确认 |

## 5.3 Runtime 级决策

| 条件 | 默认动作 |
|---|---|
| 普通浏览器 profile | 允许执行 |
| 生产环境高权限 profile | 默认收紧，必要时审批 |
| 持久化 profile 冲突 | 不执行，进入排队或拒绝 |
| Runtime 健康异常 | 不执行，返回失败或等待恢复 |

---

## 6. 审批矩阵

## 6.1 Execution 进入审批的典型条件

满足任一条件即建议进入 `pending_approval`：

- 风险等级为 `L2` 或 `L3`
- 存在对外发送动作
- 涉及生产环境主数据修改
- 涉及批量更新
- 输入中存在敏感对象标识

## 6.2 Step 触发审批的典型条件

满足任一条件即建议暂停到审批：

- 即将执行不可逆动作
- 即将执行高影响提交动作
- 即将使用受限 capability
- 需要人工确认业务语义，而不是技术问题

## 6.3 不建议走审批而应走接管的情况

以下情况更适合 `human_control` 而不是 `pending_approval`：

- 验证码
- 未知弹窗
- 页面结构变化
- 定位器失效但页面仍可人工处理
- 需要人工补充页面交互

---

## 7. 接管矩阵

## 7.1 必须进入接管的情况

- 检测到验证码
- 页面需要人工拖拽、滑块、扫码
- 页面未识别到预期元素但页面仍在线
- 关键提交前需要人工点选确认

## 7.2 可以自动失败而不进入接管的情况

- Runtime 已失联
- 浏览器会话已关闭
- 权限被明确拒绝
- 输入参数明显非法

## 7.3 可以重试后再接管的情况

- 短时网络抖动
- 元素暂未出现
- 页面加载未完成

第一阶段建议：

- 先做有限重试
- 重试后仍失败再进入接管

---

## 8. 决策输出模型

建议 `policy-service` 输出统一决策结构：

```ts
interface PolicyDecision {
  allow: boolean;
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  requiresApproval: boolean;
  requiresHumanControl: boolean;
  decisionReason: string;
  matchedRules: string[];
}
```

字段说明：

- `allow=false` 表示直接阻断
- `requiresApproval=true` 表示 Execution 或 step 进入审批
- `requiresHumanControl=true` 表示执行期应进入接管
- `decisionReason` 必须可直接用于页面展示或审计记录

---

## 9. 第一阶段推荐规则集

### 9.1 Execution 创建前规则

- 若用户无 execute 权限，拒绝
- 若 Skill 未发布，拒绝
- 若 Runtime 类型不匹配，拒绝
- 若风险等级为 `L2/L3`，创建后默认进入审批

### 9.2 Step 执行前规则

- 若当前 capability 不在 Skill 允许范围内，拒绝
- 若当前 RuntimeProfile 冲突，拒绝或排队
- 若当前 step 为高风险提交，要求审批
- 若当前页面不确定或存在验证码，要求接管

### 9.3 Resume 前规则

- 只有具备接管权限的用户可恢复
- Runtime 必须处于 `frozen`
- Execution 必须处于 `human_control`

---

## 10. Portal 展示要求

Portal 在以下状态必须展示明确原因：

### 10.1 `pending_approval`

必须展示：

- 为什么需要审批
- 当前风险等级
- 当前等待谁处理

### 10.2 `human_control`

必须展示：

- 为什么需要人工处理
- 当前 step
- 恢复后系统会继续自动执行

### 10.3 被拒绝或被取消

必须展示：

- 原因
- 谁做出的决定

---

## 11. 审计要求

每次治理决策至少记录：

- `executionId`
- `stepId`（如有）
- `riskLevel`
- `decisionType`
- `decisionReason`
- `actor`
- `matchedRules`
- `createdAt`

推荐 `decisionType`：

- `allow`
- `require_approval`
- `require_human_control`
- `deny`

---

## 12. MVP 范围内的简化

第一阶段允许的简化：

- 规则可以先以配置表或代码规则实现
- 不强求复杂 DSL
- 不强求多级审批链
- 不强求双人审批

第一阶段不建议缺失：

- 风险等级判断
- 审批与接管的明确区分
- 决策原因记录
- Portal 可解释展示

---

## 13. 验收标准

### 13.1 审批

- `L2` 场景可进入 `pending_approval`
- 审批通过后可继续执行
- 审批拒绝后可取消执行

### 13.2 接管

- 验证码或未知弹窗时可进入 `human_control`
- 用户可在 Portal 看到接管原因

### 13.3 审计

- 每次审批或接管判断都有可追溯记录

---

## 14. 与现有文档关系

- 运行时与治理原则：见 `Enterprise-Skill-Platform_Runtime-and-Policy_v2.0.md`
- MVP 范围：见 `Enterprise-Skill-Platform_MVP-Scope-and-Acceptance_v2.0.md`
- API 合同：见 `Enterprise-Skill-Platform_Execution-API-Spec_v2.0.md`
- 接管协议：见 `Enterprise-Skill-Platform_Runtime-Takeover-Protocol-Spec_v2.0.md`

本文定位是“治理决策规则规范”，用于冻结第一阶段审批与接管的默认矩阵。
