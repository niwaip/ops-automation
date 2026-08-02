# pi 契约校验与执行生命周期参考摘要

快照日期：2026-07-31  
上游仓库：`earendil-works/pi`  
审阅快照：`027a5847901b5dde30270abaa1041046cd2b4b55`

## 1. 用途

本文保存统一能力契约设计从 pi 提炼出的关键机制，供无法访问外网的开发和审阅环境使用。

这不是 pi 文档的完整镜像，也不是本项目的规范来源。最终平台行为以：

```text
unified-capability-contract-and-validation-design.md
```

为准。

## 2. 审阅的上游位置

- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/types.ts`
- `packages/agent/README.md`
- `packages/coding-agent/docs/extensions.md`
- 根目录 `README.md`

固定快照链接：

- [Agent Loop](https://github.com/earendil-works/pi/blob/027a5847901b5dde30270abaa1041046cd2b4b55/packages/agent/src/agent-loop.ts)
- [Agent Types](https://github.com/earendil-works/pi/blob/027a5847901b5dde30270abaa1041046cd2b4b55/packages/agent/src/types.ts)
- [Agent README](https://github.com/earendil-works/pi/blob/027a5847901b5dde30270abaa1041046cd2b4b55/packages/agent/README.md)
- [Extensions](https://github.com/earendil-works/pi/blob/027a5847901b5dde30270abaa1041046cd2b4b55/packages/coding-agent/docs/extensions.md)
- [Repository README](https://github.com/earendil-works/pi/blob/027a5847901b5dde30270abaa1041046cd2b4b55/README.md)

## 3. 可借鉴机制

### 3.1 执行前参数校验

Agent Loop 在准备工具调用时先执行参数兼容转换，再按工具参数 Schema 校验，之后才进入 `beforeToolCall`。

可映射为本项目：

```text
prepareArguments
  → input Schema validation
  → beforeCapabilityCall
  → executeCapability
```

平台额外要求：任何前置中间件修改参数后必须重新校验。

### 3.2 前置与后置中间件

pi 提供：

- `beforeToolCall`：执行前检查，可阻止调用；
- `afterToolCall`：执行后修改结果、错误状态或终止提示。

本项目对应：

- `beforeCapabilityCall`：权限、默认值、枚举、预算、幂等、敏感数据策略；
- `afterCapabilityCall`：结果规范化、输出 Schema、Artifact、审计和稳定错误码。

### 3.3 并发完成顺序与持久化顺序分离

pi 的并发工具调用允许完成事件按实际完成顺序发出，但最终 Tool Result 消息按 Assistant 原始调用顺序写入。

本项目 Phase 1 不启用同层并发。P3 如引入并发，应保留：

- 实时完成事件；
- 按冻结计划节点顺序持久化的稳定结果；
- 可重放的 `planHash + nodeId + contractDigest`。

### 3.4 注册接口保持小而明确

pi 的工具定义集中声明名称、描述、参数 Schema、执行函数和可选执行模式。

本项目可借鉴小型注册接口，但必须额外声明：

- 精确能力版本；
- input/output Schema；
- `dataPath`；
- `contractDigest`；
- Runtime Adapter；
- Fixture 和发布验证凭证。

### 3.5 统一检查与隔离发布验证

pi 仓库提供统一的构建、检查和测试命令，并在发布前执行隔离安装 Smoke Test；依赖和发布内容采用锁文件、精确版本和摘要约束。

本项目对应目标：

```text
capability check
capability sandbox-test
capability composition-test
capability replay-test
capability release-verify
```

## 4. 不应直接复制

### 4.1 工具结果不是强输出契约

pi 的 Tool Result `details` 可以保存任意结构，适合 Agent UI 和日志，但不能证明生产者输出可绑定到下游消费者。

本项目必须增加独立 output Schema 和运行时校验。

### 4.2 参数修改后不会自动重新校验

pi Coding Agent 扩展允许 `tool_call` 处理器修改输入，后续不自动重新执行 Schema 校验。

本项目不能继承这一行为。所有兼容转换、default 应用和中间件修改之后都必须重新校验。

### 4.3 权限和隔离需要平台负责

pi 根文档明确将文件、进程、网络和凭据边界交给容器或外部 Sandbox。

本项目必须继续使用：

- 服务权限边界；
- Release Sandbox；
- 网络和凭据策略；
- Temporal Worker 隔离；
- Control Plane 权限校验。

### 4.4 动态 Agent Loop 不等于冻结计划

pi 主要服务动态 Tool Calling。当前平台的确定性多步骤执行仍坚持：

```text
先规划
  → 静态校验
  → 冻结
  → 按图执行
```

不因参考 pi 而引入运行时自由改写计划。

## 5. 本地设计采用的映射

| pi 概念 | 本项目映射 | 平台增强 |
|---|---|---|
| Tool parameters | Capability input Schema | Schema 引用、版本和摘要 |
| `beforeToolCall` | `beforeCapabilityCall` | 修改后重新校验 |
| Tool execute | Runtime Adapter | 权限、幂等和 Temporal |
| `afterToolCall` | `afterCapabilityCall` | output Schema 和 Artifact |
| Tool events | Execution node events | Plan Hash 和稳定错误码 |
| Release smoke | Capability release gates | Sandbox、组合、Replay 和验证凭证 |

