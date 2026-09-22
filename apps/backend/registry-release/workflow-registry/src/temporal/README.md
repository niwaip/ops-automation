# Temporal Workflow 设计时资产

当前源码位于 `apps/backend/registry-release/workflow-registry/src/temporal/`。这里维护 Workflow 与 Activity 的设计时 API、草稿、模板、校验和代码生成；`../workflow-template/`、`../activity-template/`、`../validation/`、`../codegen/` 是相应协作者目录。

发布门禁与 Manifest 生成由 `release-manager` 负责；顶层执行状态由 `control-plane` 负责；Worker 执行由运行时包负责。

## 工作流包导入导出

工作流资产可以通过版本化的 `.tar.gz` 包迁移：

- `GET /temporal/:id/export`：导出完整工作流包。只有已经生成并保存主工作流代码的记录可以导出。
- `POST /temporal/import`：以 `multipart/form-data` 上传字段 `file`，导入后创建新的、未启用的工作流草稿。
- 导入不会沿用来源环境的 `validated` 或 `deployed` 状态，也不会覆盖同名记录。
- 导入时执行 tar 路径/类型/大小、清单版本、逐文件 SHA-256、`contractDigest` 和 DSL/Activity 依赖校验。
- 导入成功后必须调用 `POST /temporal/:id/validate-saved-artifact` 完成真实沙盒验证；只有当前 artifact hash 对应的工件处于 `validated` 状态时，release-manager 才能调用 deploy。

包结构：

```text
manifest.json
dsl/workflow.json
dsl/activities.json
code/workflow.py
code/activities/<index>-<activity-fn>.py
metadata/source.json
```

`manifest.json` 是唯一入口，记录格式版本、来源 artifact、契约摘要、依赖引用和全部内容文件摘要。`metadata/source.json` 仅用于审计；导入不会信任其中的部署状态。

注意：当前 V1 包会原样包含 DSL/config 与生成代码。导出文件应按代码工件管理；如果配置中误写了明文密钥，密钥也可能进入包中。推荐只在 DSL 中保存 secret reference，不保存明文凭据。

## 源码入口

模块和服务位于本目录的 `temporal-workflow.module.ts`、`temporal-workflow.service.ts`；相关类型位于 `temporal-workflow.types.ts`。浏览器草稿桥接位于 `browser-bridge/`，Activity 运行时桥接位于 `runtime-bridge/`。包的公开子路径以 `workflow-registry/package.json` 的 `exports` 为准。
