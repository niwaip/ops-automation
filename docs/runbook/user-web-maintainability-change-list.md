# user-web 可维护性整改清单

状态：进行中

本文档对应 `docs/design/user-web-maintainability-refactor-design.md`，用于把设计拆成可执行的小步任务。目标是先消除确定性问题，再进入结构拆分。

## 1. 实施范围

目录范围：

- `apps/frontend/user-web/src`

本轮只处理：

- 失效链路
- 冗余文件
- 重复实现
- 过载页面拆分

本轮不处理：

- UI 风格重做
- 接口协议重构
- 跨应用共享包大改

## 2. 修改顺序

### 第一阶段：修正确定性问题

- [x] 修复通知页刷新链路
  - 目标文件：
    - `src/app/UserRuntimeEffects.tsx`
    - `src/features/notifications/pages/NotificationsPage.tsx`
  - 目标结果：
    - “刷新”要能真实触发服务端数据同步，或直接去掉误导性刷新语义。

- [x] 明确通知拉取策略
  - 当前落地：
    - 保持自动轮询默认关闭
    - query 在有 session 时启用
    - 页面通过手动 `refetch` 触发真实服务端同步

### 第二阶段：删除冗余代码

- [x] 删除未引用的页面脚手架
  - 目标文件：
    - `src/components/page/PageScaffold.tsx`

- [x] 删除未引用的下载适配器
  - 目标文件：
    - `src/adapters/download/browserFileDownload.ts`

- [x] 删除未引用的浏览器 ID 工具
  - 目标文件：
    - `src/adapters/platform/browserId.ts`

- [x] 删除未引用的顶层 auth 兼容出口
  - 目标文件：
    - `src/auth.ts`

- [x] 再次全量检查引用
  - 验证命令：
    - `rg`
    - `npm run typecheck`

### 第三阶段：收拢重复实现

- [x] 新增共享 AI 模型推理判定工具
  - 目标文件：
    - `src/shared/lib/aiModelReasoning.ts`
  - 替换来源：
    - `src/features/chat/pages/ChatPage.tsx`
    - `src/features/chat/components/UserChatComposer.tsx`

- [x] 新增共享 session 工具
  - 候选文件：
    - `src/features/chat/lib/session.ts`
  - 替换来源：
    - `src/features/chat/pages/ChatPage.tsx`
    - `src/features/chat/chatStore.ts`

- [x] 新增共享通知跳转解析工具
  - 目标文件：
    - `src/shared/lib/notificationNavigation.ts`
  - 替换来源：
    - `src/app/layouts/UserLayout.tsx`
    - `src/features/notifications/pages/NotificationsPage.tsx`

- [x] 新增共享时间格式化工具
  - 目标文件：
    - `src/shared/lib/dateText.ts`
  - 替换来源：
    - `src/features/dashboard/pages/DashboardPage.tsx`
    - `src/features/skills/pages/PublishedSkillListPage.tsx`
    - `src/features/executions/pages/ExecutionCreatePage.tsx`
    - 其余 executions 相关页面/工具

- [x] 新增共享 cron 摘要工具
  - 目标文件：
    - `src/shared/lib/scheduleText.ts`
  - 替换来源：
    - `src/features/dashboard/pages/DashboardPage.tsx`
    - `src/features/skills/pages/PublishedSkillListPage.tsx`
    - `src/features/executions/pages/ExecutionCreatePage.tsx`

### 第四阶段：拆 Chat 页面

- [x] 抽 `message` 相关纯函数
  - 候选新文件：
    - `src/features/chat/lib/messageContent.ts`
    - `src/features/chat/lib/messageState.ts`
    - `src/features/chat/lib/taskStatus.ts`
    - `src/features/chat/lib/messageDisplay.ts`
    - `src/features/chat/lib/sessionView.ts`

- [x] 抽 stream 与 session 协调逻辑
  - 候选新文件：
    - `src/features/chat/hooks/useChatStreaming.ts`
    - `src/features/chat/hooks/useChatSessions.ts`
  - 当前状态：
    - `useChatSessions.ts` 已落地
    - `useChatStreaming.ts` 已落地
    - 页面剩余为发送、审批/驳回等页面动作编排

- [x] 抽任务终态通知逻辑
  - 实际文件：
    - `src/features/chat/lib/taskNotifications.ts`

- [x] 抽消息渲染子组件
  - 实际文件：
    - `src/features/chat/components/ChatMessageItem.tsx`
    - `src/features/chat/components/TaskMessageBlocks.tsx`
    - `src/features/chat/components/ChatSessionSidebar.tsx`
    - `src/features/chat/components/ChatStatusAlerts.tsx`

- [x] 收缩 `ChatPage.tsx`
  - 目标结果：
    - 页面只保留查询组合、顶层状态和组件装配
  - 当前结果：
    - 已从约 `1946` 行收缩到约 `500` 行
    - 仍保留发送、审批/驳回与 query 组合等页面动作

### 第五阶段：拆 Dashboard 页面

- [x] 抽执行数据聚合逻辑
  - 候选新文件：
    - `src/features/dashboard/hooks/useWorkbenchExecutions.ts`
  - 当前落地：
    - `useWorkbenchExecutions.ts` 已收拢 executions / schedules / skills 查询与派生队列聚合

- [x] 抽 Todo 本地状态逻辑
  - 候选新文件：
    - `src/features/dashboard/hooks/useWorkbenchTodos.ts`

- [x] 抽总结生成与 SSE 解析逻辑
  - 候选新文件：
    - `src/features/dashboard/hooks/useWorkbenchSummary.ts`
    - `src/features/dashboard/lib/summaryPrompt.ts`
    - `src/features/dashboard/lib/summarySse.ts`
  - 当前落地：
    - `useWorkbenchSummary.ts` 已收拢总结状态、自动生成、SSE 结果提取与缓存写入

- [x] 抽工作台分区组件
  - 候选新文件：
    - `src/features/dashboard/components/PriorityQueueCard.tsx`
    - `src/features/dashboard/components/RecentExecutionsCard.tsx`
    - `src/features/dashboard/components/TodoCard.tsx`
    - `src/features/dashboard/components/SummaryCard.tsx`
  - 当前状态：
    - 四个分区组件均已落地
    - 当前主文件已从 `1081` 行降到约 `300` 行

### 第六阶段：拆 Executions 页面

- [ ] 收缩 `ExecutionListPage.tsx`
  - 先抽：
    - 筛选状态
    - 列表时间文本
    - 详情抽屉数据装配
  - 当前落地：
    - `src/features/executions/lib/executionListView.ts` 已收拢列表筛选项、状态文案与紧凑时间文本
    - `src/features/executions/hooks/useExecutionListDetailState.ts` 已收拢详情抽屉主要派生状态
    - `src/features/executions/components/ExecutionDetailPanelLabel.tsx`
    - `src/features/executions/components/ExecutionPayloadContent.tsx`
    - `src/features/executions/components/ExecutionBasicInfoSection.tsx`
    - `src/features/executions/components/ExecutionInputOutputCard.tsx`
    - `src/features/executions/components/ExecutionPhaseStepsTimeline.tsx`
    - `src/features/executions/components/ExecutionLegacyStepsTimeline.tsx`
    - `src/features/executions/components/ExecutionBrowserProgressCard.tsx`
    - `src/features/executions/components/ExecutionPhasesCollapse.tsx`
    - `src/features/executions/components/ExecutionListDetailDrawer.tsx`
    - `src/features/executions/components/ExecutionListSummaryStrip.tsx`
    - `src/features/executions/components/ExecutionListToolbar.tsx`
    - 当前主文件已从 `2077` 行降到约 `755` 行

- [ ] 收缩 `ExecutionDetailPage.tsx`
  - 先抽：
    - 详情查询组合
    - 审批/接管相关动作
    - 各区块展示组件
  - 当前落地：
    - `src/features/executions/hooks/useExecutionDetailData.ts` 已直接收拢详情数据组合、查询装配与主要派生状态
    - `src/features/executions/hooks/useExecutionDetailActions.ts` 已收拢审批 / 接管 / 补参相关动作
    - `src/features/executions/components/ExecutionActivityOverviewCard.tsx`
    - `src/features/executions/components/ExecutionBrowserAuditEvidenceCard.tsx`
    - `src/features/executions/components/ExecutionBrowserActionCard.tsx`
    - `src/features/executions/components/ExecutionBrowserSummaryCard.tsx`
    - `src/features/executions/components/ExecutionLegacyStepsProgressCard.tsx`
    - `src/features/executions/components/ExecutionNonBrowserActionCard.tsx`
    - `src/features/executions/components/ExecutionNonBrowserInfoCard.tsx`
    - `src/features/executions/components/ExecutionNonBrowserReviewSection.tsx`
    - `src/features/executions/components/ExecutionNonBrowserResultCard.tsx`
    - `src/features/executions/components/ExecutionPhaseTimelineCard.tsx`
    - `src/features/executions/components/ExecutionReviewResultCard.tsx`
    - `src/features/executions/components/ExecutionTakeoverRecoveryCard.tsx`
    - 当前主文件已从 `2462` 行降到约 `764` 行

- [ ] 收缩 `ExecutionCreatePage.tsx`
  - 先抽：
    - 表单 schema 转换
    - cron 规则与时间文本
    - 定时任务列表展示区
  - 当前落地：
    - `src/features/executions/lib/executionCreate.ts` 已收拢 schema 字段转换、默认值、cron 构建、规则文案、输入归一化与创建页相关常量
    - `src/features/executions/hooks/useExecutionCreateActions.ts` 已收拢创建执行、创建定时任务以及 schedule 启停 / 触发 / 删除动作
    - `src/features/executions/hooks/useExecutionCreateSchedules.ts` 已收拢 schedule 列表查询与 skillSchedules / activeScheduleCount 派生状态
    - `src/features/executions/hooks/useExecutionCreateSkillState.ts` 已收拢已发布技能聚合、选中技能详情查询与创建页表单初始化
    - `src/features/executions/components/ExecutionCreateAiModal.tsx` 已收拢 AI 参数识别弹窗、文本文件上传与文件读取提示
    - `src/features/executions/components/ExecutionCreateSchemaFieldsCard.tsx` 已收拢参数 schema 渲染、默认值提示、字段级 JSON 校验与 AI/默认值操作入口
    - `src/features/executions/components/ExecutionCreateSkillInfoCard.tsx` 已收拢右侧技能信息卡、工具标签、空态与加载态
    - `src/features/executions/components/ExecutionCreateScheduleSettingsCard.tsx` 已收拢定时名称/时区/周期/时间/说明等表单区
    - `src/features/executions/components/ExecutionCreateScheduleListCard.tsx` 已收拢“当前定时配置”列表展示与启停 / 触发 / 删除操作区
    - 当前主文件已从 `1528` 行降到约 `443` 行

## 3. 验证清单

每个阶段完成后至少执行：

- [x] `cd apps/frontend/user-web && npm run typecheck`

涉及通知时补充：

- [ ] 打开通知页
- [ ] 验证刷新后数据是否与服务端同步

涉及聊天时补充：

- [ ] 验证普通聊天发送
- [ ] 验证任务模式发送
- [ ] 验证 streaming 停止/完成
- [ ] 验证待补输入、待审批、人工介入提示

涉及执行页时补充：

- [ ] 验证执行列表筛选与跳转
- [ ] 验证执行详情打开
- [ ] 验证新建执行和定时任务配置

## 4. 预计提交拆分

建议不要一次性混成一个提交，按下面拆：

1. `fix(user-web): restore notification refresh semantics`
2. `chore(user-web): remove unused frontend artifacts`
3. `refactor(user-web): extract shared text and navigation helpers`
4. `refactor(user-web): split chat page orchestration`
5. `refactor(user-web): split dashboard page orchestration`
6. `refactor(user-web): split execution pages into container and helpers`

## 5. 当前建议先做的子集

最小闭环已完成。当前建议继续下面 2 组：

1. 继续收缩 `ExecutionCreatePage.tsx`
   - 评估是否把 AI 参数识别请求与参数回填继续下沉为 hook
   - 评估是否把顶部执行方式条与技能选择区继续收敛成独立 section
2. 创建页继续下沉收益降低后，再回看 `ExecutionDetailPage.tsx`
   - 只继续处理收益明确的 live preview / header 汇总区

这样可以先把最后一个仍明显超载的创建页继续压缩，再按收益回头处理详情页剩余边角。
