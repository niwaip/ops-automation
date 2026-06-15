# 企业级 Skill 平台 Portal UX 与页面流转规范

**Portal UX and Page Flow Spec v2.0**  
日期：2026-04-19

> 本文补充 `MVP Implementation Blueprint` 与 `Execution API Spec`，专门定义第一阶段 Portal 的页面结构、用户任务流、状态展示、交互约束和页面级验收标准。

---

## 1. 文档目标

本文聚焦以下问题：

- 第一阶段 Portal 必须有哪些页面
- 用户如何从“发起 Skill”走到“查看执行”“进入接管”“恢复执行”
- 不同状态下页面展示什么信息、允许什么操作
- 哪些体验是 MVP 必做，哪些可以后置
- 前端如何避免自己拼装状态机和业务规则

---

## 2. 设计原则

### 2.1 Portal 是业务工作台，不是状态机引擎

- Portal 只展示后端提供的 Execution、RuntimeSession、ExecutionStep 状态
- Portal 不自行推断业务状态
- Portal 不绕过 `skill-control-plane` 调底层 Runtime 内部接口

### 2.2 以 Execution 为主视角

- 所有主入口都围绕 `Execution`
- Session、worker、browser connection 都是从 Execution 详情中派生展示
- 前端页面不再以旧 `session` 作为用户主要认知对象

### 2.3 人工接管是正式能力

- `human_control` 必须有独立且清晰的 UI 反馈
- 用户进入接管时要知道为什么接管、当前在哪一步、恢复后会发生什么

### 2.4 MVP 先追求清晰与稳定

- 第一阶段优先完成关键页面和主链路
- 不要求复杂运营后台
- 不要求复杂图表和高级交互动画

---

## 3. 用户角色与使用场景

### 3.1 MVP 默认角色

- `执行发起人`
- `审批处理人`
- `接管处理人`
- `管理员`

第一阶段允许一个用户同时拥有多个角色。

### 3.2 典型场景

- 发起浏览器类 Skill 执行
- 查看执行进度与 step 日志
- 处理高风险步骤审批
- 遇到验证码或未知弹窗时进行人工接管
- 执行结束后查看结果和产物

---

## 4. 信息架构

第一阶段建议 Portal 至少包含以下一级入口：

- `Skill 列表`
- `发起执行`
- `Execution 列表`
- `Execution 详情`
- `审批处理`
- `Execution 内联接管/恢复区`
- `审计查看`

若第一阶段时间紧，可将 `审批处理`、`审计查看` 先以简化页面形式存在。

---

## 5. 页面清单

## 5.1 `SkillListPage`

用途：

- 展示当前可执行 Skill

必须展示：

- Skill 名称
- Skill 描述
- 分类
- 风险等级
- 默认 Runtime 类型
- 当前可用状态

必须支持：

- 搜索
- 进入发起执行页

MVP 可后置：

- 多维筛选
- 批量管理
- 收藏与推荐

## 5.2 `ExecutionStartPage`

用途：

- 发起一次 Execution

必须展示：

- Skill 基本信息
- 参数输入表单
- 风险提示
- 是否可能进入审批或人工接管的说明

必须支持：

- 输入参数
- 发起执行
- 发起后跳转到 Execution 详情页

必须校验：

- 必填参数缺失
- 基础格式错误
- 输入体积超限

## 5.3 `ExecutionListPage`

用途：

- 浏览用户自己或管理员可见的执行记录

必须展示：

- Execution ID
- Skill 名称
- 发起人
- 当前状态
- 最近更新时间
- 是否发生审批
- 是否发生接管

必须支持：

- 按状态过滤
- 按时间排序
- 进入 Execution 详情页

## 5.4 `ExecutionDetailPage`

用途：

- Execution 主工作台

这是第一阶段最核心页面。

必须展示：

- Execution 基本信息
- 当前状态
- 当前步骤
- Step 列表
- 失败原因
- 关联 RuntimeSession 摘要
- 关联产物摘要

必须支持：

- 刷新或轮询状态
- 当状态为 `human_control` 时显示“进入接管”
- 当状态为 `failed` 时显示失败信息
- 当状态为 `succeeded` 时显示结果摘要和产物入口
- 当状态允许取消时显示取消按钮

## 5.5 `ApprovalQueuePage`

用途：

- 展示待处理审批

必须展示：

- 执行对象
- 风险等级
- 触发原因
- 申请时间

必须支持：

- 通过
- 拒绝
- 查看 Execution 详情

若审批功能第一阶段延后，可保留简化占位页。

## 5.6 `ExecutionDetailPage / ExecutionListPage` 内联接管/恢复区

用途：

- 在 Execution 页面内提供人工接管入口

必须展示：

- 接管原因
- 当前 Execution ID
- 当前 Step
- 浏览器接管入口或实时预览
- 接管注意事项
- 恢复执行按钮

必须支持：

- 打开 noVNC 或受控浏览器连接
- 用户完成接管后点击 resume
- 恢复成功后继续停留在 Execution 页面

## 5.7 `AuditViewPage`

用途：

- 查看关键事件和状态变化

第一阶段至少展示：

- 谁发起执行
- 状态流转
- 是否发生接管
- 关键 step
- 产物索引

---

## 6. 主用户流

## 6.1 发起执行主流程

```text
SkillListPage
  -> ExecutionStartPage
  -> 提交参数
  -> 创建 Execution
  -> 跳转 ExecutionDetailPage
  -> 轮询执行状态
```

页面要求：

- 用户发起成功后必须拿到 `executionId`
- 页面不应停留在表单页等待整个任务跑完

## 6.2 正常成功流程

```text
ExecutionDetailPage
  -> queued
  -> running
  -> succeeded
  -> 查看结果与产物
```

页面要求：

- 状态变化有清晰文案
- 成功后展示 result summary 和 artifact 入口

## 6.3 失败流程

```text
ExecutionDetailPage
  -> running
  -> failed
  -> 查看失败原因与失败 step
```

页面要求：

- 清晰显示失败 step
- 清晰显示错误原因
- MVP 阶段可不提供“一键重试”

## 6.4 人工接管流程

```text
ExecutionDetailPage
  -> running
  -> human_control
  -> 显示内联接管/恢复区
  -> 人工处理
  -> resume
  -> 留在 ExecutionDetailPage
```

页面要求：

- `human_control` 状态必须醒目
- 提示用户当前系统已经暂停自动执行
- 恢复按钮必须有确认动作

---

## 7. 页面级状态展示规则

### 7.1 `queued`

展示：

- “任务已创建，等待执行”
- 不展示接管入口
- 可视情况允许取消

### 7.2 `running`

展示：

- 当前正在执行
- 当前 step
- 已完成 step 数量
- 最近更新时间

### 7.3 `pending_approval`

展示：

- “等待审批”
- 显示审批触发原因
- 若当前用户是审批人，则展示处理入口

### 7.4 `human_control`

展示：

- “等待人工接管”
- 接管原因
- 当前卡住的 step
- 显示内联接管/恢复区

### 7.5 `succeeded`

展示：

- 成功状态
- 结果摘要
- 产物入口

### 7.6 `failed`

展示：

- 失败状态
- 失败 step
- 失败原因
- 最近截图或错误快照入口

### 7.7 `cancelled`

展示：

- 已取消
- 取消原因

---

## 8. ExecutionDetailPage 详细布局建议

### 8.1 顶部信息区

建议展示：

- Execution ID
- Skill 名称
- 发起人
- 状态标签
- 风险等级
- 创建时间 / 更新时间

### 8.2 主状态区

建议展示：

- 当前状态文案
- 当前 step 名称
- 当前操作提示
- 若接管中，显示明显告警条

### 8.3 Step 时间线

建议展示：

- `stepIndex`
- `name`
- `status`
- `startedAt`
- `endedAt`
- 简要错误信息

第一阶段推荐采用简单表格或时间线，不必过度复杂。

### 8.4 Runtime 摘要区

建议展示：

- Runtime 类型
- Runtime 状态
- control mode
- 最近活动时间

### 8.5 结果与产物区

建议展示：

- result summary
- artifact 列表
- snapshot 引用

---

## 9. Execution 页面内联接管/恢复区详细要求

### 9.1 区域核心目标

- 让用户明确接手当前浏览器
- 让用户知道自己要处理什么问题
- 让用户在处理完后把控制权交回系统

### 9.2 区域必须展示

- Execution ID
- Skill 名称
- 接管原因
- 当前 step
- 连接状态
- 接管说明

### 9.3 区域必须具备

- 打开 noVNC / 受控连接入口
- Resume 按钮
- 在当前页面继续查看详情的能力

### 9.4 Resume 前确认

建议弹出确认框：

- 是否已处理完当前问题
- 恢复后系统将继续自动执行

### 9.5 失败提示

若 resume 失败，必须提示：

- 当前 Runtime 是否仍处于 frozen
- 是否需要刷新详情页
- 是否需要重新打开内联接管/恢复区

---

## 10. ApprovalQueuePage 详细要求

### 10.1 列表字段

- Execution ID
- Skill 名称
- 风险等级
- 申请人
- 申请时间
- 触发原因

### 10.2 明细信息

审批详情至少应展示：

- 执行目标
- 输入摘要
- 预计影响范围
- 当前步骤

### 10.3 审批操作

- Approve
- Reject
- 写备注

---

## 11. 前端状态轮询与刷新策略

### 11.1 轮询建议

对于 `queued`、`running`、`pending_approval`、`human_control`：

- 建议每 3 到 5 秒轮询一次 `GET /executions/{id}`

对于 `succeeded`、`failed`、`cancelled`：

- 停止高频轮询

### 11.2 并发保护

- 同一详情页避免重复并发请求
- 页面切换后应停止轮询
- Resume 成功后应触发一次立即刷新

---

## 12. 文案与提示建议

第一阶段建议统一使用清晰业务文案，而不是技术术语直出。

建议：

- `queued`：等待执行
- `running`：执行中
- `pending_approval`：等待审批
- `human_control`：等待人工处理
- `succeeded`：执行成功
- `failed`：执行失败
- `cancelled`：已取消

不建议：

- 直接把内部错误码原样展示给终端用户
- 直接把 worker、lease 等内部术语作为主文案

---

## 13. MVP 必做与后置项

### 13.1 MVP 必做

- Skill 列表页
- 发起执行页
- Execution 详情页
- Execution 内联接管/恢复区
- 基础审批页
- 基础审计查看页

### 13.2 MVP 后置

- 复杂筛选
- 自定义仪表盘
- 多标签并行工作台
- 高级图表和统计分析
- 拖拽式执行流程视图

---

## 14. 页面级验收标准

## 14.1 发起执行

- 用户能从 Skill 列表进入发起页
- 参数校验失败时有明确提示
- 发起成功后跳转详情页

## 14.2 Execution 详情

- 能正确展示状态
- 能正确展示 steps
- 在 `human_control` 时能显示接管入口

## 14.3 Execution 页面内联接管/恢复区

- 能显示接管原因和当前 step
- 能打开浏览器接管连接
- 点击 resume 后能继续留在执行详情并继续轮询

## 14.4 审批页

- 能看到待审批项
- 能做 approve / reject

---

## 15. 与现有文档关系

- 主链路蓝图：见 `Enterprise-Skill-Platform_MVP-Implementation-Blueprint_v2.0.md`
- 接口规范：见 `Enterprise-Skill-Platform_Execution-API-Spec_v2.0.md`
- 迁移步骤：见 `Enterprise-Skill-Platform_MVP-Migration-Runbook_v2.0.md`

本文定位是“前端工作台实施规范”，用于让 Portal 团队按统一页面流和交互约束落地 MVP。
