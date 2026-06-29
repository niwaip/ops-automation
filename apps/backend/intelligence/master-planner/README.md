# master-planner

当前目录代表未来 `intelligence/master-planner` 的统一逻辑视图。

本目录用于承接通用意图理解、计划生成与专项 Agent 委派，
把这类主规划职责从 `ai-orchestrator` 的混合实现中逐步抽离出来。

## 该目录负责

- 通用意图理解与参数补齐编排
- 计划草稿、步骤排序与执行前决策模型
- 面向专项 Agent 的委派决策模型
- 主 Planner 的稳定 façade 出口

## 该目录不负责

- 浏览器域内部执行、观察、会话与导出实现
- 单个专项 Agent 的高频推理循环
- Release 编译、发布与 Manifest 生成
- Control-plane 与 Worker 的运行时原子执行

## 当前迁移状态

- 当前先落最小源码入口与对象模型，不在本批次搬迁 `ai-orchestrator` 的真实实现。
- `ai-orchestrator/src/modules/planner/*` 仍是当前主承载层。
- 新的主 Planner 契约、计划草稿模型与委派决策模型，应优先收敛到本包。
