# capabilities

`apps/backend/capabilities` 是浏览器能力域与文档能力域的目标平面根目录。

## 当前负责

- 统一承接浏览器能力域的目标逻辑路径
- 统一承接文档能力域的目标逻辑路径
- 为后续真实实现迁移提供稳定目标目录、导出面和边界说明

## 当前子平面

- `browser-domain`
  - 浏览器模板、语义、录制与运行时桥接
- `document-domain`
  - 文档模板、渲染、报表与运行时桥接

## 当前迁移原则

- 先固定目标平面的根入口与子层边界，再逐步迁移真实服务实现。
- 新的能力域需求应优先进入 `capabilities/*` 的逻辑视图，而不是回流到 `domain/*` 或 `ai-orchestrator/modules/browser/*`。
- `capabilities/*` 负责域能力本身，不承接通用 Planner、统一发布门禁或控制面执行生命周期。
