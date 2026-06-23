# 企业级技能平台 项目架构与目录结构重塑设计书 (v4.0)

本设计书基于企业级技能平台的最新业务定位——以**工作单元**、**工作流**、**发布（Release）**和**技能（Skill）**为核心流程，用户端通过**AI自然语言意图识别**、**自动选择Skill并生成参数**自动执行，内部内置**浏览器模板录制**和**文档模板**两大核心能力。

为了支持未来更多专业化 AI Agent（如：**代码生成智能体**、**直驱式自然语言浏览器智能体**等）的接入，设计方案在保持核心控制面稳定的前提下，将 AI 智能体层（Intelligence Plane）升级为**插拔式多智能体矩阵**结构。

---

## 一、 现状全局分析：物理结构与业务本质的“错位”

在当前的微服务/目录组织中，系统按照传统的技术分层（`core/`, `orchestration/`, `domain/`, `runtime/`, `sessions/`）进行物理划分。这导致了以下几个核心冲突，妨碍了后续的敏捷开发与扩展：

### 1. 核心概念散居 (Fragmented Domain Concepts)
- **技能（Skill）**：
  - 定义在 `core/platform`（作为数据库模型 `SkillConfig`）。
  - 解析与匹配在 `ai-orchestrator`（作为 Planner 的一部分）。
  - 前端实现在 `apps/frontend/portal/src/features/skills`。
  - 缺乏统一的“技能域”物理边界，每次修改 Skill 属性或规则，开发者需要在相隔很远的几个服务中同步修改。
- **工作流与工作单元（Workflow & Work Unit）**：
  - 静态定义（ExecutionFlowTemplate / TemporalWorkflow）在 `core/platform` 中。
  - 动态调度与执行状态在 `control-plane` 中。
  - 物理执行在 `runtime/temporal-worker` 中。
  - 这导致“设计时定义”与“运行时调度”混合在一起，概念链条不够明晰。

### 2. 发布（Release）概念被降级和湮没
- **发布（Capability Release）**是连接“设计时（草稿、模板）”与“运行时（可执行、受控发布）”的唯一门禁和生命周期枢纽。
- 当前它仅仅是 `apps/backend/core/platform/src/modules/capability-release` 下的一个普通子模块，与身份认证、组织架构等通用的 IAM 逻辑平铺在同一个服务里，其作为平台核心资产管理者的地位没有得到物理体现。

### 3. 浏览器录制模板与文档模板被混淆为普通“领域工具”
- **浏览器执行模板录制**（Browser Record/Replay）与**文档模板**（Document/Carbone Engine）是平台内置的两个**杀手级通用能力（Capabilities）**。
- 当前它们被平铺放在 `apps/backend/domain/` 目录下（`browser-template`、`document-engine`、`report`），没有将其作为独立的“能力域”进行端到端隔离。这导致它们的设计时资产（模板录制、标注）与运行时引擎（worker、carbone）物理距离过远。

### 4. AI 意图识别与执行层高度耦合
- `ai-orchestrator` 既负责自然语言的意图解析（意图识别、参数识别、生成计划），又包含了浏览器具体的执行控制（`RecorderDebugService` 1100+行代码，包含了各种复杂的录制和调试状态管理）。
- AI Planner 应该是**通用且域无关（Domain-Agnostic）**的，它只负责理解 NL 意图并翻译为通用的 Execution Plan，具体的录制控制和执行状态，应当下沉到浏览器能力域中。

---

## 二、 设计原则：北向统一，南向插拔，多智能体矩阵化

重塑项目结构时，应遵循以下核心演进心智：

1. **以业务链条为主线命名物理目录**：让新加入的开发者一眼能看出系统的运行流程。
2. **将“设计时（Design-time）”与“运行时（Run-time）”分离**：
   - 设计时专注于资产管理（Skills、Workflows、Templates 注册与定义）。
   - 运行时专注于执行、调度与状态跟踪（Execution、Step Runner、Session Broker）。
   - 发布层（Release）作为二者之间的网关。
3. **能力域与 AI 智能体南向插拔化（Agent-as-a-Service）**：
   - **多 Agent 矩阵**：未来不仅有主规划智能体，还会有生成代码、操作浏览器等专项智能体。它们应以**注册机制**或**标准微服务**接入，而非直接耦合在 Planner 服务中。
   - 核心控制面（`control-plane`）只负责任务状态推进、审批和接管，不干涉智能体内部的决策逻辑。
4. **推广“浏览器 intent/ index.ts 网关模式”**：
   - 每个子域和模块必须通过统一的 `index.ts`（外观层/网关）对外暴露，且单个文件的业务逻辑控制在 800 行以内，杜绝巨无霸服务。

---

## 三、 重塑后的项目设计（目录与文件构成）

基于上述原则，我们将 `apps/backend/` 的微服务及模块重组为 **5 大逻辑平面**：

### 1. 新的 `apps/backend/` 整体分层树状图

```text
apps/backend/
├── 1.intelligence/            # 智能意图与规划平面 (NL -> Plan / Multi-Agent)
│   ├── master-planner/        # 主规划大脑（LLM 语义路由与参数收集）
│   ├── code-generator-agent/  # 代码生成专项智能体（AI 生成 Python/JS 逻辑）
│   └── browser-nl-agent/      # 直驱式自然语言浏览器智能体（NL 直接驱动网页操作）
│
├── 2.registry-release/        # 注册与发布平面 (Design-time Catalog)
│   ├── skill-registry/        # 技能与流程模版注册中心
│   └── release-manager/       # 发布生命周期与合规校验中心
│
├── 3.execution-control/       # 执行与状态平面 (Run-time Orchestrator)
│   ├── control-plane/         # 执行主控制面（统一南向契约）
│   └── session-broker/        # 运行时执行资源与会话调度
│
├── 4.capabilities/            # 内置业务能力域平面 (Capability Domains)
│   ├── browser-domain/        # 浏览器能力子域（录制控制、语义规则、步骤模版）
│   └── document-domain/       # 文档能力子域（Carbone渲染、数据填充、报表生成）
│
└── 5.runtimes/                # 物理执行平面 (Worker Runtimes)
    ├── browser-worker/        # Playwright Headless 浏览器物理容器
    ├── replay-worker/         # CDP 专属网页回放 Worker
    ├── temporal-worker/       # TypeScript 工作流 Activity Worker
    └── sandbox-agent/         # Python 沙箱脚本执行器（由代码生成 Agent 驱动）
```

---

### 2. 各平面详细文件夹与关键文件设计

#### 1. Intelligence 平面：主 Planner 与专项智能体矩阵
专项智能体被剥离为高内聚子服务，各自通过标准的接口向控制面汇报。

##### `apps/backend/1.intelligence/master-planner/src/` (主控智能体)
```text
src/
├── app.module.ts
├── modules/
│   ├── intent/                   # 意图路由
│   │   ├── intent.service.ts     # 解析用户 NL 意图，选择匹配的 Skill 或委派给专项 Agent
│   │   └── index.ts
│   ├── planner/                  # 规划大脑
│   │   ├── plan-generator.ts     # 生成通用任务步骤链 (ExecutionPlan)
│   │   └── index.ts
│   └── params/                   # 参数识别
│       ├── param-recognizer.ts   # 收集和清洗自然语言中的参数
│       └── index.ts
```

##### `apps/backend/1.intelligence/code-generator-agent/src/` (代码生成智能体)
```text
src/
├── app.module.ts
├── modules/
│   ├── generator/                # 代码生成核心
│   │   ├── code-writer.service.ts    # 基于任务提示词生成 Python/JS 源码
│   │   ├── dependency-resolver.ts    # 识别代码所需依赖包
│   │   └── index.ts
│   └── verification/             # 代码静态与预执行校验
│       ├── security-lint.ts          # 校验高危系统调用（如 rm, exec 等）
│       └── test-runner.ts            # 在 Sandbox 进行隔离干跑测试
```

##### `apps/backend/1.intelligence/browser-nl-agent/src/` (直驱式网页动作智能体)
```text
src/
├── app.module.ts
├── modules/
│   ├── perception/               # 网页感知模块
│   │   ├── dom-parser.ts             # 提取网页可交互元素 DOM 树
│   │   ├── screen-analyzer.ts        # 分析网页快照（VLM 视觉解析）
│   │   └── index.ts
│   └── action-loop/              # 动作决策循环
│       ├── reasoning-loop.service.ts # ReAct 循环：观察页面 -> 决策下一步 NL 操作 -> 调用 worker
│       └── action-translator.ts      # 将 NL 动作（如“点击搜索按钮”）翻译为 Playwright 指令
```

#### 2. Registry & Release 平面：资产定义与发布流水线
新增对**智能体角色（Agent Profiles）**和**安全暴露范围**的管理。

##### `apps/backend/2.registry-release/skill-registry/src/` (资产注册)
```text
src/
├── modules/
│   ├── skill/                    # Skill 定义管理
│   │   ├── skill-config.service.ts
│   │   └── index.ts
│   ├── workflow/                 # 工作流模板定义管理
│   │   ├── flow-template.service.ts # 静态 DSL 工作流
│   │   └── index.ts
│   └── agent-catalog/            # 【新增】智能体目录管理
│       ├── agent-profile.service.ts  # 管理 AI Agent (如 CodeGen, BrowserNL) 的能力画像与授权
│       └── index.ts
```

##### `apps/backend/2.registry-release/release-manager/src/` (发布控制)
```text
src/
├── modules/
│   ├── compiler/                 # 静态编译与绑定器
│   │   └── skill-compiler.service.ts # 支持将 Skill 直接编译绑定到特定的专项 Agent
│   └── validator/                # 安全与合规静态校验
```

#### 3. Execution & Control 平面：统一调度与生命周期
控制面通过通用接口支持各种执行形式，无论是静态 Workflow 还是自主运行的专项 Agent。

##### `apps/backend/3.execution-control/control-plane/src/` (任务执行与干预)
```text
src/
├── modules/
│   ├── execution/
│   │   ├── lifecycle/            # 执行实例生命周期
│   │   │   └── execution-lifecycle.service.ts
│   │   ├── step-runner/          # 步骤调度引擎
│   │   │   ├── flow-runner.service.ts
│   │   │   ├── step-executor.service.ts
│   │   │   └── state-machine.service.ts
│   │   ├── takeover/             # 人工干预与接管控制
│   │   │   ├── takeover.service.ts
│   │   │   └── approval.service.ts
│   │   ├── adapters/             # 南向运行时适配器
│   │   │   ├── browser-runtime.adapter.ts # 包含模板执行与直驱 Agent 调度适配
│   │   │   ├── document-runtime.adapter.ts
│   │   │   ├── workflow-runtime.adapter.ts
│   │   │   └── sandbox-runtime.adapter.ts # 对接 Sandbox-agent 执行生成的代码
│   │   │
│   │   ├── execution.controller.ts
│   │   ├── execution.service.ts  # 唯一公开入口网关
│   │   └── index.ts
```

##### `apps/backend/3.execution-control/session-broker/src/` (资源会话分配)

#### 4. Capabilities 平面：内置专属业务能力域
保留设计时管理，将运行时交给底层 Worker。

##### `apps/backend/4.capabilities/browser-domain/src/` (浏览器能力域)
```text
src/
├── modules/
│   ├── templates/                # 浏览器自动化步骤模板 (设计时)
│   ├── semantics/                # 浏览器语义规则匹配引擎
│   └── recorder/                 # 浏览器录制 Facade
│       ├── recorder-debug.service.ts
│       ├── recorder-debug-session.ts
│       └── recorder-export.service.ts
```

##### `apps/backend/4.capabilities/document-domain/src/` (文档与报表域)

#### 5. Runtimes 平面：南向执行 Worker
Worker 仅暴露无状态原子执行接口：
- **`browser-worker`**：提供标准的 Playwright 执行，并新增**“流式感知通道”**：实时向 `browser-nl-agent` 输出 DOM 树和网页截图。
- **`sandbox-agent`**：提供无状态代码执行隔离沙箱，接收 `code-generator-agent` 编译生成的 Python 临时包。

---

## 四、 扩展性设计对比与演进优势

针对新增的 AI 智能体诉求，重塑后的多智能体架构对比传统技术分层具有决定性的优势：

| 场景 | 当前技术分层架构下的修改痛点 | 重塑后领域平面架构下的操作路径 |
| :--- | :--- | :--- |
| **新增“代码生成智能体”（Code Agent）** | 1. 必须在 `ai-orchestrator` 中硬编码 LLM 生成代码的 Prompt 逻辑；<br>2. 必须修改控制面 `control-plane` 来支持执行动态代码的特殊 Step 类型；<br>3. 代码生成的沙箱安全校验与普通的业务逻辑混在一起。<br>（**痛点：安全边界混乱，主 Planner 臃肿**） | 1. 在 `1.intelligence/` 新增 `code-generator-agent` 服务，将 Prompt、安全 lint、测试干跑逻辑完全内聚；<br>2. 智能体生成代码后，编译为标准化 Work Unit 发送给 `control-plane`；<br>3. `control-plane` 通过 `sandbox-runtime.adapter` 直接调度 `sandbox-agent` 执行。<br>（**优势：原控制面逻辑零改动，代码安全沙箱独立隔离**） |
| **新增“自然语言浏览器动作智能体”（Browser Agent）** | 1. 主意图匹配服务需要适配“用户说的每一句话”；<br>2. 需要在控制面维护高频多轮的“感知-动作”决策循环；<br>3. 破坏了控制面“单步执行”的顺序心智。<br>（**痛点：控制面因智能体高频决策而崩溃**） | 1. 用户提出意图后，`master-planner` 识别出需要“网页自主探索”并委派给 `browser-nl-agent`；<br>2. `browser-nl-agent` 作为特定 Step 的 Executor 挂载到执行生命周期中；<br>3. 在该 Step 运行期间，智能体在自己的服务内部独立做高频 ReAct 观察与决策，仅通过 `browser-worker` 发起物理动作，控制面只负责最终的 Step 成功/失败状态接收。<br>（**优势：高频交互控制下沉，主控制面依然轻量、稳定**） |

---

## 五、 实施迁移路线规划

对于正在稳定运行的系统，重塑目录结构应采取**“逻辑契约先行，目录渐进移动，测试保障收敛”**的策略，分三步走：

### 第一步：网关冻结与 Agent 适配契约设计
1. 先把 `ai-orchestrator` 中的浏览器执行逻辑封装到 `browser` 模块，对外仅暴露 `index.ts`。
2. 设计标准的 **`Agent Execution Protocol`**（智能体执行协议），规定任何自主 Agent 在接入 `control-plane` 时，其对外的状态输出、交互断点（takeover）和数据产出格式必须与通用 ExecutionStep 对齐。

### 第二步：物理分拆与归类 (Physical Regrouping)
1. 在项目根目录创建 `1.intelligence/`, `2.registry-release/`, `3.execution-control/`, `4.capabilities/`, `5.runtimes/` 五大平面分组文件夹。
2. 将原有的后端微服务物理移动到对应的平面文件夹中。
3. 修改根目录的 `pnpm-workspace.yaml` 以更新 monorepo 寻址路径：
   ```yaml
   packages:
     - 'apps/backend/1.intelligence/*'
     - 'apps/backend/2.registry-release/*'
     - 'apps/backend/3.execution-control/*'
     - 'apps/backend/4.capabilities/*'
     - 'apps/backend/5.runtimes/*'
     - 'apps/frontend/*'
     - 'packages/*'
   ```
4. 修正全局 `docker/start-smart.sh` 的 `PROJECT_ROOT` 指向。

### 第三步：契约级解耦与专项 Agent 独立部署
1. 为 `runtimes/` 下的所有 worker 实现统一的 `Runtime Capability Contract`。
2. 将 `code-generator-agent` 和 `browser-nl-agent` 作为独立微服务部署，在开发中彻底摆脱对 `control-plane` 和 `ai-orchestrator` 的直接代码依赖，进入完全解耦、独立演进的多 Agent 时代。
