# AI Browser Execution Planner and Controller Refactor Plan v1.0

## 1. 背景

当前 `browser-command` 模块已经完成一轮 `candidate-first` 改造，但整体结构仍以单文件集中编排为主，`browser-command.service.ts` 同时承担了如下职责：

- 本地规则解析
- 登录解析
- 候选点击解析
- Pattern 解析
- AI Prompt 组装
- AI 响应解析
- Planner step 到命令映射
- Click 目标统一 resolver 收口

这导致几个持续性问题：

1. `browser-command.service.ts` 已超过仓库建议阈值，维护成本高
2. Prompt、Planner、执行控制、失败恢复没有明确边界
3. “重试”无法作为独立能力演进，只能表现为“再解析一次”
4. 同一句多阶段命令容易在错误的页面状态下被一次性解析到底
5. 观察、执行、下一步决策之间缺少显式控制器

典型问题示例：

- 用户输入：`打开 http://192.168.100.143/#approvals 然后点击登录`
- 当前实现会在 `about:blank` 上下文中直接解析成：
  - `navigate approvals`
  - `click text=登录`
- 但真正合理的流程应该是：
  - 先导航
  - 再重新观察页面
  - 再根据新的 candidate / observation 决定如何点击

这说明当前核心缺口已经不只是 Prompt 文本，而是缺少一个明确的“浏览器执行计划器 + 执行控制器”能力层。

## 2. 目标

本方案目标是将当前 `browser-command` 从“万能解析器”演进为“规则解析器 + 执行计划器 + 执行控制器 + Runtime 适配层”的清晰架构。

具体目标：

- 将 AI Prompt 与响应解析从 `browser-command.service.ts` 中独立
- 建立独立的 `BrowserExecutionPlannerService`
- 建立独立的 `BrowserExecutionControllerService`
- 将页面观察、步骤执行、失败恢复纳入统一控制回路
- 为 AI 重试提供结构化失败上下文
- 支持“先执行一步，再观察，再规划下一步”的控制模式
- 在不破坏现有候选优先解析能力的前提下，收敛 AI 与规则路径

## 3. 非目标

本方案不包含以下内容：

- 不重写 browser worker 执行协议
- 不重写 recorder-debug 整体产品形态
- 不一次性废弃现有本地 parser
- 不要求一次性把所有命令全部改造成 agent loop
- 不在第一阶段引入复杂多轮 autonomous browser agent

## 4. 现状问题拆解

### 4.1 单文件职责过载

当前 `browser-command.service.ts` 中至少包含以下几类能力：

- 规则解析入口 `parseCommand()`
- 登录/候选/pattern/context 本地解析
- AI parser
- AI planner
- Prompt 构造
- Planner step 转命令
- Click command 收口

这些能力放在一个文件中，会带来：

- 模块边界不清
- 测试难以按职责组织
- Prompt 改动容易影响规则解析稳定性
- 重试逻辑难以插入

### 4.2 计划与执行没有显式分层

当前系统虽然有 `buildAIPlan()`，但它本质上仍是 `browser-command.service.ts` 中的一个私有方法，而不是稳定的“计划器服务”。

执行层虽然已有：

- `recorder-debug-execution.service.ts`
- `recorder-debug-chat-execution.service.ts`
- `recorder-observation.service.ts`

但这些服务更多是“执行已有命令”，不是“驱动计划、执行、观察、再决策”的控制器。

### 4.3 重试机制没有真实闭环

当前问题不是简单的“重试次数为 0”，而是：

- 没有可恢复错误分型
- 没有统一失败上下文结构
- 没有“失败后重新观察”的标准流程
- 没有“强制走 AI 恢复规划”的入口

因此即使简单增加 retry count，也容易重复输出同样的错误动作。

### 4.4 Prompt 本身也需要独立治理

当前 `parseWithAI()` 和 `buildAIPlan()` 都使用大段内联 Prompt 字符串，存在以下问题：

- 难以比较不同 Prompt 版本
- 难以做局部 section 复用
- 候选上下文、失败上下文、规则约束都耦合在一起
- 测试只能通过字符串包含断言，难以模块化验证

## 5. 设计原则

### 5.1 Planner Owns Reasoning

理解用户意图、分析页面状态、判断下一步策略，应由 Planner 负责，而不是散落在多个 service 中。

### 5.2 Controller Owns Loop

执行、观察、判断是否继续、是否重试、是否交给用户，必须由 Controller 统一控制。

### 5.3 Runtime Is Adapter

执行命令、采集快照、构造 observation、提取 candidates，属于 Runtime 适配层，而不是 Planner 的职责。

### 5.4 Rules First, AI Recoverable

本地规则解析仍保留，但它不应垄断所有场景；在失败恢复、复杂多步、状态依赖场景中，应允许切换到 Planner。

### 5.5 Candidate First Still Holds

无论来源是规则解析还是 AI Planner，最终点击目标仍需统一走 candidate-first resolver。

### 5.6 Prompt Builder Is Independent

Prompt 构造必须独立成模块，以便演进：

- CoT / analysis 策略
- Failure Reflection
- Candidate 树状上下文
- Prompt 长度治理

## 6. 目标架构

### 6.1 分层结构

建议将 `browser-command` 相关能力调整为以下 5 层：

1. `BrowserCommandFacadeService`
2. `BrowserRuleParserService`
3. `BrowserExecutionPlannerService`
4. `BrowserExecutionControllerService`
5. `BrowserRuntimeService`

### 6.2 各层职责

#### 6.2.1 BrowserCommandFacadeService

职责：

- 对外保留当前 `parseCommand()` 等兼容入口
- 作为旧接口向新结构过渡的 façade
- 根据调用场景路由到 rule parser / planner / controller

#### 6.2.2 BrowserRuleParserService

职责：

- 处理本地规则解析
- 优先覆盖高确定性、低成本场景
- 产出：
  - `BrowserCommand[]`
  - 或 `PendingActionIntent`
  - 或 `BrowserExecutionPlanDraft`

建议收纳的能力：

- 登录解析
- candidate scoped action
- command context 解析
- pattern 解析
- sequential command 解析

#### 6.2.3 BrowserExecutionPlannerService

职责：

- 接收用户输入、页面状态、失败上下文
- 生成下一组执行步骤
- 生成解释信息
- 负责调用模型

它不负责：

- 真正执行命令
- 观察页面
- 决定是否重试

#### 6.2.4 BrowserExecutionControllerService

职责：

- 驱动“计划 -> 执行 -> 观察 -> 再判断”的控制回路
- 识别可恢复错误
- 构造 retry context
- 决定是否强制切到 AI recovery 模式

它是本方案的核心新增能力。

#### 6.2.5 BrowserRuntimeService

职责：

- 包装执行、快照、结构探测、observation 构造、candidate 提取
- 复用现有 recorder-debug 执行与 observation 服务

## 7. 推荐文件拆分

建议新增以下文件：

- `browser-command-facade.service.ts`
- `browser-rule-parser.service.ts`
- `browser-execution-planner.service.ts`
- `browser-execution-controller.service.ts`
- `browser-planner-prompt.builder.ts`
- `browser-planner-response.parser.ts`
- `browser-candidate-context.formatter.ts`
- `browser-failure-context.builder.ts`
- `browser-plan-step.mapper.ts`
- `browser-retry-policy.service.ts`

### 7.1 当前文件拆分建议

从 `browser-command.service.ts` 中拆出：

#### 规则解析侧

- `parseLoginCommand()`
- `parseCandidateScopedAction()`
- `parseWithCommandContext()`
- `parseWithPatterns()`
- `parseSequentialCommands()`

#### Planner 侧

- `parseWithAI()`
- `parseWithAIPlan()`
- `buildAIPlan()`

#### 映射与收口侧

- `mapPlanStepsToCommands()`
- `resolveClickCommandsWithContext()`

### 7.2 现有服务复用建议

建议复用而非重写：

- `action-target-resolver.service.ts`
- `click-command.factory.ts`
- `recorder-debug-execution.service.ts`
- `recorder-observation.service.ts`
- `recorder-structure-probe.service.ts`

## 8. BrowserExecutionPlannerService 设计

### 8.1 输入模型

建议引入统一输入：

```ts
type BrowserPlannerInput = {
  userInput: string;
  mode: 'initial' | 'retry';
  currentState: BrowserExecutionState;
  failureContext?: BrowserFailureContext;
};

type BrowserExecutionState = {
  currentPageUrl?: string;
  observationText?: string;
  visibleInputs?: string[];
  visibleButtons?: string[];
  candidates?: BrowserCommandCandidate[];
  controlHints?: string[];
};

type BrowserFailureContext = {
  lastAction: Record<string, unknown>;
  errorMessage: string;
  errorType?: string;
  retryable?: boolean;
  failedStepIndex?: number;
};
```

### 8.2 输出模型

```ts
type BrowserExecutionPlan = {
  analysis?: string;
  explanation: string;
  steps: BrowserPlanStep[];
};
```

### 8.3 Prompt 策略

Planner 不应再直接内联大段 Prompt，而应由 `browser-planner-prompt.builder.ts` 构造。

建议拆成以下 section：

- `buildSystemRulesSection()`
- `buildObservationSection()`
- `buildCandidatesSection()`
- `buildFailureContextSection()`
- `buildOutputContractSection()`
- `buildExamplesSection()`

### 8.4 关于 thought / analysis

不建议强依赖原始 `thought` 字段，建议改为：

- 正常模式：`analysis` 可选，限制 1-2 句
- 重试模式：`analysis` 必填，明确说明“上次失败原因 + 本次规避策略”

原因：

- 更稳定
- 更适合落日志与展示
- 避免完整推理链泄露和解析脆弱性

## 9. Prompt 改造建议

### 9.1 Candidates 树状格式化

当前平铺 `candidate.summary` 的方式对 LLM 结构理解不够友好。

建议主视图改为树状：

```text
Visible Page Candidates:

Primary Actions:
  [action_24] Button "保留中" (ref=e82)
  [action_25] Button "承認済み" (ref=e83)

Rows:
  Row 1 (PRJ-2026-001):
    Fields:
      [field_41] Status "保留中"
    Actions:
      [action_35] Button "詳細"

Inputs:
  [input_2] Textbox "プロジェクトコード、キーワードで検索..." (ref=e62)
```

但不建议完全废弃结构化附录，建议保留一段紧凑 summary：

```text
Structured Candidate Hints:
  action_24: kind=action ref=e82 role=button label=保留中
  action_35: kind=action row=1 rowKey=PRJ-2026-001 action=detail label=詳細
```

### 9.2 Failure Context 注入

当 `mode='retry'` 且存在 `failureContext` 时，Prompt 应额外包含：

```text
### Failure Context
- Last action: click text=登录
- Error type: element_not_found
- Error message: Text click failed to find element: 登录
- Recovery rule: avoid repeating the same broad text click if current page now contains stronger candidates
```

### 9.3 输出契约

建议统一 JSON 契约：

```json
{
  "analysis": "上一步失败，因为当前页面没有“登录”文本，实际应基于新页面候选重新选择按钮。",
  "steps": [
    {
      "action": "click",
      "params": {
        "candidateId": "action_1"
      },
      "description": "点击登录按钮"
    }
  ],
  "explanation": "重新基于当前页面候选点击登录按钮"
}
```

## 10. BrowserExecutionControllerService 设计

### 10.1 核心职责

Controller 负责驱动以下闭环：

1. 获取 observation
2. 选择规则解析或 planner
3. 执行当前步骤
4. 执行后重新观察
5. 判断是否成功
6. 判断是否需要 AI recovery retry
7. 继续执行下一步 / 交用户 / 停止

### 10.2 决策模型

```ts
type BrowserControllerDecision =
  | { kind: 'execute'; plan: BrowserExecutionPlan }
  | { kind: 'retry-with-ai'; plannerInput: BrowserPlannerInput }
  | { kind: 'ask-user'; reason: string }
  | { kind: 'stop'; reason: string };
```

### 10.3 推荐执行流程

```text
observe
  -> rule parser
    -> if high-confidence: execute
    -> else planner
execute
  -> observe
  -> success ? done
  -> retryable failure ? build failure context
  -> planner retry mode
  -> execute retry steps
  -> still failed ? ask-user / stop
```

### 10.4 关键价值

这个 Controller 能解决当前最典型的问题：

- 首句中包含导航 + 点击
- 导航前的页面状态不足以支持点击目标解析
- 必须先执行导航，再观察页面，才能决定下一步

## 11. Retry 机制整改建议

### 11.1 当前问题

当前不是简单“没有重试”，而是：

- 没有 retry policy
- 没有 failure context
- 没有强制 AI recovery 入口
- 没有重试前重新观察页面

### 11.2 建议策略

建议只允许 **一次自动 AI 恢复重试**，避免无限循环。

### 11.3 触发条件

仅对可恢复错误触发：

- `Text click failed to find element`
- strict mode ambiguity
- stale / target missing
- 首轮导航后 observation 为空或候选为空

### 11.4 Retry 流程

1. 首次执行失败
2. 判断 `retryable=true`
3. 重新 observe 当前页面
4. 构造 `failureContext`
5. 强制走 Planner recovery 模式
6. 将失败信息 + 当前 observation + candidates 一起注入 Prompt
7. 执行第二轮计划
8. 若仍失败，则交给用户或停止

### 11.5 关键约束

重试时必须满足：

- 不再走普通 `parseCommand()` 全链路
- 不再让本地 parser 抢先吞掉请求
- 必须使用新的 observation，而不是沿用旧 observation

## 12. 对 browser-command.service.ts 的整改建议

### 12.1 不建议继续堆逻辑

当前文件已经超过仓库建议阈值，不应继续把：

- Prompt 文本
- Retry 逻辑
- Controller 编排

继续叠加在这个文件里。

### 12.2 推荐改造方式

保留 `browser-command.service.ts` 作为过渡 façade：

- 对外保留兼容接口
- 内部委托给新 service

最终目标：

- `browser-command.service.ts` 只保留很薄的一层路由

## 13. 分阶段实施建议

### Phase 1: 抽 Prompt 与解析器

新增：

- `browser-planner-prompt.builder.ts`
- `browser-planner-response.parser.ts`
- `browser-candidate-context.formatter.ts`

目标：

- 去掉 `browser-command.service.ts` 中的大段内联 Prompt
- 保持现有行为不变

### Phase 2: 建立 Planner Service

新增：

- `browser-execution-planner.service.ts`

目标：

- `parseWithAI()` / `buildAIPlan()` 不再自己组装 Prompt
- 统一通过 Planner Service 调用模型

### Phase 3: 建立 Controller Service

新增：

- `browser-execution-controller.service.ts`

目标：

- 在 `recorder-debug` 场景中先接入“计划 -> 执行 -> 观察”的控制回路

### Phase 4: 接入 Failure Context 与 Retry Policy

新增：

- `browser-failure-context.builder.ts`
- `browser-retry-policy.service.ts`

目标：

- 建立一次可恢复 AI 重试

### Phase 5: 收口规则解析与 Planner 协作

目标：

- 让 rule parser 成为“高置信快速路径”
- 让 Planner 成为“复杂多步与恢复路径”

## 14. 测试建议

### 14.1 Prompt Builder 测试

新增：

- 正常模式 prompt 组装测试
- retry 模式 prompt 注入测试
- candidate tree 格式测试
- failure context section 测试

### 14.2 Planner 响应解析测试

新增：

- 兼容 `analysis` 字段
- 兼容 `commands` 输出
- 兼容 `steps` 输出

### 14.3 Controller 测试

新增：

- 初次执行成功
- 首次失败后 retryable AI recovery
- 非 retryable 不重试
- retry 强制使用最新 observation
- retry 时不再走本地 parser 抢先路径

### 14.4 回归测试

重点覆盖：

- `打开 approvals 然后点击登录`
- 中文意图 + 日文按钮
- 多候选同名按钮
- 首轮页面空白、二轮有候选
- 未承认 / 保留中 / 待处理 等状态同义映射

## 15. 风险与控制

### 15.1 风险

- 若只抽 Prompt、不建 Controller，问题会被重新分散
- 若 retry 不加边界，可能导致无限循环
- 若 candidate tree 过长，可能造成 Prompt 膨胀
- 若强制输出完整 `thought`，可能增加解析脆弱性

### 15.2 风险控制

- 首先只在 `recorder-debug` 接入 Controller
- 自动重试只允许 1 次
- `analysis` 限制长度，不强依赖完整 CoT
- candidate context 增加截断与优先级排序

## 16. 最小结论

本次整改不应仅理解为“提示词优化”。

更准确的方向是：

- 将 `browser-command` 从万能解析器演进为
  - 规则解析器
  - 执行计划器
  - 执行控制器
  - Runtime 适配层

其中最关键的新增能力不是 Prompt Builder 本身，而是：

- `BrowserExecutionPlannerService`
- `BrowserExecutionControllerService`
- `Failure Context + Retry Policy`

只有这样，系统才能真正支持：

- 先执行
- 再观察
- 再决定下一步
- 失败后基于新状态进行恢复规划

这也是后续从“命令解析”走向“浏览器智能执行”所必须建立的架构基础。
