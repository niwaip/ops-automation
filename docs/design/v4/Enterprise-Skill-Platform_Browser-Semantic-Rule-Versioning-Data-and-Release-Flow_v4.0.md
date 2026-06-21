# 企业级技能平台 浏览器语义规则版本化数据模型与发布回退流程

**Browser Semantic Rule Versioning Data and Release Flow v4.0**  
日期：2026-06-21

> 本文细化浏览器语义规则版本化方案中的“数据模型、治理 API、发布灰度、回退、回放和观测”部分。  
> 目标是在不改变当前浏览器执行协议的前提下，为业务语义规则提供一套可持续运营、可验证、可回退的最小平台契约。

---

## 1. 文档目标

本文回答以下问题：

- 浏览器语义规则应以哪些核心对象落库和治理
- 规则集、规则版本、灰度策略、命中日志、回放任务之间是什么关系
- 平台应提供哪些最小治理 API
- 新规则版本从草稿到生效应经过哪些状态
- 出现误伤后如何快速回退
- 回放样本和线上命中日志如何共同驱动规则演进

---

## 2. 适用范围与边界

### 2.1 适用范围

本文适用于：

- `ai-orchestrator` 浏览器录制/调试场景中的语义归一化
- `mock-erp` 与后续浏览器评测站的任务回放
- 通用解析器之前或之后的业务语义归一化层

### 2.2 不适用范围

本文不负责：

- 直接生成最终浏览器执行命令
- 替代 `browser-command.service.ts` 中的通用规则
- 替代 `browser-action-validator` 的风险控制
- 替代 AI planner 的复杂推理

### 2.3 边界结论

- 通用规则继续留在代码里
- 业务语义通过规则集外置
- 结构化候选优先于业务正则
- AI fallback 仍然存在，但应尽量在规则归一化之后触发

---

## 3. 设计原则

### 3.1 规则是“归一化资产”，不是“执行脚本”

- 规则输出标准语义对象
- 命令生成仍由代码层统一负责
- 不允许规则直接拼接任意 `click/fill` 指令作为最终执行结果

### 3.2 版本切换必须显式

- 每次规则修改都应进入新版本，而不是就地覆盖
- 线上生效版本必须可追踪
- 任何解析结果都应能追溯到命中的版本和规则 id

### 3.3 发布前必须先回放

- 新版本不能直接上线
- 必须先跑历史样本回放
- canary 只用于有限放量验证，不替代离线回放

### 3.4 回退优先级高于继续修补

- 线上误伤先回退，再修新版本
- 不允许在 `active` 版本上热修规则内容
- 回退动作必须能在不重启服务的情况下完成

---

## 4. 核心对象模型

### 4.1 对象总览

规则系统建议至少包含以下对象：

- `SemanticRuleDomain`
- `SemanticRuleSet`
- `SemanticRule`
- `SemanticRuleRelease`
- `SemanticRuleTargeting`
- `SemanticRuleHitLog`
- `SemanticRuleReplayCase`
- `SemanticRuleReplayRun`

### 4.2 `SemanticRuleDomain`

表示一类规则资产所属的语义域。

```ts
type SemanticRuleDomain = {
  id: string;
  code: 'browser_recorder';
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
```

说明：

- 首期可以只有 `browser_recorder`
- 后续若录制态、执行态或别的能力需要不同规则域，可继续扩展

### 4.3 `SemanticRuleSet`

表示一组可一起发布、一起回退的规则版本集合。

```ts
type SemanticRuleSet = {
  id: string;
  domainId: string;
  key: string;
  name: string;
  description?: string;
  basedOnRuleSetId?: string;
  version: string;
  status: 'draft' | 'validating' | 'canary' | 'active' | 'archived' | 'rolled_back';
  changeSummary?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  archivedAt?: string;
};
```

说明：

- `key` 表示逻辑规则集，例如 `browser-recorder-default`
- `version` 表示具体可发布版本，例如 `2026.06.21-01`
- `basedOnRuleSetId` 用于表示继承来源，便于差异比较

### 4.4 `SemanticRule`

表示规则集中的单条规则。

```ts
type SemanticRule = {
  id: string;
  ruleSetId: string;
  type:
    | 'intent_alias'
    | 'field_alias'
    | 'region_alias'
    | 'entity_alias'
    | 'row_reference'
    | 'read_intent'
    | 'login_phrase';
  name: string;
  enabled: boolean;
  priority: number;
  stopOnMatch?: boolean;
  flags?: string;
  patterns: string[];
  outputs: Record<string, unknown>;
  examples?: string[];
  negativeExamples?: string[];
  tags?: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
};
```

说明：

- `priority` 决定匹配顺序
- `stopOnMatch` 控制是否命中后停止同类规则继续匹配
- `tags` 可用于标识 `erp`, `approval`, `margin`, `login` 等运营标签

### 4.5 `SemanticRuleRelease`

表示一次规则版本发布记录。

```ts
type SemanticRuleRelease = {
  id: string;
  ruleSetId: string;
  releaseMode: 'manual' | 'scheduled' | 'rollback';
  fromStatus: string;
  toStatus: string;
  releasedBy: string;
  releaseNote?: string;
  triggeredAt: string;
  effectiveAt?: string;
  previousActiveRuleSetId?: string;
};
```

说明：

- 规则集状态反映当前版本状态
- 发布记录用于审计“谁在何时把哪个版本推到了什么状态”

### 4.6 `SemanticRuleTargeting`

表示规则版本的灰度命中条件。

```ts
type SemanticRuleTargeting = {
  id: string;
  ruleSetId: string;
  environment?: string[];
  tenantIds?: string[];
  userIds?: string[];
  skillIds?: string[];
  domains?: string[];
  pageTypes?: string[];
  sampleRate?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
```

说明：

- 首期优先支持：环境、租户、用户、域名、页面类型
- `sampleRate` 支持百分比放量，但不应作为唯一灰度条件

### 4.7 `SemanticRuleHitLog`

表示一次解析过程中规则系统的命中记录。

```ts
type SemanticRuleHitLog = {
  id: string;
  domainId: string;
  ruleSetId?: string;
  matchedRuleIds: string[];
  inputText: string;
  normalizedInput?: string;
  pageUrl?: string;
  pageTitle?: string;
  pageType?: string;
  observationSummary?: string;
  availableCandidateIds?: string[];
  normalizedSemantic?: Record<string, unknown>;
  parserOutput?: Record<string, unknown>;
  usedAiFallback: boolean;
  finalExecutionSuccess?: boolean;
  failureReason?: string;
  traceId?: string;
  createdAt: string;
};
```

说明：

- `traceId` 用于串联一次浏览器调试链路
- `finalExecutionSuccess` 允许后续把解析质量与执行结果关联分析

### 4.8 `SemanticRuleReplayCase`

表示一条可重复执行的回放样本。

```ts
type SemanticRuleReplayCase = {
  id: string;
  domainId: string;
  caseKey: string;
  title: string;
  pageType: string;
  fixtureVersion: string;
  inputText: string;
  precondition: Record<string, unknown>;
  observationFixtureRef?: string;
  expectedSemantic: Record<string, unknown>;
  expectedParserOutput?: Record<string, unknown>;
  expectedExecution?: Record<string, unknown>;
  tags?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### 4.9 `SemanticRuleReplayRun`

表示一次对某个规则版本执行的离线回放结果。

```ts
type SemanticRuleReplayRun = {
  id: string;
  domainId: string;
  ruleSetId: string;
  runScope: 'pre_publish' | 'canary_check' | 'regression' | 'rollback_check';
  totalCases: number;
  passedCases: number;
  failedCases: number;
  metrics: Record<string, number>;
  startedAt: string;
  completedAt?: string;
  triggeredBy: string;
  reportRef?: string;
};
```

---

## 5. 规则状态机

### 5.1 状态定义

- `draft`：草稿态，只允许编辑，不参与线上命中
- `validating`：已冻结内容，正在执行回放验证
- `canary`：进入灰度态，只有满足 targeting 的请求会命中
- `active`：当前主生效版本
- `archived`：已下线，但保留历史记录
- `rolled_back`：曾作为 active/canary 发布过，但已被回退

### 5.2 状态流转

建议只允许以下流转：

- `draft -> validating`
- `validating -> canary`
- `validating -> draft`
- `canary -> active`
- `canary -> rolled_back`
- `active -> archived`
- `active -> rolled_back`
- `rolled_back -> archived`

### 5.3 流转原则

- 任何进入 `validating` 的版本都应冻结内容
- 任何 `active` 版本不允许原地编辑
- 回退不是删除版本，而是切回上一个稳定版本并记录审计事件

---

## 6. 解析时序与运行机制

### 6.1 推荐时序

```text
input
  -> 通用 parser 预处理
  -> 规则版本选择
  -> 规则归一化
  -> 结构化候选定位
  -> AI planner / fallback
  -> 命中日志记录
```

### 6.2 规则版本选择

运行时建议按以下顺序选择规则版本：

1. 查 domain 下是否存在 `canary` 版本且 targeting 命中
2. 若命中，则优先使用该 `canary`
3. 否则使用当前 `active` 版本
4. 若无 active 版本，则退化为“无业务规则模式”

### 6.3 缓存建议

- 规则集读取可使用本地内存缓存
- `active` / `canary` 指针应支持短 TTL 缓存
- 发布、回退后应主动失效缓存

### 6.4 失败降级

若规则系统异常，应按以下顺序降级：

1. 记录错误日志
2. 跳过业务规则归一化
3. 继续走通用 parser + 结构化候选 + AI fallback

这样可以保证规则系统不是单点阻断源。

---

## 7. 治理 API 草案

### 7.1 接口分层

规则系统接口更适合作为治理接口，而不是普通业务接口。

建议挂在：

- `L2 平台治理接口`

### 7.2 推荐接口清单

- `GET /semantic-rule-domains`
- `GET /semantic-rule-domains/{domainId}/rule-sets`
- `POST /semantic-rule-domains/{domainId}/rule-sets`
- `GET /semantic-rule-sets/{id}`
- `PUT /semantic-rule-sets/{id}`
- `POST /semantic-rule-sets/{id}/validate/replay`
- `POST /semantic-rule-sets/{id}/promote/canary`
- `POST /semantic-rule-sets/{id}/promote/active`
- `POST /semantic-rule-sets/{id}/rollback`
- `POST /semantic-rule-sets/{id}/archive`
- `GET /semantic-rule-sets/{id}/releases`
- `GET /semantic-rule-hit-logs`
- `GET /semantic-rule-replay-cases`
- `POST /semantic-rule-replay-cases`
- `POST /semantic-rule-replay-runs`
- `GET /semantic-rule-replay-runs/{id}`

### 7.3 响应 Envelope

建议沿用平台统一 envelope：

```json
{
  "success": true,
  "data": {}
}
```

错误响应应包含：

```json
{
  "success": false,
  "error": {
    "code": "SEMANTIC_RULE_SET_NOT_FOUND",
    "message": "rule set not found"
  }
}
```

---

## 8. 关键 API 示例

### 8.1 创建规则集

`POST /semantic-rule-domains/browser_recorder/rule-sets`

```json
{
  "key": "browser-recorder-default",
  "name": "ERP 业务语义规则集",
  "basedOnRuleSetId": "rs_20260620_active",
  "changeSummary": "新增 gross margin / 承认 / 决策区 别名",
  "rules": [
    {
      "type": "field_alias",
      "name": "gross margin alias",
      "enabled": true,
      "priority": 100,
      "patterns": ["粗利率", "毛利率", "gross margin"],
      "outputs": {
        "fieldAlias": "grossMargin"
      }
    }
  ]
}
```

### 8.2 触发回放验证

`POST /semantic-rule-sets/{id}/validate/replay`

```json
{
  "runScope": "pre_publish",
  "caseSelectors": {
    "tags": ["erp", "approval", "margin"]
  }
}
```

### 8.3 提升为 canary

`POST /semantic-rule-sets/{id}/promote/canary`

```json
{
  "releaseNote": "先在测试环境和租户 A 放量",
  "targeting": {
    "environment": ["test"],
    "tenantIds": ["tenant-a"],
    "pageTypes": ["approval-detail"],
    "sampleRate": 1
  }
}
```

### 8.4 提升为 active

`POST /semantic-rule-sets/{id}/promote/active`

```json
{
  "releaseNote": "回放通过且 canary 稳定，提升为主生效版本"
}
```

### 8.5 回退

`POST /semantic-rule-sets/{id}/rollback`

```json
{
  "targetRuleSetId": "rs_20260618_active",
  "reason": "field_alias 误伤登录页输入解析"
}
```

---

## 9. 错误码建议

建议至少定义以下错误码：

- `SEMANTIC_RULE_DOMAIN_NOT_FOUND`
- `SEMANTIC_RULE_SET_NOT_FOUND`
- `SEMANTIC_RULE_SET_STATUS_INVALID`
- `SEMANTIC_RULE_SET_VERSION_CONFLICT`
- `SEMANTIC_RULE_SET_NO_ACTIVE_VERSION`
- `SEMANTIC_RULE_REPLAY_CASE_NOT_FOUND`
- `SEMANTIC_RULE_REPLAY_RUN_FAILED`
- `SEMANTIC_RULE_PROMOTE_REQUIRES_REPLAY_PASS`
- `SEMANTIC_RULE_ROLLBACK_TARGET_INVALID`
- `SEMANTIC_RULE_TARGETING_INVALID`

---

## 10. 发布与回退流程

### 10.1 标准发布流程

1. 从当前 `active` 版本复制出新 `draft`
2. 编辑规则内容并补充 examples / negativeExamples
3. 冻结版本，进入 `validating`
4. 运行离线回放
5. 回放通过后进入 `canary`
6. 观察命中率、误伤率、执行成功率
7. 稳定后提升为 `active`
8. 旧 `active` 自动转为 `archived`

### 10.2 标准回退流程

1. 发现 canary 或 active 误伤
2. 立即将上一个稳定版本重新指向 `active`
3. 当前异常版本标记为 `rolled_back`
4. 记录回退原因与影响范围
5. 基于该版本复制新 `draft` 继续修复

### 10.3 发布门禁

新版本进入 `canary` 前至少满足：

- 回放样本执行完成
- `intent_accuracy` 达到门槛
- `rule_misfire_rate` 低于门槛
- 关键 L0/L1 样本不回归

新版本进入 `active` 前至少满足：

- canary 命中量达到最小样本量
- canary 无明显误伤
- 执行成功率不低于上一版

---

## 11. 回放体系设计

### 11.1 回放输入

回放不要求每次都拉起真实浏览器，但至少要具备：

- 用户输入文本
- 页面类型
- observation fixture
- 候选列表 fixture
- 期望语义输出

### 11.2 回放输出

回放结果应至少包含：

- 是否命中期望 rule set
- 命中的 rule id 列表
- 归一化语义是否正确
- parser 输出是否正确
- 是否误触发 AI fallback

### 11.3 回放分层

- `L0/L1`：通用与结构化语义，作为强门禁
- `L2`：业务语义，作为版本演进主场
- `L3`：回归与鲁棒性，作为目录迁移和结构调整门禁

### 11.4 报告结构

每次回放建议生成：

- 总体通过率
- 各规则类型通过率
- 新增误伤样本列表
- 与上一版对比差异
- 建议是否允许 `promote/canary`

---

## 12. 命中日志与分析视图

### 12.1 日志最小字段

- `traceId`
- `inputText`
- `pageType`
- `ruleSetVersion`
- `matchedRuleIds`
- `normalizedSemantic`
- `usedAiFallback`
- `finalExecutionSuccess`
- `failureReason`

### 12.2 推荐分析视图

建议至少支持以下统计：

- 某版本的命中率趋势
- 某规则的误伤样本列表
- 某页面类型的 fallback 比例
- 某租户/域名的 canary 成功率
- 某字段别名规则的 Top failure inputs

### 12.3 线上样本回灌

命中日志中可筛选以下样本回灌到回放池：

- 进入 AI fallback 且最终失败
- 命中规则后执行失败
- 未命中任何规则但人工修正成功
- 同一输入在不同页面类型上行为不一致

---

## 13. 与现有模块的职责关系

### 13.1 `browser-command.service.ts`

继续负责：

- 通用登录、导航、列表/详情骨架
- 通用 read/click/fill 句式
- AI fallback 触发与结果整合

不再继续扩张：

- ERP 字段别名
- ERP 审批动作别名
- ERP 区域别名
- ERP 实体别名

### 13.2 `recorder-observation.service.ts` / `recorder-structure-probe.service.ts`

继续负责：

- observation 摘要
- 结构化候选信息
- 页面类型和区域上下文

这些输出是规则命中日志和回放样本的关键输入，不应由规则系统重复建模。

### 13.3 AI planner

继续负责：

- 无规则覆盖的复杂意图
- 结构化候选不足时的补充推理
- 失败后的修正策略

规则系统的目标是降低 AI 自由度，而不是替代 AI。

---

## 14. 最小落地顺序

### Phase A：数据结构与日志

- 落库 `SemanticRuleSet / SemanticRule / SemanticRuleHitLog`
- 在解析链路补命中日志
- 固定 `browser_recorder` 域

### Phase B：回放与治理接口

- 落库 `SemanticRuleReplayCase / SemanticRuleReplayRun`
- 提供回放验证接口
- 提供最小查询接口

### Phase C：发布与回退

- 引入 `SemanticRuleRelease`
- 实现 `promote/canary`
- 实现 `promote/active`
- 实现 `rollback`

### Phase D：灰度完善

- 增加 targeting 维度
- 增加统计报表
- 增加运营与排障视图

---

## 15. 与其他文档的关系

- 总方案：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Plan_v4.0.md)
- 实施 Backlog：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md)
- `mock-erp` 评测站矩阵：[Enterprise-Skill-Platform_Browser-Mock-ERP-Evaluation-Site-Matrix_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Mock-ERP-Evaluation-Site-Matrix_v4.0.md)
- 平台 API 契约：[Enterprise-Skill-Platform_API-Contract-Spec_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_API-Contract-Spec_v4.0.md)

本文解决的是“规则系统如何被平台化治理”；它不替代页面矩阵文档，也不替代浏览器目录重组文档。

---

## 16. 一句话总结

> 浏览器业务语义规则如果继续散落在代码里的正则分支中，就永远只能靠发版和人工记忆演进；只有把它们升级成“有版本、有回放、有灰度、有回退、有审计”的规则资产，才能真正支撑录制态语义识别的持续优化。
