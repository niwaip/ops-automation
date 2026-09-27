# 业务应用与服务平面 (Applications & Services)

本目录为 Ops Automation 代码仓库的**所有可独立构建、部署或分发的目标应用集合**。

> [!NOTE]
> 遵循 [`docs/standards/REPOSITORY_STRUCTURE_STANDARD.md`](../docs/standards/REPOSITORY_STRUCTURE_STANDARD.md)：
> - `apps/` 承载具体可运行的服务、Web 界面、桌面/移动端宿主、插件及硬件固件；
> - 跨服务共享的协议和核心状态机必须下沉到 `packages/`，严禁在 `apps/` 之间形成横向私有跨目录引用。

---

## 一、应用矩阵与端形态划分

```text
apps/
├── backend/                            # 后端 7 大物理机能平面 (NestJS / Node.js)
│   ├── governance/                     # 认证权限、组织架构、协同工作台、微信 IM 网关与系统备份
│   ├── intelligence/                   # AI 编排主控 (AI Orchestrator)、意图解析、参数识别与智能体
│   ├── registry-release/               # 技能/工作流/模板设计态中心、发布门禁与回滚管理
│   ├── execution-control/              # 任务调度控制中心 (Control Plane) 与会话仲裁 (Session Broker)
│   ├── capabilities/                   # 南向垂直能力域 (browser-domain / document-domain)
│   ├── runtimes/                       # 无业务编排权执行器 (Playwright Worker / 个人沙箱 Runner)
│   ├── platform/                       # 数据库持久化适配器与全局 Composition Root
│   └── var/                            # 运行时临时数据与运行态产物 (Git 忽略)
├── frontend/                           # 企业 Web 前端应用 (React / Vite)
│   ├── portal/                         # 企业管理控制台 (系统设置、审批、监控、审计)
│   ├── user-web/                       # 用户前台交互与业务执行端 (会话交互、模板填报)
│   └── shared/                         # 前端共享通用 UI 组件与工具库
├── office-addin/                       # 微软 Office 协同插件 (Word / Excel / PPT Web Add-in)
│   ├── src/                            # Office.js 交互面板与文档内容审查/生成前端
│   ├── public/                         # 独立发布静态资源与 Windows 快速配置脚本
│   └── manifest-*.xml                  # Office 各组件清单元数据
├── ai-passport-agent/                  # ESP32-C3 随身语音硬件终端固件 (C/C++ / FreeRTOS)
├── desktop/                            # 桌面端宿主脚手架 (基于 @ops/user-core)
├── mobile/                             # 移动端宿主脚手架 (基于 @ops/user-core)
└── social-platform/                    # 企业协同即时通讯通道接入 (企微 / 飞书 / 钉钉 / Slack)
```

---

## 二、开发调试与启动指南

### 1. 后端服务启动
后端服务通过 Docker 统一容器化编排管理：

```bash
# 启动轻量开发核心栈 (Platform, Control-Plane, Session-Broker, AI-Orchestrator)
./docker/start-smart.sh dev up -d

# 启动全量后端栈 (包含浏览器自动化与 Carbone 模板引擎)
./docker/start-smart.sh full up -d
```

### 2. 前端应用启动
```bash
# 启动管理控制台 (默认端口: http://localhost:5173)
pnpm run dev:portal

# 启动用户业务端 (默认端口: http://localhost:5174)
pnpm run dev:user-web
```

### 3. Office 插件调试
```bash
# 启动本地 Office Add-in 开发服务与 HTTPS 证书反代
bash ./docker/start-smart.sh docker-compose.addin.yml up -d
```

---

## 三、架构边界与分层红线

1. **后端平面纯洁性**：
   - 严格禁止在 `apps/backend/` 下重新创建混杂业务逻辑的旧目录（如 `core`、`domain`）；
   - 各平面服务间调用必须通过 `packages/backend-contracts/*` 明确定义的 RPC、消息事件或强类型 DTO 进行，不得跨服务私自连库。
2. **多端体验一致性**：
   - `portal`、`user-web`、`desktop`、`mobile` 统一通过 `@ops/user-core` 共享会话流与认证状态。
3. **单文件规模控制**：
   - 严格执行 `AGENTS.md` 规范：普通业务源码文件行数不得超过 1600 行红线，超过 1200 行优先评估职责拆分。
