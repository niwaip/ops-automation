# Document Domain 产物语义对齐 (v4.1)

日期：2026-06-23

> 本文件对应实施 backlog 的 `Batch C5`，用于记录 `document-engine` 与 `report` 在当前过渡期如何向统一 `ArtifactRef` 语义对齐。

## 1. 目标

- 保留现有服务的私有返回字段，避免打断旧调用方。
- 在同一返回对象中补充统一 `artifacts` 字段。
- 让上游控制面和未来 `document-domain/runtime-facade` 可以逐步只识别统一产物语义。

## 2. 当前对齐结果

### `document-engine`

- 保留原有字段：
  - `downloadUrl`
  - `fileName`
  - `format`
  - `size`
- 新增统一字段：
  - `artifacts: ArtifactRef[]`
- 当前映射规则：
  - `type = document`
  - `id = outputId`
  - `url = downloadUrl`
  - `name = fileName`
  - `metadata.format = format`
  - `metadata.templateId = templateId`
  - 如存在则补 `skillId` / `publishedSkillId`

### `report`

- 保留原有字段：
  - `result_file`
- 新增统一字段：
  - `artifacts: ArtifactRef[]`
- 当前映射规则：
  - `type = document`
  - `id = reportId`
  - `url = /reports/{reportId}/download`
  - `name = basename(result_file)`
  - `metadata.filePath = result_file`
  - `metadata.templateId = templateId`
  - `metadata.sessionId = sessionId`

## 3. 过渡期约束

- 旧字段暂不删除。
- 新接入方优先消费 `artifacts`，不要继续扩散更多私有产物字段。
- 如需补更多产物元数据，优先放入 `ArtifactRef.metadata`，避免再定义平行字段。

## 4. 当前验证状态

- `report` 已完成类型检查通过。
- `document-engine` 已完成 Prisma 客户端本地隔离：
  - `schema.prisma` 改为生成到 `src/generated/prisma`
  - `src/prisma/client.ts` 作为服务内统一转发入口
  - 仓储与 PrismaService 已切到本地生成客户端
- `document-engine` 已完成验证：
  - `pnpm --filter carbone-engine typecheck` 通过
  - `pnpm --filter carbone-engine exec jest --runInBand src/modules/studio/studio.controller.workflow.spec.ts` 通过
- 当前仍可见的编辑器诊断更像语言服务缓存/索引问题，而非实际编译阻塞：
  - CLI 类型检查与聚焦测试均已证明 `template` / `skill` / `renderOutput` 模型访问可正常工作

## 5. 后续建议

- 如编辑器误报持续存在，可在 IDE 侧刷新 TypeScript language service 或重新打开工作区。
- 在 `document-domain/runtime-facade` 成形后，应逐步把上游调用切到统一 `ArtifactRef`，再评估移除旧字段。
