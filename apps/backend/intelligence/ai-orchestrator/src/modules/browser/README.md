# ai-orchestrator/browser -> browser-domain/recorder + runtime-facade

当前目录仍物理位于 `ai-orchestrator`，但逻辑归属已经切换为未来浏览器能力域的一部分：

- `browser-domain/recorder`
- `browser-domain/runtime-facade`
- 个别高频自然语言动作决策未来可进一步外移到 `browser-nl-agent`

## 该模块负责

- 浏览器录制调试、观察、导出、循环与会话相关编排
- 浏览器意图理解与浏览器能力域内部协调
- 作为 `ai-orchestrator` 与浏览器域之间的现阶段桥接层

## 该模块不负责

- 通用 Planner 的技能匹配与计划生成
- 浏览器模板的设计时目录管理
- 浏览器语义规则的独立发布中心职责

## 当前逻辑视图

- `gateway/`: 浏览器域入口网关稳定出口
- `intent/`: 浏览器意图理解与动作规划
- `recorder/`: 录制调试主链路与聊天执行编排稳定出口
- `observation/`: 页面观察、快照与观察语义稳定出口
- `session/`: 调试会话与状态存储
- `export/`: 录制导出与模板装配
- `runtime-facade/`: 执行桥接与阶段恢复稳定出口

## 当前物理过渡目录

- `api/`: 仍承载浏览器域控制器与 HTTP 入口实现
- `execute/`: 仍承载 recorder / observation / session / runtime-facade 的过渡实现
- `observe/`: 仍承载页面观察与快照底层服务
- `loop/`: 仍作为 recorder 的循环、条件分支与 loop draft 支撑实现
- `recovery/`: 仍承载浏览器阶段恢复实现
