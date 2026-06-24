# codegen-agent 最小落点设计 (v4.1)

日期：2026-06-23

> 本文件对应实施 backlog 的 `Batch E1`，用于为未来 `codegen-agent` 独立服务预留最小目录与契约落点。

## 1. 目标

- 不立即启动完整服务。
- 先明确未来物理路径、最小对象模型和依赖边界。
- 保证后续新增 `codegen-agent` 时，不会再次把逻辑堆回 `ai-orchestrator` 或 `temporal-workflow`。

## 2. 目标路径

当前最小落点定义为：

```text
apps/backend/intelligence/codegen-agent/
├── README.md
└── src/
    └── contracts/
        └── codegen-agent.types.ts
```

说明：

- 当前已具备最小服务骨架：
  - `package.json`
  - `src/app.module.ts`
  - `src/index.ts`
  - `src/modules/generator`
  - `src/modules/verification`
  - `src/modules/export`
- 本批次重点仍然是“明确最小落点与边界”，不是启动完整独立部署链路
- 后续若继续服务化，再补控制面接入、注册、审批与部署脚本

## 3. 最小契约

本批次只要求四类核心对象：

1. `Agent Profile`
2. `Generated Work Unit`
3. `Sandbox Runtime Binding`
4. `Security Lint` 结果结构

它们的作用分别是：

- `Agent Profile`
  - 定义该 Agent 的身份、能力、允许生成的输出类型、策略边界
- `Generated Work Unit`
  - 定义一次代码生成后的产物单元
  - 未来可被 release、sandbox、control-plane 共同识别
- `Sandbox Runtime Binding`
  - 定义生成产物如何绑定到 `sandbox-worker`
  - 只表达运行时绑定，不直接耦合具体 Docker/Temporal 实现细节
- `Security Lint`
  - 表达静态安全检查、风险级别与阻断结论

## 4. 边界定义

### `codegen-agent` 自己负责

- Prompt 组装
- 代码/文件生成
- 依赖清单推断
- 安全 lint 与 dry-run 预检查
- 生成产物封装为 `Generated Work Unit`

### 不属于 `codegen-agent`

- 具体发布为哪个 release
- 是否允许上线
- sandbox 运行时本体实现
- control-plane 审批与接管决策
- browser-domain 原子执行

## 5. 与现有模块关系

### 与 `master-planner`

- `master-planner` 负责判断是否委派给 `codegen-agent`
- `codegen-agent` 只负责生成与验证，不负责全局计划编排

### 与 `agent-catalog`

- `Agent Profile` 的注册归属未来仍应落到 `agent-catalog`
- 当前已先通过共享合同包 `@ops/backend-agent-profile` 对齐公共画像模型
- `codegen-agent` 自身仍保留本地生成与验证契约，作为最小落点

### 与 `sandbox-worker`

- `codegen-agent` 通过 `Sandbox Runtime Binding` 描述“如何执行/验证”
- 不直接内嵌沙箱执行器实现

### 与 `control-plane`

- 后续接入控制面时，应优先复用共享合同包 `@ops/backend-agent-execution-protocol`
- `codegen-agent` 只接收标准开始请求，并回传进度事件与最终结果
- 不在本批次直接把控制面私有 DTO 内嵌到 `codegen-agent`

## 6. 后续扩展方向

后续真正服务化时，建议演进为：

```text
src/
├── modules/
│   ├── generator/
│   ├── verification/
│   └── export/
└── contracts/
```

其中：

- `generator` 负责 prompt、代码生成、依赖解析
- `verification` 负责 security lint、dry-run、sandbox preflight
- `export` 负责把生成结果整理成工作单元与产物引用

## 7. 本批次结论

`Batch E1` 的结论是：

- `codegen-agent` 的目标路径已明确，且已具备最小服务骨架
- 最小契约对象已明确，并已落在 `src/contracts/codegen-agent.types.ts`
- 与 `master-planner`、`agent-catalog`、`sandbox-worker` 的边界已明确
- 与 `control-plane` 的未来接入应走共享 `agent-execution-protocol`
- 共享协议与本地领域契约的字段归属，已在 `specialized-agent-execution-protocol-boundary_v4.1.md` 中进一步明确
- 共享协议的实例载荷示例，已在 `specialized-agent-execution-protocol-examples_v4.1.md` 中进一步明确
- 后续若要真正独立部署，可在现有目录继续向下扩展，而不是重新选址
