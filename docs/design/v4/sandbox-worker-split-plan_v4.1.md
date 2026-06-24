# Sandbox Worker 独立拆分方案 (v4.1)

日期：2026-06-23

> 本文件对应实施 backlog 的 `Batch D1`，用于记录如何将历史上分散在 `temporal-worker` 与 `sandbox-agent` 中的沙箱执行能力，收敛为统一的 `sandbox-worker`。

## 1. 背景

与“动态代码沙箱执行”相关的历史来源主要来自两处：

1. 历史 `apps/backend/runtime/temporal-worker/src/sandbox/*`
2. 历史 `apps/backend/runtime/sandbox-agent/*`

两者都曾承担部分“接收代码 -> 隔离执行 -> 返回结果/日志”的职责，但部署形态和技术栈不同：

- 历史 `temporal-worker/src/sandbox/*`
  - NestJS HTTP 接口
  - 直接用 `python3` 子进程执行代码
  - 提供缓存查询和 SSE 流式日志
- 历史 `runtime/sandbox-agent/*`
  - Python Temporal worker + aiohttp HTTP server
  - 既提供 `/execute`、`/execute/stream`，也承载 Activity / Workflow validation
  - 内部包含更完整的沙箱 runner、Temporal mock、重试语义与验证链路

这导致以下问题：

- `temporal-worker` 同时承载真正的 Temporal Worker 与沙箱 HTTP 接口，运行时语义混杂。
- 存在两套执行入口与两套“缓存/执行/流式输出”实现，后续维护会继续分叉。
- 上游仍保留 `SANDBOX_AGENT_URL` 这一历史兼容命名，但当前目标目录已统一为 `apps/backend/runtimes/sandbox-worker`。

## 2. 现状盘点

### 2.1 `temporal-worker/src/sandbox/*`

当前状态：

- `temporal-worker/src/sandbox/*` 已完成移除
- 历史兼容 HTTP 入口不再保留在 `temporal-worker`
- 沙箱执行链路统一收敛到 `sandbox-worker`

当前结论：

- `sandbox` 相关职责已从 `temporal-worker` 主体移除
- `temporal-worker` 不再承担沙箱 HTTP 入口
- `runtime/sandbox-agent/*` 兼容转发层已完成删除

### 2.2 `runtime/sandbox-agent/*`

历史职责：

- 提供 HTTP API：
  - `POST /execute`
  - `POST /execute/stream`
  - `POST /validate-activity`
  - `POST /validate-workflow`
  - `POST /validate-workflow/stream`
  - `GET /health`
- 作为 Python Temporal worker，监听：
  - `SANDBOX_TASK_QUEUE`
  - `ACTIVITY_VALIDATION_TASK_QUEUE`
- 通过 `sandbox_executor.py` 执行真正的 Python 沙箱逻辑

当前状态：

- 该兼容转发层已从仓库中移除
- 主实现已统一收敛到 `apps/backend/runtimes/sandbox-worker`

## 3. 目标态

目标统一为：

`apps/backend/runtimes/sandbox-worker/`

目标职责边界：

- 只负责“动态代码/脚本的受控隔离执行”
- 同时承载：
  - HTTP 执行入口
  - Temporal 驱动的验证 worker
  - Python 沙箱 runner
- 不承载：
  - 通用 Temporal workflow worker 主骨架
  - 浏览器执行
  - control-plane 编排逻辑
  - planner / agent 决策逻辑

## 4. 目标目录建议

建议先按职责拆成以下结构：

```text
apps/backend/runtimes/sandbox-worker/
├── README.md
├── package.json                     # 若保留 Node 侧 HTTP 代理/适配层
├── requirements.txt                # Python 运行依赖
├── src/
│   ├── api/
│   │   ├── sandbox-http.server.py
│   │   └── health.py
│   ├── worker/
│   │   ├── temporal-worker.py
│   │   ├── task-queues.py
│   │   └── worker-config.py
│   ├── execution/
│   │   ├── sandbox-executor.py
│   │   ├── runner-template.py
│   │   └── code-cache.py
│   ├── workflows/
│   │   ├── agent-session.workflow.py
│   │   ├── activity-validation.workflow.py
│   │   └── workflow-validation.workflow.py
│   └── contracts/
│       ├── http-schema.py
│       └── result-schema.py
└── tests/
```

说明：

- `sandbox-agent/worker.py` 未来拆到 `api/`、`worker/`、`workflows/`
- `sandbox-agent/sandbox_executor.py` 迁到 `execution/`
- `temporal-worker/src/sandbox/*` 已完成删除

## 5. 协议边界

### 5.1 HTTP 协议

统一保留并规范以下入口：

- `POST /execute`
- `POST /execute/stream`
- `POST /validate-activity`
- `POST /validate-workflow`
- `POST /validate-workflow/stream`
- `GET /health`

建议请求字段统一为：

```json
{
  "code": "python source code",
  "fn_name": "entrypoint_name",
  "activity_id": "optional-id",
  "workflow_id": "optional-id",
  "input_data": {},
  "timeout": "60s",
  "retry_policy": {
    "maxRetries": 2,
    "backoffMs": 1000
  },
  "task_queue": "optional-task-queue"
}
```

建议响应语义统一为：

- `success`
- `result`
- `error`
- `traceback`
- `logs`
- `workflow_id`
- `activity_id`
- `attempts`
- `max_attempts`
- `non_retryable`

结论：

- 后续上游统一只认 `sandbox-worker` HTTP 协议，不再区分 “sandbox-agent API” 和 “temporal-worker sandbox API”

### 5.2 Task Queue 协议

当前已出现的队列：

- `sandbox-agent-task-queue`
- `activity-validation-task-queue`

建议目标态命名保留兼容，但通过集中配置显式声明：

- `SANDBOX_TASK_QUEUE`
- `ACTIVITY_VALIDATION_TASK_QUEUE`

后续如补 Workflow 专用验证队列，也应集中到 `worker/task-queues.py` 之类的单点配置中，避免散落在业务代码里。

## 6. 启动方式建议

### 6.1 当前推荐启动语义

当前已将主实现物理迁移到 `apps/backend/runtimes/sandbox-worker`，历史 `runtime/sandbox-agent` 兼容层已删除。

原因：

- 上游 `core/platform` 当前已经通过 `SANDBOX_AGENT_URL` / `TEMPORAL_SANDBOX_AGENT_URL` 接入它
- 其功能覆盖面已经超过 `temporal-worker/src/sandbox/*`
- 已承担 Activity / Workflow validation 的真实执行链路

### 6.2 目标启动面

目标态建议拆成两个可独立启动的入口：

1. `sandbox-http`
   - 提供 HTTP API 与 SSE
2. `sandbox-temporal-worker`
   - 连接 Temporal
   - 监听沙箱执行与验证 task queue

如果短期仍保留单进程，也要在目录和 README 中明确：

- 同一个服务镜像内包含两个子入口
- 不是“普通 Agent 服务”，而是 Runtime Worker

## 7. 依赖项说明

### 7.1 Python 依赖

当前核心依赖：

- `temporalio`
- `aiohttp`
- `orjson`
- `python-json-logger`
- `certifi`

这些依赖应归属 `sandbox-worker` 自身，不再挂靠在“agent”语义下。

### 7.2 Node 侧依赖

历史 `temporal-worker/src/sandbox/*` 曾使用：

- `@nestjs/common`
- `@nestjs/swagger`
- `child_process`
- `fs` / `path` / `os`

结论：

- 该 Node 侧历史实现已移除
- 上游统一通过 `sandbox-worker` 协议接入沙箱执行

## 8. 迁移步骤

建议按以下顺序推进：

1. 文档上将历史 `runtime/sandbox-agent` 定义为 `sandbox-worker` 的来源实现
2. 将主实现收敛到 `apps/backend/runtimes/sandbox-worker`
3. 在迁移说明中明确：`temporal-worker` 保留通用 Temporal worker，`sandbox-worker` 负责动态代码沙箱与验证
4. 后续新代码只落在 `sandbox-worker` 结构，不再写入历史 `temporal-worker/src/sandbox/*`
5. 将 `worker.py` 按职责拆分
6. 将 `sandbox_executor.py` 独立为 `execution` 子模块
7. 清理历史 `runtime/sandbox-agent/*` 与 `temporal-worker/src/sandbox/*`，保留兼容转发或直接删除
8. 在 `D3/D4/D5` 中补齐：
   - runtimes README
   - workspace 路径
   - Docker 构建/挂载路径

## 9. 本批次结论

`Batch D1` 的结论是：

- 未来统一运行时名称应为 `sandbox-worker`
- 当前主实现已迁到 `apps/backend/runtimes/sandbox-worker/*`
- `runtime/sandbox-agent/*` 已完成移除
- `temporal-worker/src/sandbox/*` 已完成移除
- `sandbox-worker` 成为唯一保留的沙箱运行时实现
