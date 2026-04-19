# 企业级 Skill 平台 Service API 与 Ownership Contract

**Service API and Ownership Contract v2.0**  
日期：2026-04-19

> 本文用于把当前仓库服务从“实现集合”收敛为“领域对象驱动的协作系统”，明确每个核心对象归谁拥有、谁能写、谁只能读，以及服务之间应通过什么 API / 事件协作。

---

## 1. 目标

本文聚焦以下问题：

- 当前仓库中的主要服务最终应收敛成哪些目标服务
- 每个核心对象由谁拥有
- 跨服务协作应采用同步 API 还是异步事件
- 迁移期如何避免双写混乱

---

## 2. 设计原则

### 2.1 一个主对象只应有一个主拥有者

例如：

- `Execution` 只能有一个主服务写主状态
- `RuntimeSession` 只能有一个主服务写运行时状态

### 2.2 读可以多方共享，写必须收口

- 允许多个服务读取 `Execution`
- 不允许多个服务都能随意更新 `Execution.status`

### 2.3 领域 API 与基础设施 API 分离

- “创建 Execution” 是领域 API
- “冻结浏览器输入” 是运行时基础设施 API

### 2.4 MVP 阶段优先同步调用，关键状态变化再补事件

因为当前仓库尚未形成正式事件总线，MVP 阶段建议：

- 关键链路先用同步 API 保障确定性
- 对审计、通知、观测类能力再逐步加事件

---

## 3. 目标服务清单

建议目标服务如下：

- `auth-identity-service`
- `skill-control-plane`
- `skill-orchestrator`
- `policy-service`
- `runtime-manager`
- `browser-runtime`
- `execution-engine`
- `template-service`
- `document-runtime`
- `artifact-service`
- `portal`
- `office-addin`

中长期再补：

- `memory-service`
- `evaluation-service`
- `evolution-service`

---

## 4. 当前仓库到目标服务映射

### `auth`

当前职责：

- 用户认证
- 用户管理
- 角色与权限
- Skill 配置
- Execution Flow 模板

目标归属：

- 保留为 `auth-identity-service`
- 其中 Skill / Flow 管理应迁出

### `control-plane`

当前职责：

- API 代理
- 认证中间件
- 审计雏形

目标归属：

- 升级为 `skill-control-plane`

### `ai-orchestrator`

当前职责：

- 模型调用
- ReAct 编排
- 参数识别
- 失败决策

目标归属：

- 收敛为 `skill-orchestrator`

### `session-broker`

当前职责：

- session 创建
- worker 分配
- freeze / resume
- 锁
- 直接执行模板步骤

目标归属：

- 收敛为 `runtime-manager`
- 执行步骤职责迁出

### `browser-worker`

当前职责：

- 浏览器控制
- 录制
- worker 管理

目标归属：

- 收敛为 `browser-runtime`

### `replay-engine`

当前职责：

- step 执行
- step log
- retry
- 接管触发

目标归属：

- 保留为 `execution-engine`

### `template`

当前职责：

- 模板编译
- 模板校验
- 模板生命周期

目标归属：

- 保留为 `template-service`

### `report` + `carbone-engine`

当前职责：

- 报告生成
- 文档分析
- 文档渲染

目标归属：

- 一部分归 `document-runtime`
- 一部分归 `artifact-service`

---

## 5. Ownership Matrix

以下使用：

- `Owner`：主拥有者，可写主状态
- `Contributor`：可补充从属数据，不可改主状态
- `Reader`：只读

---

## 5.1 `Skill`

- Owner：`skill-control-plane`
- Contributor：无
- Reader：`skill-orchestrator`、`portal`、`policy-service`

可写内容：

- 名称、描述、分类、风险等级、默认运行时、可见范围、状态

不可外写：

- 其他服务不得直接修改 Skill 主数据

---

## 5.2 `SkillVersion`

- Owner：`skill-control-plane`
- Contributor：`template-service`
- Reader：`skill-orchestrator`、`policy-service`、`portal`

可写内容：

- 版本号
- 状态
- 输入输出 schema
- 依赖能力
- 计划模板引用
- 模板包引用
- 验证规则

说明：

- `template-service` 可维护模板资产本身
- 但 `SkillVersion` 是否发布、是否可执行仍由 `skill-control-plane` 决定

---

## 5.3 `Execution`

- Owner：`skill-control-plane`
- Contributor：`skill-orchestrator`、`execution-engine`、`policy-service`
- Reader：`portal`、`artifact-service`

主状态写权限：

- 仅 `skill-control-plane` 可写 `Execution.status`

补充数据写权限：

- `skill-orchestrator` 可写计划、归一化目标、验证结果
- `execution-engine` 可回报 step 结果与执行摘要
- `policy-service` 可回报治理判定结果

推荐写法：

- 下游服务不直接更新主表
- 下游调用 `skill-control-plane` 的状态变更 API 或发布状态事件

---

## 5.4 `ExecutionStep`

- Owner：`execution-engine`
- Contributor：`skill-orchestrator`
- Reader：`skill-control-plane`、`portal`

可写内容：

- step 开始
- step 成功/失败
- retry
- assertion
- takeover_triggered

说明：

- `ExecutionStep` 的写入应完全收口到执行器

---

## 5.5 `RuntimeSession`

- Owner：`runtime-manager`
- Contributor：`browser-runtime`、`document-runtime`
- Reader：`execution-engine`、`portal`

可写内容：

- 资源分配状态
- worker_ref
- lease
- endpoints
- freeze / resume
- health_status

说明：

- `execution-engine` 可以请求 Runtime
- 但不直接写 RuntimeSession 主状态

---

## 5.6 `ApprovalRequest`

- Owner：`skill-control-plane`
- Contributor：`policy-service`
- Reader：`portal`

可写内容：

- 审批创建
- 审批结果
- 审批备注
- 过期时间

说明：

- `policy-service` 决定是否需要审批
- `skill-control-plane` 持有审批对象本身

---

## 5.7 `Policy`

- Owner：`policy-service`
- Contributor：无
- Reader：`skill-control-plane`、`skill-orchestrator`

可写内容：

- 策略规则
- 优先级
- 条件表达式
- 效果

---

## 5.8 `Artifact`

- Owner：`artifact-service`
- Contributor：`execution-engine`、`document-runtime`
- Reader：`portal`、`skill-control-plane`

可写内容：

- 存储引用
- 类型
- checksum
- visibility
- 来源 execution

---

## 5.9 `Audit Index`

- Owner：`skill-control-plane`
- Contributor：所有核心服务通过审计接口或事件上报
- Reader：`portal`

说明：

- 审计索引是平台级对象
- 不能继续保持内存态实现

---

## 5.10 禁止跨服务直写的对象

为避免迁移期间出现“ownership 名义上明确，但实现上仍然乱写”的情况，以下对象禁止跨服务直写：

- `Execution`
  - 禁止 `execution-engine`、`runtime-manager` 直接写主表中的 `status`
- `RuntimeSession`
  - 禁止 `execution-engine` 直接改 `state`
- `Skill`
  - 禁止 `auth-identity-service` 继续作为长期主写方
- `ApprovalRequest`
  - 禁止前端或编排器绕过 `skill-control-plane` 直接写审批结果
- `Policy`
  - 禁止 `skill-control-plane` 直接改策略规则

迁移期临时例外：

- 仅允许通过适配层进行兼容性回写
- 该类兼容逻辑必须有明确下线时间

---

## 6. 同步 API 合同

以下为 MVP 阶段建议的关键同步 API。

---

## 6.1 `skill-control-plane`

### `POST /skills`

用途：

- 创建 Skill

### `POST /skill-versions`

用途：

- 创建 SkillVersion

### `POST /executions`

用途：

- 创建 Execution

输入最小字段：

```json
{
  "skill_id": "string",
  "skill_version_id": "string",
  "initiator_user_id": "string",
  "goal_text": "string",
  "input_payload": {}
}
```

### `POST /executions/{id}/queue`

用途：

- 将 Execution 从 `draft` 推进到 `queued`

### `POST /executions/{id}/status`

用途：

- 统一变更 Execution 主状态

输入最小字段：

```json
{
  "from_status": "queued",
  "to_status": "running",
  "reason": "runtime_allocated",
  "actor_type": "system"
}
```

### `POST /executions/{id}/approval-requests`

用途：

- 创建审批对象

### `POST /approval-requests/{id}/decision`

用途：

- 审批通过/拒绝

---

## 6.2 `skill-orchestrator`

### `POST /orchestrations/plan`

用途：

- 为一次 Execution 生成执行计划

输入：

```json
{
  "execution_id": "string"
}
```

输出：

```json
{
  "plan_version": 1,
  "normalized_goal": {},
  "runtime_type": "browser",
  "required_capabilities": []
}
```

### `POST /orchestrations/verify`

用途：

- 对执行结果做验证

---

## 6.3 `policy-service`

### `POST /policies/evaluate`

用途：

- 对某次 Execution 或某个 step 做策略判定

输入最小字段：

```json
{
  "execution_id": "string",
  "skill_id": "string",
  "skill_version_id": "string",
  "user_id": "string",
  "runtime_type": "browser",
  "risk_level": "L2",
  "action_scope": "submit"
}
```

输出：

```json
{
  "decision": "require_approval",
  "restrictions": {
    "allow_real_profile": false
  },
  "reason": "high_risk_submit"
}
```

---

## 6.4 `runtime-manager`

### `POST /runtime-sessions`

用途：

- 为 Execution 创建 RuntimeSession

### `POST /runtime-sessions/{id}/freeze`

用途：

- 冻结运行时

### `POST /runtime-sessions/{id}/resume`

用途：

- 恢复运行时

### `POST /runtime-sessions/{id}/close`

用途：

- 回收运行时

---

## 6.5 `execution-engine`

### `POST /executions/{id}/run`

用途：

- 执行一次 Execution 的 plan

### `POST /executions/{id}/resume`

用途：

- 从指定 step 继续

### `GET /executions/{id}/steps`

用途：

- 查询 step 执行记录

### `GET /executions/{id}/summary`

用途：

- 查询执行摘要

---

## 6.6 `artifact-service`

### `POST /artifacts`

用途：

- 注册执行产物

### `GET /artifacts/{id}`

用途：

- 查询产物元数据

---

## 6.7 跨服务写库规则

MVP 阶段建议执行以下规则：

- 服务只写自己拥有的主库表
- 其他服务如需变更主对象，只能走 Owner API
- 禁止通过“共享数据库但不同服务直接 update”来完成协作

当前仓库应特别避免的写法：

- `session-broker` 继续承担 `Execution` 主状态写入
- `auth` 继续成为 Skill 主对象的长期落库点
- 前端直接依赖多个下游服务拼接业务主状态

---

## 7. 事件合同

MVP 先支持以下事件即可：

- `execution.created`
- `execution.status.changed`
- `execution.approval.requested`
- `execution.takeover.requested`
- `execution.completed`
- `runtime_session.created`
- `runtime_session.state.changed`
- `execution_step.completed`
- `artifact.created`

建议字段：

```json
{
  "event_id": "string",
  "event_type": "execution.status.changed",
  "occurred_at": "2026-04-19T12:00:00Z",
  "subject_id": "execution_id",
  "payload": {}
}
```

---

## 8. 迁移期 Contract 规则

### 规则 1：旧接口允许保留，但新真相源先确立

例如：

- 旧 `session-broker` 接口可暂时保留
- 但内部应逐步改为调用 `execution-engine` 和 `runtime-manager`

### 规则 2：禁止新功能继续写入错误归属对象

例如：

- 不再往 `auth` 新增 Skill 治理逻辑
- 不再往 `session-broker` 新增 step 执行能力

### 规则 3：迁移期间允许兼容读，不允许长期双写

可以：

- 新服务为主写源
- 旧服务通过适配层回读

不建议：

- 新旧两边长期都写状态

---

## 8.1 迁移冻结规则

在迁移期间，为防止架构继续漂移，建议立即冻结以下新增开发方向：

- 不再向 `auth` 增加新的 Skill 治理接口
- 不再向 `session-broker` 增加新的 step 执行逻辑
- 不再向 `control-plane` 增加新的纯代理接口作为长期方案
- 不再向 `browser-worker` 增加新的内存 worker 生命周期逻辑

允许继续开发的方向：

- 围绕 `Execution`、`RuntimeSession`、`ApprovalRequest`、`Artifact` 的新主对象建设
- 面向迁移的适配层与兼容层

---

## 9. 过渡期适配建议

### 第一批适配

- `control-plane` 调 `auth` 的 Skill 接口 -> 改为调新 `skill-control-plane`
- `session-broker` 的 startSession -> 改为申请 Runtime 后调用 `execution-engine`

### 第二批适配

- `portal` 的 Skill 管理页改接新治理接口
- `portal` 的执行详情页改读 `Execution + ExecutionStep + RuntimeSession`

### 第三批适配

- `report` 与 `carbone-engine` 的产物归档接 `artifact-service`

---

## 9.1 适配层原则

为降低迁移风险，建议过渡期引入适配层，但适配层必须遵守以下原则：

- 只做协议转换，不做长期业务承载
- 不沉淀新的主状态
- 必须能被后续删除
- 每个适配层都应标注“替代目标”和“下线条件”

适配层典型例子：

- `control-plane` 保留旧 URL，对内转调新 `skill-control-plane`
- `session-broker` 保留旧 start 接口，对内改为“分配 Runtime + 调 execution-engine”

---

## 10. 当前代码的直接整改要求

为使 Contract 能真正落地，建议先执行以下整改：

- 将 `control-plane` 的审计实现从内存存储改为持久化
- 将 `ai-orchestrator` 的模型、Agent、上传文件从本地 / 内存态迁移到正式存储
- 停止在 `session-broker` 中维护完整执行闭环
- 统一所有服务的默认端口与 URL 约定

---

## 10.1 首批必须统一的环境变量

为了减少当前仓库中端口与地址漂移，建议第一批先统一以下环境变量：

- `AUTH_SERVICE_URL`
- `SKILL_CONTROL_PLANE_URL`
- `SKILL_ORCHESTRATOR_URL`
- `POLICY_SERVICE_URL`
- `RUNTIME_MANAGER_URL`
- `EXECUTION_ENGINE_URL`
- `BROWSER_RUNTIME_URL`
- `ARTIFACT_SERVICE_URL`

补充要求：

- 不再允许服务内部继续硬编码旧端口作为长期默认方案
- Docker、开发环境、测试环境必须使用同一套命名

---

## 11. 结论

本 Contract 文档的核心是三句话：

- 一个主对象只能有一个 Owner
- 写路径必须收口
- 迁移期可以兼容读，但不能长期双写

只有把 ownership 先定清楚，后续的重构和多人协作才不会失控。
