# 跨服务测试中心 (Cross-Service Test Suite & Mock Center)

本目录承载 Ops Automation 代码仓库的**跨微服务契约测试**、**端到端全链路集成测试**、**真实数据库并发/租约恢复压测**以及**受控的 Mock 服务与样本应用**。

> [!NOTE]
> 根据 [`docs/standards/REPOSITORY_STRUCTURE_STANDARD.md`](../docs/standards/REPOSITORY_STRUCTURE_STANDARD.md) 架构规范：
> - **单服务单元测试**必须与源码就近放置（如 `apps/backend/platform/test/` 或 `apps/backend/execution-control/control-plane/test/`）；
> - **跨服务协作、真实网络调用、共享数据库并发及协议验证样本**统一收敛至本目录。

---

## 一、目录结构与职责分工

```text
tests/
├── contract/                           # 跨服务文档/合同抽取与比对基线资产
│   ├── generate-scanned-test-contracts.js # 扫描版合同与印章仿真测试生成脚本
│   ├── 技术服务与开发合同.pdf          # OCR 单合同审查样本
│   ├── 技术服务与开发合同_v1_扫描版.pdf # 合同差异比对基线扫描件
│   ├── 技术服务与开发合同_v2_修改版.pdf # 合同差异比对修改版扫描件
│   ├── contract_v1_baseline.{pdf,docx,md} # 多格式基线样本
│   └── contract_v2_revised.{pdf,docx,md}  # 多格式修改版样本
├── integration/                        # 跨服务集成测试与真实环境压测套件
│   ├── jest.config.js                  # Jest 集成测试套件配置
│   ├── config.ts                       # 跨服务端口与数据库/Redis 连接配置
│   ├── setup.ts                        # 自定义断言 Matcher 与测试环境生命周期
│   ├── verify-schedule-fire-concurrency.ts # PostgreSQL 50 并发抢占与 Outbox 崩溃恢复压测
│   ├── helpers/                        # 跨服务 HTTP 客户端与数据级联清理工具
│   │   ├── api-client.ts               # 统一封装 Auth、Session、Template、AI 微服务客户端
│   │   ├── cleanup.ts                  # 测试后级联清理 PostgreSQL 业务表与 Redis 缓存
│   │   ├── global-setup.ts             # 测试前服务健康与存储连通性预检
│   │   └── global-teardown.ts          # 测试后全局资源释放
│   └── e2e/                            # 端到端业务链路测试用例
│       ├── full-flow.test.ts           # TC01：录制 → 编译 → 模板 → 会话 → AI 识别 → 回放
│       └── takeover.test.ts            # TC02：人机接管（Human Takeover）状态流转
├── mock-ai-server/                     # 轻量级 AI 编排器 Mock HTTP 服务
│   └── mock-ai-server.js               # 供 Docker Compose 测试环境（docker-compose.test.yml）挂载使用
├── mock-erp/                           # 受控的 ERP 样本前端与测试服务
│   ├── index.html / styles.css / app.js# 包含登录、MFA 二次认证、数据表格与导出的样本页面
│   ├── server.js                       # 轻量级静态与 API 模拟 HTTP 服务器
│   ├── start.sh                        # 启动脚本（支持自定义 PORT 与智能 sudo 判断）
│   ├── verify-mfa-e2e.js               # 基于 Playwright 的 MFA 认证接管端到端验证
│   ├── verify-mfa-replay-api.py        # 基于 Python 的 MFA 回放 API 验证
│   ├── verify-live-export-replay.py    # 列表数据导出回放专项验证
│   └── verify-live-recorder-export.py  # 录制导出数据完整性验证
└── README.md                           # 本说明文档
```

---

## 二、核心测试套件说明

### 1. 契约基线与文档测试 (`tests/contract/`)
- **使用方**：南向能力域 `@ops/document-domain` 的单测与 E2E 规范（`scanned-pdf-review.spec.ts`、`contract-compare.service.spec.ts` 等）。
- **用途**：提供结构一致、内容受控的多格式真实文件（PDF / Word docx / Markdown），用于断言文本提取准确率、双合同逐行差异比对报告生成与 OCR 语义理解。
- **自包含生成器**：运行 `node tests/contract/generate-scanned-test-contracts.js` 可重新生成包含仿真边界、公章与排版的双版本 PDF 夹具。

### 2. 真实数据库并发与崩溃恢复压测 (`tests/integration/verify-schedule-fire-concurrency.ts`)
- **验证场景**（直接对接真实本地 PostgreSQL 实例）：
  1. **50 并发原子抢占**：验证 `(schedule_id, scheduled_at)` 唯一约束与原子事务，确保 50 个并发 Worker 仅有 1 个赢得 ScheduleFire 并在 Outbox 产生唯一事件，其余 49 个安全捕获冲突；
  2. **Worker 崩溃租约恢复**：注入租约超时记录，验证健康 Worker 通过原子 CAS 与 `FOR UPDATE SKIP LOCKED` 成功接管已崩溃节点的租约；
  3. **毒丸消息隔离 (Poison Message Quarantine)**：模拟超限失败事件（`attempts >= 10`），验证调度器主动移入死信并附加审计原因；
  4. **Execution Outbox 崩溃恢复**：模拟 Dispatcher 在处理事件期间崩溃，验证下游调度器重新领取并推进状态。

### 3. 端到端流程测试 (`tests/integration/e2e/`)
- **执行命令**：`pnpm run test:e2e`（调用 `jest --config tests/integration/jest.config.js`）。
- **覆盖能力**：全栈流水线运转，包含用户注册鉴权、模板编译存储、会话状态流转（`IDLE -> RUNNING -> CLOSED`）与人机接管控制。

### 4. 受控样本应用与 Mock 服务 (`tests/mock-erp/` & `tests/mock-ai-server/`)
- **`mock-ai-server`**：在无外部 LLM API Key 的离线与 CI 环境下，提供确定性的参数提取、模型诊断 JSON 响应。
- **`mock-erp`**：提供真实的前端交互上下文，专门用于浏览器录制器（Browser Recorder）、自动化回放（Replay Engine）以及 MFA 接管协议的回归，杜绝在真实生产页面上测试带来的不可控因素。

---

## 三、快速开始与执行指南

### 1. 准备测试依赖栈
大部分集成与 E2E 测试需要运行后端微服务或数据库依赖：

```bash
# 启动轻量开发核心栈（包含 Postgres、Redis、Platform、Control-Plane、Session-Broker、AI-Orchestrator）
./docker/start-smart.sh dev up -d
```

### 2. 运行 E2E 业务集成测试
```bash
# 执行端到端流水线测试
pnpm run test:e2e

# 包含覆盖率报告
pnpm run test:e2e:coverage
```

### 3. 运行调度器与数据库并发压测
```bash
# 直连本地运行中的 PostgreSQL 实例执行 50 并发与崩溃恢复实测
npx ts-node tests/integration/verify-schedule-fire-concurrency.ts
```

### 4. 启动与验证 Mock ERP 样本服务
```bash
# 方式 A：默认使用 80 端口（特权端口需输入 sudo 密码）
./tests/mock-erp/start.sh

# 方式 B：使用普通端口（无需 sudo）
PORT=8080 ./tests/mock-erp/start.sh

# 运行 Playwright MFA 接管流自动化验证
node tests/mock-erp/verify-mfa-e2e.js
```

---

## 四、治理与贡献规范

1. **就近原则**：单微服务或南向 Adapter 的单元测试，请放入对应的 `apps/<service>/test` 或 `packages/<pkg>/test`，严禁随意移入根目录 `tests/`；
2. **保持环境整洁**：严禁在 `tests/` 下创建无实质代码的空目录占位（如残留的 `.gitkeep`）；
3. **数据隔离与清理**：所有直接操作数据库或 Redis 的集成测试，必须在 `afterAll` 或使用 `tests/integration/helpers/cleanup.ts` 确保脏数据清理，杜绝产生跨测试干扰。
