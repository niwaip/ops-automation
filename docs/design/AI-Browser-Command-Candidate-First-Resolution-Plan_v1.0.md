# AI Browser Command Candidate-First Resolution Plan v1.0

## 1. 背景

当前浏览器命令解析链已经具备页面候选感知能力：

- observation 中可以提供 `availableCandidates`
- action 候选可携带 `preferredLocator`
- 没有 `preferredLocator` 时仍可回退到 `ref`

但这套能力并未成为统一入口。实际解析链中仍有多条上游分支会直接产出裸文本点击，例如：

- 登录专用解析直接产出 `params.text = 登录`
- 通用点击上下文解析直接产出 `params.target = text="..."`
- pattern 规则解析直接产出 `params.target = text="..."`
- AI 提示语和示例仍在鼓励模型输出 `click text=登录`

因此系统同时存在两套相互冲突的策略：

1. 候选优先，尽量使用 `preferredLocator / ref / 结构化 locator`
2. 文本优先，直接把自然语言中的按钮名称翻译为执行文本

这会导致如下问题：

- 同一页面已经观测到真实按钮 `ログイン`，最终仍执行 `登录`
- `ref` 和 `preferredLocator` 明明存在，却无法进入最终命令
- 多语言页面、品牌化按钮文案、图标按钮、区域内主操作按钮都容易误判
- 系统行为依赖硬编码词表，扩展性差，且难以覆盖真实业务页面

## 2. 目标

本方案目标不是为“登录”新增更多词典，而是建立通用能力：

- 去掉登录、提交、确认等按钮文案硬编码驱动执行的模式
- 统一所有点击类意图的目标解析链路
- 优先使用当前页面已经观测到的结构化候选与 locator
- 将裸文本点击降级为最后回退，而不是默认输出
- 保持对固定业务页面的高成功率，同时避免为单页面定制特殊逻辑

## 3. 非目标

本方案不包含以下内容：

- 不引入复杂页面自愈或跨站通用视觉识别框架
- 不要求一次性重做全部解析器
- 不要求废弃现有 `ref`、`preferredLocator` 或 recorder 导出格式
- 不在本阶段解决页面发生较大结构变化后的自动重录问题

## 4. 现状问题拆解

### 4.1 当前解析顺序的问题

当前解析顺序是：

1. `parseLoginCommand()`
2. `parseCandidateReadIntent()`
3. `parseCandidateScopedAction()`
4. `parseWithCommandContext()`
5. `parseWithAIPlan()`
6. `parseSequentialCommands()`
7. `parseWithPatterns()`
8. `parseWithAI()`

问题不在于“候选能力不存在”，而在于：

- 某些上游分支会提前返回
- 提前返回的结果是裸文本点击
- 因而候选感知分支根本没有机会运行

### 4.2 当前失败模式

以 `输入用户名 124 密码 345 然后点击登录` 为例：

1. 请求被 `parseLoginCommand()` 先命中
2. 登录专用解析识别到“登录”意图
3. `extractLoginSubmitTarget()` 将其转成固定文本 `登录`
4. 最终生成 `click text=登录`
5. worker 在页面上查找 `登录`
6. 实际按钮文案是 `ログイン`
7. 点击失败

这个失败不是单点 bug，而是设计不一致导致的必然结果。

### 4.3 当前系统中的不一致点

- 页面观测层已经提供了结构化候选
- 解析层仍允许直接生成未绑定页面证据的点击命令
- AI 提示语并未强制使用候选，而是继续生成自由文本点击
- 测试中也有大量断言默认接受 `params.text = 登录`

## 5. 设计原则

### 5.1 Candidate First

只要当前页面已经提供候选元素，就优先基于候选生成点击目标。

### 5.2 Evidence First

页面上真实观测到的文本、role、locator、ref，优先级高于自然语言中的原始词面。

### 5.3 One Resolver

所有点击类意图最终都应流入同一个“目标解析器”，而不是每个分支各自生成点击参数。

### 5.4 Text as Fallback

裸文本点击可以保留，但只能作为没有候选、没有 locator、没有结构化线索时的最后回退。

### 5.5 No Locale Hardcode

不再通过 `登录 -> Log In -> Sign In -> ログイン` 这样的硬编码词典驱动执行。

### 5.6 Parser Produces Intent, Resolver Produces Target

解析器负责理解用户想做什么，目标解析器负责决定最终点哪个元素。

## 6. 目标能力模型

### 6.1 统一的动作意图结构

点击类解析分支不再直接生成最终 click 命令，而是先产出统一的动作意图：

```ts
type PendingActionIntent = {
  action: 'click';
  rawTarget?: string;
  regionHint?: string;
  roleHint?: 'button' | 'link' | 'tab' | 'menuitem';
  semanticHint?: 'submit' | 'open' | 'enter' | 'confirm' | 'back';
  rowHint?: {
    index?: number;
    key?: string;
    text?: string;
  };
  source:
    | 'login-parser'
    | 'candidate-parser'
    | 'context-parser'
    | 'pattern-parser'
    | 'ai-parser'
    | 'ai-plan';
};
```

关键点：

- 解析器只表达“用户要点什么”
- 不在这一层决定最终是否使用 `text`、`ref`、`css`、`role`

### 6.2 统一的候选目标解析器

新增统一的 `resolveActionIntentToLocator(intent, context)`：

输入：

- `PendingActionIntent`
- `availableCandidates`
- `availableButtons`
- `lastObservationText`
- `currentPageUrl`

输出：

```ts
type ResolvedActionTarget = {
  locator?: {
    type: 'ref' | 'css' | 'role' | 'test-id' | 'text';
    value: string;
  };
  matchedCandidateId?: string;
  confidence: number;
  resolutionMode:
    | 'preferred-locator'
    | 'ref'
    | 'structured-role'
    | 'text-fallback';
};
```

### 6.3 统一的优先级

点击目标解析优先级统一为：

1. `preferredLocator`
2. `ref`
3. 可稳定生成的结构化 locator
4. 页面真实文本生成的 `role/name` 或 `text`
5. 用户原始文本回退

说明：

- 第 4 步中的“页面真实文本”指从 candidate 中取到的真实 `label/text/name`
- 不是直接使用用户输入里的原始词面

## 7. 核心改造点

### 7.1 登录解析去特殊点击生成

`parseLoginCommand()` 只负责：

- 识别凭据字段
- 生成 `fill`
- 如果存在提交动作，则生成 `PendingActionIntent`

它不再直接调用 `extractLoginSubmitTarget()` 生成 `params.text`

可选保留：

- `extractLoginSubmitTarget()` 仅用于产出 `semanticHint='submit'` 或 `rawTarget='登录'`
- 但不再作为最终执行目标

### 7.2 所有点击类分支统一收口

以下分支都不再直接生成最终 click locator，而是产出 `PendingActionIntent`：

- `parseLoginCommand()`
- `parseCandidateScopedAction()`
- `parseWithCommandContext()` 中的点击分支
- `parseWithPatterns()` 中的点击分支
- `parseWithAIPlan()`
- `parseWithAI()`

然后统一进入：

1. `buildPendingActionIntent(...)`
2. `resolveActionIntentToLocator(...)`
3. `buildClickCommandFromResolvedTarget(...)`

### 7.3 AI 输出契约收紧

AI 不再直接输出最终 `click text=...` 作为推荐形式。

优先输出：

```json
{
  "action": "click",
  "rawTarget": "登录",
  "roleHint": "button",
  "semanticHint": "submit"
}
```

或者输出候选绑定形式：

```json
{
  "action": "click",
  "candidateId": "candidate_1"
}
```

如果暂时不改 AI 输出 schema，也应在 AI 输出进入最终命令前再走统一 resolver。

### 7.4 Candidate 评分规则通用化

目标解析器评分不依赖语言词典，而是依赖页面证据：

- 候选是否处于 action/button/link 类角色
- 候选是否有 `preferredLocator`
- 候选是否有 `ref`
- 候选文本是否与 `rawTarget` 精确或近似匹配
- 候选是否位于指定区域
- 候选是否满足行级约束
- 在“submit/confirm/back”这类语义提示下，是否是当前区域的主操作候选

这里的关键不是为“登录”维护多语映射，而是：

- 用户输入提供语义方向
- 页面候选提供真实可点击对象
- resolver 在候选集合中选择最可信的一项

### 7.5 无候选时的回退规则

只有当以下条件同时成立时，才允许生成裸文本点击：

- 当前上下文没有可用 candidate
- 无法根据 observation 构建稳定 locator
- 用户输入目标足够短且明确
- 风险级别允许回退

并在命令中显式标记：

```ts
locator: {
  strategy: 'text',
  value: '登录',
  generatedBy: 'fallback',
  confidence: 0.4
}
```

这样后续日志和导出都能区分“候选解析成功”和“文本回退执行”。

## 8. 对 `ref` 的定位

### 8.1 `ref` 仍然保留

本方案不删除 `ref`。

原因：

- 在 recorder-debug 与实时执行阶段，`ref` 仍是页面观测与执行之间的有效桥梁
- 它比裸文本点击稳定
- 它能表达“当前页面已经看见的具体元素”

### 8.2 `ref` 的职责边界

- 运行时执行可以优先使用 `preferredLocator / ref`
- 导出到长期模板时，仍按既有策略尽量转成 `role / css / text / nth-match`
- 因而 `ref` 适合运行时执行，不适合作为长期模板主 locator

这与当前 recorder 导出稳定化方向是一致的，并不冲突。

## 9. 兼容性与风险

### 9.1 兼容性收益

- 登录、多语言按钮、品牌化按钮文案不再依赖词表
- 通用点击、区域内点击、列表项点击可共用一条能力链
- AI 输出与 pattern 输出不再直接污染执行层

### 9.2 风险点

- 如果候选评分过宽，可能误选相邻按钮
- 如果 resolver 过早拒绝回退，可能让原本“勉强能点”的裸文本场景失败
- 如果一次性修改所有入口，测试面会较大

### 9.3 风险控制策略

- 保留裸文本回退，但降低优先级
- 首先只统一 click 类动作，不扩展到 fill/read
- 优先改造 recorder-debug 解析链，再扩到更泛的 browser-command 使用方
- 在日志中增加 `resolutionMode`、`matchedCandidateId`、`confidence`

## 10. 实施顺序

### Phase 1: 抽统一 resolver

新增以下职责清晰的模块：

- `action-intent.builder.ts`
- `action-target-resolver.service.ts`
- `click-command.factory.ts`

目标：

- 不改业务语义，只把“生成 click 命令”的末端流程统一

### Phase 2: 先接登录与候选点击

优先改造：

- `parseLoginCommand()`
- `parseCandidateScopedAction()`

原因：

- 当前最明显故障点就在登录
- 候选点击本身已具备基础能力，最容易收口

### Phase 3: 接入通用上下文与 pattern 分支

继续改造：

- `parseWithCommandContext()`
- `parseWithPatterns()`

目标：

- 把所有本地规则解析分支统一到一套点击目标生成链

### Phase 4: 收紧 AI 输出与提示语

调整：

- `parseWithAI()`
- `parseWithAIPlan()`
- 相关 prompt examples

目标：

- 不再鼓励 `click text=登录`
- 统一改为输出 action intent 或 candidate-aware 形式

### Phase 5: 回归测试与真实页面验证

重点覆盖：

- 中文输入 + 日文登录按钮
- 中文输入 + 英文登录按钮
- 品牌按钮文案与用户输入不一致
- 区域内同名按钮
- 列表行内操作按钮
- 无 candidate 时的文本回退

## 11. 受影响文件范围

首批预计涉及：

- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/browser-command.service.ts`
- 新增 `action-target-resolver.service.ts`
- 新增 `click-command.factory.ts`
- `recorder-debug` 相关 spec
- `execution-reconcile` 相关 spec

必要时补充：

- observation/candidate 结构日志字段
- AI prompt 组装相关函数

## 12. 建议的验收标准

### 12.1 功能验收

- 同一句 `输入用户名 124 密码 345 然后点击登录`
- 在按钮为 `ログイン` / `Sign In` / `平台登录` 时都能点击成功
- 且不依赖按钮文案硬编码映射

### 12.2 运行时验收

- 日志中可看到 `resolutionMode`
- 日志中可看到 `matchedCandidateId` 或 `fallback`
- 当命中 candidate 时，不再输出裸 `params.text`

### 12.3 回归验收

- 现有候选点击、列表点击、区域点击场景不回退
- recorder 导出策略不被本方案破坏
- `ref` 仍可在运行时使用，但不被导出为长期模板 locator

## 13. 最小结论

本次问题的根因不是“登录”这个词没有翻译到 `ログイン`，而是系统没有把“页面候选优先”提升为统一解析原则。

因此正确方向不是继续扩充登录文案映射，而是：

- 让解析器产出意图
- 让统一 resolver 根据页面候选决定最终目标
- 让 `preferredLocator / ref / 结构化 locator` 成为默认路径
- 让裸文本点击仅作为最后回退

这是一种通用能力，不依赖单页面硬编码，也更符合当前 recorder 与真实业务场景的长期演进方向。
