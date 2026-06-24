# ai-orchestrator/planner -> master-planner

当前目录仍物理位于 `ai-orchestrator`，但逻辑归属已经切换为未来
`master-planner` 的通用规划链。

## 该模块负责

- Skill 匹配、参数识别、规划草稿与计划生成
- 面向多能力域的通用意图理解与规划编排
- 作为未来 `master-planner` 的过渡逻辑视图

## 该模块不负责

- 浏览器录制、页面观察、浏览器导出与调试执行
- 浏览器动作级原子解析与浏览器域内部恢复逻辑
- 浏览器能力域的专属运行时细节

## 当前逻辑视图

- `facade/`: Planner 对外统一入口
- `intent/`: 通用意图匹配阶段
- `params/`: 参数识别、参数策略与输入呈现
- `plan/`: 计划语义与计划生成
- `planning/`: 规划草稿与中间态编排
- `delegation/`: Agent 委派逻辑视图，负责未来把计划步骤与执行上下文收口为共享执行协议请求
- `skill/`: Skill 缓存与匹配辅助
