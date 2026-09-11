# runtimes

`apps/backend/runtimes` 是平台执行运行时平面（Execution Runtime Plane）的统一入口目录。

这里承接**真正执行计算、动作、浏览器操作与智能体推理的 Worker / Executor**，而不是控制面的调度与编排逻辑。

---

## 一、当前物理结构与两级分类体系

`runtimes/` 下划分两级执行实体：**平台基础设施级 Worker (`*-worker`)** 与 **租户环境专属 Runner (`*-runner`)**：

```text
apps/backend/runtimes/
├── [平台级基础设施 Workers]
│   ├── browser-worker/          # 浏览器实时自动化操控与录制代理 (Node.js + Playwright, 端口 3004)
│   ├── replay-worker/           # 动作回放、断点调试与人工接管引擎 (Node.js + CDP, @ops/replay-engine)
│   ├── temporal-worker/         # Temporal 工作流与 Activity 执行器 (Python 3.11)
│   └── sandbox-worker/          # 动态代码执行与语法校验 HTTP API 网关 (Python 3.11, 端口 8090)
│
├── [租户专属环境 Runners]
│   └── personal-sandbox-runner/ # 用户个人专属隔离容器内的智能体引擎 (Python / dsh CLI)
│
└── README.md
```

---

## 二、各运行时职责与边界清单

### 1. `browser-worker/` (浏览器实时操控)
- **定位**：实时浏览器自动化操作与录制接入网关
- **技术栈**：NestJS (Node.js) + Playwright + WebSocket
- **主要职责**：
  - 维持与无头浏览器（Chrome）的即时控制通道；
  - 接收并执行页面导航、元素点击、表单输入等原子浏览器动作；
  - 承载录制会话（Recorder Gateway），通过 WebSocket 向前端实时推送浏览器画面与操作事件。
- **协议与部署**：HTTP + WebSocket（默认端口 `3004`），作为独立容器 `ops-browser-worker` 运行。

### 2. `replay-worker/` (动作回放与接管)
- **定位**：基于 CDP 的脚本回放、重试与人工干预接管引擎（包名 `@ops/replay-engine`）
- **技术栈**：NestJS (Node.js) + Playwright-core / Chrome DevTools Protocol (CDP)
- **主要职责**：
  - 按照录制的步进序列回放自动化流程；
  - 当页面结构发生变化或流程卡死时，触发异常断点，提供人工接管辅助能力；
  - 提供调试日志、快照提取与重试控制。
- **协议与部署**：HTTP API，独立部署。

### 3. `temporal-worker/` (Temporal 工作流执行器)
- **定位**：纯粹的 Temporal 核心工作流与活动执行器
- **技术栈**：Python 3.11 + `temporalio` SDK
- **主要职责**：
  - 连接 `ops-temporal:7233`，监听 `sandbox-worker-task-queue` 与 `activity-validation-task-queue`；
  - 负责执行核心工作流：`AgentSessionWorkflow`、`ActivityValidationWorkflow`、`WorkflowValidationWorkflow`；
  - 负责执行核心活动：`execute_code_activity`。
- **协议与部署**：Temporal gRPC Worker 进程，作为独立容器 `ops-temporal-worker` 运行。

### 4. `sandbox-worker/` (系统级代码沙箱 HTTP 网关)
- **定位**：对外提供受控 Python 动态执行与语法/工作流校验的 HTTP API 服务
- **技术栈**：Python 3.11 + aiohttp + `temporalio` Client
- **主要职责**：
  - `POST /execute` / `POST /execute/stream`：受控 Python 脚本动态执行与流式日志输出；
  - `POST /validate-activity`：Activity 校验与语法验证（通过 Temporal Client 调度至 `temporal-worker` 执行）；
  - `POST /validate-workflow` / `POST /validate-workflow/stream`：工作流校验；
  - `GET /health`：健康探针。
- **协议与部署**：HTTP（默认端口 `8090`），作为独立容器 `ops-sandbox-worker` 运行。

### 5. `personal-sandbox-runner/` (用户个人 Agent 引擎)
- **定位**：用户多租户隔离沙箱内部的自主智能体引擎（DeepSeek Harness / `dsh` CLI）
- **技术栈**：Python 3.11 CLI 模块化架构
- **主要职责**：
  - 预装在每个用户的私有容器（`ops-user-sandbox:*`）中，以普通权限用户（UID 1001）运行；
  - 提供意图嗅探、多轮 ReAct 工具调用循环（天气、实时检索、文档读写、终端命令执行）；
  - 挂载并管理用户读写持久化的 `/workspace` 工作区与 `/knowledge` 个人空间。
- **协议与部署**：通过 `session-broker` 的 Dockerode 编排以 CLI 指令 (`dsh run ...`) 在容器内启动执行。

---

## 三、平面边界与架构分工

在三层执行控制体系中，新增需求应严格按以下职责划分归属：

| 层次/目录 | 核心职责 | 典型场景 |
| :--- | :--- | :--- |
| **`execution-control/control-plane`** | 执行生命周期、审批决策、干预门禁 | 流程状态机流转、审批中断、人工介入接管、输入补全 |
| **`execution-control/session-broker`** | 会话管理、资源租约、容器生命周期 | 分配 Worker 槽位、创建/销毁用户沙箱、会话冻结与解冻 |
| **`runtimes/*`** | 纯粹的动作执行与计算底座 | 跑工作流、执行代码、操纵浏览器、跑 dsh Agent |
