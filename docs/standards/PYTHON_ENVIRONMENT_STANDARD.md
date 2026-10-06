# Python 环境统一规范 (Python 3.11 Environment Standard)

## 1. 目标与标准定义

为了彻底消除开发、测试、沙箱执行与生产运行时之间的环境漂移（Environment Drift），以及因 Python 版本差异导致的语法和类型注解不兼容问题，本项目将 **Python 3.11** 确立为全仓库唯一的标准 Python 运行基线。

- **基准版本**：`Python 3.11.x`
- **语言标准**：PEP 604（原生 `|` 联合类型）、PEP 563（延迟类型评估 `from __future__ import annotations`）、标准 `asyncio` 与 `inspect` 规范。

---

## 2. 各容器运行环境映射规范

| 容器服务 | 基础镜像 | Python 版本 | 职能定义 |
| :--- | :--- | :--- | :--- |
| **`ops-temporal-worker`** | `python:3.11-slim` | **Python 3.11** | 核心异步工作流执行器，原生 3.11 运行时 |
| **`ops-sandbox-worker`** | `python:3.11-slim` | **Python 3.11** | 工作流沙箱验证代理，原生 3.11 运行时 |
| **`ops-user-sandbox`** | `node:22-bookworm-slim` | **Python 3.11.2** | 用户动态代码沙箱，Debian 12 原生 3.11 运行时 |
| **`ops-browser-chrome`** | Ubuntu 22.04 LTS | **Python 3.10 / 3.11** | 浏览器自动化与 Playwright 录制/执行环境 |
| **`ops-platform`** | `node:22-bookworm` | **Python 3.11.2** | 平台服务执行环境，Debian 12 原生 3.11 运行时 |

---

## 3. 代码生成与运行时保障规范

为确保无论在沙箱（3.11）还是降级执行器中均能获得 100% 确定性与零语法崩溃，项目建立了强制规范：

1. **统一导入声明**：
   所有由大模型动态生成或由模板编排的 Python 工作流、活动脚本，首行必须包含：
   ```python
   from __future__ import annotations
   ```
2. **代码生成器（Codegen）自动化保障**：
   在 `@ops/workflow-registry` 的 `TemporalWorkflowCodegenService` 中，所有剥离与清洗后的代码自动补齐 `from __future__ import annotations`。
3. **活动降级执行器（Runtime Bridge）双重保护**：
   在 `temporal-activity-execution.service.ts` 执行 Python 脚本前，前置校验并注入注解兼容声明，彻底杜绝 `unsupported operand type(s) for |: 'type' and 'NoneType'` 类错误。

---

## 4. 后续基线演进路径

在完成全部业务模块构建与 OpenSSL 3.0 兼容升级后，Compose 核心 Node 后端与沙箱服务已整体迁移至 `node:22-bookworm`（Debian 12，系统自带 Python 3.11.2）及 `python:3.11-slim`。而 `ops-browser-chrome` 容器基于 Ubuntu 22.04 LTS，仍运行系统预装的 Python 3.10.12（通过 `from __future__ import annotations` 保证语法兼容），后续视基础镜像规划逐步推进版本统一。
