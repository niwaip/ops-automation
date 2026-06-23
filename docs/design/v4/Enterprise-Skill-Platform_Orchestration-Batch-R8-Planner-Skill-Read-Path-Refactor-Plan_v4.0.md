# 企业级技能平台 编排层重建 Batch R8 详细方案

**Enterprise-Skill-Platform Orchestration Batch R8 Planner Skill Read Path Refactor Plan v4.0**  
日期：2026-06-22

---

## 1. 任务目标

`Batch R8` 的目标是为 [planner.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.ts) 做第一刀职责拆分，但本轮只处理“技能读路径”。

这里的“技能读路径”指的是：

1. 技能列表读取
2. 单技能按 `skillId` 读取
3. 技能缓存
4. 技能匹配与 fallback
5. 匹配结果与源技能定义的回填/补水

本批次不碰计划生成、参数识别、文档语义聚合等后续重逻辑，重点是先把 `planner.service.ts` 里最适合独立出来的“读取和匹配前段”拆开。

---

## 2. 当前现状

### 2.1 当前文件状态

当前 [planner.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.ts) 已超过 `2000` 行，且同时承担：

1. planner 顶层入口编排
2. 技能列表读取与按 ID 读取
3. 缓存键构造与 TTL 缓存
4. 技能匹配 API 调用
5. 本地 fallback 匹配
6. skill schema 标准化与 hydration
7. 参数识别结果整合
8. 计划步骤构造
9. 文档语义复杂度分析

### 2.2 当前最适合优先拆出的部分

从真实方法分布看，最适合优先拆出的，是以下这一组高度内聚的方法：

1. `loadAvailableSkills(...)`
2. `loadSkillById(...)`
3. `buildAuthCacheKey(...)`
4. `buildSkillCacheKey(...)`
5. `getCacheValue(...)`
6. `setCacheValue(...)`
7. `matchSkill(...)`
8. `fallbackSkillMatch(...)`
9. `hydrateMatchedSkill(...)`
10. `mapRawSkillDefinition(...)`
11. `normalizeParamsSchema(...)`
12. `hydrateParamsSchemaRenderPaths(...)`
13. `normalizeExecutionFlow(...)`
14. `resolveExecutionType(...)`

这些方法共同构成了“从 auth-service 拉取技能定义，并把它变成 planner 可消费的稳定 skill model，再做匹配”的完整读路径。

### 2.3 当前复杂度来源

当前复杂度不只来自行数，还来自边界混杂：

1. `PlannerService` 既负责 orchestration，又直接发 HTTP 请求
2. `PlannerService` 既负责缓存，又负责 schema 标准化
3. `PlannerService` 既负责远端 match API，又负责 keyword fallback
4. `matchSkillPhase(...)` 看似很薄，但其下层依赖了大量 private helper

这会导致：

1. 测试很难只针对 skill 读路径做隔离
2. 任何 skill 拉取或匹配改动，都要触碰巨型主服务
3. 后续 `R9/R10` 想继续拆 plan / params 时，改动面会持续叠加

---

## 3. 本批次范围

### 3.1 纳入范围

本批次纳入：

1. 新建 `planner/skill/skill-cache.service.ts`
2. 新建 `planner/skill/skill-matcher.service.ts`
3. 把技能读取、缓存、匹配、match hydration 下沉到上述服务
4. 让 `PlannerService` 保留 `generatePlan(...)`、`matchSkillPhase(...)`、`completePlanFromMatchPhase(...)` 等顶层入口
5. 必要时新增 `planner/skill/index.ts` 作为目录级稳定入口

### 3.2 不纳入范围

本批次不纳入：

1. `buildSkillPlan(...)` 的深拆
2. `buildRequiredInputs(...)` 及其整串 helper 拆分
3. `buildDocumentSemanticContext(...)` 及文档复杂度逻辑拆分
4. bilingual translation 逻辑拆分
5. `PlanStepDTO` 构造逻辑重写
6. planner API 契约修改

说明：

`R8` 只做“读路径首刀”，目的是先把 `planner.service.ts` 前段边界理顺，而不是一次性把 planner 全拆完。

---

## 4. 目标状态

目标状态下，`planner/` 目录至少演进为：

```text
planner/
├── planner.service.ts
├── skill/
│   ├── index.ts
│   ├── skill-cache.service.ts
│   └── skill-matcher.service.ts
```

其中职责建议如下：

### 4.1 `PlannerService`

保留职责：

1. `generatePlan(...)`
2. `matchSkillPhase(...)`
3. `completePlanFromMatchPhase(...)`
4. `buildSkillPlan(...)`
5. 后续 `R9/R10` 才会继续拆的 plan / params / semantic 聚合入口

不再直接负责：

1. 调用 `/skills`、`/skills/:id` 接口
2. 管理 skill 缓存 Map
3. 执行 match API + fallback 的匹配细节
4. skill definition 到 planner model 的 hydration 细节

### 4.2 `SkillCacheService`

建议承接：

1. `loadAvailableSkills(...)`
2. `loadSkillById(...)`
3. `buildAuthCacheKey(...)`
4. `buildSkillCacheKey(...)`
5. `getCacheValue(...)`
6. `setCacheValue(...)`
7. `mapRawSkillDefinition(...)`
8. `normalizeParamsSchema(...)`
9. `hydrateParamsSchemaRenderPaths(...)`
10. `normalizeExecutionFlow(...)`
11. `resolveExecutionType(...)`

定位：

它不是通用缓存组件，而是“planner 的 skill read-model adapter + cache”。

### 4.3 `SkillMatcherService`

建议承接：

1. `matchSkill(...)`
2. `fallbackSkillMatch(...)`
3. `hydrateMatchedSkill(...)`

它依赖：

1. `SkillCacheService`
2. `axios` 对 `/skills/match` 的调用
3. 可能保留少量 `PlannerService` 现有类型与常量依赖

定位：

它负责“给定用户目标与 available skills，输出最终可用于 planner 的 `SkillMatchResult | null`”。

---

## 5. 建议实施步骤

### Step 1：先抽 `skill-cache.service.ts`

先迁出：

1. `loadAvailableSkills(...)`
2. `loadSkillById(...)`
3. 缓存 map 与 TTL
4. skill raw definition -> normalized definition 的全部 helper

原因：

1. 这是最稳定的只读路径
2. 对 planner 主流程影响最可控
3. 可以先不碰匹配逻辑，降低首轮回归范围

### Step 2：让 `PlannerService.matchSkillPhase(...)` 改经 `SkillCacheService`

目标形态接近：

```ts
const availableSkills = await this.skillCacheService.loadAvailableSkills({
  authToken,
  traceId,
  targetSkillId,
});
```

这样先把“拉技能定义”的细节从主服务拿出去。

### Step 3：再抽 `skill-matcher.service.ts`

迁出：

1. `matchSkill(...)`
2. `fallbackSkillMatch(...)`
3. `hydrateMatchedSkill(...)`

目标形态接近：

```ts
const matchedSkill = await this.skillMatcherService.matchSkill({
  userInput: objective,
  userId,
  authToken,
  traceId,
  availableSkills,
  context,
});
```

### Step 4：收敛 `PlannerService` 中的 skill 相关 private helper

完成 `Step 1-3` 后，`PlannerService` 中与 skill 读路径相关的 private 方法应显著减少，`matchSkillPhase(...)` 应只保留：

1. 读取目标输入
2. 调 skill read path
3. 返回 `PlannerMatchPhaseResult`

### Step 5：补目录网关与导出边界

若本轮新增 `planner/skill/index.ts`，建议：

1. `planner.service.ts` 只通过 `./skill` 导入协作者
2. 外部模块暂不直接依赖 `skill/` 内部实现
3. 避免把 `skill/` 做成新的深链路来源

---

## 6. 推荐文件改动

建议首轮只改以下核心文件：

1. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.ts`
2. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.module.ts`
3. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/skill/skill-cache.service.ts`
4. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/skill/skill-matcher.service.ts`
5. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/skill/index.ts`
6. `apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.spec.ts`

说明：

如果 `planner.module.ts` 当前尚未显式声明这些 provider，本轮需要同步补齐。

---

## 7. 验收标准

### 7.1 结构验收

1. `planner.service.ts` 不再直接维护 skill cache map
2. `planner.service.ts` 不再直接实现远端 skill list / skill by id 读取
3. `planner.service.ts` 不再直接承载主匹配逻辑与 fallback 匹配实现
4. `planner.service.ts` 行数有可见下降

### 7.2 编译验收

1. `npm --prefix apps/backend/orchestration/ai-orchestrator run typecheck` 通过

### 7.3 测试验收

至少验证以下范围：

1. `planner.service.spec.ts` 中与 `loadAvailableSkills`、`matchSkill`、waiting input resume 相关的核心测试
2. `chat-orchestrator.service.spec.ts` 中依赖 planner `matchSkillPhase(...)` 的关键场景
3. 如新增 `skill-cache.service.spec.ts` / `skill-matcher.service.spec.ts`，优先写高价值定点测试，而不是机械搬运整份 planner spec

### 7.4 运行时验收

至少回归以下真实链路：

1. 普通 skill match -> generate plan
2. `waiting_input_resume` 指定 `target_skill_id` 的 resume 场景
3. document skill 的 `document_render` fallback 路径
4. auth-service 暂时不可用时的 fallback plan 行为

---

## 8. 风险点

### 8.1 最大风险

1. 把 `PlannerService` 的内部 helper 生搬硬套出去，导致新 service 之间来回互调
2. skill cache 与 skill match 同时拆时，mock 方式大面积变化，导致现有 spec 破碎
3. `matchedSkill` hydration 迁移不完整，导致 document skill 的 `executionFlow`、`renderPath`、`executionType` 回填回归

### 8.2 控制策略

1. 先拆 `SkillCacheService`，再拆 `SkillMatcherService`
2. 保持 `PlannerService` 对外 API 完全不变
3. 先做委托替换，再考虑后续测试重构
4. 文档、workflow、通用 query 三类 skill 都至少保留一条回归样例

---

## 9. 回滚策略

若本批次引入回归，建议按以下粒度回滚：

1. 先回滚 `SkillMatcherService` 委托替换
2. 如仍异常，再回滚 `SkillCacheService` 委托替换
3. 新建文件可暂时保留，但停止在其上继续推进 `R9/R10`

推荐提交粒度：

1. `SkillCacheService` 抽取一个 commit
2. `SkillMatcherService` 抽取一个 commit
3. `PlannerService` 清理与测试收口一个 commit

---

## 10. 与后续批次的关系

`R8` 完成后，后续批次衔接会更稳定：

1. `R9` 再拆 `buildSkillPlan(...)` 周边的计划生成逻辑
2. `R10` 再拆参数识别与 waiting-input 参数整合逻辑

也就是说：

1. `R8` 解决的是 “skill read path too heavy”
2. `R9` 解决的是 “plan generation mixed in planner”
3. `R10` 解决的是 “params recognition and merge mixed in planner”

---

## 11. 建议的首轮 PR 范围

首轮 PR 建议只包含：

1. 新建 `SkillCacheService`
2. `PlannerService` 改为通过 `SkillCacheService` 读取技能
3. 少量必要测试调整

首轮 PR 不建议同时包含：

1. `SkillMatcherService` 抽离
2. `buildSkillPlan(...)` 深拆
3. 文档语义逻辑迁移

原因：

先把最稳定的 skill read-model 与缓存边界立住，更容易控制风险，也更利于第二个 PR 再安全接上 `SkillMatcherService`。

---

## 12. 结论

`Batch R8` 的目标不是“把 planner 一次性拆完”，而是先把最稳定、最清晰的一段职责拆出来：

1. 技能读取
2. 技能缓存
3. 技能匹配前段

当这条读路径从 `PlannerService` 中下沉后，`planner.service.ts` 才有条件继续在 `R9/R10` 中拆出计划生成和参数识别逻辑，最终回到“主服务只保留顶层编排”的目标态。
