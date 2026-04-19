# 企业级 Skill 平台 MVP 迁移实施 Runbook

**MVP Migration Runbook v2.0**  
日期：2026-04-19

> 本文补充 `Service Boundaries`、`MVP Scope`、`MVP Implementation Blueprint` 等设计，专门给出第一阶段从当前仓库迁移到 MVP 目标结构的实施步骤、冻结规则、风险点与回退策略。

---

## 1. 文档目标

本文回答以下问题：

- 第一阶段到底按什么顺序迁移
- 哪些服务先改，哪些服务后改
- 哪些对象先新增，哪些旧对象先兼容
- 如何避免“全部一起改”导致系统失稳
- 每一阶段的验收出口条件是什么

---

## 2. 迁移原则

### 2.1 不做一次性大爆炸重构

- 不一次性重命名全部服务
- 不一次性拆掉所有旧接口
- 不一次性拆分全部数据库模型

### 2.2 先引入新对象，再迁移调用方

第一阶段必须先把以下对象立起来：

- `Execution`
- `RuntimeSession`
- `ExecutionStep`
- `ExecutionEvent`

然后再逐步将旧调用链迁移到新对象上。

### 2.3 新旧链路允许短期并存

迁移期允许：

- `session-broker` 同时保留旧 `session` 接口
- `portal` 同时保留旧页面和新 `Execution` 工作台
- 旧浏览器执行流程继续可跑

但新主链路必须优先使用新对象和新接口。

### 2.4 冻结主边界

第一阶段开发期间不得反复变更以下主边界：

- `Execution` 是业务真相源
- `RuntimeSession` 是资源真相源
- `ExecutionStep` 是最小执行观测对象

---

## 3. 当前系统基线

基于当前仓库，第一阶段可复用基础如下：

### 3.1 可复用

- `control-plane` 的统一网关入口
- `ai-orchestrator` 的模型调用与编排能力
- `session-broker` 的 allocation / lock / freeze / resume 基础
- `browser-worker` 的浏览器托管能力
- `replay-engine` 的 step 执行与日志思路
- `portal` 的前端骨架

### 3.2 必须收敛的问题

- `session` 不能继续同时承担业务与资源语义
- `Execution.status` 不能由多个服务直写
- `auth` 不应继续长期持有 Skill 平台业务主边界
- `control-plane` 不能继续只是代理壳

---

## 4. 目标迁移结果

MVP 阶段迁移完成后，应达到：

- `skill-control-plane` 拥有 `Execution` 主状态
- `runtime-manager` 拥有 `RuntimeSession` 主状态
- 浏览器类主链路全部以 `Execution` 为主视图
- `portal` 能展示 execution 详情、steps、接管入口
- step 日志与关键状态变化可落库查询

---

## 5. 阶段拆分

建议分 5 个阶段推进。

### Phase 0：冻结边界与准备

目标：

- 冻结 MVP 主边界
- 确定第一条业务场景
- 明确表结构和 API 草案

必须完成：

- 冻结 `Execution`、`RuntimeSession`、`ExecutionStep` 字段
- 冻结主链路 API
- 确认 Browser Runtime 作为第一阶段执行域

出口条件：

- 相关设计文档进入可执行状态
- 不再继续扩展 MVP 范围

### Phase 1：先立新对象

目标：

- 在不破坏旧链路的前提下新增新对象

建议动作：

- 新增 `executions`
- 新增 `runtime_sessions`
- 新增 `execution_steps`
- 新增 `execution_events`

说明：

- 第一阶段允许这些表先挂在当前 PostgreSQL 中
- 不要求此时就拆出独立数据库

出口条件：

- 新表可读写
- 基础索引已建立
- 旧链路仍可用

### Phase 2：打通后端新主链路

目标：

- `control-plane -> runtime-manager -> orchestrator -> browser-runtime`

建议动作：

- `control-plane` 增加 `POST /executions`
- `runtime-manager` 增加 `POST /runtime-sessions`
- `orchestrator` 增加 start / resume 内部接口
- 浏览器执行结果开始回写 `ExecutionStep`

出口条件：

- 能创建 `Execution`
- 能分配 `RuntimeSession`
- 至少能成功执行 1 到 2 个 step

### Phase 3：打通人工接管链路

目标：

- `human_control` 闭环成立

建议动作：

- 复用并收敛现有 freeze / unfreeze 逻辑
- 当 step 返回 `shouldTakeover=true` 时触发冻结
- Portal 增加接管入口页
- Resume 后从指定 step 或下一个 step 继续

出口条件：

- 至少一条执行可进入 `human_control`
- 用户接管后可恢复
- 运行时和业务状态都能正确流转

### Phase 4：Portal 迁移到 Execution 视图

目标：

- 从 `session` 视图迁移到 `execution` 视图

建议动作：

- 新增 `ExecutionStartPage`
- 新增 `ExecutionDetailPage`
- 新增 `TakeoverWorkbenchPage`
- Portal 不再直接依赖底层 Runtime API

出口条件：

- 用户能通过新页面发起、查看、接管、恢复执行

### Phase 5：收敛旧接口和旧语义

目标：

- 把“旧 session 语义”从主链路中移除

建议动作：

- 标记旧接口 deprecated
- 迁移日志和观测口径到 `Execution` 视图
- 限制新功能继续构建在旧 `session` 模型之上

出口条件：

- 新功能默认全部走新链路
- 旧接口只保留兼容用途

---

## 6. 逐服务迁移建议

## 6.1 `control-plane`

当前问题：

- 更像 proxy，不像 control plane

迁移目标：

- 成为 `Execution` 主状态聚合入口

第一阶段动作：

- 新增 `Execution` 外部 API
- 聚合 `RuntimeSession` 和 `ExecutionStep`
- 接收接管与恢复请求

暂不做：

- 完整 Skill Registry 重构
- 全量审计平台化

## 6.2 `ai-orchestrator`

当前问题：

- 更偏聊天与工具执行，缺少正式 Execution 视角

迁移目标：

- 围绕 `Execution` 生成 plan、推进 step、处理 resume

第一阶段动作：

- 引入 executionId 作为主上下文
- 生成最小 step plan
- 接收 browser-runtime 返回的 step 结果

暂不做：

- 复杂长期规划
- 正式 Memory 注入服务

## 6.3 `session-broker`

当前问题：

- session 同时承担资源和部分执行语义

迁移目标：

- 收敛为 `runtime-manager`

第一阶段动作：

- 保留 freeze / resume / lock / allocation
- 对外新增 `RuntimeSession` 视角接口
- 把 Redis 字段语义收敛到 `RuntimeSession`

暂不做：

- 复杂多节点迁移
- 高级调度器

## 6.4 `browser-worker`

当前问题：

- 有浏览器托管能力，但未完全抽象成正式 runtime

迁移目标：

- 成为 `browser-runtime`

第一阶段动作：

- 标准化 step 执行输入输出
- 返回 snapshot、page summary、takeover 信号
- 暴露接管连接信息

暂不做：

- 多种浏览器运行策略
- 高级录制与回放引擎重构

## 6.5 `portal`

当前问题：

- 现有前端更多围绕 session、模板、管理页

迁移目标：

- 增加 Execution 工作台

第一阶段动作：

- 新增发起页、详情页、接管页
- 轮询 `Execution` 状态
- 基于 `human_control` 展示接管入口

---

## 7. 数据迁移策略

### 7.1 第一阶段不做的大迁移

不建议第一阶段做：

- 从 `auth` 中彻底拆 Skill 全部存量数据
- 重建全部旧 execution / session 历史数据
- 全量回填历史 step log

### 7.2 第一阶段建议做法

- 新产生的 MVP 执行统一写新表
- 历史数据保持原样
- Portal 对历史记录和新记录允许双视图存在

### 7.3 外键策略

建议：

- 第一阶段 `Execution.createdBy`、`Execution.skillId` 可先使用逻辑外键
- 不强求跨服务数据库层强 relation

原因：

- 降低拆库前的耦合和迁移成本

---

## 8. API 迁移策略

### 8.1 新增优先，替换延后

原则：

- 先新增 `/executions`、`/runtime-sessions`
- 后淘汰旧 `/sessions` 语义接口

### 8.2 兼容适配层

在迁移期允许：

- `control-plane` 内部保留适配逻辑，把旧 session 请求桥接到新模型

但要求：

- 所有适配逻辑必须标注下线日期
- 适配层不得成为长期正式边界

---

## 9. 状态收口策略

### 9.1 `Execution.status`

禁止：

- `browser-runtime` 直接改 Execution 主状态
- `runtime-manager` 直接改 Execution 主状态
- Portal 绕过 control-plane 改 Execution 主状态

允许：

- 下游服务通过内部 API 请求 control-plane 更新状态

### 9.2 `RuntimeSession.state`

禁止：

- `skill-orchestrator` 直接改 RuntimeSession 主状态
- Portal 直接调用底层 runtime 状态接口进行状态变更

允许：

- 通过 runtime-manager 冻结、恢复、关闭

---

## 10. 风险清单

### 10.1 最大风险

- 新旧对象并存导致概念混乱
- Portal 继续以 session 为主视角
- 多服务仍偷偷直写主状态
- 设计未冻结就开始写大规模代码

### 10.2 风险应对

- 用文档冻结主对象和状态机
- 所有新接口都围绕 `Execution`
- 通过 code review 严格拦截跨服务直写
- 每阶段设置明确出口条件

---

## 11. 回退策略

### 11.1 技术回退

若新主链路未稳定，可采取：

- 保留旧 session 链路可继续演示
- 新 Execution 页面只对内部测试用户开放
- 新表保留但暂停写入

### 11.2 范围回退

若阶段进度失控，应优先回退以下能力，而不是破坏主边界：

- 暂不做审批页面
- 暂不做复杂 artifact 归档
- 暂不做多场景 Skill

不应回退：

- `Execution` 主对象
- `RuntimeSession` 主对象
- freeze / resume 主链路

---

## 12. 验收出口条件

### Phase 1 验收

- 新表已建立
- 基础字段和索引可用

### Phase 2 验收

- `POST /executions` 可创建执行
- `POST /runtime-sessions` 可分配运行时
- 至少 1 条执行可跑完基础 step

### Phase 3 验收

- 至少 1 条执行可进入 `human_control`
- 用户接管后可 `resume`

### Phase 4 验收

- Portal 可展示 Execution 详情和 steps
- 接管工作台可进入并恢复执行

### Phase 5 验收

- 新功能默认全部走新对象
- 旧接口只保留兼容用途

---

## 13. 推荐里程碑

### Milestone A：对象与接口冻结

- 产出：表结构、API Spec、Blueprint

### Milestone B：后端主链路可跑

- 产出：create / start / step execute

### Milestone C：人工接管闭环

- 产出：freeze / takeover / resume

### Milestone D：Portal 工作台可演示

- 产出：Execution 详情页 + 接管页

### Milestone E：MVP 演示版本

- 产出：完整浏览器类 Skill 闭环

---

## 14. 与现有文档关系

- 服务边界：见 `Enterprise-Skill-Platform_Service-Boundaries_v2.0.md`
- API 合同：见 `Enterprise-Skill-Platform_Service-API-and-Ownership-Contract_v2.0.md`
- MVP 范围：见 `Enterprise-Skill-Platform_MVP-Scope-and-Acceptance_v2.0.md`
- 详细设计蓝图：见 `Enterprise-Skill-Platform_MVP-Implementation-Blueprint_v2.0.md`

本文定位是“迁移实施手册”，用于把设计文档转化为可执行的分阶段改造路径。
