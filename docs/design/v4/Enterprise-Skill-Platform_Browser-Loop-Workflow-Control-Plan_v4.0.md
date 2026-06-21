# 企业级 Skill 平台 Browser Loop Workflow 控制改造方案

**Browser Loop Workflow Control Plan v4.0**  
日期：2026-06-20

> 本文定义 browser recording skill 在存在 `loopDraft` 时的目标执行模型。  
> 目标是在保留 `loop` 正确语义的同时，让每一个浏览器步骤继续作为 `activity` 暴露给 workflow，支持截图、审计、人工接管、接管后从具体步骤恢复。

---

## 1. 文档目标

本文回答以下问题：

- 为什么当前 `direct skill -> browser runtime` 方案不满足业务要求
- 为什么“loop 由 runtime 控制”不适合需要逐步可见和人工介入的 browser workflow
- browser loop 的正确职责边界应该如何划分
- 如何把 `loopDraft` 编译成 workflow 可执行计划，而不是退回到旧的线性 phase 重写
- control-plane、platform、browser runtime、前端展示分别需要改什么
- 如何平滑从当前实现迁移到“loop 由 workflow 控制、step 仍是 activity”的目标模型

---

## 2. 背景与问题

### 2.1 现状

当前链路存在两种执行模式：

- 旧模式
  - browser recording skill 被 `control-plane` 改写为多个线性 `workflow_activity`
  - 优点是每一步都有 phase / step 记录
  - 缺点是不理解 `loopDraft`
- 新修复中的过渡模式
  - 当 skill 带 `loopDraft` 时，`control-plane` 直接改为单个 `system_skill`
  - 由 browser recording runtime 读取 `loopDraft` 并在 runtime 内部循环
  - 优点是 `loop` 语义能真正执行
  - 缺点是外层 workflow 失去 step 级可见性

### 2.2 当前过渡模式的核心问题

对业务来说，browser execution 不只是“最终跑完即可”，还要求：

- 每一步都能看见
- 每一步都能挂截图和页面状态
- 每一步都能审计
- 中途能人工接管
- 接管后能从当前步骤继续
- loop 每一轮的执行都能在 workflow 中被追踪

而当前 `direct skill -> browser runtime` 的模型只能满足：

- `loopDraft` 被消费
- runtime 内部拿到完整 skill 语义

但无法把以下能力作为 workflow 一等公民暴露出来：

- 当前运行到第几轮
- 当前轮的第几步
- 哪一步触发人工介入
- 接管后从哪一步恢复
- 哪一步产出了截图、断言、失败、重试

### 2.3 目标要求

目标不是“回退到旧模式”，而是升级为第三种模式：

- `loop` 由 workflow / control-plane 控制
- 每一个浏览器原子步骤仍然是 activity
- browser runtime 只执行单步，不再吞掉整轮 loop
- workflow 维护 iteration state、stop condition、人工接管与恢复点

---

## 3. 设计结论

### 3.1 最终职责边界

- `control-plane / workflow`
  - 解析 `loopDraft`
  - 构建 loop-aware execution plan
  - 控制迭代状态
  - 记录每一步 activity
  - 决定继续下一轮、结束、失败、人工接管、接管后恢复
- `platform / browser runtime`
  - 执行单个 browser activity
  - 返回单步截图、页面状态、提取值、错误、建议接管信号
  - 复用已有 browser session
  - 不负责控制整轮 loop
- `portal / user-web`
  - 展示 loop 轮次
  - 展示每轮 step 列表
  - 展示人工接管挂点
  - 展示恢复位置与恢复后的继续执行轨迹

### 3.2 最终模型

对于带 `loopDraft` 的 browser skill：

- 外层不是一个 `system_skill` 吞掉全部流程
- 外层也不是简单的 7 个线性 `workflow_activity`
- 外层应是一个 `loop-aware workflow`
  - 预循环步骤：逐步 activity
  - 循环体步骤：逐步 activity
  - 终止判断：workflow 控制节点
  - 后循环步骤：逐步 activity

### 3.3 为什么不能继续让 runtime 控 loop

如果 loop 继续由 runtime 控制，会带来结构性问题：

- workflow 看不到轮次边界
- workflow 看不到 step 级恢复点
- 人工接管只能落在 runtime 内部，而不是标准 phase/activity 边界
- 重试只能重试整个 skill，而不是当前 step
- 执行审计不能自然复用现有 `execution_steps / execution_phases` 模型

因此，runtime 控 loop 只适合“黑盒执行”；不适合“长流程、逐步可见、可接管”的 browser workflow。

---

## 4. 目标架构

### 4.1 总体链路

目标链路如下：

1. 发布后的 browser skill 仍保留 `executionPlan.loopDraft`
2. `control-plane` 在创建 execution 时识别 `loopDraft`
3. `control-plane` 将 `loopDraft` 编译为 `loop-aware plan`
4. `ExecutionFlowRunnerService` 根据 plan 顺序调度 step activity
5. 每个 browser step 通过统一 step runtime 协议调用 browser runtime
6. workflow 在本地维护 `loopContext`
7. 每轮结束后 workflow 评估 stop condition
8. 若满足停止条件则退出 loop，否则进入下一轮
9. 任一步触发 takeover 时，workflow 挂起在当前 activity
10. takeover 结束后，从当前 activity 继续

### 4.2 核心原则

- session 由 workflow 持有，而不是 loop 由 runtime 持有
- step 是最小可接管、可重试、可审计边界
- loop condition 是 workflow 状态，不是 runtime 私有状态
- runtime 返回证据，workflow 决定控制流
- 浏览器 skill 的可见性优先于内部黑盒执行便利性

---

## 5. 目标数据模型

### 5.1 Execution 级新增字段

建议在 `Execution` 或 `normalizedInput/current_state` 里持久化：

- `runtimeSourceType`
- `loopMode`
- `loopStatus`
- `currentLoopIteration`
- `maxLoopIterations`
- `loopStopReason`
- `loopContextJson`

`loopContextJson` 建议包含：

```ts
interface BrowserLoopContext {
  loopId: string;
  iteration: number;
  maxIterations: number;
  stopWhen?: BrowserLoopCondition;
  lastExtractedValues?: Record<string, unknown>;
  lastDecision?: {
    shouldContinue: boolean;
    reason: string;
  };
  takeoverState?: {
    pending: boolean;
    phaseKey?: string;
    stepId?: string;
  };
}
```

### 5.2 ExecutionPhase / ExecutionStep 扩展字段

建议增加以下上下文字段：

- `loopId`
- `loopIteration`
- `loopSegment`
  - `pre_loop`
  - `iteration`
  - `post_loop`
- `loopStepId`
- `resumeFromTakeover`

这样每一步 activity 都能被归入具体轮次。

### 5.3 新增 Loop 控制节点

workflow 中需要显式存在非浏览器步骤的控制节点：

- `loop_init`
- `loop_eval_before_iteration`
- `loop_eval_after_iteration`
- `loop_continue`
- `loop_break`

这些节点不是 browser activity，但要进入执行轨迹，方便审计和恢复。

---

## 6. Plan 编译模型

### 6.1 输入

编译输入来自已发布 skill 的：

- `executionPlan`
- `loopDraft`
- `templateSteps`
- `loopPlanPreview`

### 6.2 输出

输出不是当前的：

- 线性 `workflow_activity[]`

也不是：

- 单个 `execute_selected_skill`

而是：

```ts
interface CompiledBrowserLoopPlan {
  planType: 'browser_loop_workflow';
  browserSessionPolicy: {
    reuseSession: true;
    createOnStart: true;
    closeOnComplete: true;
  };
  preLoopSteps: BrowserWorkflowActivityStep[];
  iterationSteps: BrowserWorkflowActivityStep[];
  postLoopSteps: BrowserWorkflowActivityStep[];
  controlSteps: BrowserLoopControlStep[];
  stopCondition: BrowserLoopCondition;
}
```

### 6.3 编译规则

编译时遵循：

- 预循环步骤展开为普通 browser activities
- 循环体步骤展开为带 `loopSegment=iteration` 的 browser activities
- 后循环步骤展开为普通 browser activities
- `stopWhen` 相关表达式编译为 workflow 可评估条件
- 需要读取页面值的 stop condition，必须有显式 `extract/assert/read` activity 提供输入

### 6.4 示例

假设模板步骤如下：

- `step_1` 打开审批页
- `step_2` 输入用户名
- `step_3` 输入密码
- `step_4` 点击登录
- `step_5` 打开待办列表
- `step_6` 点击第一条待办
- `step_7` 读取状态文本
- `step_8` 判断是否仍需审批
- `step_9` 点击同意
- `step_10` 点击确认

编译后应成为：

```text
phase_01_step_1
phase_02_step_2
phase_03_step_3
phase_04_step_4
phase_05_step_5
phase_06_loop_init
phase_07_loop_eval_before_iteration
phase_08_iter_1_step_6
phase_09_iter_1_step_7
phase_10_iter_1_step_8
phase_11_iter_1_step_9
phase_12_iter_1_step_10
phase_13_loop_eval_after_iteration
phase_14_iter_2_step_6
...
phase_N_loop_break
phase_N1_post_loop_step_x
```

这里的重点不是“预先生成 100 轮 phase”，而是：

- plan 知道 iteration template
- workflow 在运行时逐轮展开
- 已执行的轮次会被真正写入 `execution_phases / execution_steps`

---

## 7. Workflow 执行模型

### 7.1 执行状态机

建议引入以下状态机：

```text
INIT
-> PRE_LOOP
-> LOOP_EVAL_BEFORE
-> ITERATION_RUNNING
-> LOOP_EVAL_AFTER
-> LOOP_CONTINUE | LOOP_BREAK
-> POST_LOOP
-> COMPLETED
```

中断分支：

```text
ITERATION_RUNNING -> TAKEOVER_PENDING -> TAKEOVER_ACTIVE -> RESUME_STEP -> ITERATION_RUNNING
ITERATION_RUNNING -> FAILED
LOOP_EVAL_* -> FAILED
```

### 7.2 调度原则

- workflow 一次只调度一个 browser activity
- 每个 activity 执行后立刻落库其 output、snapshot、artifact
- stop condition 只在 workflow 节点上评估
- workflow 绝不向 runtime 传“执行整个 loop”的请求

### 7.3 Session 复用

浏览器上下文必须跨 activity 保留，因此建议：

- 在 execution 开始时创建 `runtimeSessionId`
- 所有 iteration steps 复用同一个 `runtimeSessionId`
- takeover 期间同样保持 session
- 只有在 execution 完成、取消、超时、人工终止时才释放

### 7.4 恢复语义

恢复必须以“当前 activity”为边界，而不是以“整个 skill”为边界：

- step 失败后，可重试当前 step
- step 触发 takeover 后，可从该 step 重试或人工完成后跳过
- iteration 中断后，恢复到最后未完成 step
- 不允许 resume 语义退化成“重新从整轮 loop 开始”

---

## 8. Runtime 协议改造

### 8.1 Browser runtime 的职责收敛

browser runtime 需要从“可执行整份 browser skill”收敛为“优先执行单步 activity”：

- 保留整份 skill 执行能力，仅用于模板测试页或兼容链路
- 新 workflow 链路统一调用单步协议

### 8.2 新的单步请求结构

建议在现有 `RuntimeStepInvokeRequest` 上明确 browser step 请求模型：

```ts
interface BrowserActivityInvokeInput {
  executionId: string;
  runtimeSessionId: string;
  stepId: string;
  stepIndex: number;
  stepName: string;
  loopContext?: {
    loopId?: string;
    iteration?: number;
    segment?: 'pre_loop' | 'iteration' | 'post_loop';
  };
  command: BrowserCommand;
  input: Record<string, unknown>;
  verification?: BrowserStepVerification;
}
```

### 8.3 返回结果结构

```ts
interface BrowserActivityInvokeResult {
  status: 'completed' | 'failed' | 'takeover_required';
  output?: Record<string, unknown>;
  pageState?: Record<string, unknown>;
  snapshot?: SnapshotRef;
  artifacts?: ArtifactRef[];
  extractedValues?: Record<string, unknown>;
  suggestedNextAction?: 'retry' | 'takeover' | 'abort';
  error?: {
    code: string;
    message: string;
  };
}
```

### 8.4 明确禁用的旧语义

对 workflow 链路，必须禁用以下 runtime 语义：

- `executionStepIndex/name` 被解释为“从整份 skill 中挑一个 step 执行”
- runtime 私自识别 `loopDraft` 后自行展开整轮 loop
- runtime 在单步执行接口中返回整份 skill trace 作为主结果

这些语义只保留给旧兼容模式或模板测试模式。

---

## 9. 人工介入模型

### 9.1 接管触发点

以下场景应支持在当前 activity 触发 takeover：

- 定位器失配但页面上下文仍可识别
- 出现验证码 / 二次认证
- 页面弹窗与模板预期不一致
- 业务数据异常，需要人工决定继续还是结束

### 9.2 接管对象

takeover 必须绑定到：

- `executionId`
- `phaseKey`
- `stepId`
- `runtimeSessionId`
- `loopIteration`

不能只绑定到整个 execution。

### 9.3 接管后恢复

接管完成后，用户应可选择：

- 重试当前 step
- 标记当前 step 已人工完成并继续下一步
- 终止当前 iteration
- 结束整个 execution

workflow 负责把这些决策转译为控制流，而不是让 runtime 私自猜测。

---

## 10. 前端展示改造

### 10.1 Execution Detail

执行详情页需要新增：

- loop 总览
  - loop 模式
  - 当前轮次
  - 最大轮次
  - 停止原因
- 轮次分组视图
  - `pre_loop`
  - `iteration 1`
  - `iteration 2`
  - `post_loop`
- step 级证据
  - 截图
  - 页面 URL
  - 提取结果
  - 是否人工介入

### 10.2 执行列表页

执行列表页建议展示：

- `browser`
- `loop x/y`
- 当前 step
- takeover 状态

并避免把普通页面 URL 误显示成“下载结果”。

### 10.3 接管 UI

接管面板应展示：

- 当前 iteration
- 当前 step
- 上一步截图
- 当前页面 live view
- 恢复选项

---

## 11. 代码改造范围

### 11.1 control-plane

重点改造：

- `execution-planning.service.ts`
  - 不再把带 `loopDraft` 的 browser skill 改成单个 `execute_selected_skill`
  - 改为编译 `CompiledBrowserLoopPlan`
- `execution-plan-normalization.service.ts`
  - 新增 `buildBrowserLoopWorkflowPlanDraft()`
  - 新增 loop-aware step/phase 标准结构
- `execution-flow-runner.service.ts`
  - 新增 loop 状态机调度
- `execution-step-executor.service.ts`
  - 支持 browser activity 和 loop control step 的不同执行路径
- `browser-phase.executor.ts`
  - 从“执行一组 commands”收敛为“执行单个 browser activity”或演进为更通用的 `browser-activity.executor.ts`
- `runtime-step-request.factory.ts`
  - browser workflow 模式下明确生成单步 browser activity 请求

### 11.2 platform

重点改造：

- `capability-release-browser-recording.service.ts`
  - 保留整份 skill 执行能力给兼容链路
  - 新增或拆出单步 browser activity 执行服务
- runtime execute API
  - 区分 `execute_skill` 与 `execute_browser_activity`

### 11.3 browser worker / ai-orchestrator

重点改造：

- 保持 session 跨 step 生命周期稳定
- 为每一步返回标准 snapshot / artifact / extractedValues
- 人工接管后可继续使用原 session

### 11.4 portal / user-web

重点改造：

- execution timeline 增加 loop 轮次视图
- step 级证据展示
- takeover 恢复操作入口
- 避免 URL 被误识别为下载链接

---

## 12. 迁移策略

### 12.1 Phase 1: 引入 loop-aware plan，但保留旧兼容模式

目标：

- 新增 plan 编译结构
- 不立即删除旧的 direct skill 路径
- 通过 feature flag 控制：
  - `browser_loop_workflow_enabled`

### 12.2 Phase 2: 浏览器单步执行协议落地

目标：

- browser runtime 支持单步 activity 执行
- session 跨 step 稳定复用
- 单步返回统一结果结构

### 12.3 Phase 3: workflow loop 状态机落地

目标：

- workflow 逐轮调度 iteration steps
- stop condition 在 workflow 中评估
- 执行轨迹完整写入 phases / steps

### 12.4 Phase 4: takeover 与 resume 绑定到 step

目标：

- 接管绑定到 `loopIteration + stepId`
- 接管结束后从当前 step 继续

### 12.5 Phase 5: 前端视图与旧路径收敛

目标：

- execution 详情支持 loop 轮次视图
- execution 列表支持当前轮次和当前 step
- 移除对带 loop 的 browser skill 的 direct skill 过渡方案

---

## 13. 风险与应对

### 13.1 风险：session 在多 step / 多 iteration 中丢失

应对：

- 引入 session lease / heartbeat
- execution 结束前不主动释放 browser session
- 在 resume 场景验证 session 可继续使用

### 13.2 风险：loop 条件依赖 runtime 私有结果，难以 workflow 化

应对：

- 把 stop condition 依赖的数据显式提升为 `extract/assert` activity 输出
- 不允许 workflow 依赖 runtime 私有 trace 字段

### 13.3 风险：执行记录数量显著增加

应对：

- step 证据做分层存储
- timeline 默认折叠 iteration
- 仅关键截图做首屏加载

### 13.4 风险：旧链路与新链路并存导致行为分叉

应对：

- 使用 feature flag 精确切流
- 对同一 skill 明确标记执行模式
- 为两种模式分别补回归测试与 runbook

---

## 14. 验收标准

改造完成后，以下场景必须成立：

- 带 `loopDraft` 的 browser skill 正式 execution 中，每一步都是独立 activity
- execution timeline 能看到 `iteration 1/2/3...`
- 任一步失败时，能看到该步截图和页面状态
- 任一步触发 takeover 时，接管记录绑定到具体 `stepId + iteration`
- takeover 结束后，可从当前 step 继续，而不是整轮重跑
- stop condition 由 workflow 决定，不由 runtime 黑盒决定
- 普通无 loop 的 browser skill 不回归
- 模板测试页可继续使用整份 skill 执行模式，不影响现有调试体验

---

## 15. 推荐实施顺序

建议按以下顺序推进：

1. 先冻结当前过渡方案，仅作为短期止血路径
2. 设计 `CompiledBrowserLoopPlan` 数据结构并落库
3. 拆出 browser 单步 activity runtime 协议
4. 在 control-plane 实现 loop 状态机与 iteration 写路径
5. 接入 takeover/resume 到 step 粒度
6. 最后补前端 loop 轮次视图与证据展示

---

## 16. 最终结论

对于“既要 `loop` 正确，又要每一步可见，并支持中途人工介入”的 browser workflow，最终方案应当是：

- `loop` 由 workflow / control-plane 控制
- 每一个浏览器步骤仍然是 activity
- browser runtime 只执行单步并返回证据
- session 跨 step / iteration 复用
- takeover 与 resume 绑定到具体步骤，而不是绑定到整份 skill

这不是回退到旧的线性 phase 方案，而是把当前 browser recording skill 升级为：

- 支持 loop 语义
- 支持 step 级可见性
- 支持人工接管
- 支持接管后恢复

的完整 workflow 执行模型。

---

## 17. 官网语义对齐结论

本节用于校验本方案是否符合 Temporal 官方对 `Workflow`、`Activity`、长循环、人工交互的推荐模式。

### 17.1 Workflow 与 Activity 的官方职责

Temporal 官方对两者职责区分非常明确：

- `Workflow`
  - 持有流程状态
  - 编排步骤顺序
  - 决定失败、重试后的控制流
  - 处理外部消息
- `Activity`
  - 执行单个、定义明确的动作
  - 可以非确定
  - 可以失败并被重试
  - 结果返回给 workflow，由 workflow 决定后续逻辑

这与本方案一致：

- browser loop 的状态、轮次、恢复点应在 workflow
- browser runtime 应收敛为单步 activity 执行器

### 17.2 人工介入的官方模式

Temporal 官方把外部交互定义为 `Signals / Updates / Queries`：

- `Signal`
  - 异步写入 workflow 状态
- `Update`
  - 同步写入 workflow 状态并等待结果
- `Query`
  - 只读查看 workflow 当前状态

对本项目的含义是：

- 人工接管不应挂在一个黑盒 runtime 内部私有状态机上
- takeover / approve / resume / skip / abort 应作为 workflow message 进入 workflow
- workflow 应基于当前 `iteration + stepId + session` 决定恢复路径

### 17.3 长循环与历史控制

Temporal 官方明确提醒长 workflow 要关注 Event History 大小，并在必要时使用 `Continue-As-New`。

对本项目的含义是：

- browser loop 一旦改为“每一步都是 activity”，history 增长会显著快于当前黑盒 runtime 模式
- 当轮次较多、步骤较多、人工交互较多时，应引入：
  - history 监控阈值
  - `Continue-As-New`
  - 把当前 `loopContext`、`runtimeSessionRef`、`resumePointer` 作为 continuation state 传递

### 17.4 Activity Heartbeat 的边界

Temporal 官方允许长 Activity 通过 heartbeat 上报进度、接收取消并在重试时恢复最后的 heartbeat details。

但这类机制更适合：

- 单个长 activity 内部的进度保护
- worker 崩溃后的粗粒度恢复

不适合作为本项目 browser loop 的主控制机制，因为它无法天然提供：

- workflow 级 iteration timeline
- step 级审计与可见性
- step 级人工接管挂点
- step 级恢复语义

### 17.5 官方语义下的最终判断

如果本项目目标只是“把 loop 执行正确”，则：

- 单个 runtime 黑盒执行整份 browser skill 也是可行路径

如果本项目目标是：

- loop 正确
- 每一步可见
- 中途人工介入
- 接管后从具体步骤恢复

则更符合 Temporal 官方语义的模式应为：

- workflow 控制 loop
- step 作为 activity 执行
- 人工交互通过 signal/update 注入 workflow
- 长循环通过 continue-as-new 控制 history

---

## 18. 对“声明式 DSL + 解释器模式”方案的评价

本节评价如下方案：

- 引入声明式浏览器工作流 DSL
- 使用结构化 JSON 表达 action / conditional / loop
- 用解释器模式替代 `new Function` 动态执行字符串条件

### 18.1 结论

整体方向是对的，但必须调整职责边界。

这份方案最值得保留的部分是：

- 使用声明式 DSL 替代动态 JS 条件字符串
- 使用策略模式替代 `eval / new Function`
- 显式建模条件、循环、局部变量与执行上下文
- 为 takeover / resume 预留上下文序列化能力

这份方案最需要调整的部分是：

- 不应把完整控制流引擎主要下沉到 `browser-worker`
- 不应让 loop 的主控制权停留在浏览器执行端解释器里
- 不应把“每一步都是 activity”的需求退化成“worker 内部解释执行多步”

### 18.2 哪些判断是正确的

以下判断是正确且应该采纳的：

- `new Function` 或 `eval` 不适合作为条件执行主方案
  - 可维护性差
  - 安全边界弱
  - 难以做版本化与审计
- 自然语言到结构化 DSL 比自然语言到 JS 字符串更稳定
- 条件运算符做成白名单策略更利于扩展和测试
- `ExecutionContext` 作为变量与作用域承载体是必要的
- takeover/resume 要求上下文可序列化，这一点非常关键

### 18.3 哪些地方要改

#### 18.3.1 DSL 应作为“编排 IR”，而不是直接等于 worker 运行时

当前方案默认：

- AI 产出 DSL
- browser-worker 直接解释整个 DSL

这对“黑盒执行”是合理的，但不适合本项目当前要求。

更合适的方式是：

- DSL 作为统一编排中间表示（IR）
- `control-plane` 负责把 DSL 编译为 workflow-aware execution plan
- `browser-worker` 只负责执行编译后的单步 activity

也就是说：

- DSL 可以保留
- Interpreter 也可以保留
- 但 interpreter 的主位置不应是“吞掉整轮 loop 的 browser-worker”
- 应拆成：
  - planner/compiler interpreter
  - step executor runtime

#### 18.3.2 LoopStep 不应直接由 worker 主导整个循环

原方案中的：

- `LoopStepExecutor`
- `countElements()`
- `for (...) executeStep(subStep)`

意味着 loop 的主控制在 worker。

这会直接损失：

- workflow 级轮次可见性
- 每一步 activity 落库
- step 级接管与恢复
- workflow message 驱动的人工操作

因此：

- `LoopStep` 可以保留在 DSL 层
- 但实际运行时应由 workflow 展开 iteration
- worker 不应在一次 activity 内部吞掉整个 loop

#### 18.3.3 条件判断应尽量基于显式 step 输出，而不是隐式页面读取

原方案中条件可以直接从：

- `element`
- `variable`

读取。

方向没错，但要注意边界：

- 若 stop condition 依赖页面值，建议先有显式 `extract` / `assert` step
- workflow 再基于 step 输出做条件判断

不建议让 workflow 层条件过度依赖 worker 侧临时 DOM 查询，因为这会导致：

- 条件来源不透明
- 审计困难
- 恢复时状态重建复杂

推荐模式是：

- step 负责采集证据
- workflow 负责解释控制流

#### 18.3.4 ExecutionContext 需要可持久化、可版本化

原方案提出作用域链和子上下文，这个方向是正确的。

但在 Temporal/长流程场景下，还要补充：

- 上下文必须可 JSON 序列化
- 上下文字段必须可版本迁移
- 上下文不能保存不可重建的 DOM handle / Playwright 对象实例
- 上下文里应保存可恢复引用：
  - `runtimeSessionId`
  - `loopIteration`
  - `currentStepId`
  - `iteratorBindings`
  - `lastExtractedValues`

### 18.4 建议的重构落点

把这份方案改造成适合本项目的版本后，推荐分成四层：

- `Authoring DSL`
  - AI/录制器输出的声明式浏览器流程
- `Compiler / Planner IR`
  - control-plane 将 DSL 编译为 loop-aware workflow plan
- `Workflow State Machine`
  - workflow 控制 iteration、branch、takeover、resume
- `Browser Step Runtime`
  - browser-worker 执行单个 action / extract / assert activity

对应关系应为：

- `ConditionalStep`
  - 编译为 workflow condition node
- `LoopStep`
  - 编译为 workflow iteration template
- `ActionStep`
  - 编译为 browser activity

### 18.5 对当前代码库的具体建议

结合当前仓库现状，建议如下：

- 在 `ai-orchestrator` 中逐步废弃基于 `new Function` 的条件执行
- 保留 DSL 方向，但把其定义上收为共享协议层
- 不让 `PlaywrightCliAdapter` 直接演进成完整流程引擎
- 让 browser worker 只负责单步执行和证据返回
- 把 branch / loop 的主解释权放到 control-plane workflow

### 18.6 最终评价

这份“声明式 DSL + 解释器模式”方案：

- 在“替换动态代码执行、提升可维护性、安全性、可测试性”这件事上，方向正确
- 在“自然语言控制浏览器的表达层”上，值得采用
- 但在“控制流应该主要运行在哪一层”上，需要按本项目目标做关键修正

最终推荐不是：

- `browser-worker` 解释整份 loop/if workflow

而是：

- DSL 负责表达业务控制流
- workflow 负责解释控制流和持久化状态
- browser-worker 负责执行单步 activity

只有这样，才能同时满足：

- loop 正确
- 每步可见
- 可人工接管
- 接管后恢复
- 长流程可维护

### 18.7 生成阶段、Release 与运行时的职责边界

针对 browser recording 中的 `loop` / `branch` / `takeover` 场景，需要明确区分三层职责：

- 模板/工作流生成阶段
  - 负责把录制结果、`templateSteps`、`loopDraft`、条件表达式编译成带控制流语义的 workflow plan / IR
- Release 阶段
  - 负责校验这份 plan / IR 是否合法、可发布、可映射为 skill，并将其固化为 skill 可消费的发布产物
- Execution 运行时
  - 负责根据真实页面状态、真实 step 输出和人工介入结果，决定是否继续下一轮 iteration、是否进入 takeover、是否 resume

这里需要特别强调：

- 生成阶段不应把 `repeat_until` 这类循环一次性静态展开为固定 N 轮 activity
- 生成阶段也不能只产出一份线性 Playwright 脚本，然后把 loop/branch 仅作为旁路元数据挂在 skill 上
- 正确做法是：
  - 在生成阶段产出“带循环语义的 workflow 结构”
  - 在 Release 阶段验证并发布这份结构
  - 在运行时按轮次动态展开下一轮 iteration

原因是：

- `repeat_until` 的退出条件依赖运行时页面状态，生成阶段无法提前知道会执行多少轮
- 如果在生成阶段硬编码展开为 `maxIterations` 轮，会导致 workflow 体积膨胀，且难以正确承接 takeover / resume
- 如果只发布线性脚本，则 loop/branch 无法成为真正的 execution truth，最终仍会退化为黑盒运行时

因此，本项目推荐的最终形态不是：

- 生成阶段展开完所有循环
- Release 仅发布一段线性脚本

而是：

- 生成阶段产出 loop-aware workflow skeleton
- Release 发布可被 control-plane / workflow 直接消费的控制流结构
- 运行时基于 `loop_eval`、step output、人工决策动态插入或继续下一轮 activity

从结构上看，生成结果应更接近：

```text
pre_loop activities
loop_init
while (!stop) {
  iteration activity 1
  iteration activity 2
  iteration activity 3
  loop_eval
}
post_loop activities
```

这里的 `while` 不一定必须表现为源码中的 `while` 语句，也可以是：

- workflow DSL 中的 loop node
- compiler IR 中的 iteration template
- control-plane plan 中的 `loop_control + iterationSteps`

关键点不在语法形式，而在于：

- 循环控制权必须属于 workflow / control-plane
- browser worker 只负责单步 activity 执行
- release 发布的必须是“可执行的控制流结构”，而不是“附带 loop 注释的线性 skill”

---

## 19. 现有代码到目标架构的映射

本节把当前仓库中的关键实现映射到目标方案，明确：

- 哪些模块可以保留
- 哪些模块需要收敛职责
- 哪些模块需要上移到 workflow/control-plane
- 哪些模块需要拆分以承接 loop-aware workflow

### 19.1 ai-orchestrator

#### 19.1.1 `recorder-conditional-branch.service.ts`

当前职责：

- 读取页面文本或候选元素
- 调用 `branchAnalysisService`
- 基于条件字符串求值决定是否命中分支
- 在命中时生成下一条浏览器命令

目标职责：

- 不再在运行时直接决定 branch 的最终控制流
- 转为：
  - 生成结构化 branch/condition DSL
  - 输出 compiler/planner 可消费的 IR 片段
  - 保留“读值建议”“候选 selector 建议”“推荐下一动作”的分析能力

建议改造：

- 保留页面观察和候选元素打分能力
- 移除或逐步淘汰基于动态条件字符串的最终判定职责
- 新增共享的 `ConditionExpression` / `BranchSpec` 协议对象
- 将“条件是否成立”的最终判定收敛到 control-plane workflow

最终定位：

- `ai-orchestrator` 提供“控制流分析建议”
- `control-plane` 负责“控制流执行真相”

#### 19.1.2 `recorder-script-export.service.ts`

当前职责：

- 把浏览器录制步骤导出为 Playwright 脚本片段

目标职责：

- 继续承担导出/兼容脚本的能力
- 不作为 workflow 执行真相来源

建议改造：

- 保留“导出脚本”作为调试/回放能力
- 不要让脚本导出逻辑成为 browser loop 编排的核心路径
- browser loop 的正式执行计划应以 DSL/IR 为准，而非脚本文本
- 对外需要明确标注：
  - 导出的 Playwright 脚本只是一份兼容性产物
  - loop / branch / takeover 的执行真相来自 workflow plan，而不是脚本文本
- 当模板已经生成 `templateSteps` / `loopDraft` 时：
  - script export 可以继续导出线性脚本用于调试
  - 但不得把这份线性脚本当作 release 发布物的唯一执行来源

### 19.2 control-plane

#### 19.2.1 `execution-planning.service.ts`

当前职责：

- 识别 browser recording skill
- 在不同条件下把 plan 改写成：
  - 线性 `workflow_activity`
  - 单个 `execute_selected_skill`

问题：

- 当前只在“线性 phase”与“黑盒 direct skill”之间切换
- 还没有第三种“loop-aware workflow”模式

目标职责：

- 新增 browser loop plan compiler 入口
- 将带 `loopDraft` 的 skill 编译为 `CompiledBrowserLoopPlan`
- 不再把 loop 场景降格为单个 black-box skill

建议改造：

- 保留 browser recording 识别逻辑
- 将 `rewriteBrowserRecordingPlanDraftWithActivities()` 拆分为：
  - `detectBrowserRecordingExecutionMode()`
  - `compileBrowserLoopWorkflowPlan()`
  - `buildLegacyBrowserPhasePlan()`
- 增加 feature flag：
  - `browser_loop_workflow_enabled`
- 明确该层的核心职责是：
  - 把模板/录制结果编译为可执行控制流结构
  - 而不是在这里提前静态展开全部 iteration
- 生成结果应包含：
  - loop segment 划分
  - iteration template
  - control node
  - stop condition
  - takeover / resume 所需元数据
- release 之后真正按轮次插入下一轮 step 的动作，不应在此层完成，而应留给 runtime runner

#### 19.2.2 `execution-plan-normalization.service.ts`

当前职责：

- 构建标准 `planDraft`
- 支持 direct skill 的规范化

目标职责：

- 成为 loop-aware workflow IR 的主要构建器

建议新增：

- `buildBrowserLoopWorkflowPlanDraft()`
- `buildBrowserLoopIterationTemplate()`
- `buildBrowserConditionNode()`
- `buildBrowserControlNode()`

建议保留：

- 现有输入归一化与 runtime default 注入能力

#### 19.2.3 `execution-flow-runner.service.ts`

当前职责：

- 顺序推进 `pending step`
- 按 step 类型分发到：
  - browser goto
  - browser phase
  - system skill
  - input collection

问题：

- 目前是简单线性推进器
- 没有 loop state machine

目标职责：

- 升级为 loop-aware workflow runner
- 管理：
  - `pre_loop`
  - `loop_eval_before`
  - `iteration`
  - `loop_eval_after`
  - `loop_continue`
  - `loop_break`
  - `post_loop`

建议改造：

- 保留“找下一步并推进”的主循环框架
- 新增 `loopContext` 持久化读取与写入
- 新增 control node 的分发逻辑
- 支持在运行时按 iteration template 动态生成新 step

#### 19.2.4 `browser-phase.executor.ts`

当前职责：

- 接收 phase commands
- 一次性执行一组 browser commands

问题：

- 这仍然是 phase 级黑盒执行
- 不适合“每一步都是 activity”的最终目标

目标职责：

- 逐步退役为 legacy executor
- 或拆分为：
  - `browser-activity.executor.ts`
  - `browser-control-step.executor.ts`

建议改造：

- 保留旧 phase 兼容路径
- 新 workflow 模式下不要再调用“多 command 一次执行”
- 新增单步 action/extract/assert 的 executor

#### 19.2.5 `runtime-step-request.factory.ts`

当前职责：

- 构建 runtime step 请求
- 已经开始区分 browser 与非 browser 的 step metadata 行为

目标职责：

- 成为 browser single-step activity 请求的唯一构造入口

建议改造：

- 保留现有 browser skill 特殊处理
- 新增：
  - `buildBrowserActionRequest()`
  - `buildBrowserExtractRequest()`
  - `buildBrowserAssertRequest()`
  - `buildBrowserLoopControlRequest()`（若控制节点也需要 runtime 辅助）
- 明确禁止 loop workflow 模式下传递“整份 skill 选择器语义”

#### 19.2.6 `execution-browser-orchestration.service.ts`

当前职责：

- browser execution bootstrap
- 处理 browser step 结果
- 同步 phase

目标职责：

- 保留 browser session bootstrap、step result handling、phase sync 能力
- 但从“phase orchestration”转向“step orchestration”

建议改造：

- 保留 bootstrap goto/session 初始化逻辑
- 增加 loop-aware step result hooks：
  - 写入 `loopIteration`
  - 写入 `loopSegment`
  - 写入 `lastExtractedValues`
- 将 takeover 恢复语义收敛为“当前 step 继续”

### 19.2.7 capability release / published skill 桥接

相关模块：

- `capability-release-browser-recording.service.ts`
- `capability-release-publish.service.ts`
- `capability-release-runtime.service.ts`

当前职责：

- 把 browser recording 模板/导出产物整理为 release source payload
- 做发布前校验
- 生成并发布 skill 可消费的数据

目标职责：

- 成为“验证 + 固化 + 发布”的桥接层
- 确保 release 发布物中包含可执行控制流结构
- 不承担真实 loop 执行、iteration 推进、条件求值真相

建议改造：

- 发布时必须优先保留并透传：
  - `executionPlan.templateSteps`
  - `loopDraft`
  - `loopPlanPreview`
  - branch / extract / takeover 元数据
- 发布校验应验证：
  - loop 结构是否完整
  - 条件表达式是否可解释
  - iteration step 范围是否自洽
  - takeover 节点是否可恢复
- 发布产物应明确区分：
  - `script` / `commands`：兼容或调试用途
  - `executionPlan` / `templateSteps` / `loopDraft`：正式执行真相来源
- 不应在 release 阶段：
  - 预先把 `repeat_until` 展开成固定轮数
  - 生成“已经跑完循环”的静态 skill
  - 用线性脚本覆盖结构化 workflow plan

最终定位：

- 生成阶段负责“产出控制流结构”
- release 阶段负责“验证并发布该结构”
- runtime 阶段负责“根据真实执行结果推进该结构”

### 19.3 browser-worker

#### 19.3.1 `playwright-cli.adapter.ts`

当前职责：

- 管理 session
- 执行各类 CLI browser action
- 采集截图、html、text、snapshot 等证据

优点：

- 已具备单步执行能力
- 已具备 session 生命周期管理能力
- 已具备截图与产物采集能力

目标职责：

- 继续作为单步 browser activity 执行器核心实现
- 不要扩展成整份 workflow 解释器

建议改造：

- 保留 `runCliAction()` 等单步动作能力
- 新增统一的：
  - `executeActionStep()`
  - `executeExtractStep()`
  - `executeAssertStep()`
- 把 selector/runtime target ref 解析留在此层
- 不在此层引入 branch/loop 主状态机

#### 19.3.2 `browser-command.service.ts`

当前职责：

- 对 adapter 做统一封装
- 支持 `executeCommands()` 与 `executeStep()`

目标职责：

- 成为 browser single-step runtime application service

建议改造：

- 保留 adapter registry
- 新 workflow 模式下优先走 `executeStep()`
- `executeCommands()` 保留给模板测试页、兼容路径、脚本回放

#### 19.3.3 `browser-session.service.ts`

当前职责：

- 管理 runtime session 与 adapter 绑定

目标职责：

- 成为 loop-aware workflow 的 session lease/service 基座

建议改造：

- 保留现有 session registry 能力
- 增加长循环场景的：
  - session heartbeat
  - session stale reclaim
  - session continuation handoff

### 19.4 前端

#### 19.4.1 execution timeline 相关页面

目标职责：

- 呈现 workflow 解释后的 loop 轨迹，而不是 runtime 黑盒 trace

建议改造：

- 按 `loopIteration` 分组展示 steps
- 区分：
  - `pre_loop`
  - `iteration`
  - `post_loop`
- 在 step 卡片中展示：
  - screenshot
  - extracted values
  - takeover 状态
  - resume 来源

---

## 20. 第一批实施切面

本节给出最小可执行的第一批工程切面，避免直接做“大一统重构”。

### 20.1 切面 A：先把 DSL/IR 从运行时逻辑中抽出来

目标：

- 明确 `ActionStep / ConditionalStep / LoopStep` 协议
- 不再让 branch/loop 只以字符串脚本或私有对象形式存在

优先动作：

- 新建共享协议文件
- 在 `ai-orchestrator` 和 `control-plane` 共用
- 保持现有执行路径不立即切换

### 20.2 切面 B：在 control-plane 落 loop-aware plan compiler

目标：

- 新增第三种 plan 模式：
  - `browser_loop_workflow`

优先动作：

- `execution-planning.service.ts` 识别并切到新模式
- `execution-plan-normalization.service.ts` 产出 iteration template 与 control nodes

### 20.3 切面 C：让 browser-worker 只承接单步 activity

目标：

- 单步 action/extract/assert 协议稳定

优先动作：

- 明确 `executeStep()` 的输入输出契约
- 将多 command phase 仅保留给兼容链路
- 为单步结果统一返回：
  - snapshot
  - artifacts
  - extractedValues
  - control hints

### 20.4 切面 D：在 execution-flow-runner 引入 loop state machine

目标：

- 先跑通一个最小 loop：
  - pre_loop
  - one iteration template
  - stop condition

优先动作：

- `loop_init`
- `loop_eval_after_iteration`
- `loop_continue / loop_break`
- 动态落库下一轮 steps

### 20.5 切面 E：把 takeover 恢复语义从 execution 级收敛到 step 级

目标：

- takeover 绑定到 `iteration + stepId`

优先动作：

- 扩展 execution/takeover 记录字段
- resume 从“当前 step”恢复
- 前端接管面板显示当前轮次与当前 step

---

## 21. 推荐的第一阶段落地顺序

建议按以下顺序推进第一阶段实现：

1. 定义共享 DSL/IR 协议，不切流量
2. 改造 `execution-planning.service.ts`，产出 `browser_loop_workflow` plan
3. 改造 `execution-flow-runner.service.ts`，支持 loop control nodes
4. 改造 `runtime-step-request.factory.ts`，稳定单步 browser activity 协议
5. 收敛 `browser-worker` 到单步 executor
6. 最后再接 takeover step 级恢复与前端 loop timeline

这样可以先把“loop 控制权上移到 workflow”这件事做对，再逐步补齐可见性、接管和前端体验。
