# 企业级技能平台 浏览器语义规则版本化与模块重组方案 v4.0

- 版本：v4.0
- 日期：2026-06-21
- 状态：设计中，待代码落地
- 适用范围：
  - `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/`
  - `apps/backend/orchestration/ai-orchestrator/src/modules/browser-phase-recovery/`
  - `mock-erp` 及后续浏览器测试网站

## 1. 背景

当前浏览器录制与调试链路已经具备以下能力：

- 录制态页面观察、候选抽取、参数识别、命令生成
- AI planner + 规则 parser 混合解析
- 调试执行、循环导出、条件分支、人工接管与恢复
- 导出 `executionPlan/templateSteps/loopDraft/manualInterventions`

但围绕语义识别、测试验证和模块组织仍存在三个明显问题：

1. `browser-command.service.ts` 中同时承载了通用规则、业务词汇归一化和兜底 AI 逻辑，边界不清晰。
2. `mock-erp` 目前更像演示站，不足以系统验证“语义识别 + 命令生成 + 候选定位”的能力。
3. 浏览器相关文件堆积在 `browser-command/` 目录，录制、观察、执行、导出、恢复混在一起，不符合处理流程，也不利于后续拆分。

本方案把这三个问题合并处理，先形成统一设计，再进行代码改造。

## 2. 目标

### 2.1 目标

- 将浏览器语义识别拆成“通用规则层 + 业务语义层 + AI 补全层”
- 让业务语义规则支持版本化、灰度发布、回退和失败样本回放
- 将 `mock-erp` 升级为“可评测测试网站”，而不仅是演示网站
- 按浏览器处理流程重新组织浏览器相关目录
- 为后续代码重构提供明确的迁移顺序和验收标准

### 2.2 非目标

- 本文不直接修改当前线上执行协议
- 本文不直接引入视觉 agent 或多模态模型
- 本文不替换现有 AI planner，只约束其输入输出边界
- 本文不在本轮把所有业务语义完全外置

## 3. 设计原则

### 3.1 通用规则留在代码里

`browser-command.service.ts` 内应保留跨站点、跨业务仍成立的规则，例如：

- 登录：用户名、密码、验证码、登录、提交
- 导航：打开、前往、访问、go to、visit
- 页面动作：点击、填写、搜索、截图、滚动、切换标签
- 列表与详情骨架：一览、列表、表格、第 N 条、详情、明细、返回

### 3.2 业务语义外置并版本化

只在特定业务域内成立的语义，不继续堆进通用解析器，例如：

- 字段别名：`粗利率`、`毛利率`、`gross margin`
- 动作别名：`承认`、`批准`、`审批通过`
- 区域别名：`审批区`、`决策区`、`操作区`
- 业务实体：`案件`、`申请单`、`项目`

### 3.3 优先使用结构化候选，而不是业务正则

当页面观察阶段已经能提供 `candidateId / row / region / stableName / field / preferredLocator` 时，应优先依赖结构化候选解析，而不是继续增加业务正则。

### 3.4 测试网站必须服务于评测

测试网站不仅要“能走流程”，还要能稳定回答以下问题：

- 规则是否命中正确意图
- 候选召回是否充分
- 定位是否稳定
- 命令是否能在页面变体上保持成功

## 4. 当前问题拆解

### 4.1 语义规则问题

当前实现中，通用解析和业务语义归一化混在一起，导致：

- 新业务容易继续往通用解析器里加词
- 很难区分“通用能力问题”还是“业务词汇问题”
- 规则更新依赖代码发版，无法灰度和回退

### 4.2 测试网站问题

仅靠单一 `mock-erp` 页面走通，并不能证明以下能力：

- 列表第 N 行定位是否稳定
- 同义字段是否能被正确识别
- 区域变体和按钮文案变化是否会打断解析
- 页面结构略变时，候选与语义映射是否仍能工作

### 4.3 模块组织问题

当前 `browser-command/` 下混合了：

- API controller
- 会话管理
- 页面观察
- 自然语言解析
- 调试执行
- 循环与条件分支
- 导出
- 接管后 reconcile

同时 `browser-phase-recovery/` 作为独立目录存在，但与浏览器主链路关联紧密，容易造成理解成本和跨目录跳转。

## 5. 总体方案

整体方案分三层推进：

1. 测试层：建立可评测浏览器测试网站
2. 语义层：建立规则版本化与样本回放机制
3. 模块层：按处理流程重组浏览器目录

## 6. 测试网站方案

### 6.1 定位

`mock-erp` 的下一阶段定位不是演示站，而是“浏览器语义识别与命令生成训练场”。

### 6.2 页面矩阵

至少应包含以下页面类型：

- 登录页
- 搜索页
- 一览列表页
- 详情页
- 审批页
- 弹窗确认页
- 筛选页
- 异常/空状态页

### 6.3 每类页面必须有变体

同一业务页面至少准备 3 类变体：

- 文案变体：
  - `详情` / `明细` / `查看`
  - `承认` / `批准` / `通过`
- 结构变体：
  - 表格列顺序变化
  - 按钮位置变化
  - 区域分组变化
- 可定位性变体：
  - 有 `data-testid`
  - 只有文本和 role
  - 只有区域标签和行信息

### 6.4 推荐的页面标注能力

测试网站应尽量暴露稳定的结构化标注，以便评估“结构化候选是否足够强”：

- `data-ai-region`
- `data-ai-action`
- `data-ai-field`
- `data-row-key`
- `data-entity-id`
- `data-stable-name`

这些标注优先作为测试和观测辅助，不强制直接暴露给最终线上站点。

### 6.5 评测任务集

任务集应分为三层：

- 通用交互任务：
  - 登录
  - 搜索
  - 打开详情
  - 返回列表
- 结构化语义任务：
  - 打开第 2 条详情
  - 读取当前案件粗利率
  - 在审批区点击承认
- 业务语义任务：
  - 在 `gross margin` 低于阈值时进入人工审核
  - 读取 `案件利润率`
  - 在 `决策区` 选择 `审批通过`

### 6.6 评测指标

建议至少记录以下指标：

- `candidate_recall`
- `candidate_top1_accuracy`
- `candidate_topk_accuracy`
- `intent_accuracy`
- `step_success_rate`
- `flow_success_rate`
- `fallback_to_ai_rate`
- `rule_hit_rate`
- `rule_misfire_rate`

## 7. 动态正则与语义规则版本化方案

### 7.1 规则边界

规则系统只负责“语义归一化”，不直接负责最终执行。

规则命中后的输出应是标准语义对象，例如：

```json
{
  "semanticIntent": "approve",
  "fieldAlias": "grossMargin",
  "regionAlias": "decision-actions"
}
```

最终命令仍由代码层统一生成。

### 7.2 规则分类

第一阶段推荐支持以下规则类型：

- `intent_alias`
- `field_alias`
- `region_alias`
- `entity_alias`
- `row_reference`
- `read_intent`
- `login_phrase`

### 7.3 规则数据结构

```ts
type SemanticRuleSet = {
  id: string;
  scene: 'browser_recorder';
  version: string;
  status: 'draft' | 'canary' | 'active' | 'archived';
  description?: string;
  basedOnVersion?: string;
  createdAt: string;
  createdBy: string;
  rules: SemanticRule[];
};

type SemanticRule = {
  id: string;
  type:
    | 'intent_alias'
    | 'field_alias'
    | 'region_alias'
    | 'entity_alias'
    | 'row_reference'
    | 'read_intent'
    | 'login_phrase';
  enabled: boolean;
  priority: number;
  patterns: string[];
  flags?: string;
  outputs: Record<string, unknown>;
  examples?: string[];
  negativeExamples?: string[];
  note?: string;
};
```

### 7.4 发布与回退流程

1. 收集线上失败样本：
   - 用户自然语言
   - 页面观察结果
   - 命中的旧规则
   - 实际失败原因
2. 生成新规则版本
3. 对历史样本集做离线回放
4. 通过后进入 `canary`
5. 观测命中率、误伤率、成功率
6. 稳定后提升为 `active`
7. 异常时一键回退到上一版

### 7.5 灰度维度

建议至少支持：

- 环境
- 租户
- 用户
- 技能
- 域名
- 页面类型

### 7.6 命中日志

每次解析应记录：

- 原始用户输入
- 页面 URL / title / observation 摘要
- 命中的 rule set version
- 命中的 rule id 列表
- 规则归一化输出
- 最终 parser 输出
- 是否进入 AI fallback
- 最终执行是否成功

### 7.7 与 AI 的关系

规则版本化不是为了替代 AI，而是为了缩小 AI 需要处理的自由度。

推荐顺序：

1. 通用 parser
2. 规则归一化
3. 结构化候选定位
4. AI planner / fallback

## 8. `browser-command.service.ts` 的边界重塑

改造后建议职责如下：

- 保留：
  - 通用命令句式识别
  - 通用列表/详情骨架识别
  - 通用登录/导航/搜索语义
  - AI fallback 触发与结果整合
- 移出：
  - 业务字段别名
  - 业务动作别名
  - 业务区域别名
  - 业务实体别名

换句话说：

- 离开 ERP 仍成立的，留在代码里
- 只在业务域内成立的，进入规则版本系统
- 结构化候选能解决的，不再写业务正则

## 9. 浏览器目录重组方案

### 9.1 设计目标

目录组织应能直接映射浏览器处理流程：

- API
- 会话
- 观察
- 意图解析
- 执行
- 循环
- 导出
- 恢复

### 9.2 目标目录

```text
modules/
  browser/
    api/
      browser-command.controller.ts
      recorder-debug.controller.ts
    session/
      recorder-debug-session-store.service.ts
      recorder-debug-session-coordinator.service.ts
    observe/
      recorder-observation.service.ts
      recorder-snapshot.service.ts
      recorder-structure-probe.service.ts
      recorder-debug-observation-refresh.service.ts
    intent/
      browser-command.service.ts
      browser-command.types.ts
      action-intent.builder.ts
      action-target-resolver.service.ts
      click-command.factory.ts
      browser-action-validator.service.ts
      browser-candidate-context.formatter.ts
      browser-execution-planner.service.ts
      browser-planner-prompt.builder.ts
      browser-planner-response.parser.ts
      browser-planner.constants.ts
      recorder-disambiguation.service.ts
      recorder-parameter.service.ts
    execute/
      browser-execution-controller.service.ts
      recorder-debug.service.ts
      recorder-debug-execution.service.ts
      recorder-debug-chat-support.service.ts
      recorder-debug-chat-flow.service.ts
      recorder-debug-chat-execution.service.ts
      recorder-debug-response.service.ts
      execution-reconcile.service.ts
    loop/
      recorder-loop.types.ts
      recorder-loop.service.ts
      recorder-loop-state.service.ts
      recorder-loop-locator.service.ts
      recorder-loop-export.service.ts
      recorder-conditional-branch.service.ts
    export/
      browser-recording-execution-plan.ts
      recorder-export-assembly.service.ts
      recorder-export.service.ts
      recorder-script-export.service.ts
      recorder-template-export.service.ts
    recovery/
      browser-phase-recovery.service.ts
    browser.module.ts
```

### 9.3 命名原则

- `api/` 只放 controller
- `session/` 只放 session 状态和协调
- `observe/` 只放页面观察与快照
- `intent/` 只放解析、候选定位、planner、规则
- `execute/` 只放执行、调试编排和接管后 reconcile
- `loop/` 只放循环和条件分支
- `export/` 只放导出与 IR 组装
- `recovery/` 只放 phase recovery

### 9.4 模块边界

推荐新增统一入口 `BrowserModule`，并由其导出：

- `BrowserCommandService`
- `RecorderDebugService`
- `RecorderLoopService`
- `ExecutionReconcileService`
- `BrowserPhaseRecoveryService`

后续外部模块不再直接依赖旧目录名。

## 10. 实施顺序

### Phase A：文档与规则边界固化

- 完成本方案文档评审
- 明确通用规则与业务规则边界
- 明确 `mock-erp` 页面矩阵和评测指标

### Phase B：评测与日志先行

- 给现有 parser 补命中日志
- 建立失败样本采集
- 建立 mock 站任务集和回放脚本

### Phase C：规则版本化

- 抽离规则加载器与 active version 指针
- 优先外置：
  - `intent_alias`
  - `field_alias`
  - `region_alias`

### Phase D：目录重组

- 引入 `modules/browser/`
- 先迁移目录，不改业务行为
- 再按子目录逐步收口依赖

### Phase E：验收与发布

- 回放通过
- 诊断通过
- 测试站任务集达到目标成功率
- 文档与导航同步更新

## 11. 验收标准

达到以下标准后，才进入代码全面落地：

- 通用规则与业务规则边界得到确认
- `mock-erp` 页面矩阵和指标得到确认
- 语义规则版本化数据结构和发布流程得到确认
- 浏览器目录目标树和迁移顺序得到确认
- 至少定义一组最小回放样本集

## 12. 推荐下一步

按优先级建议这样推进：

1. 先补 `mock-erp` 页面矩阵和评测任务集
2. 再实现语义规则版本化最小闭环
3. 最后再做目录重组

原因是：

- 没有测试站和回放，规则版本化无法安全演进
- 没有规则边界，目录重组只会把混乱换个地方继续存在

