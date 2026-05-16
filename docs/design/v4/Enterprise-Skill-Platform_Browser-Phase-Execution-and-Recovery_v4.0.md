# 企业级 Skill 平台 Browser Phase 执行与恢复设计

**Browser Phase Execution and Recovery v4.0**  
日期：2026-05-15

> 本文定义浏览器执行链路从“step 级原子执行”升级为“phase 级阶段执行”的设计方案。  
> 目标是在不影响现有文档执行与生成能力的前提下，为浏览器 workflow 增加幂等执行、失败恢复、人工接管、接管后继续执行的能力。

---

## 1. 文档目标

本文回答以下问题：

- 为什么浏览器链路需要从 `browser_step` 升级到 `phase`
- 如何按页面迁移、登录、内容处理、提交、校验切分阶段
- phase 如何做到可重试、可人工接管、可恢复继续
- AI 如何在 phase 失败后参与恢复决策，而不是直接接管整条主链
- 如何保证现有文档功能零回归，仅接入统一观测层

---

## 2. 范围与非目标

### 2.1 本次覆盖范围

- 浏览器类 execution / workflow / capability release
- execution 详情页与执行列表页的 phase 展示
- runtime session 与人工接管的 phase 级联动
- control-plane、ai-orchestrator、browser-worker、platform 的契约收敛

### 2.2 本次明确不做

- 不重写现有文档 builtin activity
- 不把文档 workflow 迁移到浏览器 runtime 模型
- 不让 AI 自由修改整个 workflow 结构
- 不以“从第几个 step 继续”作为恢复语义

---

## 3. 设计原则

### 3.1 以阶段状态为恢复边界

- 浏览器 workflow 不应只暴露 step 级执行边界
- workflow 编排层应面向 phase
- phase 内允许包含多个 step

### 3.2 幂等定义为“达到目标状态”

- phase 幂等不是“重复点击安全”
- phase 幂等应定义为：
  - 调用前若已满足目标状态，则直接成功
  - 调用后必须达到目标状态，否则失败

### 3.3 AI 只负责恢复决策，不直接改业务目标

- AI 可以做有限 patch：
  - selector 修正
  - wait 补偿
  - refresh/back/reopen page
- AI 不应：
  - 任意改变 workflow 结构
  - 修改文档类参数映射
  - 改变业务目标

### 3.4 文档链路只接统一观测

- 文档 workflow 保持现有执行逻辑
- 文档 execution 只新增 phase 观测与展示
- 不启用浏览器专属 takeover / live preview / recovery patch

---

## 4. 分层模型

### 4.1 Step 层

- 保留现有 `browser_step`
- 用于执行：
  - `goto`
  - `click`
  - `fill`
  - `wait`
  - `extract`
  - `screenshot`

### 4.2 Phase 层

- 新增 `browserPhase`
- 一个 phase 内部封装若干 step
- phase 对外暴露：
  - `precheck`
  - `commands`
  - `postcheck`
  - `recoveryPolicy`

### 4.3 Workflow 层

- workflow 不再直接关心所有浏览器原子步骤
- workflow 只按 phase 编排：
  - 登录
  - 页面迁移
  - 表单填写
  - 提交
  - 结果校验

---

## 5. Phase 切分规则

默认按以下边界切分：

- `登录阶段`
  - 打开登录页
  - 输入用户名密码
  - 触发登录
  - 校验登录成功
- `页面迁移阶段`
  - URL 切换
  - 菜单进入新业务页
  - 主区域上下文明显变化
- `内容处理阶段`
  - 一组连续表单填写
  - 一组连续筛选条件设置
- `提交阶段`
  - 点击提交/确认
  - 处理二次确认弹窗
- `校验阶段`
  - 成功提示验证
  - 结果页面验证
  - 数据提取

### 5.1 不建议的切分方式

- 每个 click/fill 都单独一个 phase
- 把多个业务目标揉成一个大 phase
- 把不可逆动作和校验动作放在同一 phase 里

---

## 6. 核心数据模型

### 6.1 ExecutionPhase

建议新增：

- `id`
- `executionId`
- `phaseKey`
- `phaseName`
- `phaseType`
- `status`
- `attempt`
- `runtimeSessionId`
- `inputJson`
- `outputJson`
- `precheckJson`
- `postcheckJson`
- `recoveryDecisionJson`
- `errorCode`
- `errorMessage`
- `startedAt`
- `completedAt`

### 6.2 ExecutionPhaseArtifact

建议新增：

- `phaseId`
- `artifactType`
- `snapshotId`
- `pageUrl`
- `pageFingerprint`
- `payloadJson`

### 6.3 ExecutionTakeover

建议新增：

- `executionId`
- `phaseId`
- `runtimeSessionId`
- `status`
- `reason`
- `requestedBy`
- `resolvedBy`
- `resolutionNote`
- `createdAt`
- `resolvedAt`

### 6.4 Execution 轻量扩展

建议新增：

- `currentPhaseKey`
- `currentPhaseStatus`
- `takeoverStatus`

---

## 7. Phase 执行协议

### 7.1 BrowserPhaseInput

```ts
interface BrowserPhaseInput {
  executionId: string;
  runtimeSessionId: string;
  phaseKey: string;
  phaseName: string;
  phaseType: string;
  commands: BrowserPhaseCommand[];
  precheck?: BrowserPhaseCheck;
  postcheck?: BrowserPhaseCheck;
  recoveryPolicy?: {
    maxAutoRetries?: number;
    allowAiRecovery?: boolean;
    allowHumanTakeover?: boolean;
  };
  context?: Record<string, unknown>;
}
```

### 7.2 BrowserPhaseResult

```ts
interface BrowserPhaseResult {
  success: boolean;
  phaseKey: string;
  runtimeSessionId: string;
  pageUrl?: string;
  pageFingerprint?: string;
  snapshotId?: string;
  stepResults: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  retryable?: boolean;
  takeoverSuggested?: boolean;
  errorCode?: string;
  errorMessage?: string;
}
```

---

## 8. 幂等与可重复执行

### 8.1 phase 标准流程

每个 phase 固定走：

1. `precheck`
2. `execute`
3. `postcheck`

### 8.2 规则

- `precheck` 命中时直接成功返回
- `execute` 后若 `postcheck` 不满足，则判定 phase 失败
- 提交类 phase 必须绑定业务幂等键
- 已存在的业务结果优先复用，不重复提交

---

## 9. 恢复与接管

### 9.1 自动重试

- 优先处理瞬时失败
- phase 内允许有限次自动重试
- 自动重试策略应由 `recoveryPolicy.maxAutoRetries` 控制

### 9.2 AI 恢复决策

phase 失败后，AI 恢复决策器返回：

- `retry_same_phase`
- `retry_with_patch`
- `takeover_required`
- `abort`

### 9.3 人工接管

- phase 状态切到 `waiting_takeover`
- 保留 `runtimeSessionId`
- 用户通过 noVNC 接管当前页面
- 用户点击“继续”后先执行 `reconcile`

### 9.4 接管后恢复

- 恢复语义不是“从第几个 step 继续”
- 恢复语义是“先校验当前阶段目标是否已达成”
- 若已达成，直接进入下一 phase

---

## 10. 对现有文档功能的影响边界

### 10.1 明确保留的链路

- `documentRender`
- `httpRequest`
- `structuredTransform`
- 现有 deterministic workflow code generation

### 10.2 仅新增的统一能力

- execution 返回 `phases`
- execution 页面展示 phase timeline
- 文档 phase 仅做只读观测

### 10.3 明确不启用的浏览器专属能力

- 文档 execution 不显示 live preview
- 文档 execution 不触发 takeover
- 文档 execution 不走 AI selector patch

---

## 11. 第一阶段实施范围（P0）

P0 只做最小骨架，不触碰现有文档执行主链：

### 11.1 数据与契约

- 新增 `ExecutionPhase` 相关表
- 扩展 execution DTO，支持：
  - `currentPhaseKey`
  - `currentPhaseStatus`
  - `takeoverStatus`
  - `phases`

### 11.2 执行侧

- 新增 `ExecutionPhaseService`
- 新增 `BrowserPhaseExecutor`
- `runtime-execution.orchestrator` 增加 `executePhase()`
- `browser_step` 继续作为 phase 内部原子执行器

### 11.3 前端侧

- execution 详情页新增 phase timeline
- execution 列表页新增 phase 状态字段

### 11.4 暂不纳入 P0

- AI recovery planner
- 自动 phase 切分
- 文档链路相同行为改造
- takeover/reconcile 全流程

---

## 12. 模块改动清单

### 12.1 control-plane

- `execution.dto.ts`
- `execution.mapper.ts`
- `execution.service.ts`
- 新增：
  - `execution-phase.service.ts`
  - `execution-phase.dto.ts`
  - `execution-phase.mapper.ts`
  - `browser-phase.executor.ts`

### 12.2 ai-orchestrator

- 保留 `browser-step.tool.ts`
- 后续新增：
  - `browser-phase.tool.ts`
  - `execution-recovery-planner.tool.ts`

### 12.3 browser-worker

- 后续新增页面状态探测协议
- 提供 phase `precheck/postcheck` 所需能力

### 12.4 platform

- 扩展 workflow DSL 的 `phase` 元数据
- 后续增加浏览器 workflow 自动切分服务

### 12.5 frontend

- `ExecutionDetailPage.tsx`
- `ExecutionListPage.tsx`
- execution API DTO 扩展

---

## 13. 验收标准

P0 验收标准：

- execution DTO 可携带 phase 信息且兼容旧接口
- mapper 可稳定映射 phase 数据
- execution 页面可展示 phase timeline
- 现有文档生成与 execution 不回归

后续完整方案验收标准：

- 浏览器 phase 失败后可自动重试
- 浏览器 phase 失败后可触发人工接管
- 人工接管后可继续后续 phase
- 顶层 execution 状态与 phase 状态保持一致

---

## 14. 风险与控制

### 14.1 风险

- execution 顶层状态与 phase 状态不一致
- runtime session 生命周期拉长导致资源占用增加
- phase 切分过粗或过细影响恢复效率
- AI patch 范围失控

### 14.2 控制措施

- 顶层 execution 状态始终由 control-plane 统一收口
- waiting_takeover 增加 lease / timeout
- phase 切分先用固定规则，不直接自动学习
- AI recovery 输出做严格 schema 校验

---

## 15. 推荐推进顺序

1. 写入数据模型与 DTO
2. 落 `ExecutionPhaseService`
3. 落 `BrowserPhaseExecutor`
4. 前端展示 phase timeline
5. 再引入 takeover / reconcile
6. 最后引入 AI recovery planner

---

## 16. 当前结论

- `phase` 是统一执行框架的合适中间层
- 浏览器链路优先承载恢复、接管、继续执行能力
- 文档链路只接统一观测层，保持现有稳定执行逻辑不变
- P0 应先落契约、数据、DTO、执行骨架，不要一次性重构全部链路
