# Design Docs

## 说明

`design/` 目录已按版本整理：

- `history/`
  - 早期以 Browser Control Plane 为中心的历史方案
- `v2/`
  - 当前已完成的一组 `v2.0` 设计文档
- `v3/`
  - 面向 `Planner-only Agent OS` 的新一轮架构演进设计

当前项目的主方向是：

- 以 `Skill` 为一等公民的企业级能力平台
- 以 `Execution` 为业务真相源、以 `RuntimeSession` 为资源真相源
- 将 `ai-orchestrator` 收敛为 `Planner / Verifier / Failure Classifier`
- 将 `Policy / Memory / Evolution / Release` 独立成正式平面

## 目录结构

- `history/`
  - 历史文档，仅用于追溯背景
- `v2/`
  - 已有平台设计基线
- `v3/`
  - 新版 Agent OS 设计

## 推荐阅读顺序

### `v3` 优先

1. `v3/Enterprise-Skill-Platform_Master_v3.0.md`
2. `v3/Enterprise-Skill-Platform_Agent-OS-Planner-Architecture_v3.0.md`
3. `v3/Enterprise-Skill-Platform_Agent-OS-Execution-and-Migration-Blueprint_v3.0.md`
4. `v3/Enterprise-Skill-Platform_Core-Data-Model_v3.0.md`
5. `v3/Enterprise-Skill-Platform_Runtime-and-Policy_v3.0.md`
6. `v3/Enterprise-Skill-Platform_Execution-API-Spec_v3.0.md`
7. `v3/Enterprise-Skill-Platform_Service-Boundaries_v3.0.md`
8. `v3/Enterprise-Skill-Platform_Full-Roadmap_v3.0.md`
9. `v3/Enterprise-Skill-Platform_Phase-2-to-5-Implementation-Outline_v3.0.md`
10. `v3/Enterprise-Skill-Platform_Phase-2-Implementation-Blueprint_v3.0.md`
11. `v3/Enterprise-Skill-Platform_Policy-Data-Model_v3.0.md`
12. `v3/Enterprise-Skill-Platform_Policy-API-Spec_v3.0.md`
13. `v3/Enterprise-Skill-Platform_Phase-3-Memory-and-Evaluation-Blueprint_v3.0.md`
14. `v3/Enterprise-Skill-Platform_Memory-Data-Model_v3.0.md`
15. `v3/Enterprise-Skill-Platform_Evaluation-API-Spec_v3.0.md`
16. `v3/Enterprise-Skill-Platform_Phase-4-and-5-Overview_v3.0.md`
17. `v3/Enterprise-Skill-Platform_Implementation-Blueprint_v3.0.md`
18. `v3/Enterprise-Skill-Platform_MVP-Implementation-Checklist_v3.0.md`
19. `v3/Enterprise-Skill-Platform_MVP-Development-Backlog_v3.0.md`
20. `v3/Enterprise-Skill-Platform_MVP-Story-Breakdown_v3.0.md`
21. `v3/Enterprise-Skill-Platform_MVP-Code-Mapping_v3.0.md`
22. `v3/Enterprise-Skill-Platform_MVP-Implementation-Sequence_v3.0.md`
23. `v3/Enterprise-Skill-Platform_MVP-First-Change-Set_v3.0.md`
24. `v3/Enterprise-Skill-Platform_Phase-1-Implementation-Plan_v3.0.md`

### `v2` 作为基础背景

1. `v2/Enterprise-Skill-Platform_Master_v2.0.md`
2. `v2/Enterprise-Skill-Platform_Domain-Model_v2.0.md`
3. `v2/Enterprise-Skill-Platform_Runtime-and-Policy_v2.0.md`
4. `v2/Enterprise-Skill-Platform_Service-Boundaries_v2.0.md`
5. `v2/Enterprise-Skill-Platform_Core-Data-Model_v2.0.md`
6. `v2/Enterprise-Skill-Platform_Execution-Lifecycle-RFC_v2.0.md`
7. `v2/Enterprise-Skill-Platform_Memory-and-Evolution-RFC_v2.0.md`
8. `v2/Enterprise-Skill-Platform_MVP-Implementation-Blueprint_v2.0.md`
9. `v2/Enterprise-Skill-Platform_MVP-Migration-Runbook_v2.0.md`

## `v3` 文档定位

- `v3/Enterprise-Skill-Platform_Master_v3.0.md`
  - 统一 `v3` 的顶层目标、分层、原则与演进路线
  - 说明为什么要把 `ai-orchestrator` 降级为 Planner
  - 给出 `v3` 文档之间的关系和主链路

- `v3/Enterprise-Skill-Platform_Agent-OS-Planner-Architecture_v3.0.md`
  - 定义 `Planner / Execution / Runtime / Policy / Memory / Evolution` 的目标分层
  - 明确 `ai-orchestrator` 降级后的职责边界
  - 定义长期记忆和受控进化应落在哪个平面

- `v3/Enterprise-Skill-Platform_Agent-OS-Execution-and-Migration-Blueprint_v3.0.md`
  - 定义 `Execution`、`ExecutionStep`、`RuntimeSession` 的目标模型
  - 给出从现有仓库迁移到 `Planner-only Agent OS` 的阶段路线
  - 明确哪些模块可直接复用、哪些模块要重构、哪些只能参考

- `v3/Enterprise-Skill-Platform_Core-Data-Model_v3.0.md`
  - 定义 `v3` 下 `SkillVersion / Execution / RuntimeSession / MemoryItem / CandidatePatch` 的核心对象模型
  - 给出第一阶段必须落地的表、枚举、索引和存储职责

- `v3/Enterprise-Skill-Platform_Runtime-and-Policy_v3.0.md`
  - 定义 `v3` 下 Runtime 与 Policy 的正式边界
  - 说明风险分级、Capability 授权、审批、接管与 Runtime 分类治理

- `v3/Enterprise-Skill-Platform_Execution-API-Spec_v3.0.md`
  - 定义 `v3` 下外部 API、内部 API、DTO、状态写入约束和错误码
  - 约束 Planner、Execution、Runtime、Portal 的写入职责分工

- `v3/Enterprise-Skill-Platform_Service-Boundaries_v3.0.md`
  - 将当前仓库服务映射到 `Planner-only Agent OS` 目标边界
  - 明确哪些服务原地升级、哪些职责应迁出、第一阶段哪些边界必须收敛

- `v3/Enterprise-Skill-Platform_Full-Roadmap_v3.0.md`
  - 给出 `Phase 1` 到 `Phase 5` 的完整演进路线、依赖关系、退出标准和里程碑
  - 明确为什么先做执行主链，再做治理、记忆、进化和高级运行时

- `v3/Enterprise-Skill-Platform_Phase-2-to-5-Implementation-Outline_v3.0.md`
  - 将 `Phase 2` 到 `Phase 5` 进一步明确为阶段纲要
  - 给出每阶段的范围、对象、服务改动、接口方向、验收标准和明确后置项

- `v3/Enterprise-Skill-Platform_Phase-2-Implementation-Blueprint_v3.0.md`
  - 给出 `Phase 2` 的正式落地范围、治理挂点、API Runtime / Document Runtime 接入方式和退出标准

- `v3/Enterprise-Skill-Platform_Policy-Data-Model_v3.0.md`
  - 定义 `Policy / PolicyBinding / PolicyDecision / ApprovalRequest / DecisionRecord` 的核心对象模型

- `v3/Enterprise-Skill-Platform_Policy-API-Spec_v3.0.md`
  - 定义 `precheck / step-check / postcheck` 与审批相关接口、DTO、错误码和写入约束

- `v3/Enterprise-Skill-Platform_Phase-3-Memory-and-Evaluation-Blueprint_v3.0.md`
  - 给出 `Phase 3` 的正式落地范围、Memory 分层、Evaluation 角色、服务改动和退出标准

- `v3/Enterprise-Skill-Platform_Memory-Data-Model_v3.0.md`
  - 定义 `MemoryItem`、作用域、来源、生命周期、检索维度和访问日志模型

- `v3/Enterprise-Skill-Platform_Evaluation-API-Spec_v3.0.md`
  - 定义 `Evaluation` 的生成、查询接口、DTO、状态约束和与 Execution 的协作关系

- `v3/Enterprise-Skill-Platform_Phase-4-and-5-Overview_v3.0.md`
  - 以概要方式定义 `Phase 4/5` 的稳定边界
  - 重新判断整条 `Phase 1 -> Phase 5` 路线的整合性、主要风险与后续实施重点

- `v3/Enterprise-Skill-Platform_Implementation-Blueprint_v3.0.md`
  - 给出第一阶段落地对象、状态、存储分工、服务职责和主链路时序
  - 说明当前仓库如何以最小改动跑出正式 Browser 闭环

- `v3/Enterprise-Skill-Platform_MVP-Implementation-Checklist_v3.0.md`
  - 将第一阶段进一步收敛为 `MVP` 可执行清单
  - 明确什么是必交付、什么是条件交付、什么只保留接口预留

- `v3/Enterprise-Skill-Platform_MVP-Development-Backlog_v3.0.md`
  - 将 `MVP` 可执行清单进一步下沉为开发 backlog
  - 按服务拆分 `P0 / P1 / Reserved`，便于直接排期和分配

- `v3/Enterprise-Skill-Platform_MVP-Story-Breakdown_v3.0.md`
  - 将 backlog 进一步拆成 story 粒度的开发单元
  - 为每个 story 定义目标、输入、输出、验收和阶段映射

- `v3/Enterprise-Skill-Platform_MVP-Code-Mapping_v3.0.md`
  - 将 MVP story 直接映射到当前仓库的服务、模块和关键文件
  - 明确哪些可以直接复用，哪些需要重点改造，哪些应在现有服务内新增

- `v3/Enterprise-Skill-Platform_MVP-Implementation-Sequence_v3.0.md`
  - 将 story 和 code mapping 进一步收敛成实际开发顺序
  - 明确先改什么、哪些可并行、哪些必须等联调关口通过后再继续

- `v3/Enterprise-Skill-Platform_MVP-First-Change-Set_v3.0.md`
  - 将实施顺序进一步压缩成第一批真实改动文件清单
  - 明确第一次开工时先动哪些文件、每个文件要解决什么问题、改完后的完成信号

- `v3/Enterprise-Skill-Platform_Phase-1-Implementation-Plan_v3.0.md`
  - 将第一阶段实施蓝图拆成按服务可执行的任务清单、依赖顺序、排期和验收标准

## `v2` 文档定位

`v2/` 中保留了完整的上一版平台设计，适合作为：

- 当前实现背景
- 数据模型和状态机基础
- 服务边界与 MVP 设计参考
- 与 `v3` 做差异分析时的基线

## 后续整理建议

- 后续新版本文档继续按 `v4/`、`v5/` 目录递进
- 每次架构调整先更新 `README.md` 中的推荐阅读顺序
- 新版本文档优先引用相对路径，避免写入失效的绝对链接
