# 企业级技能平台 编排层重建 Batch R10 详细方案

**Enterprise-Skill-Platform Orchestration Batch R10 Planner Param Recognition Refactor Plan v4.0**  
日期：2026-06-22

---

## 1. 任务目标

`Batch R10` 的目标是把 [planner.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.ts) 中“参数识别、参数补全、waiting-input 上下文整合、required input 计算”这一整段职责，从主服务中拆到 `params/` 子目录。

本批次要解决的不是 skill 读路径，也不是最终 `PlanDraftDTO` 组装，而是：

1. 如何构造给 `RecognizerService` 的 schema
2. 如何把识别结果与 waiting-input 已收集参数合并
3. 如何做 bilingual completion
4. 如何根据 workflow policy / schema policy 计算 `required_inputs`
5. 如何输出可稳定供 `plan/` 消费的参数解析结果

---

## 2. 当前现状

### 2.1 当前参数识别相关方法分布

当前 `PlannerService` 中，参数识别与整合相关的方法主要包括：

1. `buildRecognizerParamsSchema(...)`
2. `buildRecognizerParamsSchemaProperties(...)`
3. `resolveRecognizerFieldNamesForContext(...)`
4. `resolveRecognizerRequiredFieldsForContext(...)`
5. `mergeRecognizedWithCollectedContext(...)`
6. `extractCollectedParamsFromContext(...)`
7. `identifyBilingualPairs(...)`
8. `applyBilingualCompletionToRecognized(...)`
9. `batchTranslate(...)`
10. `buildRequiredInputs(...)`
11. `resolveWorkflowParamPolicies(...)`
12. `resolveWorkflowRequiredMode(...)`
13. `hasWorkflowPolicyStrategySource(...)`
14. `buildArrayGroupTargetCounts(...)`
15. `hasMeaningfulRequiredInputValue(...)`
16. `normalizeMeaningfulInputValue(...)`
17. `countMeaningfulRequiredInputItems(...)`
18. `normalizeOptionalDefaultValue(...)`
19. `decorateArrayGroupCompletenessDescription(...)`
20. `resolveRequiredInputDisplayName(...)`
21. `decorateRequiredInputDescription(...)`
22. `summarizeInputValue(...)`

### 2.2 当前边界问题

这部分逻辑现在同时混合了 4 类职责：

1. 识别请求入参准备
2. 识别结果后处理
3. waiting-input 恢复态参数整合
4. 字段级 required input 决策

其中最重的问题是：

1. `buildRequiredInputs(...)` 过长且包含大量字段级策略判断
2. `applyBilingualCompletionToRecognized(...)` 带有异步 LLM 翻译行为，但仍嵌在主服务里
3. waiting-input resume 的上下文窄化和已收集参数合并，与普通首次规划路径耦合在一起
4. `PlannerService.buildSkillPlan(...)` 一旦修改参数整合顺序，就可能影响 document semantic 与 execution snapshot

---

## 3. 本批次范围

### 3.1 纳入范围

本批次纳入：

1. 新建 `planner/params/param-recognizer.service.ts`
2. 下沉 recognizer schema 构造与 waiting-input 场景字段窄化
3. 下沉 recognized params 与 collected context 的合并逻辑
4. 下沉 bilingual completion 逻辑
5. 下沉 `required_inputs` 计算逻辑
6. 让 `PlannerService` 改为依赖参数协作者输出稳定的参数解析结果

### 3.2 不纳入范围

本批次不纳入：

1. `RecognizerService` 本身的实现重写
2. plan DTO 组装重写
3. skill read path 改造
4. semantic summary 组装逻辑迁移
5. planner 对外接口修改

说明：

`R10` 的职责边界应严格限定在 “param recognition pipeline”。

---

## 4. 目标状态

目标结构建议演进为：

```text
planner/
├── planner.service.ts
├── skill/
├── plan/
└── params/
    ├── index.ts
    └── param-recognizer.service.ts
```

### 4.1 `PlannerService`

保留职责：

1. 接收 `matchedSkill`
2. 触发参数识别
3. 接收规范化后的参数解析结果
4. 把结果交给 `plan/` 路径生成最终 plan

不再直接负责：

1. recognizer schema 窄化
2. waiting-input 已收集参数 merge
3. bilingual completion
4. `required_inputs` 字段级规则计算

### 4.2 `ParamRecognizerService`

建议承接：

1. `buildRecognizerParamsSchema(...)`
2. `buildRecognizerParamsSchemaProperties(...)`
3. `resolveRecognizerFieldNamesForContext(...)`
4. `resolveRecognizerRequiredFieldsForContext(...)`
5. `mergeRecognizedWithCollectedContext(...)`
6. `extractCollectedParamsFromContext(...)`
7. `identifyBilingualPairs(...)`
8. `applyBilingualCompletionToRecognized(...)`
9. `batchTranslate(...)`
10. `buildRequiredInputs(...)`
11. `resolveWorkflowParamPolicies(...)`
12. `resolveWorkflowRequiredMode(...)`
13. `hasWorkflowPolicyStrategySource(...)`
14. `buildArrayGroupTargetCounts(...)`
15. 所有 value normalization / confirmation / missing reason helper

建议它最终对 `PlannerService` 暴露一个更高层的方法，例如：

```ts
resolveParamsForMatchedSkill(...)
```

输出形态建议至少包含：

1. `recognized`
2. `requiredInputs`
3. `workflowParamPolicies`
4. `debug`

---

## 5. 建议实施步骤

### Step 1：先抽 recognizer schema 与 waiting-input 窄化逻辑

先迁出：

1. `buildRecognizerParamsSchema(...)`
2. `buildRecognizerParamsSchemaProperties(...)`
3. `resolveRecognizerFieldNamesForContext(...)`
4. `resolveRecognizerRequiredFieldsForContext(...)`

原因：

1. 这部分最清晰地属于 “recognizer request preparation”
2. 对输出 DTO 影响相对可控
3. 能先把 waiting-input resume 的上下文窄化边界立住

### Step 2：再抽 recognized merge 与 bilingual completion

迁出：

1. `mergeRecognizedWithCollectedContext(...)`
2. `extractCollectedParamsFromContext(...)`
3. `identifyBilingualPairs(...)`
4. `applyBilingualCompletionToRecognized(...)`
5. `batchTranslate(...)`

注意：

这一步包含异步翻译调用，测试中需要明确区分：

1. 不触发翻译的普通场景
2. 触发翻译的双语字段场景
3. 翻译失败回退场景

### Step 3：最后抽 `required_inputs` 计算

迁出：

1. `buildRequiredInputs(...)`
2. workflow policy 读取与 required mode 决策
3. value normalization / confirmation / missing reason / displayName 相关 helper

原因：

这是参数路径中最容易引入行为回归的一段，放在最后迁移更稳妥。

### Step 4：让 `PlannerService.buildSkillPlan(...)` 只做高层编排

目标形态接近：

```ts
const resolvedParams = await this.paramRecognizerService.resolveParamsForMatchedSkill({
  matchedSkill,
  objective,
  modelId,
  context,
});

return this.planGeneratorService.buildSkillPlan({
  objective,
  matchedSkill,
  recognized: resolvedParams.recognized,
  requiredInputs: resolvedParams.requiredInputs,
  ...
});
```

### Step 5：确保 `R9` 与 `R10` 边界稳定

本轮结束后应明确：

1. `params/` 只负责参数解析
2. `plan/` 只负责 plan shaping
3. `PlannerService` 只做 orchestration

不要把 `required_inputs` 的后续展示语义再次塞回 `plan/` 或主服务。

---

## 6. 推荐文件改动

建议首轮只改以下文件：

1. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.ts`
2. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.module.ts`
3. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/params/param-recognizer.service.ts`
4. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/params/index.ts`
5. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.spec.ts`

如首轮测试压力过大，也可考虑：

1. 新增 `param-recognizer.service.spec.ts`
2. 只把高价值字段级策略测试迁过去

---

## 7. 验收标准

### 7.1 结构验收

1. `planner.service.ts` 不再直接包含主要的 `required_inputs` 计算逻辑
2. waiting-input 窄化与 collected context merge 已下沉
3. bilingual completion 逻辑已从主服务移出
4. 参数识别管线已有稳定协作者承接

### 7.2 编译验收

1. `npm --prefix apps/backend/orchestration/ai-orchestrator run typecheck` 通过

### 7.3 测试验收

至少覆盖以下高价值场景：

1. required 字段缺失时，`required_inputs` 标记正确
2. optional 字段有 placeholder default 时，不被误当作有效值
3. low confidence 字段触发 `needs_confirmation`
4. `waiting_input_resume` 仅窄化到缺失字段与已收集字段
5. 双语字段在单边输入时完成补全或回退
6. array group 部分识别时触发 `partial_group`

### 7.4 运行时验收

至少回归以下真实链路：

1. 普通 skill 首次规划
2. document skill 参数较多时的 required input 识别
3. `waiting_input_resume` 后只针对目标 skill 和缺失字段继续规划
4. bilingual document 场景的参数补全链路

---

## 8. 风险点

### 8.1 最大风险

1. `required_inputs` 计算顺序变化，导致 `missing` / `needs_confirmation` 结果漂移
2. bilingual completion 迁移后，翻译调用时机变化，影响 usage 或 debug notes
3. waiting-input merge 迁移不完整，导致已确认参数丢失或被不确定识别结果覆盖
4. 大量字段级测试仍挂在 `planner.service.spec.ts`，导致重构时测试维护成本过高

### 8.2 控制策略

1. 先抽 schema narrowing，再抽 merge/bilingual，再抽 `required_inputs`
2. 对高风险字段级规则保留定点测试，不做无价值全量快照
3. `waiting_input_resume`、document、generic query 三类路径都至少保留一组回归样例
4. `required_inputs` 行为若有微调，必须在文档和断言里同步说明，不做暗改

---

## 9. 回滚策略

若本批次引入回归，建议按以下顺序回滚：

1. 先回滚 `required_inputs` 计算委托替换
2. 若 waiting-input 行为异常，再回滚 context merge 与 narrowing 委托替换
3. bilingual completion 可单独回滚，不必连带撤销整个 params 子目录

推荐提交粒度：

1. recognizer schema / waiting-input narrowing 一个 commit
2. merge + bilingual completion 一个 commit
3. `required_inputs` 计算下沉一个 commit
4. `PlannerService` 清理与测试收口一个 commit

---

## 10. 与前后批次的关系

`R10` 是 planner 三段式拆分的最后一块核心能力：

1. `R8` 负责 `skill/`
2. `R9` 负责 `plan/`
3. `R10` 负责 `params/`

完成后，planner 目标态会更加清晰：

1. `skill/` 只管读路径和匹配
2. `params/` 只管识别与字段级决策
3. `plan/` 只管计划结果输出
4. `PlannerService` 只做顶层编排

---

## 11. 建议的首轮 PR 范围

首轮 PR 建议只包含：

1. `param-recognizer.service.ts`
2. recognizer schema / waiting-input narrowing 委托替换
3. 少量必要测试调整

第二个 PR 再包含：

1. merge + bilingual completion
2. `required_inputs` 计算整体下沉

不建议首轮同时包含：

1. `plan/` 与 `params/` 再次交叉搬移
2. `planner.service.spec.ts` 大规模拆文件
3. planner 输出 DTO 契约改动

---

## 12. 结论

`Batch R10` 的核心，是把 planner 最复杂、最容易回归的一段“字段级参数解析决策”从主服务里抽出来：

1. recognizer request preparation
2. waiting-input resume merge
3. bilingual completion
4. `required_inputs` 计算

只有这部分也独立下来，`planner.service.ts` 才能真正从“巨型实现文件”收敛为“编排入口”，而不是只把部分 helper 挪到了旁边。
