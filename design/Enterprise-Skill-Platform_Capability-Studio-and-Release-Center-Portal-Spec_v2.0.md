# 企业级 Skill 平台 Capability Studio 与 Release Center Portal 规范

**Capability Studio and Release Center Portal Spec v2.0**  
日期：2026-04-25

> 本文补充 `Workflow-to-Skill Release Process Spec` 与 `Capability Release API Spec`，专门定义从能力设计到发布上线的统一 Portal 页面结构、用户操作流、状态展示规则和页面级验收标准。

---

## 1. 文档目标

本文聚焦以下问题：

- Portal 应如何把当前分散的 `ExecutionFlowTemplatePage`、`TemporalWorkflowPage`、`SkillAdminPage` 收敛成统一发布工作流
- 哪些页面是“设计页”，哪些页面是“发布页”，哪些页面是“已发布管理页”
- 用户在每个阶段看到什么、允许做什么、禁止做什么
- 长时任务如 build、sandbox、deploy 的流式反馈如何呈现
- 页面级 MVP 先做哪些，哪些可以延后

---

## 2. 设计原则

### 2.1 以 `CapabilityRelease` 为页面主对象

- 页面主视角不再是单纯的模板、代码或 Skill
- 统一以一次发布流程作为工作单元
- 用户进入页面后看到的核心对象应是 `release`

### 2.2 分为“设计”和“发布”两个空间

- `Capability Studio`
  - 负责定义、生成、验证
- `Release Center`
  - 负责审核、发布、部署、回滚

### 2.3 长时任务必须流式反馈

- AI 生成
- Sandbox 验证
- 部署

这三类动作必须在 UI 中支持：

- 阶段状态
- 实时日志
- 中间结果预览
- 失败后重试

### 2.4 页面不自行推断业务状态

- 所有主状态由后端返回
- 页面根据 `release.status` 和子对象状态决定展示和按钮显隐
- 前端不凭本地逻辑推导“是否已可发布”

---

## 3. 信息架构

建议新增以下一级导航：

- `Capability Studio`
- `Release Center`
- `Published Skills`
- `Build & Validation History`

现有页面建议调整为：

- `ExecutionFlowTemplatePage`
  - 下沉为模板型能力的“高级编辑器”
- `TemporalWorkflowPage`
  - 下沉为 Temporal 型能力的“高级编排编辑器”
- `SkillAdminPage`
  - 收敛为“已发布 Skill 管理页”

---

## 4. 页面总览

第一阶段建议新增以下页面：

- `CapabilityReleaseListPage`
- `CapabilityStudioPage`
- `CapabilityBuildDetailPage`
- `ReleaseCenterPage`
- `PublishedSkillDetailPage`

可复用现有页面能力：

- `ExecutionFlowTemplatePage`
- `TemporalWorkflowPage`
- `SkillAdminPage`

---

## 5. 页面定义

## 5.1 `CapabilityReleaseListPage`

用途：

- 展示所有发布流程

必须展示：

- `releaseId`
- `sourceType`
- `sourceName`
- `status`
- `approvalStatus`
- `deploymentStatus`
- `publishedSkillId`
- `updatedAt`
- `createdBy`

必须支持：

- 按类型过滤
- 按状态过滤
- 关键字搜索
- 新建 release
- 进入 Studio
- 进入 Release Center

表格建议列：

- 发布编号
- 能力类型
- 能力名称
- 当前阶段
- 最近构建
- 最近验证
- 发布状态
- 部署状态
- 更新时间
- 操作

操作按钮建议：

- `进入设计`
- `进入发布`
- `查看历史`

## 5.2 `CapabilityStudioPage`

用途：

- 从源定义到验证完成的统一工作台

这是第一阶段最核心页面。

建议布局：

- 左侧：步骤导航
- 中间：主编辑区
- 右侧：构建/验证状态与日志面板

建议步骤条：

- `1. 选择类型`
- `2. 配置能力源`
- `3. AI 生成`
- `4. 静态校验`
- `5. Sandbox 验证`
- `6. 生成 Skill 草案`

### 5.2.1 步骤一：选择类型

必须支持：

- 选择 `模板型能力`
- 选择 `Temporal 编排型能力`

必须展示：

- 两类能力的适用场景说明
- 推荐判定规则

按钮：

- `下一步`

校验：

- 未选择类型时禁止进入下一步

### 5.2.2 步骤二：配置能力源

当选择模板型能力时：

- 显示模板编辑器
- 可复用 `ExecutionFlowTemplatePage` 中的参数 Schema、goal、expectedResult、steps 编辑能力

当选择 Temporal 型能力时：

- 显示 Workflow DSL 编辑器
- 显示 Activity 资源池
- 支持关联已有 Activity

必须支持：

- 保存源定义
- 查看 JSON 预览
- 基础静态校验

按钮：

- `保存草稿`
- `上一页`
- `下一步`

### 5.2.3 步骤三：AI 生成

必须支持：

- 触发 `build`
- 展示当前 build 状态
- 展示模型选择
- 基于错误上下文重新生成

必须展示：

- build 阶段状态
- prompt 元数据摘要
- 生成代码或生成配置
- 与当前源定义的 diff 摘要

按钮：

- `AI 生成`
- `重新生成`
- `接受本次生成`
- `拒绝本次生成`

页面区域建议：

- 代码预览面板
- 配置预览面板
- 日志面板

### 5.2.4 步骤四：静态校验

必须支持：

- 发起静态校验
- 展示结构化问题列表
- 展示日志

必须展示：

- 校验分数
- 通过/失败
- 问题清单
- 优化建议

按钮：

- `开始校验`
- `基于问题重新生成`
- `回到源定义修改`

### 5.2.5 步骤五：Sandbox 验证

必须支持：

- 输入测试参数
- 输入模拟用户请求
- 发起流式 sandbox 验证
- 展示实时日志
- 展示结果摘要

必须展示：

- 连接状态
- 当前执行阶段
- 实时日志流
- 最终返回结果
- traceback 或错误信息
- 评分

按钮：

- `开始验证`
- `停止`
- `基于错误重新生成`
- `重试验证`

说明：

- 模板型能力应展示 `flow_execute` 调用轨迹
- Temporal 型能力应展示函数入口、stdout、traceback

### 5.2.6 步骤六：生成 Skill 草案

必须支持：

- 基于最近一次成功验证生成 Skill 草案
- 人工编辑 Skill 草案
- 校验 Skill 草案完整性
- 一键进入 Release Center

必须展示：

- `name`
- `description`
- `triggerKeywords`
- `paramsSchema`
- `executionFlowTemplateIds`
- `tools`
- `apiEndpoints`

按钮：

- `生成 Skill 草案`
- `保存草案`
- `进入发布`

---

## 5.3 `CapabilityBuildDetailPage`

用途：

- 查看某次具体 build 或 validation 的详情

必须展示：

- 所属 release
- build 类型
- modelId
- 输入快照
- prompt 版本
- 生成结果
- 验证日志
- 关联 validation

适用场景：

- 排查生成差异
- 比较不同 build
- 追溯线上问题

---

## 5.4 `ReleaseCenterPage`

用途：

- 从 Skill 草案进入审核、发布、部署和回滚

建议步骤条：

- `1. 审核草案`
- `2. 发布 Skill`
- `3. 部署到环境`
- `4. 发布后验证`
- `5. 完成`

建议布局：

- 左侧：流程步骤与操作区
- 中间：当前步骤表单与日志
- 右侧：release 摘要、审批状态、部署状态、历史版本

### 5.4.1 审核草案

必须展示：

- 最近一次 sandbox 结果
- Skill 草案内容
- 风险提示
- 是否需要审批

必须支持：

- `通过`
- `驳回`
- `退回修改`

### 5.4.2 发布 Skill

必须展示：

- 即将发布的 Skill 配置
- 若为更新发布，应显示与当前已发布版本的差异

必须支持：

- `发布为 Skill`
- 发布成功后展示 `publishedSkillId`

### 5.4.3 部署到环境

必须展示：

- 环境选择：`dev/test/staging/prod`
- 部署策略选择
- 是否需要 worker reload

必须支持：

- 发起流式部署
- 展示部署日志
- 展示部署结果

按钮：

- `开始部署`
- `重试部署`

### 5.4.4 发布后验证

必须展示：

- smoke test 结果
- 首次可用性检查
- 若失败则展示回滚入口

按钮：

- `执行 Smoke Test`
- `确认完成`
- `回滚`

### 5.4.5 完成页

必须展示：

- 发布成功摘要
- Skill ID
- Release Version
- Deployment 环境
- 发布时间
- 下一步推荐动作

按钮：

- `查看已发布 Skill`
- `查看发布历史`

---

## 5.5 `PublishedSkillDetailPage`

用途：

- 展示已发布 Skill 详情

必须展示：

- 当前发布版本
- 关联 release
- 当前可执行状态
- 权限配置
- 关联模板或 workflow
- 历史发布记录

必须支持：

- 查看最新 release
- 查看回滚链路
- 进入编辑器发起新一轮 release

---

## 6. 页面状态与按钮约束

### 6.1 `CapabilityStudioPage`

当 `release.status = draft`：

- 可编辑源定义
- 可发起 build
- 不可 deploy

当 `release.status = building`：

- 不可再次发起 build
- 可查看日志
- 可取消当前操作

当 `release.status = build_failed`：

- 可重新 build
- 可回到源定义编辑

当 `release.status = validating`：

- 不可编辑 build 结果
- 不可进入发布

当 `release.status = validation_failed`：

- 可重新验证
- 可基于错误上下文重新生成

当 `release.status = draft_ready`：

- 可生成 Skill 草案
- 可进入 Release Center

### 6.2 `ReleaseCenterPage`

当 `approvalStatus = pending`：

- 不可发布 Skill
- 不可部署

当 `status = approved`：

- 可发布 Skill
- 发布前仍不可部署

当 `status = published`：

- 可部署
- 不可重新生成草案

当 `status = deploying`：

- 不可重复部署
- 允许只读查看日志

当 `status = deployed`：

- 可查看部署记录
- 可发起 smoke test
- 可在需要时回滚

---

## 7. 流式任务交互规范

以下操作必须使用统一流式交互组件：

- AI 生成
- Sandbox 验证
- 部署

### 7.1 通用组件建议

建议封装：

- `ReleaseStagePanel`
- `ReleaseLiveLogPanel`
- `ReleaseResultSummary`

### 7.2 事件展示规则

事件类型：

- `stage`
- `log`
- `result`
- `error`
- `done`

展示规则：

- `stage` 使用高亮状态块
- `log` 进入滚动日志区
- `result` 进入结构化摘要区
- `error` 进入错误摘要卡片
- `done` 显示完成态和下一步按钮

### 7.3 长任务恢复

若用户刷新页面或中断连接：

- 页面应支持根据 `releaseId` 重新拉取最近任务状态
- 已完成的日志需要可回放
- 不要求第一阶段支持断点续流，但必须支持重新查看最终结果

---

## 8. 页面级数据依赖

### 8.1 `CapabilityReleaseListPage`

依赖：

- `GET /capability-releases`

### 8.2 `CapabilityStudioPage`

依赖：

- `GET /capability-releases/{id}`
- `PUT /capability-releases/{id}/source`
- `POST /capability-releases/{id}/build`
- `GET /capability-releases/{id}/builds`
- `POST /capability-releases/{id}/validate/static`
- `POST /capability-releases/{id}/validate/sandbox`
- `GET /capability-releases/{id}/validations`
- `POST /capability-releases/{id}/generate-skill-draft`
- `GET /capability-releases/{id}/skill-draft`

### 8.3 `ReleaseCenterPage`

依赖：

- `GET /capability-releases/{id}`
- `GET /capability-releases/{id}/skill-draft`
- `PUT /capability-releases/{id}/skill-draft`
- `POST /capability-releases/{id}/approve`
- `POST /capability-releases/{id}/publish-skill`
- `POST /capability-releases/{id}/deploy`
- `GET /capability-releases/{id}/deployments`
- `POST /capability-releases/{id}/rollback`

---

## 9. 与现有页面的迁移建议

### 9.1 迁移策略

建议采用“保留旧页、逐步收口”的方式。

### 9.2 第一阶段

- 保留 `ExecutionFlowTemplatePage`
- 保留 `TemporalWorkflowPage`
- 保留 `SkillAdminPage`
- 新增 `CapabilityStudioPage`
- 新增 `ReleaseCenterPage`

此时旧页仍可直接操作，但新能力发布流程优先走新页面。

### 9.3 第二阶段

- 将旧页入口变成“高级编辑器”
- 从 Studio 跳入旧页编辑，再返回 Studio
- `SkillAdminPage` 只展示已发布 Skill，不再承担设计职责

### 9.4 第三阶段

- 逐步下线旧的分散式发布入口
- 所有新发布动作统一走 release 流程

---

## 10. MVP 验收标准

以下标准建议作为页面级验收条件：

- 用户可以在 `CapabilityReleaseListPage` 新建一次 release
- 用户可以在 `CapabilityStudioPage` 完成能力类型选择和源定义保存
- 用户可以发起 AI 生成，并实时看到日志和结果
- 用户可以完成静态校验和 sandbox 校验，并看到结构化结果
- 用户可以生成并编辑 Skill 草案
- 用户可以在 `ReleaseCenterPage` 完成审核、发布 Skill、部署和发布后验证
- 用户可以在失败时看到明确错误并执行重试或回滚
- 用户可以从 `PublishedSkillDetailPage` 回溯到对应 release

---

## 11. 不建议的页面实现方式

以下做法不建议采用：

- 把 build、validate、publish、deploy 混成一个大按钮
- 用弹窗串完整条链路
- 让用户在模板页、workflow 页、skill 页之间手工跳转完成发布
- 不保存日志，只展示最终成功或失败
- 把“部署”做成一个没有实际运行时反馈的表面动作

---

## 12. 推荐的页面主链路

推荐用户主链路如下：

```text
CapabilityReleaseListPage
  -> CapabilityStudioPage
    -> source config
    -> AI build
    -> static validation
    -> sandbox validation
    -> generate skill draft
  -> ReleaseCenterPage
    -> review
    -> publish skill
    -> deploy
    -> post-deploy validation
  -> PublishedSkillDetailPage
```

推荐页面角色划分如下：

```text
Studio：负责“做出来”
Release Center：负责“发出去”
Published Skill：负责“管起来”
```

---

## 13. 前端实现建议

建议前端新增模块：

- `src/pages/admin/CapabilityReleaseListPage.tsx`
- `src/pages/admin/CapabilityStudioPage.tsx`
- `src/pages/admin/CapabilityBuildDetailPage.tsx`
- `src/pages/admin/ReleaseCenterPage.tsx`
- `src/pages/admin/PublishedSkillDetailPage.tsx`

建议 API 客户端新增：

- `src/api/capability-release.ts`

建议组件新增：

- `src/components/release/ReleaseWizard.tsx`
- `src/components/release/ReleaseStagePanel.tsx`
- `src/components/release/ReleaseLogViewer.tsx`
- `src/components/release/SkillDraftEditor.tsx`
- `src/components/release/DeploymentStatusPanel.tsx`

建议状态管理：

- 使用 `react-query` 管 release 主数据
- 对长时任务使用 SSE 或统一 stream helper
- 页面本地状态只负责 UI 交互，不负责业务真相

---

## 14. 推荐落地顺序

建议 Portal 实施顺序如下：

### 阶段 A

- `CapabilityReleaseListPage`
- `CapabilityStudioPage` 基础版本
- 只先打通 create/source/build/validate

### 阶段 B

- `SkillDraftEditor`
- `ReleaseCenterPage` 基础版本
- 打通 draft/publish

### 阶段 C

- 部署日志面板
- 部署与回滚页面
- `PublishedSkillDetailPage`

### 阶段 D

- 差异对比视图
- 版本时间线
- 更细粒度审批和环境策略

---

## 15. 最终建议

Portal 最终应该形成三层体验：

- 设计层：`Capability Studio`
- 发布层：`Release Center`
- 运维层：`Published Skills`

这样可以把当前仓库里已经存在的模板、workflow、skill 三类能力整合到一个统一的产品闭环里，同时避免用户继续通过多个页面手工拼装完整发布链路。
