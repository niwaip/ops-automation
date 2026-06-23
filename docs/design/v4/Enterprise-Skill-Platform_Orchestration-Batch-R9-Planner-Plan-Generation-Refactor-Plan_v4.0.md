# 企业级技能平台 编排层重建 Batch R9 详细方案

**Enterprise-Skill-Platform Orchestration Batch R9 Planner Plan Generation Refactor Plan v4.0**  
日期：2026-06-22

---

## 1. 任务目标

`Batch R9` 的目标是在 `Batch R8` 已经收敛 skill 读路径之后，继续把 [planner.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.ts) 中“计划生成主路径”从巨型主服务里拆出来。

本批次重点处理：

1. skill match 之后如何生成 `PlanDraftDTO`
2. fallback planner 结果如何构造
3. plan step、risk summary、skill match DTO 如何生成
4. document task 的 semantic summary 如何参与最终 plan 聚合

本批次不处理参数识别细节本身，那部分留给 `Batch R10`。

---

## 2. 当前现状

### 2.1 当前 plan generation 入口

当前 `PlannerService` 中，plan generation 主路径主要集中在以下方法：

1. `completePlanFromMatchPhase(...)`
2. `buildSkillPlan(...)`
3. `buildFallbackPlan(...)`
4. `buildPlanSteps(...)`
5. `buildRiskItems(...)`
6. `toPlanSkillMatch(...)`
7. `toStepTitle(...)`
8. `buildExecutionSnapshot(...)`
9. `isExecutionInputSafe(...)`

此外，与 document skill 计划语义强相关的方法还有：

1. `buildDocumentSemanticContext(...)`
2. `analyzeDocumentComplexity(...)`
3. `buildPlanSemantic(...)`
4. `buildSemanticSummary(...)`
5. `buildGroupedMissing(...)`

### 2.2 当前边界问题

当前问题不是单一函数过长，而是“plan generation”与“params recognition / semantic shaping”强耦合在一起：

1. `buildSkillPlan(...)` 同时负责参数识别、参数合并、语义处理、step 组装、risk 组装、snapshot 组装
2. `completePlanFromMatchPhase(...)` 现在只是薄壳，但其下游仍高度集中在主服务
3. fallback plan 和 skill plan 都属于 plan 结果构造，却仍和 skill 读路径、参数识别路径混在同一个服务里

这会导致：

1. 后续调整 plan DTO 很难不影响其它职责
2. planner 测试很难只对“生成计划结果”做定点覆盖
3. `R10` 想拆参数识别时，很容易和 plan generation 改动互相冲突

---

## 3. 本批次范围

### 3.1 纳入范围

本批次纳入：

1. 新建 `planner/plan/plan-generator.service.ts`
2. 新建 `planner/plan/plan-semantic.service.ts`
3. 将 fallback / skill plan 的 DTO 组装逻辑从 `PlannerService` 下沉
4. 将 document semantic summary 与 grouped missing 的生成逻辑下沉到 `PlanSemanticService`
5. 让 `PlannerService` 保留“调用 skill path -> 调 params path -> 调 plan path”的顶层编排

### 3.2 不纳入范围

本批次不纳入：

1. `recognizerService.recognizeParams(...)` 调用路径重写
2. `mergeRecognizedWithCollectedContext(...)` 拆分
3. bilingual completion 逻辑迁移
4. required input 字段级计算规则迁移
5. planner 对外 API 契约修改

说明：

`R9` 只拆“生成计划结果”这一层，不重写“如何拿到 recognized params”。

---

## 4. 目标状态

目标结构建议演进为：

```text
planner/
├── planner.service.ts
├── skill/
├── plan/
│   ├── index.ts
│   ├── plan-generator.service.ts
│   └── plan-semantic.service.ts
└── params/
```

### 4.1 `PlannerService`

保留职责：

1. `generatePlan(...)`
2. `matchSkillPhase(...)`
3. `completePlanFromMatchPhase(...)`
4. 协调 skill / params / plan 三条子路径

不再直接负责：

1. fallback plan DTO 细节拼装
2. steps / risk summary / skill match DTO 组装
3. document semantic summary 与 grouped missing 组装

### 4.2 `PlanGeneratorService`

建议承接：

1. `buildSkillPlan(...)` 中 plan 结果聚合的主体
2. `buildFallbackPlan(...)`
3. `buildPlanSteps(...)`
4. `buildRiskItems(...)`
5. `toPlanSkillMatch(...)`
6. `toStepTitle(...)`
7. `buildExecutionSnapshot(...)`
8. `isExecutionInputSafe(...)`

它的定位是：

给定：

1. `objective`
2. `matchedSkill`
3. `requiredInputs`
4. `semantic`
5. `usage`

输出稳定的 `PlanDraftDTO`。

### 4.3 `PlanSemanticService`

建议承接：

1. `buildDocumentSemanticContext(...)`
2. `analyzeDocumentComplexity(...)`
3. `buildPlanSemantic(...)`
4. `buildSemanticSummary(...)`
5. `buildGroupedMissing(...)`
6. `resolveBusinessGroupLabel(...)`
7. `resolvePreviewBlocking(...)`
8. `isPreviewBlockingGroup(...)`
9. 以及与 semantic label / key 归一化相关的小型 helper

它的定位是：

把 document task 的“字段缺失视角”提升为“业务组 / preview-ready / final-ready”的计划语义模型。

---

## 5. 建议实施步骤

### Step 1：先抽 `plan-semantic.service.ts`

先迁出 document semantic 相关能力：

1. `buildDocumentSemanticContext(...)`
2. `analyzeDocumentComplexity(...)`
3. `buildPlanSemantic(...)`
4. `buildSemanticSummary(...)`
5. `buildGroupedMissing(...)`

原因：

1. 这部分与 `PlanDraftDTO.semantic` 强相关
2. 与“是否为 document task”的 plan 语义清晰相关
3. 相比 params recognition，本身更偏 plan shaping

### Step 2：让 `PlannerService.buildSkillPlan(...)` 先改为委托 semantic 协作者

目标形态接近：

```ts
const semanticContext = this.planSemanticService.buildDocumentSemanticContext({
  matchedSkill,
  requiredInputs,
});
```

先把 semantic shaping 从主服务抽出去，再做 plan DTO 组装抽取。

### Step 3：再抽 `plan-generator.service.ts`

迁出：

1. `buildFallbackPlan(...)`
2. `buildPlanSteps(...)`
3. `buildRiskItems(...)`
4. `toPlanSkillMatch(...)`
5. `toStepTitle(...)`
6. `buildExecutionSnapshot(...)`
7. `isExecutionInputSafe(...)`

随后把 `buildSkillPlan(...)` 主体改为“先拿 recognized / requiredInputs / semantic，再交给 `PlanGeneratorService` 出 plan DTO”。

### Step 4：压薄 `PlannerService.buildSkillPlan(...)`

目标是让 `buildSkillPlan(...)` 接近以下骨架：

```ts
const recognized = await ...
const mergedRecognized = ...
const enrichedRecognized = ...
const requiredInputs = this.buildRequiredInputs(...)
const semanticContext = this.planSemanticService.buildDocumentSemanticContext(...)

return this.planGeneratorService.buildSkillPlan({
  objective,
  matchedSkill,
  recognized: enrichedRecognized,
  requiredInputs: semanticContext.requiredInputs,
  semantic: semanticContext.semantic,
  semanticDebug: semanticContext.debug,
});
```

这样 `PlannerService` 还保留 orchestration，但不再自己拼完整 plan DTO。

### Step 5：补 `plan/index.ts` 稳定入口

建议：

1. `planner.service.ts` 只通过 `./plan` 导入
2. 外部模块继续只依赖 `PlannerService`
3. 不把 `plan/` 暴露成跨模块直接注入入口

---

## 6. 推荐文件改动

建议首轮只改以下文件：

1. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.ts`
2. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.module.ts`
3. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/plan/plan-generator.service.ts`
4. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/plan/plan-semantic.service.ts`
5. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/plan/index.ts`
6. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.spec.ts`

---

## 7. 验收标准

### 7.1 结构验收

1. `planner.service.ts` 不再直接拼装 fallback plan
2. `planner.service.ts` 不再直接持有主要的 semantic summary 构造实现
3. plan DTO 组装从主服务下沉到稳定协作者
4. `PlannerService` 更接近顶层 orchestration service

### 7.2 编译验收

1. `npm --prefix apps/backend/orchestration/ai-orchestrator run typecheck` 通过

### 7.3 测试验收

至少覆盖以下范围：

1. `planner.service.spec.ts` 中 fallback plan 相关场景
2. `planner.service.spec.ts` 中文档类 skill 的 semantic summary / grouped missing 场景
3. `planner.service.spec.ts` 中 required inputs 进入 `execution_snapshot` 的关键场景
4. `chat-orchestrator.service.spec.ts` 中 planner 输出被上游消费的关键场景

### 7.4 运行时验收

至少回归以下真实链路：

1. 未匹配技能时返回 fallback plan
2. 普通 skill 成功生成 steps / risk summary
3. document skill 在复杂参数场景下生成 semantic summary
4. `waiting_input_resume` 后 plan snapshot 仍保持一致

---

## 8. 风险点

### 8.1 最大风险

1. semantic logic 拆出后，`requiredInputs` 清洗顺序发生变化，导致 grouped missing 回归
2. `execution_snapshot` 构造位置迁移后，字段缺失或 shape 漂移
3. fallback plan 与 skill plan 分别改动时，planner spec mock 范式一起变化，测试噪声变大

### 8.2 控制策略

1. 先拆 `PlanSemanticService`，再拆 `PlanGeneratorService`
2. 首轮不改 `buildRequiredInputs(...)` 及其 helper
3. 对 `PlanDraftDTO` 结构做快照式断言时，优先只守关键字段，不扩大无价值比对面
4. document / query / resume 三类路径都至少保留一组高价值回归样例

---

## 9. 回滚策略

若本批次引入回归，建议按以下顺序回滚：

1. 先回滚 `PlanGeneratorService` 委托替换
2. 若 document semantic 出现结构漂移，再回滚 `PlanSemanticService` 委托替换
3. 新建文件可保留，但暂停继续推进 `R10`

推荐提交粒度：

1. `PlanSemanticService` 一个 commit
2. `PlanGeneratorService` 一个 commit
3. `PlannerService` 清理和测试收口一个 commit

---

## 10. 与后续批次的关系

`R9` 完成后，`R10` 的边界会更清晰：

1. `R8` 解决 skill read path
2. `R9` 解决 plan generation path
3. `R10` 再解决 params recognition / merge path

也就是说，`R10` 不应再负责：

1. fallback plan 组装
2. semantic summary 组装
3. steps / risk / snapshot 组装

这样才能避免 planner 重构出现“拆了一半又重新耦合”的情况。

---

## 11. 建议的首轮 PR 范围

首轮 PR 建议只包含：

1. 新建 `PlanSemanticService`
2. `PlannerService` 先改为委托 semantic 构造
3. 少量必要测试调整

第二个 PR 再包含：

1. `PlanGeneratorService`
2. fallback / plan steps / risk / snapshot 下沉

不建议首轮就同时包含：

1. `R10` 的 params recognition 拆分
2. planner 所有 helper 的统一搬移
3. planner spec 的大规模重写

---

## 12. 结论

`Batch R9` 的核心，是把 `planner.service.ts` 从“匹配之后什么都自己拼”收敛成“协调 recognized params 与 plan shaping 的入口”：

1. `PlanSemanticService` 负责语义摘要与 grouped missing
2. `PlanGeneratorService` 负责最终 `PlanDraftDTO` 拼装
3. `PlannerService` 继续保留顶层编排

这样做后，planner 的三段式边界才会逐步成型：

1. `skill/` 负责技能读路径
2. `plan/` 负责计划结果构造
3. `params/` 负责参数识别与参数整合
