# Backend Domain Layer

领域层（Domain Layer）是整个系统的业务核心，负责实现具体的自动化场景模型、报告渲染与能力建模。

## 典型职责

- **浏览器模版管理 (Browser Template)**：自动化步骤录制后的 DSL、校验规则、参数化配置解析。
- **文档与渲染引擎 (Document Engine / carbone)**：保密协议、测试报告等 Office / PDF 模板的高性能渲染。
- **技能定义 (Skill Domain)**：业务技能的元数据、步骤链编排、记忆管理与评分评估模型。

## 依赖原则

- 允许依赖 `platform/*` 进行鉴权及租户隔离约束，允许依赖 `shared/*`。
- **绝对禁止**依赖 `runtime/*` 与 `orchestration/*`，确保核心业务领域逻辑的纯洁性与高可测性。
