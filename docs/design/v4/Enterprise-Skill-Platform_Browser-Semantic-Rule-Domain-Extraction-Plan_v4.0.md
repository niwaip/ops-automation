# 企业级技能平台 浏览器语义规则 Domain 下沉分层改造方案

**Browser Semantic Rule Domain Extraction Plan v4.0**  
日期：2026-06-21

> 本文定义如何把浏览器业务语义规则从 `orchestration/ai-orchestrator` 中下沉为独立的 `domain` 服务，同时保持录制观察、命令解析、AI fallback、执行恢复等编排能力继续留在 `ai-orchestrator`。  
> 目标不是整体搬迁浏览器模块，而是把“规则资产”和“编排链路”切成清晰边界。

---

## 1. 文档目标

本文回答以下问题：

- 为什么浏览器业务语义规则更适合放到 `apps/backend/domain/`
- 哪些能力应该下沉到 domain，哪些能力必须继续留在 orchestration
- 新的 domain 服务目录应该如何组织
- `ai-orchestrator` 与新的 domain 服务如何交互
- 如何分阶段迁移，避免一次性重构造成风险

---

## 2. 现状判断

### 2.1 当前问题

当前浏览器相关能力主要集中在：

- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/`
- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-phase-recovery/`

但这两部分混合了三类不同职责：

- 业务语义资产：字段别名、动作别名、区域别名、实体别名
- 编排链路：候选整形、planner、AI fallback、调试会话
- 执行恢复：phase recovery、接管后 reconcile、循环导出

结果是：

- 业务规则更新必须跟着编排代码发版
- 业务语义和通用规则边界不清
- 编排层越来越像“规则仓库 + 运行链 + 调试台”的混合体

### 2.2 与当前仓库分层的冲突

当前仓库分层已经明确：

- `domain/`：核心业务服务与引擎
- `orchestration/`：跨域控制面与 AI 编排

并且 `domain` 明确要求：

- 允许依赖 `platform/*` 和 `shared/*`
- 禁止依赖 `runtime/*` 与 `orchestration/*`

这意味着：

- “规则资产”适合下沉到 domain
- “AI 编排链路”不应被硬塞到 domain

---

## 3. 结论

### 3.1 不建议整体搬迁

不建议把以下整块直接搬到 `domain/`：

- `browser-command/`
- `browser-phase-recovery/`
- `recorder-debug*`
- `recorder-observation*`
- `browser-execution-planner*`

原因是这些文件强依赖：

- 模型调用
- Redis 会话
- 调试上下文
- 执行失败恢复
- 结构化候选和页面观察

这些都属于 orchestration 编排层。

### 3.2 建议新增独立 domain 服务

更合理的方式是新增：

- `apps/backend/domain/browser-semantics/`

或次选命名：

- `apps/backend/domain/browser-rule/`

本文以下统一使用：

- `browser-semantics`

### 3.3 迁移目标

把以下内容从 orchestration 中抽离到新的 domain 服务：

- 规则集与规则版本
- 规则发布记录
- 规则灰度 targeting
- 规则命中日志
- 回放样本与回放运行
- 规则治理接口

而以下内容继续保留在 `ai-orchestrator`：

- 页面观察
- 候选提取与结构化定位
- 通用规则 parser
- AI planner / fallback
- 调试执行
- phase recovery

---

## 4. 分层原则

### 4.1 domain 负责“资产”

`browser-semantics` 负责：

- 规则对象建模
- 规则版本状态机
- 治理 API
- 命中日志
- 回放与评测资产

它的输出是：

- 当前生效规则集
- 指定版本规则集
- 命中日志查询结果
- 回放结果与评测报告

### 4.2 orchestration 负责“运行”

`ai-orchestrator` 负责：

- 把用户输入、页面 observation、候选上下文拼装成解析上下文
- 调用 `browser-semantics` 读取 active/canary 规则
- 用规则做语义归一化
- 继续走结构化候选定位和 AI fallback
- 把命中结果与最终执行结果回写给 `browser-semantics`

### 4.3 runtime 继续负责“执行”

`browser-worker` 仍然只负责：

- 浏览器动作执行
- 会话保持
- snapshot / artifact 返回

不负责：

- 业务语义规则存储
- 规则发布与回退

---

## 5. 推荐目录结构

### 5.1 新 domain 服务结构

```text
apps/backend/domain/browser-semantics/
  prisma/
    schema.prisma
    migrations/
  src/
    config/
      service-endpoints.ts
    modules/
      domain/
        semantic-rule-domain.service.ts
      rule-set/
        semantic-rule-set.controller.ts
        semantic-rule-set.dto.ts
        semantic-rule-set.module.ts
        semantic-rule-set.service.ts
      release/
        semantic-rule-release.controller.ts
        semantic-rule-release.service.ts
      targeting/
        semantic-rule-targeting.service.ts
      hit-log/
        semantic-rule-hit-log.controller.ts
        semantic-rule-hit-log.service.ts
      replay/
        semantic-rule-replay.controller.ts
        semantic-rule-replay.dto.ts
        semantic-rule-replay.service.ts
      runtime/
        semantic-rule-runtime.controller.ts
        semantic-rule-runtime.dto.ts
        semantic-rule-runtime.service.ts
    prisma/
      prisma.module.ts
      prisma.service.ts
    types/
      semantic-rule.types.ts
    app.module.ts
    main.ts
  test/
  package.json
  tsconfig.json
```

### 5.2 模块职责

- `rule-set/`：规则集 CRUD、版本状态、规则内容维护
- `release/`：promote、rollback、archive
- `targeting/`：canary 灰度条件与命中选择
- `hit-log/`：规则命中日志记录与查询
- `replay/`：回放样本、回放执行、报告输出
- `runtime/`：供 `ai-orchestrator` 调用的轻量运行时读取接口

---

## 6. `ai-orchestrator` 保留内容

### 6.1 保留在 `browser-command/intent` 的能力

- `browser-command.service.ts`
- `browser-command.types.ts`
- `action-intent.builder.ts`
- `action-target-resolver.service.ts`
- `browser-action-validator.service.ts`
- `browser-execution-planner.service.ts`
- `browser-planner-prompt.builder.ts`
- `browser-planner-response.parser.ts`
- `recorder-disambiguation.service.ts`
- `recorder-parameter.service.ts`

### 6.2 保留在编排链路的能力

- `recorder-observation.service.ts`
- `recorder-snapshot.service.ts`
- `recorder-structure-probe.service.ts`
- `recorder-debug*`
- `execution-reconcile.service.ts`
- `browser-phase-recovery.service.ts`

### 6.3 对这些文件的唯一要求

不是把它们搬走，而是减少它们直接内嵌业务语义规则的需求。

---

## 7. 新服务与编排层的接口边界

### 7.1 `browser-semantics` 对 `ai-orchestrator` 提供什么

建议至少提供两类接口：

- 治理接口：给运营和研发管理规则版本
- 运行接口：给 `ai-orchestrator` 读取当前有效规则并记录命中日志

### 7.2 运行时最小接口

建议新增：

- `GET /runtime/semantic-rules/resolve`
- `POST /runtime/semantic-rules/hit-logs`

### 7.3 读取规则请求示例

```json
{
  "domain": "browser_recorder",
  "environment": "test",
  "tenantId": "tenant-a",
  "userId": "user-1",
  "pageType": "approval-detail",
  "host": "mock-erp.local"
}
```

返回：

```json
{
  "ruleSetId": "rs_20260621_01",
  "version": "2026.06.21-01",
  "status": "canary",
  "rules": [
    {
      "id": "rule_field_margin_01",
      "type": "field_alias",
      "priority": 100,
      "patterns": ["粗利率", "毛利率", "gross margin"],
      "outputs": {
        "fieldAlias": "grossMargin"
      }
    }
  ]
}
```

### 7.4 命中日志回写示例

```json
{
  "domain": "browser_recorder",
  "ruleSetId": "rs_20260621_01",
  "matchedRuleIds": ["rule_field_margin_01"],
  "inputText": "读取当前案件粗利率",
  "pageType": "approval-detail",
  "observationSummary": "detail page with decision-actions region",
  "normalizedSemantic": {
    "semanticIntent": "read_field",
    "fieldAlias": "grossMargin"
  },
  "usedAiFallback": false,
  "finalExecutionSuccess": true,
  "traceId": "trace-123"
}
```

---

## 8. 依赖方向

### 8.1 正确依赖方向

应调整为：

```text
portal / tooling
  -> orchestration/ai-orchestrator
  -> domain/browser-semantics
  -> shared/platform
```

以及：

```text
orchestration/ai-orchestrator
  -> domain/browser-semantics
  -> sessions/runtime/platform/shared
```

### 8.2 必须避免的方向

禁止：

- `domain/browser-semantics -> orchestration/ai-orchestrator`
- `domain/browser-semantics -> runtime/browser-worker`

原因是这会破坏 domain 层纯度，并把规则资产重新绑死在编排实现上。

---

## 9. 数据归属建议

### 9.1 应归属到 `browser-semantics` 的数据

- `SemanticRuleDomain`
- `SemanticRuleSet`
- `SemanticRule`
- `SemanticRuleRelease`
- `SemanticRuleTargeting`
- `SemanticRuleHitLog`
- `SemanticRuleReplayCase`
- `SemanticRuleReplayRun`

### 9.2 不应归属到 `browser-semantics` 的数据

- 浏览器 session
- snapshot 引用存储
- recorder debug 会话态
- browser execution 中间状态
- phase recovery 执行上下文

这些仍应归属于 orchestration、sessions 或 runtime。

---

## 10. 文件级迁移建议

### 10.1 新增，不迁移

这次更多是“新建 domain 服务”，而不是把现有 orchestration 文件大量平移过去。

首期建议：

- 在 `browser-semantics` 新建 rule-set/release/hit-log/replay/runtime 模块
- 在 `ai-orchestrator` 中新增一个 client/adapter 访问该服务

### 10.2 可从现有文档直接映射的数据模型

可直接以这份设计为基础落地：

- [Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-Data-and-Release-Flow_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-Data-and-Release-Flow_v4.0.md)

### 10.3 `ai-orchestrator` 首期改动点

首期只建议做这几类改动：

- 新增 `browser-semantics.client.ts`
- 在 `BrowserCommandService` 前置读取当前 active/canary 规则
- 在解析完成后写入命中日志
- 不改变现有执行链主流程

---

## 11. 分阶段迁移计划

### Phase A：文档与数据模型冻结

- 确认规则资产下沉到 `domain`
- 冻结对象模型、API 与依赖方向

### Phase B：新 domain 服务骨架

- 创建 `apps/backend/domain/browser-semantics/`
- 落地 Prisma schema
- 落地 rule-set / release / runtime 最小模块

### Phase C：编排层接入

- `ai-orchestrator` 新增 client
- 读取 active/canary 规则
- 写入 hit log

### Phase D：回放与治理

- 落地 replay 模块
- 落地治理接口
- 支持回放门禁和回退

### Phase E：收口代码边界

- 停止在 `browser-command.service.ts` 中继续新增业务语义硬编码
- 把新增业务规则都走 `browser-semantics`

---

## 12. 与现有 domain 服务的类比

### 12.1 类比 `browser-template`

`browser-template` 已经体现出 domain 服务的典型形态：

- 独立 Prisma 数据
- 独立模块
- 以业务资产和校验逻辑为中心

这与 `browser-semantics` 很接近，因为后者本质上也是：

- 规则资产
- 版本治理
- 校验与发布

### 12.2 不应类比成 runtime worker

`browser-semantics` 不是执行器，不应做：

- 浏览器动作执行
- session 保持
- snapshot 采集

否则它会越界成 runtime。

---

## 13. 风险与对策

### 13.1 风险：服务拆得太早

问题：

- 如果一开始就把大量 orchestration 逻辑搬过去，容易破坏现有链路

对策：

- 首期只新建规则资产服务
- orchestration 通过 client 消费它

### 13.2 风险：domain 服务反向依赖编排上下文

问题：

- 规则服务一旦开始直接依赖 observation/planner，就会失去分层意义

对策：

- domain 只接收结构化输入
- 不直接调用模型、不接 Redis 会话

### 13.3 风险：同一规则在两边重复维护

问题：

- 迁移期容易出现 domain 和 `browser-command.service.ts` 双写

对策：

- 明确新增业务规则只允许进 `browser-semantics`
- 通用规则继续留在代码里
- 用评审清单约束边界

---

## 14. 最终结论

正确方向不是：

- 把 `browser-command/` 整个搬到 `apps/backend/domain/`

而是：

- 把“浏览器业务语义规则资产”抽成新的 `domain/browser-semantics`
- 让 `ai-orchestrator` 继续承担观察、解析、规划、fallback、恢复
- 通过清晰的运行时接口连接两层

这样做的好处是：

- 规则资产可治理、可版本化、可回退
- 编排链路保持敏捷，不被业务规则存储绑死
- 仓库分层更符合当前 `domain / orchestration / runtime` 的既有原则

---

## 15. 一句话总结

> 浏览器业务语义规则更像“领域资产”，而不是“编排实现细节”；因此最合适的方向不是整体搬迁浏览器模块，而是在 `apps/backend/domain/` 下新增 `browser-semantics` 服务，让规则资产下沉、让编排链路继续留在 `ai-orchestrator`。
