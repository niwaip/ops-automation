# 跨端共享契约与核心协议包 (Shared Contracts & SDKs)

本目录为 Ops Automation 仓库的**跨服务共享契约、南向能力开发 SDK 与多端体验核心状态机**收敛中心。

> [!NOTE]
> 遵循 [`docs/standards/REPOSITORY_STRUCTURE_STANDARD.md`](../docs/standards/REPOSITORY_STRUCTURE_STANDARD.md)：
> - `packages/` 仅承载**稳定契约、无副作用的领域模型、多端共享核心与 SDK**；
> - 严禁在 `packages/` 中引入具体数据库持久化实现、直接 HTTP 服务侦听或外部重型依赖。

---

## 一、目录结构与包职责矩阵

```text
packages/
├── backend-contracts/                  # 后端跨平面与微服务 RPC/通信协议契约 (14 个独立发布包)
│   ├── agent-execution-protocol        # 智能体执行与状态协议
│   ├── agent-profile                   # 智能体画像与配置元数据契约
│   ├── ai-chat-protocol                # AI 对话、流式交互与 Session Patch 契约
│   ├── browser-execution-contract      # 浏览器执行器指令与运行时协议
│   ├── builtin-skill-contract          # 内置技能元数据、版本与沙箱安全契约
│   ├── common-dto                      # 分页、排序、统一返回响应与通用工具 DTO
│   ├── deterministic-plan              # 确定性调度计划与执行 DAG 图模型
│   ├── error-codes                     # 全局结构化错误码与分类
│   ├── execution-core                  # 执行核心实体、状态机常量与上下文
│   ├── execution-events                # Outbox 领域事件与审计载荷契约
│   ├── planning-decision               # 规划决策、意图识别与参数推断模型
│   ├── release-manifest                # 技能/工作流发布清单不可变规范
│   ├── result-ref                      # 大体积结果引用与外部存储句柄协议
│   └── runtime-capability-contract     # 南向 Capability 能力声明与执行契约
├── capability-sdk/                     # 南向能力域开发 SDK
│   ├── manifest.ts                     # 能力清单声明与 JSON Schema 校验器 (Ajv)
│   ├── routing-card.ts                 # 能力卡片元数据与权限要求定义
│   ├── runtime-adapter.ts              # 业务系统与第三方集成适配器基类
│   └── test-kit.ts                     # 能力单测与契约一致性测试工具集
└── user-core/                          # 多端用户体验共享核心 (@ops/user-core)
    ├── src/auth/                       # 跨端登录鉴权、Token 刷新与 Session 管理
    ├── src/chat/                       # 会话消息流管理与乐观更新状态机
    ├── src/storage/                    # 跨端抽象本地存储适配器 (Web / Electron / React Native)
    └── src/device/                     # 设备特征与通知通道桥接
```

---

## 二、架构治理与依赖约束

1. **统一 Workspace 协议**：
   - 依赖本目录包的微服务或客户端，在 `package.json` 中必须使用严格的 `workspace:*` 依赖。
2. **严格单向依赖与无环校验**：
   - `backend-contracts/*` 处于 Monorepo 依赖图的叶子层，严禁反向依赖任何 `apps/backend/*` 服务；
   - 每次提交均通过 `pnpm run check:architecture` 自动校验依赖拓扑无环。
3. **零业务持久化**：
   - 契约包仅定义 TypeScript 类型、Zod/Ajv Schema、错误码枚举与轻量序列化工具，不包含 Prisma Client 或数据库连接池。

---

## 三、常用命令

```bash
# 校验 user-core 构建与边界规范
pnpm run validate:user-core

# 编译能力 SDK
pnpm --filter @ops/capability-sdk run build

# 运行能力 SDK 规范单元测试
pnpm --filter @ops/capability-sdk run test
```
