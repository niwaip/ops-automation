# 仓库工程质量门禁与工具中心 (Repository Quality Gates & Tools)

本目录承载 Ops Automation 代码仓库的**全局架构合规门禁**、**代码质量度量规则**与**跨模块运维迁移辅助工具**。

> [!NOTE]
> 根目录 `scripts/` 的核心定位是保障 Monorepo 工程健康度。所有门禁脚本均作为 CI/CD 强卡点（`pnpm run ci:check`）运行。

---

## 一、目录结构与职责分工

```text
scripts/
├── check-workspace-architecture.mjs    # Monorepo 依赖拓扑、workspace:* 规范与分层无环校验门禁
├── check-file-complexity.mjs           # AGENTS.md 单文件行数复杂度门禁实现 (1200 建议 / 1600 红线)
├── check-file-complexity.sh            # 复杂度门禁 Shell 入口包装器
├── validate-outbound-side-effects.mjs  # 外部副作用、幂等账本状态机与 Fail-Closed 静态语义门禁
├── tools/                              # 跨模块业务数据迁移与模板构建 CLI 工具
│   ├── create-template-activity-workflow.js # 模板活动工作流脚手架
│   └── migrate-workflow-activity-refs.js   # 工作流活动节点引用迁移脚本
└── README.md                           # 本说明文档
```

---

## 二、架构治理与质量门禁说明

### 1. 工作空间架构依赖门禁 (`check-workspace-architecture.mjs`)
- **命令**：`pnpm run check:architecture`
- **规则**：
  - 检查全仓库 50+ 个工作空间 package 的依赖关系；
  - 内部依赖必须使用严格的 `workspace:*` 协议，禁止跨包写死版本号；
  - 校验工作空间依赖图谱为**有向无环图 (DAG)**，彻底杜绝循环依赖；
  - 校验 Backend Control Plane、Platform 等后端分层的边界归属。

### 2. 代码复杂度红线门禁 (`check-file-complexity.mjs` / `.sh`)
- **命令**：`pnpm run check:complexity`
- **规则**：
  - 严格执行 `AGENTS.md` 中的单文件规模控制规则；
  - 普通业务源码文件超过 `1200` 行输出告警；
  - 普通业务源码文件超过 `1600` 行时直接阻断构建（阻断红线）；
  - 针对 Controller、Service、Page、Component 倡导职责下沉与单一职责设计。

### 3. 外部副作用与账本状态机门禁 (`validate-outbound-side-effects.mjs`)
- **命令**：`pnpm run validate:outbound-side-effects`
- **规则**：
  - 检查所有声明为 `external_write` 的 Capability 是否具备防直写防护（Fail-Closed）；
  - 校验 `OutboundEffectLedgerService` 状态流转（PREPARED → APPROVED → COMMITTING → COMMITTED / UNKNOWN / FAILED）与 CAS 原子更新；
  - 检查滞留租约自动回收机制（`reapStaleCommits`）与人工裁决（`resolveUnknown`）能力；
  - 校验调度执行层（Deterministic Plan Scheduler）挂起逻辑与 W3C Trace 链路透传。

---

## 三、脚本归属边界规范（防膨胀反模式）

为了避免 `scripts/` 目录演变为杂乱脚本的“垃圾箱”，新增脚本时必须严格遵循以下边界：

| 脚本类型 | 推荐放置目录 | 说明 |
| :--- | :--- | :--- |
| **工程质量门禁 / 架构校验** | `scripts/` | 直接对接根目录 `package.json` 的 CI 门禁命令 |
| **跨模块运维工具 / 迁移脚手架** | `scripts/tools/` | 一次性迁移、模板生成等 CLI 工具 |
| **测试夹具 / 测试用例 / 压测** | `tests/` | 放置于 `tests/contract/`、`tests/integration/`、`tests/e2e/` 等，严禁放入 `scripts/` |
| **容器运行时 / 启动引导 / 冒烟** | `docker/scripts/` 或各服务目录 | 容器镜像内依赖或 Docker Compose 专用运维脚本 |
| **数据库 DDL / 角色权限 / 数据属主** | `database/scripts/` | 数据库治理与 Schema 属主校验规范专有目录 |
| **应用或包内部专用脚本** | `apps/<app>/scripts/` 或 `packages/<pkg>/scripts/` | 局部业务专属，避免提升至全局根目录 |

---

## 四、本地执行与 CI 联动

所有的核心门禁脚本均整合在统一的 CI 检查中：

```bash
# 执行全量质量门禁（架构依赖 + 文件复杂度 + 副作用账本 + 数据库属主 + 分层校验）
pnpm run ci:check

# 单独执行架构校验
pnpm run check:architecture

# 单独执行复杂度校验
pnpm run check:complexity

# 单独执行副作用语义门禁
pnpm run validate:outbound-side-effects
```
