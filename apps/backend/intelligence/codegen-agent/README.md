# codegen-agent

`codegen-agent` 是未来独立的专项智能体，用于把用户意图或工作单元草案转换为可验证的代码生成结果。

当前只保留最小落点，不启动完整服务。

本目录当前职责：

- 保留未来物理路径
- 收敛最小契约
- 防止相关逻辑继续回流到 `ai-orchestrator` 或 `temporal-workflow`

当前 `Agent Profile` 已优先对齐到共享合同包 `@ops/backend-agent-profile`，
其余生成物与验证结果结构仍暂留本地，后续再按批次继续收口。

当前逻辑视图：

- `contracts/`
  - `Agent Profile` 扩展
  - `Generated Work Unit`
  - `Sandbox Runtime Binding`
  - `Security Lint Result`
- `modules/generator`
  - prompt 组装
  - 代码写出
  - 依赖解析
- `modules/verification`
  - dry-run
  - package assembly
  - security lint
- `modules/export`
  - 生成结果映射为 `Generated Work Unit`

边界说明：

- `master-planner` 只负责判断是否委派给 `codegen-agent`
- `codegen-agent` 只负责生成、预校验与结果封装
- `control-plane` 不负责代码生成内部循环
- `sandbox-worker` 只承接运行时验证绑定，不承接生成逻辑本体

最小对象：

- `Agent Profile`
- `Generated Work Unit`
- `Sandbox Runtime Binding`
- `Security Lint Result`

后续服务化时，再补：

- `src/modules/generator`
- `src/modules/verification`
- `src/modules/export`
