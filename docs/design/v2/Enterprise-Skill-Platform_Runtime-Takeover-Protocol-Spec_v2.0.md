# 企业级 Skill 平台 Runtime Takeover Protocol 规范

**Runtime Takeover Protocol Spec v2.0**  
日期：2026-04-19

> 本文补充 `Runtime and Policy`、`Execution Lifecycle RFC`、`MVP Implementation Blueprint`，专门定义第一阶段人工接管能力所需的运行时协议、状态切换、握手步骤、安全约束和异常处理。

---

## 1. 文档目标

本文聚焦以下问题：

- 什么情况下允许触发人工接管
- Runtime、Execution、Portal 在接管过程中各自负责什么
- freeze / takeover / resume 的协议步骤是什么
- 浏览器控制权如何从 Agent 切换到 Human，再切回 Agent
- 接管失败、连接失败、恢复失败时怎么处理

---

## 2. 核心定义

### 2.1 `takeover`

定义：

- 将当前自动执行流程切换为人工处理模式的正式动作

表现为：

- `Execution.status=human_control`
- `RuntimeSession.state=frozen`
- `RuntimeSession.control_mode=HUMAN_CONTROL`

### 2.2 `freeze`

定义：

- 停止 Agent 对 Runtime 的自动推进

目标：

- 阻止自动继续执行高风险或不确定动作
- 保留当前浏览器会话和页面上下文
- 允许人工通过可视化入口进入同一会话

### 2.3 `resume`

定义：

- 在人工处理结束后恢复自动执行

目标：

- 将控制权切回 Agent
- 从指定 step 或下一待执行 step 继续

---

## 3. 设计原则

### 3.1 接管是正式状态，不是异常补丁

- 接管必须进入正式状态机
- 接管必须有明确进入原因和退出方式
- 接管必须被审计记录

### 3.2 Freeze 优先于接管 UI

- 先冻结 Runtime，后暴露人工入口
- 禁止在未冻结时直接开放人机同时写入浏览器

### 3.3 单控制者原则

任一时刻只允许一个主控制者：

- `AGENT_RUNNING`
- `HUMAN_CONTROL`

禁止：

- Agent 和 Human 同时对同一会话进行写操作

### 3.4 恢复必须显式确认

- Human 处理完成后必须明确点击 resume
- 不允许系统自动猜测“人已经处理完”

---

## 4. 触发条件

第一阶段建议支持以下接管触发类型：

### 4.1 风险型触发

例如：

- 检测到高风险提交动作
- 检测到对外发送动作
- 命中策略要求人工确认

### 4.2 不确定性触发

例如：

- 验证码
- 未知弹窗
- 关键页面结构变化
- 定位失败但页面仍可见

### 4.3 显式人工触发

例如：

- 用户主动点击“请求接管”
- 审批处理人要求人工介入

---

## 5. 状态模型

## 5.1 `Execution`

接管相关状态：

- `running`
- `human_control`
- `cancelled`
- `failed`

关键规则：

- `running -> human_control`
- `human_control -> running`
- `human_control -> cancelled`

## 5.2 `RuntimeSession`

接管相关状态：

- `busy`
- `frozen`
- `closed`
- `error`

关键规则：

- `busy -> frozen`
- `frozen -> busy`
- `frozen -> closed`
- `frozen -> error`

## 5.3 `RuntimeSession.control_mode`

- `AGENT_RUNNING`
- `HUMAN_CONTROL`

---

## 6. 协议参与方

### 6.1 `skill-control-plane`

职责：

- 持有 `Execution.status`
- 接收接管请求和恢复请求
- 对 Portal 暴露统一入口

### 6.2 `runtime-manager`

职责：

- 冻结和恢复 RuntimeSession
- 维护 `RuntimeSession.state` 和 `control_mode`
- 返回接管连接信息

### 6.3 `browser-runtime`

职责：

- 停止 Agent 自动输入
- 保留浏览器会话
- 提供 noVNC / 受控浏览器接入点

### 6.4 `skill-orchestrator`

职责：

- 在 freeze 后停止推进后续 step
- resume 后从指定位置继续

### 6.5 `Portal`

职责：

- 展示接管原因和入口
- 让用户在 Execution 页面进入内联接管/恢复区
- 发起 resume

---

## 7. 接管握手流程

## 7.1 自动触发接管

```text
browser-runtime
  -> detects takeover condition
  -> returns shouldTakeover=true, takeoverReason

skill-orchestrator
  -> stops scheduling next step
  -> requests runtime-manager freeze

runtime-manager
  -> freeze runtime session
  -> state=frozen
  -> control_mode=HUMAN_CONTROL

skill-control-plane
  -> Execution.status=human_control
  -> writes execution_event

Portal
  -> polls execution detail
  -> shows takeover entry
```

## 7.2 人工请求接管

```text
Portal
  -> POST /executions/{id}/takeover

skill-control-plane
  -> validates execution state
  -> asks runtime-manager to freeze
  -> updates Execution.status=human_control
  -> returns success
```

## 7.3 恢复执行

```text
Portal
  -> POST /executions/{id}/resume

skill-control-plane
  -> validates execution is in human_control
  -> asks runtime-manager to resume
  -> asks skill-orchestrator to resume execution
  -> updates Execution.status=running
```

---

## 8. Freeze 协议详细要求

### 8.1 Freeze 前置条件

- `Execution.status=running`
- `RuntimeSession.state=busy`
- 当前会话仍健康可接管

### 8.2 Freeze 动作要求

freeze 成功后必须满足：

- Agent 不再注入新的浏览器动作
- 当前页面上下文被保留
- noVNC 或受控浏览器入口仍可访问
- `RuntimeSession.state=frozen`
- `RuntimeSession.control_mode=HUMAN_CONTROL`

### 8.3 Freeze 幂等要求

- 对同一 `RuntimeSession` 重复 freeze 不得导致状态错乱
- 若已是 `frozen`，可返回幂等成功或明确冲突错误，但语义必须固定

---

## 9. Resume 协议详细要求

### 9.1 Resume 前置条件

- `Execution.status=human_control`
- `RuntimeSession.state=frozen`
- 当前用户具有 resume 权限

### 9.2 Resume 动作要求

resume 成功后必须满足：

- RuntimeSession 从 `frozen -> busy`
- `control_mode` 从 `HUMAN_CONTROL -> AGENT_RUNNING`
- orchestrator 恢复 step 推进
- Execution 从 `human_control -> running`

### 9.3 Resume 目标

resume 时允许两种模式：

- 指定 `stepId` 恢复
- 从系统判断的下一个待执行 step 恢复

第一阶段建议：

- 优先支持指定 `stepId`

### 9.4 Resume 幂等要求

- 若 Execution 不在 `human_control`，不得重复推进状态
- 若 RuntimeSession 不在 `frozen`，不得执行 resume

---

## 10. 连接与会话要求

### 10.1 连接信息

`RuntimeSession.connection_info` 建议至少包含：

- `novncUrl`
- `wsEndpoint`
- `debuggerUrl`

第一阶段可由后端返回其中一部分，不要求全部实现。

### 10.2 连接生命周期

- 接管连接仅在 `human_control` 期间有效
- 执行结束后连接应失效
- Runtime 被关闭后不应继续暴露旧连接

### 10.3 单活用户要求

第一阶段建议：

- 同一时刻仅允许一个人工接管操作者

若多个用户同时打开同一 Execution 的内联接管/恢复区：

- 只允许一个用户拥有恢复执行权限

---

## 11. 安全与权限约束

### 11.1 接管权限

以下用户可进入接管：

- 执行发起人
- 被授权处理人
- 管理员

### 11.2 Resume 权限

以下用户可 resume：

- 当前接管处理人
- 管理员

### 11.3 安全要求

- 接管链接不能长期有效
- 连接凭证必须受控
- 不应将底层 worker 内网地址直接暴露给终端用户

---

## 12. 事件记录要求

每次接管主流程建议记录以下事件：

- `step.takeover_requested`
- `runtime.frozen`
- `execution.human_control.entered`
- `runtime.connection.issued`
- `execution.resumed`
- `runtime.resumed`

事件字段建议包含：

- `executionId`
- `runtimeSessionId`
- `stepId`
- `reason`
- `actor`
- `createdAt`

---

## 13. 错误与异常处理

## 13.1 Freeze 失败

可能原因：

- Runtime 已失联
- 当前状态不允许 freeze
- worker 无法停止 Agent 输入

建议处理：

- Execution 可进入 `failed` 或保留 `running` 并提示手动重试，具体策略需固定
- 必须写入事件日志

### 推荐第一阶段策略

- 如果 Runtime 已失联，直接判定为 `failed`
- 如果只是重复 freeze，按幂等处理

## 13.2 接管连接失败

可能原因：

- noVNC 服务异常
- 浏览器会话已关闭
- 连接信息过期

建议处理：

- 页面提示“接管入口不可用”
- 允许用户刷新状态
- 必要时允许管理员重新触发接管或直接取消执行

## 13.3 Resume 失败

可能原因：

- Runtime 仍未恢复
- stepId 无效
- orchestrator 无法继续推进

建议处理：

- Execution 保持 `human_control`
- 明确提示用户未成功恢复
- 不得假装恢复成功

---

## 14. Portal 交互要求

### 14.1 ExecutionDetailPage

在 `human_control` 状态下必须展示：

- 接管原因
- 显示内联接管/恢复区
- 当前 step
- 提示“系统已暂停自动执行”

### 14.2 Execution 页面内联接管/恢复区

必须展示：

- 当前接管原因
- 当前浏览器入口
- 恢复执行按钮

必须提示：

- 恢复后系统会继续自动执行
- 如果未处理完成，不应点击 resume

---

## 15. MVP 范围内的简化

第一阶段可以接受的简化：

- 先只支持浏览器类 Runtime
- 先只支持单接管人
- 先用轮询，不强制 WebSocket 推送
- 先不做复杂接管会话转移

第一阶段不建议缺失：

- freeze/resume 正式状态流转
- 接管原因记录
- 接管事件审计
- Resume 前显式确认

---

## 16. 验收标准

### 16.1 接管触发

- 当 step 返回 `shouldTakeover=true` 时，可稳定进入 `human_control`

### 16.2 接管连接

- 用户能从 Portal 进入接管入口

### 16.3 Resume

- 用户处理后可点击 resume
- 状态可从 `human_control -> running`

### 16.4 审计

- 整个 freeze / takeover / resume 流程有事件记录

---

## 17. 与现有文档关系

- 运行时治理：见 `Enterprise-Skill-Platform_Runtime-and-Policy_v2.0.md`
- 执行状态机：见 `Enterprise-Skill-Platform_Execution-Lifecycle-RFC_v2.0.md`
- 主链路蓝图：见 `archive/Enterprise-Skill-Platform_MVP-Implementation-Blueprint_v2.0.md`
- Portal 页面流：见 `archive/Enterprise-Skill-Platform_Portal-UX-and-Page-Flow-Spec_v2.0.md`

本文定位是“接管协议实施规范”，用于统一 Runtime、Portal 和 control-plane 在人工接管链路上的行为约束。
