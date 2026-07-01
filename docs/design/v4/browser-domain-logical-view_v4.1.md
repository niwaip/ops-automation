# Browser Domain 统一逻辑视图 (v4.1)

日期：2026-06-23

> 本文件对应实施 backlog 的 `Batch C1`，用于把当前分散在多个服务中的浏览器相关能力，统一映射到未来的 `browser-domain` 逻辑视图。

## 1. 当前归属映射

| 当前路径 | 当前职责 | 未来逻辑归属 |
| :--- | :--- | :--- |
| `apps/backend/domain/browser-template` | 浏览器模板设计、编译、校验 | `browser-domain/templates` |
| `apps/backend/domain/browser-semantics` | 浏览器语义规则生成、发布、运行时解析 | `browser-domain/semantics` |
| `apps/backend/intelligence/ai-orchestrator/src/modules/browser` | 浏览器录制、观察、会话、导出、浏览器意图桥接 | `browser-domain/recorder` + `browser-domain/runtime-facade` |

## 2. 统一结构草图

```text
capabilities/browser-domain/
├── recorder/
│   ├── api/
│   ├── execute/
│   ├── observe/
│   ├── session/
│   ├── export/
│   ├── loop/
│   └── recovery/
├── templates/
│   ├── registry/
│   ├── compiler/
│   └── validation/
├── semantics/
│   ├── rule-set/
│   ├── generation/
│   ├── release/
│   ├── runtime/
│   ├── hit-log/
│   └── error-log/
└── runtime-facade/
    ├── intent/
    └── runtime-bridge/
```

## 3. 当前迁移约束

- `browser-template` 的真实运行包根目录已迁到 `apps/backend/capabilities/browser-domain/templates`，旧目录 `apps/backend/domain/browser-template` 的 `src/` 已移除，当前仅保留 `README.md` 作为迁移说明锚点；`ai-orchestrator/modules/browser` 仍暂不做物理搬迁。
- `browser-semantics` 的真实运行包根目录已迁到 `apps/backend/capabilities/browser-domain/semantics`，旧物理路径已在后续收口中完成删除。
- 新增浏览器域需求必须先判断属于 `templates`、`semantics`、`recorder` 或 `runtime-facade`。
- 浏览器域新增需求不应再被当作三套彼此独立的系统处理。

## 4. 对后续批次的衔接

- `Batch C2`：优先收敛模板与语义规则的发布接口，与 `release-manager` 建立清晰边界。
- `Batch C3`：继续拆分 `RecorderDebugService`，使其逐步贴近 `recorder / observation / session / export` 的目标结构。
