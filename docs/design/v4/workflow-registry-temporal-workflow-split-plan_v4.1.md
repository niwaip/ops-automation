# workflow-registry / temporal-workflow 拆分方案 (v4.1)

日期：2026-06-24

> 本文对应 [Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md) 中的 P0 任务，用于把 `core/platform/src/modules/temporal-workflow` 拆成可持续迁移的 `workflow-registry` 结构。

---

## 1. 任务目标

本方案的目标是解决 `temporal-workflow` 模块“设计时模板 + Activity + codegen + 浏览器辅助 + 运行时执行辅助”混杂的问题。

本批次要完成的核心结果是：

1. 明确哪些逻辑仍属于 `workflow-registry`。
2. 明确哪些逻辑应下沉到 `browser-domain`、`release-manager` 或 `runtimes / execution-control`。
3. 在当前目录先完成职责分层，再考虑物理迁移。

本批次不追求：

- 一次性删除全部历史 helper
- 一次性把浏览器相关逻辑搬走
- 一次性改完所有 controller / DTO / 测试

---

## 2. 当前现状

### 2.1 当前目录

当前模块位于：

`apps/backend/core/platform/src/modules/temporal-workflow/`

当前已有的逻辑分组有：

- `workflow/`
- `activity/`
- `codegen/`
- `validation/`

但真实实现仍大量集中在根层文件。

### 2.2 当前主要文件

当前目录中最具代表性的文件包括：

- `temporal-workflow.service.ts`
- `temporal-workflow-template.service.ts`
- `temporal-workflow-draft.service.ts`
- `temporal-workflow-config.service.ts`
- `temporal-workflow-codegen.service.ts`
- `temporal-workflow-browser-draft.service.ts`
- `temporal-workflow-browser.helpers.ts`
- `temporal-workflow-fixed-workflow-code.helpers.ts`
- `fixed-activity-templates.ts`
- `builtin-activity.registry.ts`
- `temporal-activity.service.ts`
- `temporal-activity-crud.service.ts`
- `temporal-activity-codegen.service.ts`
- `temporal-activity-execution.service.ts`
- `temporal-workflow-validation.service.ts`
- `temporal-workflow-validation-facade.service.ts`
- `temporal-activity-validation.service.ts`

### 2.3 当前核心问题

当前问题主要体现在五种职责被放在同一个模块里：

1. Workflow 草稿与模板管理
2. Activity 注册、CRUD、校验
3. Workflow / Activity 代码生成
4. 浏览器相关草稿生成和辅助逻辑
5. 运行时执行辅助逻辑

这导致当前模块虽然在 README 中已被定义为 `workflow-registry`，但内部实现仍无法直接稳定映射到目标子层。

---

## 3. 本批次范围

### 3.1 纳入范围

本方案纳入：

1. `temporal-workflow` 模块职责重新分区
2. `workflow / activity / codegen / validation` 四层的真实边界澄清
3. 浏览器辅助逻辑和运行时执行辅助逻辑的迁移出口设计
4. 适合作为首轮 PR 的拆分顺序

### 3.2 不纳入范围

本方案不纳入：

1. `execution-flow` 全量重构
2. `workflow-registry` 包立刻承接全部实现
3. `temporal-worker` 侧调用协议大改
4. 浏览器域录制链路同步迁移

说明：

`temporal-workflow` 的正确推进方式不是“先拆包”，而是“先把这个模块内部变成真正的 `workflow-registry` 结构”。

---

## 4. 目标职责边界

### 4.1 `workflow/`

#### 负责

- Workflow 草稿
- Workflow 模板
- Workflow 配置
- Workflow 模板归一化
- Workflow 模板读取与维护

#### 建议承载文件

- `temporal-workflow.service.ts`
- `core/platform/src/workflow-registry/workflow-template/temporal-workflow-template.service.ts`
- `temporal-workflow-draft.service.ts`
- `core/platform/src/workflow-registry/workflow-template/temporal-workflow-config.service.ts`
- `temporal-workflow-normalization.service.ts`
- `temporal-workflow-template.helpers.ts`

#### 不负责

- Activity 运行时执行
- 浏览器录制草稿辅助
- 发布门禁

### 4.2 `activity/`

#### 负责

- Activity 注册与模板定义
- Activity CRUD
- Activity 配置读取
- Activity 校验前的定义管理

#### 建议承载文件

- `temporal-activity.service.ts`
- `temporal-activity-crud.service.ts`
- `builtin-activity.registry.ts`
- `fixed-activity-templates.ts`
- `temporal-workflow-activity-resolution.service.ts`
- `temporal-workflow-activity.helpers.ts`

#### 不负责

- Runtime 真正执行
- 发布后绑定

### 4.3 `codegen/`

#### 负责

- Workflow 代码生成
- Activity 代码生成
- 固定工作流代码模板
- Python / deterministic / fixed workflow 代码辅助

#### 建议承载文件

- `temporal-workflow-codegen.service.ts`
- `temporal-workflow-deterministic-activity-code.helpers.ts` / `temporal-workflow-fixed-workflow-code.helpers.ts`（旧 `temporal-workflow-codegen.helpers.ts` 聚合 wrapper 已在后续 Phase E 删除）
- `temporal-workflow-fixed-workflow-code.helpers.ts`
- `temporal-workflow-fixed-document-workflow-code.helpers.ts`
- `temporal-workflow-deterministic-activity-code.helpers.ts`
- `temporal-workflow-deterministic-builder.ts`
- `temporal-workflow-python.utils.ts`
- `temporal-activity-codegen.service.ts`

#### 不负责

- 浏览器专属草稿构造
- Runtime 执行

### 4.4 `validation/`

#### 负责

- Workflow 校验
- Activity 校验
- 校验 façade
- 校验 HTTP 适配
- 校验结果类型出口

#### 建议承载文件

- `temporal-workflow-validation.service.ts`
- `temporal-workflow-validation-facade.service.ts`
- `temporal-workflow-validation-http.service.ts`
- `temporal-activity-validation.service.ts`
- `temporal-activity-validation-facade.service.ts`
- `temporal-activity-validation-http.service.ts`

#### 不负责

- 设计时草稿主流程
- 编译或发布

---

## 5. 需要迁出的逻辑

### 5.1 应逐步迁到 `browser-domain`

以下逻辑不宜长期留在 `workflow-registry`：

- `temporal-workflow-browser-draft.service.ts`
- `temporal-workflow-browser.helpers.ts`

原因：

1. 它们本质上服务于浏览器录制或浏览器流程资产生成。
2. 它们并不是所有 Workflow 共有的通用设计时能力。
3. 继续留在 `temporal-workflow` 中，会让 `workflow-registry` 绑定浏览器域特性。

### 5.2 应逐步迁到 `release-manager`

以下逻辑如果最终承担“发布装配”角色，应从本模块外移：

- 与 Manifest 生成强耦合的编译包装逻辑
- 与发布期固定模板展开强耦合的装配逻辑

说明：

`workflow-registry` 负责“定义和生成设计时资产”，`release-manager` 负责“把这些资产装配成可执行产物”。两者不应长期混住。

### 5.3 应逐步迁到 `execution-control` 或 `runtimes`

以下逻辑不宜长期留在设计时模块：

- `temporal-activity-execution.service.ts`
- `temporal-activity-execution.helpers.ts`

原因：

1. 它们更接近运行时执行或运行时桥接。
2. 它们让设计时模块对 Runtime 语义知道过多。
3. 长期会削弱 `control-plane` 和 `temporal-worker` 的边界。

---

## 6. 目标文件结构

本批次完成后，建议目录逐步演进为：

```text
apps/backend/core/platform/src/modules/temporal-workflow/
├── workflow/
│   ├── index.ts
│   ├── temporal-workflow.facade.ts
│   ├── temporal-workflow-template.service.ts
│   ├── temporal-workflow-draft.service.ts
│   ├── temporal-workflow-config.service.ts
│   └── temporal-workflow-normalization.service.ts
├── activity/
│   ├── index.ts
│   ├── temporal-activity.service.ts
│   ├── temporal-activity-crud.service.ts
│   ├── builtin-activity.registry.ts
│   └── fixed-activity-templates.ts
├── codegen/
│   ├── index.ts
│   ├── temporal-workflow-codegen.service.ts
│   ├── temporal-activity-codegen.service.ts
│   ├── fixed-workflow-code.helpers.ts
│   └── deterministic-builder.ts
├── validation/
│   ├── index.ts
│   ├── temporal-workflow-validation.service.ts
│   ├── temporal-workflow-validation-facade.service.ts
│   ├── temporal-activity-validation.service.ts
│   └── temporal-activity-validation-facade.service.ts
├── browser-bridge/          # 迁移期临时层，可后续外移
├── runtime-bridge/          # 迁移期临时层，可后续外移
├── temporal-workflow.controller.ts
├── activity.controller.ts
├── temporal-workflow.module.ts
└── index.ts
```

说明：

- `browser-bridge/` 与 `runtime-bridge/` 可以是迁移期临时层。
- 这样做的目的不是创造新长期目录，而是把“不属于设计时注册面”的逻辑先从核心子层中隔离出来。

---

## 7. 建议实施步骤

### Step 1：先把运行时执行辅助从设计时主层中隔离

第一刀建议优先动：

- `temporal-activity-execution.service.ts`
- `temporal-activity-execution.helpers.ts`

原因：

1. 这类职责与设计时边界最不一致。
2. 隔离后最有利于恢复 `activity/` 的纯设计时语义。
3. 也有利于后续判断它最终该去 `execution-control` 还是 `runtimes/temporal-worker`。

### Step 2：把浏览器辅助逻辑从 `workflow / codegen` 主层中切出

第二刀建议动：

- `temporal-workflow-browser-draft.service.ts`
- `temporal-workflow-browser.helpers.ts`

做法：

1. 先迁到本模块内的临时 `browser-bridge/`
2. 保持原 façade 或导出不变
3. 等 `browser-domain` 的承接层准备好后再继续物理迁移

### Step 3：收敛 `workflow` 主入口

目标：

让 `temporal-workflow.service.ts` 更像 façade，而不是大杂烩 service。

优先移出的内容：

1. 草稿管理细节
2. 配置归一化细节
3. 模板装配细节

### Step 4：收敛 `codegen`

目标：

把代码生成相关 helper 和 service 明确收口到 `codegen/`。

优先动作：

1. 让 `temporal-workflow-codegen.service.ts` 成为统一入口
2. 让各种 fixed / deterministic / python helper 作为协作者存在
3. 避免 codegen helper 继续在 `workflow/` 与 `activity/` 间随意散落

### Step 5：统一 `validation`

目标：

让 Workflow 校验和 Activity 校验都通过 `validation/` 稳定出口对外暴露。

这样后续无论是：

- `workflow-registry` 包承接实现
- 还是 `release-manager` 调用校验 façade

边界都会更清晰。

---

## 8. 建议的首轮 PR 范围

首轮 PR 建议只做最边界清晰的一刀：

1. 新建迁移期 `runtime-bridge/` 或等效 service
2. 把 `temporal-activity-execution.service.ts` 相关运行时辅助逻辑从设计时主层中隔离
3. 让 `activity/` 回到“定义、注册、校验前管理”的语义
4. 保持 controller、module、对外导出不变

首轮 PR 不建议同时做：

1. 浏览器草稿辅助外移
2. codegen helper 全量重命名
3. `execution-flow` 同步重构
4. `workflow-registry` 包路径切换

---

## 9. 验收标准

### 9.1 结构验收

1. `workflow / activity / codegen / validation` 四层边界更清晰
2. 运行时执行辅助不再直接混在设计时主层
3. 浏览器专属辅助不再继续扩张到通用 Workflow 逻辑中

### 9.2 编译验收

至少保证：

1. `apps/backend/core/platform` 可正常 typecheck
2. 现有 controller 与模块注入关系稳定

### 9.3 测试验收

优先回归以下测试范围：

1. `temporal-workflow-core.test.ts`
2. `temporal-workflow-draft.test.ts`
3. `temporal-workflow-template.test.ts`
4. `temporal-workflow-codegen.test.ts`
5. `temporal-workflow-browser.test.ts`

### 9.4 架构验收

1. 新增 Workflow 设计时需求可明确判断进入 `workflow / activity / codegen / validation` 哪一层
2. 后续迁到 `workflow-registry` 包时，不再需要整体搬运一个混合模块

---

## 10. 风险点

### 10.1 最大风险

1. 为了快速迁移，新增一个“更大的 façade”，反而继续包住所有旧逻辑
2. codegen 与 runtime 边界切错，导致后续调用链更复杂
3. 浏览器专属辅助逻辑迁移不彻底，导致 `workflow-registry` 仍长期绑定浏览器域

### 10.2 控制策略

1. 先切最不属于设计时模块的运行时执行辅助
2. 再切浏览器专属桥接逻辑
3. 每一刀都保持对外 API 稳定
4. 避免在同一批次同时重命名目录、重写 helper、调整 controller

---

## 11. 回滚策略

若某一刀引入回归，按以下顺序回滚：

1. 回滚新 bridge service 的接线
2. 保留目录骨架，停止推进下一刀
3. 恢复原 service 直连逻辑

推荐提交粒度：

1. 运行时桥接隔离一个 commit
2. 浏览器桥接隔离一个 commit
3. workflow façade 瘦身一个 commit
4. codegen 与 validation 收口一个 commit

---

## 12. 与后续迁移的关系

本方案完成后，后续三条线会更顺畅：

1. `workflow-registry` 可以逐步承接真正的设计时 Workflow / Activity 资产管理
2. `browser-domain` 可以接走浏览器专属草稿与辅助逻辑
3. `execution-control` 或 `runtimes/temporal-worker` 可以接走真正偏运行时的执行辅助

---

## 13. 结论

`temporal-workflow` 当前最大的问题不是目录名，而是它仍把“设计时注册面、浏览器桥接、运行时辅助、代码生成”放在一个模块里。正确顺序应是：

1. 先恢复 `workflow / activity / codegen / validation` 四层的真实边界
2. 把浏览器专属和运行时专属逻辑隔离出去
3. 再让拆开的实现迁入 `workflow-registry`

只有这样，`workflow-registry` 才会成为真正稳定的设计时工作流注册中心，而不是旧 `temporal-workflow` 的换名副本。
