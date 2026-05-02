# 企业级 Skill 平台 `v4` 迁移实施方案

**Migration Plan v4.0**  
日期：2026-05-01

> 本文定义如何从当前仓库现态逐步迁移到 `v4` 目标架构。  
> 目标不是一次性大拆服务，而是在不破坏现有可运行能力的前提下，逐步收敛接口、冻结契约、整理边界、拆分部署层，并为外部能力独立接入铺路。

---

## 1. 文档目标

本文回答以下问题：

- `v4` 迁移应该先做什么，后做什么
- 哪些能力可以保留现状，哪些必须优先收敛
- 当前服务应如何逐步演进，而不是一次性重写
- 每个阶段的产出物、风险、验收标准是什么

---

## 2. 迁移原则

### 2.1 先冻结契约，再调整实现

- 优先冻结 `Execution / Skill / Runtime Context / Tool Governance / Runtime Protocol`
- 再改服务内部结构
- 最后再做物理拆分和部署分层

### 2.2 先收边界，再补能力

- 先解决职责漂移
- 再继续扩展外部能力
- 先保证接入方式一致
- 再增加接入数量

### 2.3 兼容现有可运行链路

迁移过程中必须保证以下链路不断：

- Skill 匹配
- Execution 创建与查看
- 浏览器链路可运行
- Skill 发布链可运行
- 模板工作流草稿与发布链可运行

### 2.4 不强求第一阶段物理拆服务

`v4` 第一阶段的关键是：

- 逻辑边界清晰
- 契约清晰
- 外部接入面清晰

而不是：

- 一开始就把服务全部物理拆散

---

## 3. 当前现态到目标态的差距

### 3.1 已经具备的能力

- `Execution` 控制面雏形已存在
- Skill Registry 与 Release 链已存在
- Tool Catalog 与 SkillToolBinding 已存在
- Browser Runtime 已存在
- Document / Temporal 相关构建与运行链已存在
- Planner 已具备匹配、参数识别、计划生成能力

### 3.2 主要差距

- Runtime 私有协议尚未统一
- `auth` 中身份域与 Registry 域耦合较深
- `ai-orchestrator` 仍保留较多执行味道
- Compose 部署边界尚未按架构层表达
- API 语义虽已雏形存在，但未正式冻结

---

## 4. 迁移阶段总览

建议按六个阶段推进：

1. `P0 契约冻结`
2. `P1 控制面收敛`
3. `P2 Runtime 协议统一`
4. `P3 Registry 逻辑拆分`
5. `P4 部署分层化`
6. `P5 外部能力开放接入`

---

## 5. `P0` 契约冻结

### 5.1 目标

把 `v4` 的正式对象和接口先写清楚，并在实现中开始对齐。

### 5.2 产出物

- `Architecture Proposal v4.0`
- `API Contract Spec v4.0`
- `Docker and Deployment Blueprint v4.0`
- `Runtime Capability Protocol Spec v4.0`
- 错误码清单
- DTO 冻结清单

### 5.3 工作项

1. 确认 `Execution API` 作为唯一北向业务入口
2. 确认 `Skill Contract` 作为唯一能力交付对象
3. 确认 `Published Skill Runtime Context` 为正式运行态上下文
4. 确认 `Tool Governance` 为正式治理对象
5. 确认 `Runtime Capability Contract` 为统一南向协议

### 5.4 验收标准

- 团队对四类稳定契约达成一致
- 新增能力设计不再绕开这些契约
- 文档成为后续实现的正式基线

---

## 6. `P1` 控制面收敛

### 6.1 目标

确保 `Execution`、`Skill`、`Tool Governance` 的主写边界明确。

### 6.2 重点收敛对象

#### 6.2.1 `control-plane`

必须明确：

- `Execution.status` 只在这里写
- 审批、接管、恢复只在这里发起正式状态变更
- Portal 后续必须优先依赖这里

#### 6.2.2 `auth`

必须明确：

- `Skill`、`ToolCatalog`、`SkillToolBinding`、`CapabilityRelease` 的主写入口在这里
- 后续虽然可逻辑拆分，但当前先冻结其治理语义

#### 6.2.3 `ai-orchestrator`

必须明确：

- 仅作为 Planner 使用
- 不再被定义为外部能力接入主入口
- 不应写主业务状态

### 6.3 工作项

1. 明确各服务“允许写什么、不允许写什么”
2. 对外文档与 README 中统一这些边界
3. 逐步减少 Portal 对非控制面接口的直接依赖

### 6.4 验收标准

- 所有业务状态变化都能追溯到 `control-plane`
- Skill 相关治理都能追溯到 `auth`
- 新增接入不再优先挂到 `ai-orchestrator`

---

## 7. `P2` Runtime 协议统一

### 7.1 目标

让 Browser / Document / Workflow / 第三方 Runtime 都对齐统一运行时协议。

### 7.2 第一批改造对象

#### 7.2.1 `browser-worker`

改造项：

- 对齐 `RuntimeStepInvokeRequest`
- 对齐 `RuntimeStepInvokeResult`
- 标准化错误码
- 标准化 snapshot / artifact 返回

#### 7.2.2 `carbone-engine`

改造项：

- 收敛为 `document.render`
- 标准化 `ArtifactRef`
- 把 downloadUrl、documentId 映射到统一产物语义

#### 7.2.3 `temporal-worker`

改造项：

- 收敛为 `workflow.run`
- 统一长流程返回语义
- 标准化日志、等待态、失败态

### 7.3 工作项

1. 抽象内部 Runtime adapter 接口
2. 为三类 Runtime 各写一个平台侧 adapter
3. 把 Execution 引擎改为只认统一协议
4. 保留旧接口作为兼容层，逐步废弃

### 7.4 验收标准

- 新旧 Runtime 都能通过统一平台适配层被调用
- Execution 不再依赖某个 Runtime 私有返回字段
- takeover / artifact / snapshot 语义在三类 Runtime 中一致

---

## 8. `P3` Registry 逻辑拆分

### 8.1 目标

把 `auth` 中“身份域”和“Registry / Release 域”概念上拆开，为后续物理拆分做准备。

### 8.2 重点

当前不强制物理拆分服务，但必须先做到：

- 文档上明确两个逻辑域
- API 分组上明确两个逻辑域
- 内部模块依赖方向清晰

### 8.3 工作项

1. 统一命名
   - `identity`
   - `skill-registry`
   - `release-service`
2. 把通用身份逻辑和 Skill / Release 逻辑分开组织
3. 逐步减少跨模块直接依赖

### 8.4 验收标准

- 外部团队理解平台时，不再把 `auth` 误解为“只是登录服务”
- Skill / Release 模块可以被独立识别和规划

---

## 9. `P4` 部署分层化

### 9.1 目标

让部署模型反映架构边界，而不是继续只反映开发便利。

### 9.2 工作项

1. 引入新的 Compose 文件分层：
   - `core`
   - `planner`
   - `runtime`
   - `experience`
   - `full`
2. 在启动文档中明确五组部署语义
3. 让外部 Runtime Adapter 能独立挂入运行时组

### 9.3 验收标准

- 核心平台可以独立启动
- 运行时可以按需挂载
- 体验层可以独立联调
- 团队不再把 `full` 误解为唯一架构形态

---

## 10. `P5` 外部能力开放接入

### 10.1 目标

使外部团队可以在不修改平台核心代码的前提下，独立接入能力。

### 10.2 支持的接入模式

1. 作为 `Tool Provider`
2. 作为 `Runtime Adapter`
3. 作为 `Flow / Workflow Source`

### 10.3 工作项

1. 提供接入模板
2. 提供最小示例
3. 提供接入校验清单
4. 提供发布与治理流程说明

### 10.4 验收标准

- 外部团队不需要理解内部 Prompt 和 ReAct 细节
- 外部团队只需要对齐正式契约即可接入
- 平台侧不再因每接一个新能力就修改核心控制逻辑

---

## 11. 服务级迁移建议

### 11.1 `control-plane`

短期：

- 继续承接 Execution API
- 强化唯一状态写入口定位

中期：

- 收敛代理逻辑
- 对接统一 Runtime Adapter 层

长期：

- 成为稳定的 `Execution Control Plane`

### 11.2 `ai-orchestrator`

短期：

- 继续承接规划与识别能力

中期：

- 收敛工具执行逻辑暴露
- 减少对具体 Runtime 私有行为的感知

长期：

- 成为可替换的 Planner Facade

### 11.3 `auth`

短期：

- 稳定 Skill / Tool / Release 契约

中期：

- 逻辑拆分身份域与 Registry 域

长期：

- 视需要物理拆为 `identity-service` 与 `skill-registry-release-service`

### 11.4 `session-broker`

短期：

- 强化 RuntimeSession 资源面定位

中期：

- 对齐统一 Runtime 管理语义

长期：

- 成为标准 Runtime Manager

### 11.5 `browser-worker`

短期：

- 保持现有可运行链路

中期：

- 对齐统一 Runtime 协议

长期：

- 成为 Browser Runtime Adapter 标准实现

### 11.6 `carbone-engine`

短期：

- 保持文档渲染可用

中期：

- 对齐 Document Runtime 协议

长期：

- 成为可替换的 Document Runtime Adapter

### 11.7 `temporal-worker`

短期：

- 保持工作流执行能力

中期：

- 对齐 Workflow Runtime 协议

长期：

- 成为可扩展的 Workflow Runtime Adapter

---

## 12. 数据与 API 迁移清单

### 12.1 DTO 冻结

优先冻结：

- `ExecutionDto`
- `ExecutionStepDto`
- `SkillConfigDto`
- `ToolCatalogItem`
- `PublishedSkillRuntimeContext`
- `RuntimeStepInvokeRequest`
- `RuntimeStepInvokeResult`

### 12.2 错误码冻结

优先冻结：

- Execution 域错误码
- Skill 域错误码
- Tool 域错误码
- Runtime 域错误码

### 12.3 兼容层策略

迁移期间允许：

- 保留旧接口
- 在平台内部写 adapter 做转换
- 在日志中标记旧协议调用

迁移完成后：

- 旧接口逐步标记 `deprecated`
- 新能力必须只走新契约

---

## 13. 风险与对策

### 13.1 风险：迁移期间双协议并存

对策：

- 明确新协议优先
- 通过 adapter 兼容旧协议
- 对旧路径做使用量统计

### 13.2 风险：团队继续按服务名理解职责

对策：

- 所有文档优先讲契约对象
- 在 README、API 文档、架构图中统一术语

### 13.3 风险：外部团队绕过控制面接入

对策：

- 文档中明确“不推荐接入路径”
- 平台评审时按契约检查
- 治理链要求所有能力最终进入 Skill / Release

### 13.4 风险：先写代码后补文档

对策：

- 新增 Runtime、新增 Tool、新增发布链改动时，必须先对照 `v4` 契约文档

---

## 14. 推荐时间顺序

### 第 1 周

- 冻结 `v4` 文档与术语
- 统一接口对象命名
- 统一错误码清单

### 第 2 周

- 梳理 Execution API 与 Skill API 的正式字段
- 引入 Runtime 协议 adapter 层

### 第 3 周

- Browser Runtime 对齐新协议
- Document Runtime 对齐新协议

### 第 4 周

- Workflow Runtime 对齐新协议
- 发布链与 Runtime Context 对齐

### 第 5 周

- 拆分 Compose 文件
- 输出接入模板和外部接入指南

---

## 15. 最终结论

`v4` 迁移的核心不是“把现有系统推倒重来”，而是：

- 把已经存在的能力放回清晰边界
- 把已经出现的接口上升为正式契约
- 把已经跑通的执行链收敛成统一 Runtime 协议
- 把后续新增能力约束到统一接入方式

只要迁移顺序保持为“先契约、再适配、再拆分、再开放”，当前仓库可以平滑演进到 `v4` 目标态，而不需要一次性大规模重构。
