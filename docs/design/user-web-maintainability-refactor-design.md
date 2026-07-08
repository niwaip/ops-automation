# user-web 可维护性收敛设计

状态：基本完成

本文档用于约束 `apps/frontend/user-web/` 的前端收敛方向。目标不是重写页面，而是在保持当前页面机能、视觉结果和交互约束不回退的前提下，把已经过载的页面拆回清晰、可持续维护的结构。

## 1. 背景

当前 `user-web` 的目录分层表面上已经具备：

- `adapters`
- `api`
- `app`
- `features`
- `shared`

但实际维护压力主要来自以下问题：

1. 多个页面文件已经明显超过仓库约定阈值，页面同时承载数据获取、状态编排、领域规则、格式化工具和渲染。
2. 当前页面功能迭代较快，一部分旧入口、旧工具和预留文件已经不再参与真实调用链。
3. 跨页面存在重复实现，规则一旦继续分散，后续修复会出现“改了一处，漏了另一处”的漂移问题。
4. 通知链路存在“页面提供刷新动作，但真实服务端拉取已关闭”的失配，属于功能表象存在、实际链路失效。

## 2. 当前问题归类

### 2.1 职责过载页面

当前重点过载对象：

- `src/features/chat/pages/ChatPage.tsx`
- `src/features/dashboard/pages/DashboardPage.tsx`
- `src/features/executions/pages/ExecutionListPage.tsx`
- `src/features/executions/pages/ExecutionDetailPage.tsx`
- `src/features/executions/pages/ExecutionCreatePage.tsx`
- `src/features/skills/pages/PublishedSkillListPage.tsx`

这些文件的问题不是单纯“行数大”，而是同时混入：

- 页面容器逻辑
- 查询与缓存协同
- SSE / stream 解析
- 任务状态归并
- 展示格式化
- 副作用通知
- 局部领域规则

这会导致：

- 新需求很难判断改动落点
- 回归问题定位慢
- 重复逻辑持续扩散
- 页面文件改动 blast radius 过大

### 2.2 冗余或无效代码

当前已识别的高置信度冗余对象：

- `src/components/page/PageScaffold.tsx`
- `src/adapters/download/browserFileDownload.ts`
- `src/adapters/platform/browserId.ts`
- `src/auth.ts`

这些对象在当前 `user-web/src` 范围内没有实际引用，继续保留会增加误判成本。

### 2.3 重复实现

当前存在跨文件重复的规则/工具：

- `supportsNativeReasoning`
- `buildSessionId`
- `resolveActionPath`
- `formatDateTime`
- `summarizeCronExpression`

这类重复实现本身不一定立即造成功能错误，但会显著提高后续维护成本。

### 2.4 通知链路失配

通知页当前主要依赖本地 `notificationStore`，而 `UserRuntimeEffects` 内服务端通知拉取开关关闭。结果是：

- 用户能看到“刷新”
- 但刷新并不会真正重新拉取服务端通知

这属于必须优先修正的链路问题。

## 3. 设计目标

本次收敛只做以下四件事：

1. 修复真实失效链路，优先恢复通知页的语义一致性。
2. 删除当前不再参与页面机能的冗余文件。
3. 抽出重复规则，建立稳定共享落点。
4. 将超大页面拆为“页面容器 + 领域 hooks/utils + 纯展示组件”三层。

## 3.1 当前落地进度

截至当前版本，已完成或已明确进入代码的内容如下：

1. 通知刷新链路已修正，通知页“刷新”可以真实触发服务端同步。
2. 已删除一批 `user-web/src` 内无引用的冗余文件。
3. 已收拢共享规则：
   - `src/shared/lib/aiModelReasoning.ts`
   - `src/shared/lib/notificationNavigation.ts`
   - `src/shared/lib/dateText.ts`
   - `src/shared/lib/scheduleText.ts`
   - `src/features/chat/lib/session.ts`
4. `ChatPage.tsx` 已完成多轮拆分，当前已下沉：
   - `src/features/chat/hooks/useChatSessions.ts`
   - `src/features/chat/hooks/useChatStreaming.ts`
   - `src/features/chat/hooks/useChatPageActions.ts`
   - `src/features/chat/lib/messageContent.ts`
   - `src/features/chat/lib/messageDisplay.ts`
   - `src/features/chat/lib/messageState.ts`
   - `src/features/chat/lib/sessionView.ts`
   - `src/features/chat/lib/taskNotifications.ts`
   - `src/features/chat/lib/taskStatus.ts`
   - `src/features/chat/components/TaskMessageBlocks.tsx`
   - `src/features/chat/components/ChatMessageItem.tsx`
   - `src/features/chat/components/ChatMessageList.tsx`
   - `src/features/chat/components/ChatSessionSidebar.tsx`
   - `src/features/chat/components/ChatStatusAlerts.tsx`

当前 `ChatPage.tsx` 已进一步降到 `342` 行，已从“页面 + 规则 + 大段消息渲染”继续收缩为更明确的容器页。`session`、`streaming` 与发送/审批动作协调都已进入 hooks，消息列表渲染也已迁入 `ChatMessageList.tsx`，页面当前主要保留 query、页面级状态组合与组件装配。
5. `PublishedSkillListPage.tsx` 已开始从单文件页面收敛为“容器页 + hook + 展示组件”结构，当前已新增：
   - `src/features/skills/hooks/usePublishedSkillList.ts`
   - `src/features/skills/components/SkillGrid.tsx`
   - `src/features/skills/components/SkillCard.tsx`
   - `src/features/skills/components/RequestAccessModal.tsx`
   - `src/features/skills/components/PublishedSkillOverview.tsx`
   - `src/features/skills/components/PublishedSkillSectionCard.tsx`
   - `src/features/skills/components/publishedSkillListStyles.ts`
   - `src/features/skills/lib/publishedSkillList.ts`

当前技能页的 catalog query、schedule query、授权申请 mutation、弹窗状态、区块折叠状态与技能分组/排序派生都已下沉到 `usePublishedSkillList.ts` 和 `publishedSkillList.ts`；统计卡片区与折叠 section 容器也已继续拆到 `PublishedSkillOverview.tsx` 与 `PublishedSkillSectionCard.tsx`，页面当前只保留 hook 出参拼装、两个技能网格和授权申请弹窗接线，已更接近纯容器页。
6. `scheduleApi` 已完成第一轮类型补全，当前已新增统一的 `CreateScheduleRequest`、`UpdateScheduleRequest` 与 `ScheduleDto`，并通过 `src/api/schedules.ts` 对外导出；`skills`、`dashboard` 与 `executions` 相关 schedule 查询链路已开始统一复用这组类型，去掉了本地 `ScheduleSummary` 重复声明和 `as Promise<...>` / `as ExecutionScheduleItem[]` 断言。随后 `useExecutionCreateActions.ts` 内对 `scheduleApi.create/update` 的请求对象也已继续下沉为 `executionCreate.ts` 内的纯 builder，减少 hook 内现场拼 payload；skills 模块对 schedule DTO 的最后一层 `ScheduleSummary` 别名以及 executions 模块中的 `ExecutionScheduleItem` 别名也都已移除，三条前端链路现在直接统一使用 `ScheduleDto`。
7. `useWorkbenchSummary.ts` 已开始对齐统一 streaming transport，原先页面内的 `fetch + 手动读取整段 SSE 文本 + 自行拆包解析` 已切换为复用 `chatApi.stream(browserStreamingTransport, ...)`；当前 hook 保留 prompt 生成、缓存读写和总结内容提取职责，但底层流消费方式已与 chat 主链统一，减少了 dashboard 自己维护一套独立 SSE 客户端的漂移风险。随后 summary 流的事件内容提取与累计内容归并逻辑也已继续下沉到 `src/features/dashboard/lib/workbenchSummaryStream.ts`，daily / weekly 总结 prompt 的执行项文本拼接和文案组装也已下沉到 `src/features/dashboard/lib/workbenchSummaryPrompt.ts`，让 hook 更接近纯组合层。进一步地，summary 的时间格式化、缓存初始化 state builder 与共享状态类型也已继续从 hook 抽离到 `src/features/dashboard/lib/workbenchSummaryState.ts`，`SummaryCard.tsx` 与 `useWorkbenchSummary.ts` 现在复用同一组状态定义，减少 dashboard summary 链路里重复声明状态结构的问题。

## 4. 非目标

本次不包含以下动作：

- 不重做 UI 视觉风格
- 不重写路由结构
- 不替换 `react-query`、`zustand`、`antd`
- 不大规模改动 `@ops/user-core` 或 `@chat-web`
- 不为了“文件数更少”继续把逻辑并回页面

## 5. 收敛原则

### 5.1 页面只负责编排

页面文件保留：

- 路由参数
- 页面级查询组合
- 页面级状态组合
- 组件装配

页面文件不再新增：

- 与页面无关的通用格式化
- 可复用规则判断
- 独立的解析器
- 兼容旧协议的文本解析逻辑

### 5.2 共享规则必须单点定义

以下类型逻辑要统一进入共享层：

- chat/session 规则
- reasoning 支持判定
- 通知跳转路径解析
- cron 文本摘要
- 通用时间显示

### 5.3 冗余代码要么接入，要么删除

对于当前未被引用的文件，不再长期保留“可能以后会用”的状态。

判断规则：

- 当前调用链不使用
- 当前页面功能未暴露
- 没有明确文档说明是保留兼容层

满足以上条件时，直接删除优于继续悬挂。

## 6. 目标结构

### 6.1 Chat 模块

长期目标结构：

```text
src/features/chat/
├── components/
│   ├── UserChatComposer.tsx
│   ├── UserChatWidget.tsx
│   ├── ChatMessageItem.tsx
│   ├── ChatSessionSidebar.tsx
│   ├── ChatStatusAlerts.tsx
│   └── TaskMessageBlocks.tsx
├── hooks/
│   ├── useChatSessions.ts
│   ├── useChatStreaming.ts
│   └── useTaskTerminalNotifications.ts
├── lib/
│   ├── messageContent.ts
│   ├── reasoning.ts
│   ├── session.ts
│   ├── taskStatus.ts
│   └── historyMerge.ts
├── pages/
│   └── ChatPage.tsx
└── chatStore.ts
```

说明：

- 文档最初写的 `components/message/*` 目录尚未实际创建。
- 当前已优先完成“先拆职责，再决定是否进一步按目录分组”。
- 如果后续消息组件继续增长，再把 `components/` 下的消息相关组件整体迁入 `components/message/`，而不是为了对齐文档先做纯路径搬运。

### 6.2 Dashboard 模块

建议收敛为：

```text
src/features/dashboard/
├── components/
│   ├── PriorityQueueCard.tsx
│   ├── RecentExecutionsCard.tsx
│   ├── TodoCard.tsx
│   └── SummaryCard.tsx
├── hooks/
│   ├── useWorkbenchExecutions.ts
│   ├── useWorkbenchSummary.ts
│   └── useWorkbenchTodos.ts
├── lib/
│   ├── executionText.ts
│   ├── summaryPrompt.ts
│   ├── summarySse.ts
│   └── scheduleText.ts
└── pages/
    └── DashboardPage.tsx
```

### 6.3 Executions 模块

建议拆成每页一个 container，通用规则下沉到 `lib/` 和 `components/`：

```text
src/features/executions/
├── components/
├── hooks/
│   ├── useExecutionListFilters.ts
│   ├── useExecutionDetailData.ts
│   └── useExecutionCreateForm.ts
├── lib/
│   ├── dateText.ts
│   ├── scheduleText.ts
│   ├── runtimeSession.ts
│   ├── artifacts.ts
│   ├── detailView.tsx
│   └── ...
└── pages/
    ├── ExecutionListPage.tsx
    ├── ExecutionDetailPage.tsx
    └── ExecutionCreatePage.tsx
```

### 6.4 Shared 层

建议新增或收拢以下共享对象：

```text
src/shared/lib/
├── dateText.ts
├── notificationNavigation.ts
├── aiModelReasoning.ts
└── scheduleText.ts
```

## 7. 分阶段实施

### 阶段 1：修正失效链路与清理冗余

包含：

- 修复通知页刷新语义
- 删除未使用文件
- 清理仅保留壳层但无必要的兼容入口

目标：

- 先把“明显错误”和“明显冗余”清掉

### 阶段 2：抽共享规则

包含：

- 抽 `supportsNativeReasoning`
- 抽 `buildSessionId`
- 抽 `resolveActionPath`
- 抽时间与 cron 文本工具

目标：

- 在拆页面前先减少重复逻辑扩散

### 阶段 3：拆 Chat / Dashboard

原因：

- 这两块迭代频率高，先拆收益最大

当前状态：

- Chat：已基本完成当前阶段目标，纯函数、通知、副展示块、消息项、`useChatSessions`、`useChatStreaming`、`useChatPageActions` 与 `ChatMessageList` 都已落地；`ChatPage.tsx` 当前已回收到约 `342` 行，主要承担 query、页面级状态组合与组件装配职责，可先转入文档收口或继续处理其它模块尾项。
- Dashboard：已完成第一轮结构拆分，`useWorkbenchExecutions`、`useWorkbenchTodos`、`useWorkbenchSummary` 以及四个工作台分区组件都已落地。当前 `DashboardPage.tsx` 已明显收缩，可继续评估是否再抽 hero 区或转去 executions 模块。
- Executions：已基本完成当前阶段目标。`ExecutionListPage.tsx`、`ExecutionDetailPage.tsx` 与 `ExecutionCreatePage.tsx` 已分别收敛到约 `233`、`268` 与 `199` 行，页面主要承担容器装配职责；列表、详情、创建三条链路的查询装配、派生状态、drawer props、runtime session、phase progress、result state 与页面视图 helper 已继续下沉到 hooks / lib / components。当前 `executions/lib/` 已不再包含 `tsx` 文件，`useExecutionDetailData.ts`、`useExecutionDetailDerivedState.ts`、`useExecutionRuntimeSessionQuery.ts`、`useExecutionListDetailState.ts` 与 `useExecutionListDrawerProps.ts` 也都已收缩为薄 hook 或组合层，当前更多属于后续迭代中的局部优化观察项，而不再是阻塞本轮验收的主问题。

当前剩余观察项（非阻塞）：

- `src/features/executions/hooks/useExecutionDetailData.ts` 当前约 `41` 行，已只保留 `baseQueryState + derivedState + statusMeta` 的组合出口，可继续观察是否需要再拆更细主题组合，但当前体量与职责都已可控。
- `src/features/executions/hooks/useExecutionDetailDerivedState.ts` 当前约 `109` 行，主要负责把 phase/result/runtime/waiting-input 这几块状态做最终组合；基础纯推导已回收到 `src/features/executions/lib/executionDerivedState.ts`，后续只需防止再次增长。
- `src/features/executions/hooks/useExecutionRuntimeSessionQuery.ts` 当前约 `47` 行，已收口为统一 query 装配层；轮询规则和稳定 URL 逻辑都已在 `runtimeSession.ts` 与 `useStableRuntimeSessionNovncUrl.ts` 中单点维护。
- `src/features/executions/hooks/useExecutionListDetailState.ts` 当前约 `28` 行，已是薄 hook；列表详情派生装配现由 `src/features/executions/lib/executionListDetailState.ts` 承担。
- `src/features/executions/hooks/useExecutionListDrawerProps.ts` 当前约 `122` 行，虽然入参较多，但核心职责已限定为 memo 包装 + 调用 `buildExecutionListDetailDrawerProps(...)`；后续如继续增长，应优先收口参数分组或 builder 入参对象，而不是把逻辑回填到页面。
- `src/features/executions/lib/` 当前已不再包含 `tsx` 文件，说明“lib 不混 JSX”的收敛目标已在 executions 模块内基本达成；后续只需在新增需求中持续守住这一边界。

### 阶段 4：拆 Executions 三页

原因：

- 体量最大，但也最容易在拆分过程中引入回归，需要放在共享规则稳定后处理

## 8. 风险与控制

### 8.1 风险

- 拆分后导入路径变多，容易出现漏改
- Chat 页面存在 streaming 与历史合并，稍有变动就可能导致消息重复或丢失
- Execution 页面包含较多运行时状态，拆分时可能出现展示字段回归

### 8.2 控制措施

- 每个阶段只处理一类问题
- 先抽纯函数，再移动 UI 结构
- 每次拆分后至少运行 `typecheck`
- 对通知、聊天流、执行详情这三条主链做最小回归验证

## 9. 验收标准

完成后需满足：

1. 通知页“刷新”能真实刷新，或文案与行为一致。
2. 当前未使用文件已清理，不再制造伪入口。
3. 重复工具具备统一落点。
4. `ChatPage.tsx`、`DashboardPage.tsx` 不再同时承担页面与大段工具逻辑。
5. 三个 executions 页面开始向容器化结构收敛，至少把可抽离规则移出页面。

## 10. 本次建议优先顺序

建议按下面顺序执行：

1. 通知链路修正
2. 冗余文件删除
3. 共享规则抽取
4. Chat 页面拆分
5. Dashboard 页面拆分
6. Executions 三页拆分
