# 后端目录结构方案

## 目标

为当前 monorepo 定义一套清晰、可扩展、可长期演进的后端目录结构，重点把以下五类能力明确分层：

- 运行时
- 会话管理
- 核心领域能力
- 平台层
- AI 编排层

这份方案不是纯概念稿，而是基于当前仓库已有代码结构、服务模块和运行时残留文件核对后整理出的目标结构。

## 本次治理边界

本轮工作优先只做“项目架构和文件夹治理”，不做功能改造。

### 允许做的事情

- 调整顶层目录结构
- 迁移服务所在目录
- 统一命名
- 增加 README、迁移说明、边界说明文档
- 收口运行时文件目录
- 调整脚本、Docker 挂载、配置路径，但仅限于适配目录变化
- 增加架构校验规则、依赖边界规则

### 明确不做的事情

- 不改业务行为
- 不改接口语义
- 不新增功能
- 不重写领域逻辑
- 不改变数据库模型语义
- 不改变工作流执行逻辑
- 不在本轮引入新的产品能力

### 判断标准

如果一个改动不能被归类为“目录治理、命名治理、边界治理、运行时文件治理”，就不应放在本轮执行。

## 现状验证结论

本方案已经结合当前代码做过逐项核对，关键结论如下。

### 1. 当前后端已经初步分成三层，但分类标准混用

当前目录是：

```text
apps/backend/
  core/
  domain/
  runtime/
```

这个结构说明项目已经有分层意识，但问题在于：

- `core` 里同时放了平台能力、执行编排、AI 协调、会话管理
- `domain` 里是业务能力服务
- `runtime` 里是实际执行器

也就是说，现在同时混用了：

- 平台分层
- 业务分层
- 运行角色分层

这会导致后续新增服务时很难判断应该放到哪里。

### 2. `core/platform` 不是纯平台层，而是“平台 + 发布 + 工作流编排”混合体

当前 `apps/backend/core/platform/src/app.module.ts` 引入了这些模块：

- `auth`
- `user`
- `organization`
- `skill`
- `execution-flow`
- `temporal-workflow`
- `capability-release`

这说明它并不只是平台基础设施，而是混合了：

- 身份与组织管理
- 技能管理
- 执行流模板
- Temporal 工作流
- 能力发布

因此不适合整体平移成一个单独的 `platform` 服务，而应该按模块职责拆分后落位。

### 3. `core/control-plane` 更接近“接入层 + 执行编排层”

当前 `apps/backend/core/control-plane/src/app.module.ts` 引入了：

- `proxy`
- `audit`
- `execution`
- `notifications`
- `mcp`

这说明 `control-plane` 的职责更像：

- 外部接入与代理
- 审计
- 执行编排与状态推进
- MCP 接入
- 通知聚合

因此它更适合归入 `orchestration/control-plane`，而不是 `platform`。

### 4. `core/ai-orchestrator` 已经是明确的 AI 编排层雏形

当前 `apps/backend/core/ai-orchestrator/src/app.module.ts` 和模块目录包含：

- `model`
- `agent`
- `recognizer`
- `decider`
- `planner`
- `orchestration`
- `react-engine`
- `browser-phase-recovery`
- `chat`
- `browser-command`

这说明这个服务本身已经非常接近目标中的 AI 编排层，建议作为 `orchestration/ai-orchestrator` 的核心服务保留。

### 5. `core/session-broker` 已经具备独立会话层特征

当前 `apps/backend/core/session-broker/src/app.module.ts` 和模块目录包含：

- `session`
- `runtime-session`
- `allocation`
- `lock`
- `freeze`
- `execution`
- `template`

它承担的已经是执行会话、运行时会话、分配、冻结、锁控制等能力，适合单独提升为 `sessions/*` 层。

### 6. `runtime` 层整体判断基本成立

当前运行时服务职责比较清楚：

- `browser-worker`：浏览器执行、录制、健康检查、worker 控制
- `replay-engine`：CDP、执行器、重试、日志、接管
- `temporal-worker`：worker + sandbox
- `temporal-sandbox-agent`：沙箱代理脚本目录

因此运行层整体方向没有问题，只需要命名收敛和内部结构标准化。

### 7. 运行时文件已经侵入源码目录

当前已经存在下列运行时残留目录：

- `apps/backend/core/ai-orchestrator/.tmp`
- `apps/backend/core/ai-orchestrator/data`
- `apps/backend/domain/carbone-engine/outputs`
- `apps/backend/domain/carbone-engine/templates`
- `apps/backend/runtime/browser-worker/.playwright-cli`
- `apps/backend/runtime/browser-worker/temp`
- `apps/backend/runtime/temporal-sandbox-agent/__pycache__`

这证明“运行数据”和“源码目录”还没有隔离，后续必须统一收口到 `apps/backend/var/`。

## 设计原则

### 统一分类标准

后端目录只按“职责边界”分层，不再混用：

- 业务域
- 部署角色
- 历史命名

### 顶层分层必须固定

建议后端固定为以下七个顶层目录：

- `platform`
- `sessions`
- `domain`
- `orchestration`
- `runtime`
- `shared`
- `var`

### 运行数据必须出源码树

缓存、输出、模板、浏览器 profile、调试文件、上传文件、临时文件都不应继续散落在具体服务目录中。

### 新能力必须有唯一落点

- 新平台治理能力 -> `platform/*`
- 新会话生命周期能力 -> `sessions/*`
- 新业务能力 -> `domain/*`
- 新 AI / 工作流协调能力 -> `orchestration/*`
- 新执行器 / Worker -> `runtime/*`

## 推荐目标目录树

```text
apps/
  backend/
    README.md

    platform/
      identity-access/             # 认证、鉴权、用户、组织、租户
      policy-center/               # 权限、审批、策略、风控
      artifact-registry/           # 技能、模板、工作流、发布物注册与版本
      audit-observability/         # 审计、日志、指标、追踪
      gateway-admin/               # 管理端入口、平台控制 API
      config-center/               # 配置、开关、环境能力

    sessions/
      session-broker/              # 执行会话总入口
      runtime-session/             # 运行时会话状态
      session-allocation/          # worker/session 分配
      session-lock/                # 分布式锁、并发控制
      session-recovery/            # 恢复、冻结、补偿

    domain/
      browser-template/            # 浏览器模板领域
      document-engine/             # 文档渲染与模板引擎
      report/                      # 报告与产物生成
      skill/                       # 技能元数据、能力定义
      execution-model/             # 执行域模型、步骤、工件
      evaluation/                  # 评估、评分、对比
      memory/                      # 记忆、检索、历史索引

    orchestration/
      control-plane/               # 接入、执行路由、协调控制平面
      ai-orchestrator/             # LLM 编排、识别、决策、规划
      execution-flow/              # 执行流模板与编排
      workflow-orchestrator/       # Temporal 工作流编排
      release-orchestrator/        # 能力发布编排
      planner/                     # 独立规划能力

    runtime/
      browser-worker/              # 浏览器执行器
      replay-worker/               # 回放执行器
      temporal-worker/             # Temporal worker
      sandbox-agent/               # 沙箱代理
      tool-runner/                 # 通用工具执行器

    shared/
      contracts/                   # DTO、事件、服务协议
      kernel/                      # ID、错误模型、结果模型、基础抽象
      infra/                       # DB、MQ、缓存、存储适配
      observability/               # logger、trace、metrics
      testkit/                     # 测试基建

    var/
      cache/
      sessions/
      browser-profiles/
      uploads/
      outputs/
      templates/
      debug/
      tmp/
```

## 各层职责说明

### `platform`

平台层只承载全局平台能力，不直接承载具体执行编排。

典型职责：

- 认证、鉴权
- 用户、组织、租户
- 权限与策略
- 审计与观测
- 全局配置
- 技能 / 模板 / 工作流的注册与版本管理
- 平台管理接口

### `sessions`

会话层统一管理所有“执行会话”和“运行时会话”相关能力。

典型职责：

- 会话创建
- 会话续租和过期
- 会话冻结和恢复
- 会话锁
- Worker 分配
- 运行时会话状态
- 会话历史与查询

### `domain`

领域层只承载核心业务能力，不承载跨服务编排。

典型职责：

- 浏览器模板
- 文档引擎
- 报告生成
- 技能定义
- 执行域模型
- 评估
- 记忆模型

### `orchestration`

编排层负责跨领域协调、AI 决策、执行流推进、工作流编排。

典型职责：

- 执行计划
- LLM 路由
- Prompt 编排
- 决策与恢复
- 执行路由
- 控制平面
- Temporal 工作流协调
- 发布编排

### `runtime`

运行时层只负责“执行”，不负责高层策略和业务编排。

典型职责：

- 浏览器自动化
- 回放执行
- 沙箱执行
- Worker 任务消费
- 工具调用

### `shared`

只放后端内部受控复用内容，禁止做成“大杂烩公共目录”。

### `var`

统一承载所有运行时数据，不允许继续散落到各服务源码目录。

## 标准服务内部结构

### 业务服务 / API 服务模板

```text
<service>/
  package.json
  README.md
  src/
    application/        # 用例编排
    domain/             # 领域模型、规则
    infrastructure/     # 数据库/缓存/外部适配
    interfaces/         # controller/http/consumer
    contracts/          # DTO、事件、协议
    config/
    bootstrap/
  prisma/
  test/
    unit/
    integration/
  scripts/
```

### 运行时服务模板

```text
<runtime-service>/
  package.json
  README.md
  src/
    bootstrap/
    handlers/           # 任务入口
    runners/            # 实际执行逻辑
    adapters/           # 浏览器/工具/文件系统适配
    contracts/
    telemetry/
    config/
  test/
    unit/
    integration/
```

## 依赖规则

### 建议依赖方向

- `platform` -> `shared`
- `sessions` -> `platform`, `shared`
- `domain` -> `platform`, `shared`
- `orchestration` -> `platform`, `sessions`, `domain contracts`, `shared`
- `runtime` -> `orchestration contracts`, `domain contracts`, `shared`

### 明确禁止

- `platform` 不能依赖 `runtime`
- `platform` 不应直接依赖具体业务领域实现
- `domain` 不能依赖 `runtime`
- `runtime` 不能反向成为上层通用库
- 一个服务不能直接 import 另一个服务的私有 `src/**`

### 跨服务通信方式

跨服务交互只能通过以下边界之一：

- contracts
- events
- SDK
- HTTP / RPC client

不能直接耦合到对方内部实现。

## 基于当前代码的服务落位方案

### 现有服务整体映射

```text
apps/backend/core/control-plane
  -> apps/backend/orchestration/control-plane

apps/backend/core/ai-orchestrator
  -> apps/backend/orchestration/ai-orchestrator

apps/backend/core/session-broker
  -> apps/backend/sessions/session-broker

apps/backend/domain/browser-template
  -> apps/backend/domain/browser-template

apps/backend/domain/carbone-engine
  -> apps/backend/domain/document-engine

apps/backend/domain/report
  -> apps/backend/domain/report

apps/backend/runtime/browser-worker
  -> apps/backend/runtime/browser-worker

apps/backend/runtime/replay-engine
  -> apps/backend/runtime/replay-worker

apps/backend/runtime/temporal-worker
  -> apps/backend/runtime/temporal-worker

apps/backend/runtime/temporal-sandbox-agent
  -> apps/backend/runtime/sandbox-agent
```

### `core/platform` 不能整包平移，建议按模块拆分

当前 `core/platform` 更适合拆成下面几部分：

```text
apps/backend/core/platform/src/modules/auth
apps/backend/core/platform/src/modules/user
apps/backend/core/platform/src/modules/organization
  -> apps/backend/platform/identity-access

apps/backend/core/platform/src/modules/skill
  -> apps/backend/domain/skill
  或 -> apps/backend/platform/artifact-registry

apps/backend/core/platform/src/modules/execution-flow
  -> apps/backend/orchestration/execution-flow

apps/backend/core/platform/src/modules/temporal-workflow
  -> apps/backend/orchestration/workflow-orchestrator

apps/backend/core/platform/src/modules/capability-release
  -> apps/backend/orchestration/release-orchestrator
  + apps/backend/platform/artifact-registry
```

这比直接把 `core/platform` 改名成 `platform/*` 更符合当前代码真实职责。

## 仅移动文件夹、不改功能代码的具体方案

这一节定义的是“当前仓库应该怎么移动文件夹，但不改任何功能代码”的执行方式。

### 执行原则

- 保持所有服务 `package.json` 包名不变
- 保持服务内部 `src/` 代码不做功能性修改
- 只做目录迁移、命名调整、路径适配、文档补充、运行时文件归档
- 不改接口语义
- 不改数据库语义
- 不改业务逻辑

### 前置条件

在真正移动目录前，必须先确认以下前置条件已经满足。

当前 workspace 配置位于：

- [package.json](file:///Users/chain/Documents/MyProject/ops-automation/package.json)
- [pnpm-workspace.yaml](file:///Users/chain/Documents/MyProject/ops-automation/pnpm-workspace.yaml)

由于目标目录会变成类似 `apps/backend/orchestration/control-plane` 的三级路径，因此必须先扩展 workspace 匹配规则，确保新目录仍能被 pnpm 正确识别。

### 已验证的前置条件（基于代码实际核查）

经过对当前代码和配置的逐项核查，以下五项前置条件**尚未满足**，在修正完成前不建议进行物理目录迁移。

#### 前置条件 1：pnpm workspace 路径扩展

**问题**：当前 [package.json](file:///Users/chain/Documents/MyProject/ops-automation/package.json) 和 [pnpm-workspace.yaml](file:///Users/chain/Documents/MyProject/ops-automation/pnpm-workspace.yaml) 的 workspace 配置都只匹配两级路径：

```yaml
packages:
  - 'apps/*'
  - 'apps/*/*'   # 最多识别 apps/backend/core 这一层
  - 'tests/*'
  - 'packages/*'
```

目标路径如 `apps/backend/orchestration/control-plane` 属于三级路径，当前 glob 无法匹配，迁移后 pnpm 将无法识别这些包，所有 workspace 依赖引用会断裂。

**修复方案**：在 `package.json` 和 `pnpm-workspace.yaml` 中同时追加三级匹配：

```yaml
packages:
  - 'apps/*'
  - 'apps/*/*'
  - 'apps/*/*/*'   # 新增，覆盖三级路径
  - 'tests/*'
  - 'packages/*'
```

修复后执行 `pnpm install` 验证新路径可被正确识别。

---

#### 前置条件 2：Docker Compose volume 挂载路径

**问题**：以下 5 个 Compose 文件硬编码了旧的服务目录路径，迁移后容器将无法找到挂载目录，直接导致服务启动失败：

| 文件 | 引用的旧路径 |
|---|---|
| [docker-compose.base.yml](file:///Users/chain/Documents/MyProject/ops-automation/docker/compose/docker-compose.base.yml) | `core/platform`、`core/session-broker`、`core/control-plane`、`core/ai-orchestrator` |
| [docker-compose.full.yml](file:///Users/chain/Documents/MyProject/ops-automation/docker/compose/docker-compose.full.yml) | 同上，另含 `domain/carbone-engine`、`runtime/temporal-sandbox-agent` |
| [docker-compose.core.yml](file:///Users/chain/Documents/MyProject/ops-automation/docker/compose/docker-compose.core.yml) | `core/platform`、`core/control-plane`、`core/session-broker` |
| [docker-compose.carbone.yml](file:///Users/chain/Documents/MyProject/ops-automation/docker/compose/docker-compose.carbone.yml) | `domain/carbone-engine` |
| [docker-compose.runtime.yml](file:///Users/chain/Documents/MyProject/ops-automation/docker/compose/docker-compose.runtime.yml) | `runtime/browser-worker`、`domain/carbone-engine`、`runtime/temporal-sandbox-agent` |

**修复方案**：每次迁移一个服务时，同步更新对应 Compose 文件中的 volume 挂载路径，迁移完成后立即通过 `./docker/start-smart.sh` 验证服务能否正常启动。

---

#### 前置条件 3：`start-dev.sh` 脚本路径映射

**问题**：[docker/scripts/start-dev.sh](file:///Users/chain/Documents/MyProject/ops-automation/docker/scripts/start-dev.sh) 在以下位置硬编码了旧目录：

- 第 66–71 行：case 语句中的服务名到路径映射（`core/ai-orchestrator`、`core/platform`、`core/session-broker`、`core/control-plane`）
- 第 184–186 行：Prisma migrate 路径（`apps/backend/core/platform`）

迁移后开发者通过 `start-dev.sh` 启动单服务会找不到目录。

**修复方案**：每迁移一个服务，同步更新 case 语句中对应行的路径，并在完成后验证 `./start-dev.sh <service>` 可正常调起服务。

---

#### 前置条件 4：`temporal/Dockerfile` 的 COPY 路径

**问题**：[docker/temporal/Dockerfile](file:///Users/chain/Documents/MyProject/ops-automation/docker/temporal/Dockerfile) 硬编码了：

```dockerfile
COPY apps/backend/runtime/temporal-sandbox-agent/requirements.txt /app/requirements.txt
COPY apps/backend/runtime/temporal-sandbox-agent/*.py /app/
```

若 `temporal-sandbox-agent` 按计划重命名为 `sandbox-agent`，镜像构建会直接失败。

**修复方案**：在执行 `temporal-sandbox-agent -> sandbox-agent` 重命名时，同步更新 Dockerfile 中的两处 COPY 路径，并验证 `docker build` 能正常完成。

---

#### 前置条件 5：CI 脚本路径（已核实存在问题）

**问题**：[.github/workflows/e2e-test.yml](file:///Users/chain/Documents/MyProject/ops-automation/.github/workflows/e2e-test.yml) 引用了以下路径：

- `apps/backend/core/auth`（当前代码中不存在此独立目录，auth 模块已并入 `core/platform`）
- `apps/backend/core/session-broker`
- `apps/backend/domain/template`（当前代码中不存在此目录）
- `apps/backend/core/ai-orchestrator`
- `apps/backend/runtime/replay-engine`

其中 `core/auth` 和 `domain/template` 在当前仓库中**不存在独立目录**，说明 CI 脚本基于历史目录结构编写，与当前实际代码已经不符。

**修复方案**：

1. 将 `core/auth` 路径改为当前真实承载位置 `core/platform`
2. 将 `domain/template` 路径改为当前真实目录 `domain/browser-template`
3. 结合实际服务入口修正其他旧路径
4. 确认 CI 脚本在修正后可正常运行

---

### 整体风险评级

| 前置条件 | 严重度 | 不修复的后果 |
|---|---|---|
| pnpm workspace glob | 高 | 所有迁移后的包失效，workspace 依赖断裂 |
| Docker Compose volume 路径 | 高 | 容器启动直接失败 |
| `start-dev.sh` 路径 | 中 | 开发启动工具失效 |
| `Dockerfile` COPY 路径 | 中 | 镜像构建失败（重命名时触发）|
| CI 脚本路径 | 中 | CI 流水线失效，且当前已确认存在失效路径 |

**当前结论**：当前指南和代码方向基本一致，但执行条件还没有完全对齐。在上述五项前置条件全部修正之前，不建议进行任何物理目录迁移。

### 目标顶层目录

```text
apps/backend/
  platform/
  sessions/
  domain/
  orchestration/
  runtime/
  shared/
  var/
```

### 第一批迁移候选服务

这一批服务从职责边界看适合进入目标目录，但当前仍应视为“迁移候选”，而不是“可立即执行迁移”。

```text
apps/backend/core/control-plane
  -> apps/backend/orchestration/control-plane

apps/backend/core/ai-orchestrator
  -> apps/backend/orchestration/ai-orchestrator

apps/backend/core/session-broker
  -> apps/backend/sessions/session-broker

apps/backend/domain/browser-template
  -> apps/backend/domain/browser-template

apps/backend/domain/carbone-engine
  -> apps/backend/domain/document-engine

apps/backend/domain/report
  -> apps/backend/domain/report

apps/backend/runtime/browser-worker
  -> apps/backend/runtime/browser-worker

apps/backend/runtime/replay-engine
  -> apps/backend/runtime/replay-worker

apps/backend/runtime/temporal-worker
  -> apps/backend/runtime/temporal-worker

apps/backend/runtime/temporal-sandbox-agent
  -> apps/backend/runtime/sandbox-agent
```

说明：

- `browser-template`、`report`、`browser-worker`、`temporal-worker` 虽然目标路径与原层级部分一致，但建议仍按目标结构统一整理父目录
- `carbone-engine` 建议只做目录重命名为 `document-engine`，不在本轮修改其内部实现
- `replay-engine` 建议只做目录重命名为 `replay-worker`
- 上述目录在真正迁移前，必须先完成 workspace、Docker、脚本、构建路径的同步适配

### 第二批暂不整体迁移的目录

下面这个目录本轮不建议整体搬迁：

```text
apps/backend/core/platform
```

原因：

- 当前它不是纯平台服务
- 内部同时混有身份、组织、技能、执行流、Temporal 工作流、能力发布
- 如果粗暴改名，会把编排能力错误归类到平台层

因此本轮建议：

- 先保留 `apps/backend/core/platform`
- 只在目标目录里预创建未来落点
- 在文档中明确模块归属
- 不在本轮拆它的内部实现

### `core/platform` 的保守治理方案

本轮只建立目标目录，不搬实现代码：

```text
apps/backend/platform/
  identity-access/
  artifact-registry/

apps/backend/orchestration/
  execution-flow/
  workflow-orchestrator/
  release-orchestrator/
```

对应关系如下：

```text
apps/backend/core/platform/src/modules/auth
apps/backend/core/platform/src/modules/user
apps/backend/core/platform/src/modules/organization
  -> apps/backend/platform/identity-access

apps/backend/core/platform/src/modules/skill
  -> apps/backend/domain/skill
  或 -> apps/backend/platform/artifact-registry

apps/backend/core/platform/src/modules/execution-flow
  -> apps/backend/orchestration/execution-flow

apps/backend/core/platform/src/modules/temporal-workflow
  -> apps/backend/orchestration/workflow-orchestrator

apps/backend/core/platform/src/modules/capability-release
  -> apps/backend/orchestration/release-orchestrator
  + apps/backend/platform/artifact-registry
```

### 运行时文件归档方案

本轮允许迁移运行时文件，但不改变业务逻辑。

建议新增统一目录：

```text
apps/backend/var/
  cache/
  sessions/
  browser-profiles/
  outputs/
  templates/
  debug/
  tmp/
```

当前目录从归档方向看是合理候选，但是否立即迁移也取决于运行时环境变量、挂载路径和服务配置是否已同步调整。

当前归档候选如下：

```text
apps/backend/core/ai-orchestrator/.tmp
  -> apps/backend/var/tmp/ai-orchestrator

apps/backend/core/ai-orchestrator/data
  -> apps/backend/var/cache/ai-orchestrator

apps/backend/domain/carbone-engine/outputs
  -> apps/backend/var/outputs/document-engine

apps/backend/domain/carbone-engine/templates
  -> apps/backend/var/templates/document-engine

apps/backend/runtime/browser-worker/.playwright-cli
  -> apps/backend/var/browser-profiles/playwright-cli

apps/backend/runtime/browser-worker/temp
  -> apps/backend/var/tmp/browser-worker

apps/backend/runtime/temporal-sandbox-agent/__pycache__
  -> 清理并加入忽略规则
```

### 迁移前必须先修正的配置项

下面这些项目已经确认依赖旧路径；如果不先修正，目录迁移就会直接产生启动或构建风险：

- workspace 路径
- Docker volume 挂载路径
- 服务脚本中的相对路径
- Dockerfile 中的 COPY 路径
- CI 脚本中的旧目录路径
- 文档中的旧路径引用
- `.gitignore` 中与运行时目录相关的规则

这些调整只属于“路径适配”，不属于功能改造，但必须先于物理迁移完成。

### 当前更稳妥的执行顺序

```text
1. 修改 workspace 配置
2. 修正 Docker、Dockerfile、脚本、CI 的旧路径
3. 建立目标目录与 README，但先不搬代码
4. 用文档确认服务落位与迁移映射
5. 选一个低风险服务做试点迁移验证
6. 通过启动、构建、Compose 挂载验证后，再批量迁移
7. 最后处理 core/platform 的拆分准备
```

### 本轮不要做的事情

- 不拆 `core/platform` 内部实现
- 不把 `modules/*` 改造成 `application/domain/infrastructure/interfaces`
- 不改 DTO
- 不改接口
- 不改 Prisma schema
- 不改工作流逻辑
- 不改跨服务调用协议

### 本轮一句话策略

当前最稳妥的做法是：

> 先修正所有依赖旧路径的配置，再决定是否进行物理目录迁移；在验证通过前，不把任何服务视为“零风险可直接搬迁”。

## 当前结构的核心问题

### 1. `core` 桶过大

现在 `core` 这个名字同时承载了：

- 平台基础能力
- 会话管理
- 控制平面
- AI 编排

这个桶已经失去约束力，继续往里放功能会越来越乱。

### 2. 平台层与编排层边界不清

当前 `platform` 里已经有：

- execution flow
- temporal workflow
- capability release

这些更像编排层，而不是纯平台底座。

### 3. 会话层仍然混有执行细节

`session-broker` 当前包含 `execution` 和 `template` 相关模块，并通过 URL 调用浏览器 worker 和模板服务。目标态应该逐步把“会话管理”和“执行调用”解耦。

### 4. 运行数据污染源码目录

当前已出现 `.tmp`、`temp`、`outputs`、`templates`、`.playwright-cli`、`__pycache__` 等目录，必须统一迁移。

### 5. 服务内部结构仍偏模块拼装式

当前大量服务内部仍以 `modules/* + dto + interfaces + prisma` 组织，尚未系统拆成：

- application
- domain
- infrastructure
- interfaces

这会让服务内部职责继续膨胀。

## 分阶段迁移建议

迁移顺序必须遵守“先结构，后内部；先目录，后逻辑”的原则。

### 阶段 0：冻结功能范围

- 本阶段只允许做目录、命名、边界、挂载路径治理
- 禁止顺手修改业务逻辑
- 禁止顺手修功能缺陷，除非目录迁移导致服务无法启动
- 若发现功能问题，单独登记，不并入本轮目录治理

### 第一阶段：锁定顶层目录

- 先建立 `platform / sessions / domain / orchestration / runtime / shared / var`
- 给每层补 README
- 不急着改业务逻辑

### 第二阶段：先迁运行数据

- 把 `.tmp`、`temp`、`outputs`、`templates`、`browser profile`、`debug` 文件统一迁到 `apps/backend/var/`
- 同步修正 Docker volume、环境变量、脚本路径

### 第三阶段：按服务搬迁

- `control-plane` -> `orchestration/control-plane`
- `ai-orchestrator` -> `orchestration/ai-orchestrator`
- `session-broker` -> `sessions/session-broker`
- `browser-template` / `carbone-engine` / `report` 留在 `domain`
- `browser-worker` / `replay-engine` / `temporal-worker` 归到 `runtime`

### 第四阶段：拆 `core/platform`

先拆分模块职责，再决定是否拆成多个服务；不要把整个 `core/platform` 粗暴重命名。

这一阶段也优先只做目录和模块归属调整，不重写能力实现。

### 第五阶段：统一服务内部结构

- 逐步从 `modules/*` 迁到 `application / domain / infrastructure / interfaces`
- 拆掉过大的 service/controller 文件
- 用 contracts / SDK 代替跨服务内部引用

### 第六阶段：加边界约束

- 增加依赖边界校验
- 禁止跨服务私有实现引用
- 明确每层允许依赖的上游和下游

## 本轮推荐执行清单

如果本轮严格只做架构和文件夹治理，建议只执行下面这些动作：

### 必做

- 建立目标顶层目录
- 将现有服务迁移到目标层级目录
- 为每层补充职责 README
- 统一 `runtime`、`session`、`orchestration` 等命名
- 收口 `temp`、`.tmp`、`outputs`、`templates`、`browser-profiles` 到 `apps/backend/var/`
- 调整 Docker volume、脚本路径、环境变量路径

### 可做

- 补依赖边界检查
- 为服务补迁移映射文档
- 补目录级 AGENTS/README 说明

### 本轮不要做

- 服务内部 `modules/*` 到 `application/domain/infrastructure/interfaces` 的大拆分
- 领域对象重构
- 接口合并或拆分
- 数据库表结构调整
- 工作流逻辑改造
- 跨服务调用协议升级

## 最小可落地版本

如果当前不适合一次性大改，建议先落这版最小目录：

```text
apps/backend/
  platform/
  sessions/
  domain/
  orchestration/
  runtime/
  shared/
  var/
```

然后先完成：

- 现有服务迁移到七个顶层目录
- 运行数据迁到 `var`
- `core/platform` 按模块拆分计划落文档

这三步完成后，再做服务内部细化重构。

## 命名建议

- 用职责命名，不用历史名词命名
- 统一使用 `*-worker`、`*-broker`、`*-orchestrator`、`*-engine`、`*-registry`
- 避免继续使用 `core`、`misc`、`common-services` 这类大桶名称
- 同一层不要同时混放“业务域名”和“运行角色名”

## 最终建议

建议把后端长期基线确定为：

- `platform`：平台治理与基础能力
- `sessions`：会话生命周期管理
- `domain`：核心领域能力
- `orchestration`：控制平面、AI 编排、工作流编排
- `runtime`：实际执行器与 worker
- `shared`：受控共享能力
- `var`：所有运行时数据

基于当前代码看，这个方向是可落地的，但要特别注意两点：

- 不要把 `core/platform` 整体当成纯平台服务迁移
- 必须优先清理运行时文件与源码目录混放的问题

只要先把这两个问题处理掉，后续扩展“运行时、会话管理、核心领域能力、平台层、AI 编排层”会明显清晰很多。

如果只做本轮治理，建议目标收敛为一句话：

> 只动目录、命名、边界和运行时文件归档，不动功能实现。
