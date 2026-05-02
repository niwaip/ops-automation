# 企业级 Skill 平台 Agent OS 运行时与治理设计

**Runtime and Policy v3.0**  
日期：2026-04-26

> 本文定义 `Planner-only Agent OS` 下的运行时与治理边界，重点回答 Runtime 如何与 Planner 解耦、Policy 如何成为正式决策平面，以及高风险动作如何通过审批、接管和能力授权进入受控执行。

---

## 1. 文档目标

本文回答以下问题：

- `v3` 中 Runtime 的边界到底在哪里
- Planner、Execution、Runtime、Policy 之间如何协作
- 高风险动作如何做授权、审批、接管和阻断
- Browser Runtime、API Runtime、Document Runtime、Code Runtime 分别应遵循什么约束

---

## 2. 核心原则

### 2.1 Planner 不直接持有高权限

- Planner 只能给出 `PlanDraft` 和 `RiskHint`
- Planner 不能直接决定高风险写操作落地
- Planner 不能绕过 Policy 或 Runtime gate

### 2.2 Runtime 只执行 typed capability

- Runtime 不接受自由文本“帮我做一下”
- Runtime 只接受结构化 `ExecutionStep`
- Runtime 返回结构化执行结果、断言结果和资源状态

### 2.3 Policy 是正式平面，不是隐藏逻辑

- 风险分级不能埋在 Prompt 里
- 审批要求不能散落在各个工具实现里
- 接管触发条件必须可解释、可审计

### 2.4 高风险动作默认不自治

- `L2` 起默认要求审批
- `L3` 原则上要求人工接管或双人审批
- Planner 的建议永远不等于系统的最终授权

### 2.5 Runtime 是资源边界，不是业务边界

- Runtime 成功只代表资源执行成功
- 是否业务成功要由 `Execution + Verification` 决定

---

## 3. Runtime 与 Policy 的总体关系

推荐主链路：

`Planner -> PlanDraft -> Policy Precheck -> Execution -> Runtime Invoke -> Verification -> Policy Postcheck`

其中：

- Planner 提供建议
- Policy 判断能不能做
- Execution 记录过程和状态
- Runtime 负责真正执行
- Verification 判断结果是否满足业务目标

---

## 4. 权限模型

`v3` 推荐按 5 层治理，而不是只做 API 鉴权。

### 4.1 人对 Skill 的权限

决定：

- 谁能看到 Skill
- 谁能执行 Skill
- 谁能编辑 Skill
- 谁能发布 Skill
- 谁能查看日志与产物

推荐动作：

- `view`
- `execute`
- `edit`
- `publish`
- `view_logs`
- `view_artifacts`

### 4.2 Skill 对 Capability 的权限

决定：

- 某个 SkillVersion 能调用哪些 capability
- 哪些 capability 只能在特定风险等级下调用
- 哪些 capability 在某些环境中被禁用

### 4.3 Capability 对 Runtime 的权限

决定：

- 某个 capability 能否进入真实浏览器 profile
- 能否访问生产环境
- 能否访问外网
- 能否持久化会话
- 能否访问文件系统

### 4.4 Execution 级权限

决定：

- 本次任务是否跨过风险阈值
- 是否涉及敏感对象
- 是否需要审批
- 是否要求固定 approver

### 4.5 Step 级权限

决定：

- 某一步是否必须暂停
- 某一步是否必须审批
- 某一步是否必须进入人工接管
- 某一步是否必须阻断

---

## 5. 风险分级

建议统一分为四档：

- `L0`
- `L1`
- `L2`
- `L3`

### 5.1 `L0`

示例：

- 查询数据
- 提供建议
- 生成草稿
- 页面只读分析

默认治理：

- 默认自动执行
- 必须记录审计

### 5.2 `L1`

示例：

- 填写表单但不提交
- 渲染内部草稿
- 更新非关键辅助字段

默认治理：

- 可自动执行
- 建议做 step 级验证

### 5.3 `L2`

示例：

- 提交业务单据
- 修改主数据
- 对外发送内容
- 批量更新对象

默认治理：

- 默认要求审批
- 必须有详细审计

### 5.4 `L3`

示例：

- 删除关键数据
- 财务付款确认
- 大范围停用对象
- 不可撤销的对外发送

默认治理：

- 原则上不允许自治
- 要求人工接管或双人审批

---

## 6. Policy 决策对象

建议引入统一 `PolicyDecision` 概念。

### 6.1 `PolicyDecision` 最小字段

- `decision`
  - `allow / require_approval / require_human / deny`
- `risk_level`
- `reason_codes`
- `explanations`
- `required_approvers`
- `required_controls`
- `expires_at`

### 6.2 决策来源

决策应综合以下输入：

- 用户身份与角色
- Skill 和 SkillVersion
- Capability
- Runtime 类型
- 输入数据范围
- 风险等级
- 环境标签

---

## 7. Runtime 分类

### 7.1 Browser Runtime

适用场景：

- 企业门户
- Web 表单系统
- 无稳定 API 的业务系统

关键能力：

- session 管理
- step 执行
- 快照
- 断言
- freeze / resume
- human takeover

关键原则：

- 不让模型直接自由式操控 DOM
- 执行应遵循 `Step -> Assertion -> Retry -> Takeover`
- 持久 profile 必须被治理

### 7.2 API Runtime

适用场景：

- 企业内部接口
- 标准化提交
- 查询与结构化更新

关键原则：

- 必须明确 method、host、path、schema
- 必须明确幂等性
- 必须明确超时和重试策略
- 必须带环境和数据域标签

### 7.3 Document Runtime

适用场景：

- 模板填充
- 文档生成
- 预览
- 导出

关键原则：

- 文档输出先进入草稿态
- 对外交付和归档需要额外治理

### 7.4 Code Runtime

适用场景：

- 数据转换
- 规则计算
- 受控批处理

关键原则：

- 必须隔离运行
- 默认不开放任意文件系统权限
- 默认不开放任意网络权限
- 必须可审计、可回收、可限额

---

## 8. Browser Runtime 治理细则

### 8.1 Profile 治理

Profile 不是任意目录路径，应是被治理的企业资源。

至少应有：

- `owner`
- `profile_type`
- `persistence_policy`
- `environment_tag`
- `concurrency_policy`
- `data_writeback_policy`

### 8.2 锁策略

- 同一高权限 profile 默认单写锁
- 同一 `RuntimeSession` 默认只允许一个控制面
- 接管期间禁止 Agent 和 Human 并发写操作

### 8.3 Freeze / Resume 约束

- `freeze` 必须可回溯到原因
- `resume` 必须绑定发起人和时间
- freeze 期间 step 推进必须停止

### 8.4 浏览器接管

接管触发条件建议包括：

- 出现未知验证码
- 关键审批页面出现高风险按钮
- 断言反复失败
- 页面结构与模板偏差过大

接管后原则：

- `Execution.status = human_control`
- `RuntimeSession.control_mode = HUMAN_CONTROL`
- 所有自动 step 暂停

---

## 9. API Runtime 治理细则

### 9.1 Allowlist 原则

- 默认禁止任意 URL 出网
- 必须按 `host + path + method` 白名单授权

### 9.2 Schema 原则

- 请求输入必须 schema 校验
- 响应结果必须归一化
- 高风险响应必须可审计

### 9.3 环境原则

- dev / test / prod 必须区分
- 同一 SkillVersion 不应默认跨环境写操作

---

## 10. Code Runtime 治理细则

### 10.1 执行约束

- 使用独立运行容器或受控 sandbox
- 限制 CPU、内存、时间、并发
- 限制网络、文件系统、环境变量

### 10.2 输入输出约束

- 输入必须结构化
- 输出必须结构化
- stdout/stderr 必须被归档

### 10.3 审计约束

- 记录代码版本
- 记录依赖快照
- 记录运行参数
- 记录资源使用情况

---

## 11. 审批与接管

### 11.1 审批适用场景

- 风险级别 `L2/L3`
- 敏感对象写操作
- 跨系统批量操作
- 外部发送

### 11.2 接管适用场景

- 复杂验证码
- UI 偏差过大
- 模型无法稳定断言
- 需要人类价值判断

### 11.3 审批与接管的区别

- 审批：允许不允许继续
- 接管：谁来完成后续控制

二者不可混为同一状态。

---

## 12. 审计要求

至少应记录：

- 谁发起了任务
- 谁审批了任务
- 哪个 SkillVersion 被执行
- 哪些 capability 被调用
- 哪些步骤进入了接管
- 哪些 artifacts 被生成
- 最终结果与失败原因

---

## 13. 与当前仓库的映射

### 13.1 可直接承接

- `control-plane`
  - 承接审批、接管、Execution 状态推进
- `session-broker`
  - 承接 `RuntimeSession` 状态与资源分配
- `browser-worker`
  - 承接 Browser Runtime

### 13.2 需要补强

- `auth/capability-release`
  - 还应进一步吸收 policy snapshot、promotion audit
- `ai-orchestrator`
  - 不应再内含高权限自由工具执行逻辑

---

## 14. 一句话总结

`v3` 的 Runtime 和 Policy 设计重点不是“让 Agent 能做更多”，而是：

> 让每一次执行都在明确资源边界、权限边界和风险边界内发生，并且在越高风险的地方，越少依赖 Prompt，越多依赖正式系统机制。
