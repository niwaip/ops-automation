# 企业级智能自动化平台 全景架构与技术说明书 (Project Overview)

> 版本：v4.2 (2026-09 最新架构基线)  
> 状态：Active Production & Architecture Specification  
> 面向对象：全栈架构师、后端/前端研发人员、AI 编排开发者、平台运维工程师  

---

## 1. 平台定位与核心业务主链

### 1.1 平台定位
本项目是一套面向企业复杂业务场景的 **AI 原生技能与自动化任务编排平台**。  
系统以**高确定性、强审计性、安全受控、人机协同**为核心理念，深度融合了自然语言意图理解、浏览器自动化（网页录制/回放/接管）、办公文档智能渲染以及分布式长耗时工作流调度。

### 1.2 核心业务主链
整个平台遵循统一的南向能力交付与北向调用主干：

```text
[用户意图 (自然语言 / Web Chat / 微信 / 邮件)]
        │
        ▼
[AI 规划层 (Two-Stage Deterministic Planner)]
  ├─ 阶段一：意图识别与 DAG 拓扑选择 (选能力，编次序)
  └─ 阶段二：确定性参数提取与绑定 (缺参则冻结拓扑进入 waiting_input)
        │
        ▼
[统一能力资产库 (Unified Capabilities)]
  ├─ Built-in Skill (平台原生内置：文档导出、灾备、通知)
  ├─ Published Skill (编排发布态：DSL + 真实探测 + Temporal 工作流)
  └─ LLM Operation (受控纯文本算子：总结、抽取、格式转换)
        │
        ▼
[发布态权威门禁 (Release Manager)]
  └─ 静态校验、真实验证、不可变发布清单 (Release Manifest)、版本快照与审批
        │
        ▼
[执行调度中心 (Control Plane)]
  └─ 顶层权威：冻结计划哈希 (Plan Hash)、Step Lease、事务发件箱 (Outbox)、审批流
        │
        ▼
[受控运行时集群 (Southern Runtimes)]
  ├─ Browser Worker / Headless Chrome (浏览器自动化、DOM 快照、录制对账)
  ├─ Temporal Cluster & Worker (高可用分布式工作流)
  ├─ Sandbox Worker (受控 Python/Node 安全沙箱)
  └─ Carbone Engine (Word/Excel 高保真渲染)
```

---

## 2. 系统物理机能平面架构

后端完全打破了旧有的技术单体大杂烩（`core/`、`domain/`、`orchestration/`），全面重组为 **5 大物理机能平面 + 平台装配根 + 双前端体验端**：

```
apps/
├── backend/
│   ├── governance/          # [平面 1] 平台治理平面
│   │   ├── identity-access/ # 认证、鉴权、RBAC、安全守卫
│   │   ├── organization/    # 组织架构、部门、多租户隔离
│   │   ├── workbench/       # 个人/团队工作台、待办流转、协同收件箱
│   │   ├── im-gateway/      # 外部 IM 渠道网关 (微信 iLink 长连接、通知通道)
│   │   └── system-backup/   # 灾备引擎 (配置/技能/模型资产全量与增量备份恢复)
│   │
│   ├── intelligence/        # [平面 2] 智能与规划平面
│   │   ├── ai-orchestrator/ # 主规划器、两阶段确定性规划、参数抽取、模型治理
│   │   ├── master-planner/  # 顶层意图路由与复合任务分解
│   │   ├── browser-nl-agent/# 网页探索式自然语言动作智能体
│   │   └── codegen-agent/   # 动态代码生成与沙箱交互智能体
│   │
│   ├── registry-release/    # [平面 3] 资产与发布平面
│   │   ├── skill-registry/  # 技能元数据注册与配置管理
│   │   ├── workflow-registry/ # 工作流模板、Flow 编排 DSL
│   │   ├── template-registry/ # 基础模板资源库
│   │   └── release-manager/ # 核心网关：可执行资产编译、审批、发布与回滚
│   │
│   ├── execution-control/   # [平面 4] 执行与调度控制平面
│   │   ├── control-plane/   # 顶层执行权威、计划冻结、状态机、Outbox、审计事件
│   │   └── session-broker/  # 运行时会话仲裁、浏览器实例池生命周期管理
│   │
│   ├── capabilities/        # [平面 5] 南向能力域
│   │   ├── browser-domain/  # 浏览器能力域
│   │   │   ├── recorder/    # 录制状态机、持久化定位解析器 (Durable Locator)、IR
│   │   │   ├── templates/   # 浏览器录制模板编译与 Schema 规范
│   │   │   ├── semantics/   # 页面语义规则、选择器版本控制
│   │   │   └── runtime-facade/ # 运行时执行控制器门面、故障接管与对账契约
│   │   └── document-domain/ # 文档能力域 (合同/报表模板渲染、Excel/Word 引擎)
│   │
│   ├── runtimes/            # [执行器] 物理运行容器
│   │   ├── browser-worker/  # Playwright 驱动、动作执行、DOM 快照抽取
│   │   ├── replay-worker/   # 轨迹回放引擎
│   │   └── [外部容器]/      # browser-chrome (无头浏览器集群), sandbox, temporal
│   │
│   └── platform/            # [装配中心] NestJS Composition Root & 数据库权威
│                            # 仅保留路由装配、全局 Guard、Prisma Ports & Bridges
│
└── frontend/                # [体验平面] 现代响应式前端
    ├── portal/              # 企业管理控制台 (资产管理、发布审批、审计大盘)
    └── user-web/            # 用户业务体验端 (AI 交互会话、任务监控、人工接管)
```

---

## 3. 核心设计模式与技术规范 (沉淀自实践的最佳实践)

### 3.1 两阶段确定性规划 (Two-Stage Deterministic Planning)
- **痛点规避**：严禁采用单次调用完成“选技能 + 排 DAG + 猜参数 + 组装完整 JSON”的脆弱巨石 Prompt。
- **阶段一（仅生成拓扑）**：LLM 仅根据用户意图识别需调用的能力卡片与其前置依赖关系（DAG）。
- **代码权威组装**：字段 Schema 校验、类型收敛、默认值解析、数据管道绑定（上游输出注入下游输入）完全由确定性代码推导，不让 LLM 猜测路径。
- **阶段二（仅提取缺参）**：仅针对已选能力未绑定的槽位进行提取。若缺少必填参数，直接冻结当前拓扑并进入 `waiting_input`。用户补齐参数后按已冻结拓扑执行，**绝不重新规划 DAG**。

### 3.2 平台三类能力资产治理 (Three Capability Assets Model)
平台对外部统一暴露标准化 `Capability Contract`，但在内部划分为三类独立生命周期的资产：
1. **Builtin Skill**：平台原生内置功能，通过代码中的固定 Handler 执行（如系统备份、文档生成）。
2. **Published Skill**：编排型技能，由工作流 DSL、真实环境探测、代码生成并经 `release-manager` 发布为不可变镜像，在 Temporal 中运行。
3. **LLM Operation**：受控的大模型纯文本算子（总结、字段抽取、文本格式转换），具备独立的数据版本、安全沙箱（强制关闭 tools 和外网），以及评测准入门槛。

### 3.3 顶层执行权与分布式运行时分层 (Control Plane vs Temporal Authority)
- **Control Plane**：作为全局 Execution、Frozen Plan Hash、人工审批、Step Lease、Outbox 以及 SSE 事件流的**唯一顶层权威**。
- **Temporal**：仅作为底层的精确 Work Unit 运行时，执行被冻结节点指定的 Workflow Type 与版本。Temporal 严禁反向接管顶层全局状态机，以防止分布式双状态机撕裂与回放不确定性。

### 3.4 外发副作用两阶段安全防重机制 (Two-Phase Outbound Safety)
- **读写物理分离**：读取操作（如拉取邮件、查询数据）与外发副作用操作（如发送邮件、微信通知、外部调用）物理拆分为不同的独立 Capability。
- **两阶段提交**：`Prepare` 阶段规范化生成不可变的 Payload 与 `payloadHash`；审批 UI 仅对该 Hash 展示并由用户授权；`Commit` 阶段携带授权凭证提交。
- **未知状态 (`UNKNOWN`) 挂起**：外部第三方 API 在网络超时时，绝对禁止自动盲目重试（防止重复发信发消息），必须将状态置为 `UNKNOWN` 并发出告警等待人工处置。

### 3.5 浏览器执行三层结果契约与证据链解耦
- **三层结构**：
  1. **核心状态 (Status)**：精简的状态与元数据；
  2. **证据平面 (Evidence Plane)**：截图、DOM 快照、网络控制台日志统一走 Artifact URI 存储，不直接塞入主返回体污染上下文；
  3. **具名业务输出 (Business Output)**：模板设计时明确定义并命名的输出字段，供下游节点消费。
- **超时对账与恢复**：页面导航或交互超时后，必须发起真实 DOM 状态对账，若目标已达成则生成 `recovered` 恢复状态。
- **Session Broker 强管控**：所有浏览器操作必须由 `session-broker` 统一分配租期和会话，禁止运行时私自启动 Worker。

### 3.6 受控用户习惯与偏好学习 (Controlled Habit Learning)
- 坚决不采用不可控的自进化 Agent；固定工作流永远优先于动态生成。
- 习惯学习仅作用于“工作流复用、默认参数填充、输出格式偏好”；AI 仅做只读审查，不可擅自修改发布态代码与调度配置。

---

## 4. 技术栈与基础设施拓扑

| 分层 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **运行时环境** | Node.js (v20+), Python (3.10+) | 全平台支持 macOS/Linux |
| **包管理与 Monorepo** | pnpm (v8.12.0) Workspaces | 根目录配置 `shamefully-hoist`，统一依赖管理 |
| **后端框架** | NestJS (v10), Express, SWC | 高性能模块化企业级架构，SWC 秒级极速编译 |
| **数据库与持久化** | PostgreSQL 15, Prisma ORM (v5.22.0) | 单一 Prisma 权威治理，88 张物理表模型完全映射 |
| **缓存与分布式锁** | Redis 7 (Alpine), ioredis | 状态缓存、会话租期 Lease、分布式并发控制 |
| **工作流调度** | Temporal (v1.22.0) + Temporal Web UI | 工业级分布式持久化工作流编排引擎 |
| **浏览器自动化** | Playwright, Chromium (Headless), CDP | 浏览器 DOM 录制、持久化定位解析与回放 |
| **文档渲染引擎** | Carbone Engine (v3.8.2) | 高保真 Word/Excel 模板生成与 PDF 转换 |
| **前端框架** | React 18, Vite, TypeScript | 双前端（Portal 控制台 + User-Web 体验端） |
| **容器编排与启动** | Docker Compose (`./docker/start-smart.sh`) | 智能四层拓扑引导启动，杜绝环境漂移 |

---

## 5. 开发与工程运维红线 (Engineering Guardrails)

遵循仓库根目录 [`AGENTS.md`](../AGENTS.md) 的统一强制规则：

1. **Docker 统一入口**：
   - 所有容器启动、停止、重启统一通过 `./docker/start-smart.sh` 执行（例如 `./docker/start-smart.sh docker-compose.base.yml up -d platform`）。
   - 禁止绕过启动脚本直接执行 `docker compose`。
   - Compose 挂载路径必须统一使用 `${PROJECT_ROOT}`。
2. **单文件复杂度红线**：
   - 业务源码文件原则上**不超过 1200 行**；
   - 超过 **1600 行**为不可逾越的重构红线，必须按职责进行物理拆分；
   - 超过 500 行的 Service、Controller 或组件，在新增需求时优先下沉职责。
3. **架构解耦模式（Ports & Bridges）**：
   - `platform` 仅作为纯粹的 Composition Root 和数据库权威，禁止在 `platform` 内存放具体业务 Domain 模块。
   - 所有业务逻辑下沉至 `governance/`、`capabilities/` 或 `registry-release/`，通过 Token 依赖注入桥接。
4. **依赖一致性保证**：
   - 根目录保持 [`.npmrc`](../.npmrc) 固化：`confirm-modules-purge=false`、`auto-install-peers=true`、`shamefully-hoist=true`，确保多包间不存在单例符号隔离冲突。
