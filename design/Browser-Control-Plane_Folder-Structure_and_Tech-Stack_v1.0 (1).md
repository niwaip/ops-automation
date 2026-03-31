# Browser Control Plane

## 项目文件夹结构 & 推荐技术栈（v1.0）

> 本文定义该项目的 **代码组织结构（Monorepo）** 以及 **推荐技术栈**，与《需求定义 v1.0》与架构图保持一致，可直接作为仓库初始化蓝本。

---

## 一、Monorepo 项目文件夹结构

```text
browser-control-plane/
├─ README.md
├─ LICENSE
├─ docs/
│  ├─ requirements/
│  │  └─ Browser-Control-Plane_Requirements_v1.0.md
│  ├─ architecture/
│  │  ├─ diagrams/                 # 系统/数据流/状态机/K8s 架构图
│  │  ├─ permission-matrix.md      # Role × Permission × State
│  │  ├─ state-machine.md
│  │  └─ threat-model.md
│  ├─ runbooks/
│  │  ├─ operations.md
│  │  ├─ incident-response.md
│  │  └─ troubleshooting.md
│  └─ api/
│     └─ openapi.yaml              # Control Plane + Replay Engine API
│
├─ services/
│  ├─ control-plane/               # 控制平面（权限/会话/Profile/锁）
│  │  ├─ src/
│  │  │  ├─ auth/                  # 账号密码（bcrypt），后续可接 LDAP/AD
│  │  │  ├─ rbac/                  # 角色与权限模型
│  │  │  ├─ policy/                # 网络/下载/剪贴板等策略
│  │  │  ├─ sessions/              # create/takeover/resume/close
│  │  │  ├─ profiles/              # Profile 元数据（PVC 路径）
│  │  │  ├─ locks/                 # Redis 写锁（SETNX + TTL）
│  │  │  ├─ templates/             # 模板元数据与发布状态机
│  │  │  ├─ audit/                 # Step-level logs
│  │  │  └─ admin/                 # 管理接口
│  │  ├─ migrations/
│  │  └─ Dockerfile
│  │
│  ├─ replay-engine/               # 确定性回放引擎
│  │  ├─ src/
│  │  │  ├─ dsl/                   # JSON 模板解析与校验
│  │  │  ├─ runner/                # step 执行（retry/assert）
│  │  │  ├─ cdp/                   # Playwright over CDP
│  │  │  ├─ freeze/                # 接管时冻结输入
│  │  │  ├─ ai-orchestrator/       # 参数识别/异常决策
│  │  │  └─ logging/
│  │  └─ Dockerfile
│  │
│  ├─ template-compiler/           # 录制产物 → JSON 模板
│  │  ├─ src/
│  │  │  ├─ ingest/                # Playwright codegen 输入
│  │  │  ├─ normalize/             # 参数化/locator 归一
│  │  │  ├─ assertions/            # 断言规则
│  │  │  └─ export/
│  │  └─ cli/
│  │
│  ├─ portal-ui/                   # 前端 Portal
│  │  ├─ src/
│  │  │  ├─ auth/
│  │  │  ├─ sessions/
│  │  │  ├─ takeover/
│  │  │  ├─ admin/
│  │  │  └─ components/
│  │  └─ Dockerfile
│  │
│  └─ browser-worker/              # 浏览器运行时（noVNC + CDP）
│     ├─ base/                     # 基于 chrome-novnc-docker
│     ├─ overlay/
│     │  ├─ entrypoint.sh
│     │  └─ supervisord.conf
│     └─ Dockerfile
│
├─ packages/
│  ├─ template-schema/             # JSONSchema（模板/Step/Log）
│  ├─ policy-model/                # RBAC/Policy 共享模型
│  ├─ sdk/                         # 外部调用 SDK
│  └─ common/
│
├─ infra/
│  ├─ helm/
│  ├─ k8s/
│  │  ├─ ingress/
│  │  ├─ pv-pvc/
│  │  ├─ networkpolicy/
│  │  └─ hpa/
│  └─ compose/
│
├─ tests/
│  ├─ integration/
│  │  ├─ session-lock/
│  │  ├─ takeover-resume/
│  │  └─ template-replay/
│  └─ regression/
│
└─ tools/
   └─ scripts/
```

---

## 二、推荐技术栈

### 1. 前端（Portal / Admin）
- **React + TypeScript + Vite**
- UI：Ant Design 或 MUI
- 状态管理：TanStack Query
- 实时：SSE（展示 step logs）
- noVNC：新窗口/新 Tab 打开

### 2. 控制平面（Control Plane）
- **Node.js + NestJS**（推荐） / Go / Java Spring Boot
- 数据库：PostgreSQL
- 缓存与锁：Redis（SETNX + TTL）
- 认证：账号密码（bcrypt），后续可接 LDAP/AD

### 3. 回放引擎（Replay Engine）
- **Node.js + playwright-core**（通过 CDP）
- JSON 模板驱动，确定性执行
- 接管时冻结 CDP 输入（鼠标/键盘）

### 4. 模板编译器（Template Compiler）
- Node.js 或 Python
- 输入：Playwright codegen 脚本
- 输出：JSON 模板 + JSONSchema 校验

### 5. 浏览器运行时（Browser Worker）
- 基于 **chrome-novnc-docker** 思路：
  - Xvfb + headed Chrome
  - noVNC（8080）
  - CDP（9222）
- Profile 挂载路径：`/profiles/{user_id}/chrome`

### 6. 基础设施（K8s）
- Kubernetes
- Ingress：nginx / traefik（支持 WebSocket）
- PV/PVC：NFS（Profile 持久化）
- HPA：browser-worker 按需扩缩容

---

## 三、演进路线

- ✅ MVP：账号密码 + JSON 模板 + CDP 回放 + noVNC 接管 + Redis 写锁
- ⏭ v1：LDAP/AD、网络白名单、下载/剪贴板策略
- ⏭ v2：Trace/录像证据链、模板 CI 回归、DLP 集成

---

> 该结构可直接用于仓库初始化，并与需求定义、架构图一一对应。
