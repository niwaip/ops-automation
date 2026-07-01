# release-manager / capability-release 第一批 PR 任务分解 (v4.1)

日期：2026-06-24

> 本文是 [release-manager-capability-release-split-plan_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/release-manager-capability-release-split-plan_v4.1.md) 的执行层拆解版本。  
> 目标不是继续讨论“应该怎么拆”，而是把第一批 PR 直接拆到文件级动作、验证范围与回滚点。
>
> 历史状态说明：本文记录的是第一批 PR 设计时的拆解视图，保留旧 `modules/capability-release/*` 路径用于对照当时的拆分动作；截至当前 Phase D，相关旧路径已退化为兼容壳，稳定实现与默认消费入口已切到 `core/platform/src/release-manager/*` 与 `@ops/release-manager/*`。

---

## 1. 任务目标

本文件回答四个执行问题：

1. `capability-release` 的第一批 PR 应先动哪一刀。
2. 每个 PR 具体改哪些文件、哪些依赖注入、哪些导出。
3. 每个 PR 要验证哪些测试和哪些行为。
4. 如果中间出问题，应该回滚到哪一层。

本批次默认遵循以下原则：

1. 不改对外路由。
2. 不改数据库 Schema。
3. 不改发布协议名称。
4. 不做目录物理迁移到 `apps/backend/registry-release/release-manager`。

---

## 2. 当前可直接利用的基础

当前 `capability-release` 模块已经具备以下可用基础：

1. 目录级子层已存在：
   - `release/`
   - `compiler/`
   - `validator/`
   - `publisher/`
   - `audit/`
2. 根导出面已切到子层导出：
   - [index.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/platform/src/modules/capability-release/index.ts)
3. `CapabilityReleaseModule` 已按子层 provider 注册大部分协作者：
   - [capability-release.module.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/platform/src/modules/capability-release/capability-release.module.ts)

这意味着：

1. 第一批 PR 不需要先补目录骨架。
2. 第一批 PR 可以直接从“新增 service + 旧 service 委托”开始。
3. 第一批 PR 不需要改控制器路由和模块挂载位置。

---

## 3. 第一批 PR 的总体策略

第一批不建议做成一个巨型 PR，而建议拆成三个连续 PR：

1. `PR-1`：抽 `publisher` 的 runtime binding 首刀
2. `PR-2`：抽 `release` 的 façade / draft 组装首刀
3. `PR-3`：切开 `compiler` 与 `validator` 中最容易混住的一组逻辑

这样拆的原因是：

1. `capability-release-runtime.service.ts` 的“发布后绑定”职责边界最清晰，适合作为第一刀。
2. `capability-release.service.ts` 适合在第二刀被收敛成 façade。
3. `compiler` / `validator` 的边界需要在主入口变薄之后再切，更稳。

---

## 4. PR-1：抽出 `publisher` 的 runtime binding 首刀

### 4.1 目标

让 `capability-release-runtime.service.ts` 不再直接承载最核心的“发布后 runtime 绑定”细节。

首轮只抽一类职责：

- runtime binding / runtime bridge 相关逻辑

不同时抽：

- 部署
- smoke 校验
- 审计收口

### 4.2 建议新增文件

建议新增：

```text
apps/backend/core/platform/src/modules/capability-release/publisher/
└── release-runtime-binding.service.ts
```

### 4.3 建议修改文件

首轮 PR 建议只改以下文件：

1. `apps/backend/core/platform/src/modules/capability-release/capability-release-runtime.service.ts`
2. `apps/backend/core/platform/src/modules/capability-release/capability-release.module.ts`
3. `apps/backend/core/platform/src/modules/capability-release/publisher/index.ts`
4. `apps/backend/core/platform/src/modules/capability-release/publisher/release-runtime-binding.service.ts`

### 4.4 下沉内容

从 `capability-release-runtime.service.ts` 中优先识别并迁出：

1. 运行时绑定参数组装
2. 发布态到运行时绑定模型的映射
3. 与部署、smoke 无直接耦合的 runtime attach / bind 逻辑

保留在 `capability-release-runtime.service.ts` 的内容：

1. 顶层发布后流程编排
2. 调用 runtime binding service
3. 调用部署 / smoke 协作者

### 4.5 目标形态

目标调用形态应接近：

```ts
const runtimeBinding = await this.releaseRuntimeBindingService.bindRuntime(...)
```

而不是让 `CapabilityReleaseRuntimeService` 自己继续直接完成全部装配细节。

### 4.6 验证范围

编译验证：

1. `apps/backend/core/platform` typecheck 通过

测试验证：

1. `capability-release-runtime.service.test.ts`
2. `capability-release-bridge-dto.test.ts`

行为验证：

1. 至少验证一条发布后 runtime binding 主链路
2. 确认原 controller 接口行为不变

### 4.7 回滚点

若本 PR 引入回归：

1. 先回滚 `CapabilityReleaseRuntimeService` 到原有直连逻辑
2. 保留 `release-runtime-binding.service.ts` 空骨架或整体回滚

---

## 5. PR-2：抽出 `release` 的 façade / draft 组装首刀

### 5.1 目标

让 `capability-release.service.ts` 开始收敛成主入口 façade，而不是继续承担草稿装配与编译前组织细节。

首轮只抽一类职责：

- release draft / release 主流程前置组装

不同时抽：

- browser recording 编译
- temporal schema 编译
- validator 全量切分

### 5.2 建议新增文件

建议新增：

```text
apps/backend/core/platform/src/modules/capability-release/release/
├── capability-release.facade.ts
└── release-draft.service.ts
```

说明：

- 第一版可以只先落其中一个文件。
- 若首轮范围需要更稳，建议先只落 `release-draft.service.ts`。

### 5.3 建议修改文件

建议改以下文件：

1. `apps/backend/core/platform/src/modules/capability-release/capability-release.service.ts`
2. `apps/backend/core/platform/src/modules/capability-release/capability-release.module.ts`
3. `apps/backend/core/platform/src/modules/capability-release/release/index.ts`
4. `apps/backend/core/platform/src/modules/capability-release/release/release-draft.service.ts`
5. 可选：`apps/backend/core/platform/src/modules/capability-release/release/capability-release.facade.ts`

### 5.4 下沉内容

优先迁出：

1. Skill 草稿关联读取
2. Release 草稿读取与前置装配
3. Manifest 组装前的主数据准备

保留在 `capability-release.service.ts` 的内容：

1. 顶层入口
2. 调用 compiler / validator / publisher
3. 返回 DTO 或调用 mapper 组装最终响应

### 5.5 目标形态

目标调用形态应接近：

```ts
const releaseDraft = await this.releaseDraftService.loadReleaseDraft(...)
```

### 5.6 验证范围

编译验证：

1. `apps/backend/core/platform` typecheck 通过

测试验证：

1. `capability-release-core.test.ts`
2. `capability-release-skill-draft.test.ts`

行为验证：

1. 至少验证一条 release 草稿读取 / 组装主链路
2. 确认 controller 侧接口保持兼容

### 5.7 回滚点

若本 PR 引入回归：

1. 先回滚 `CapabilityReleaseService` 的委托接线
2. 保留 `release-draft.service.ts` 空骨架或整体回滚

---

## 6. PR-3：切开 `compiler` 与 `validator` 的首组边界

### 6.1 目标

在主入口和 runtime binding 已稍微变薄之后，再把最容易混写的一组逻辑切开：

1. Browser Recording 计划合法性
2. 编译前结构检查
3. 发布门禁校验

### 6.2 建议新增或收敛文件

优先收敛到现有子层：

```text
apps/backend/core/platform/src/modules/capability-release/compiler/
└── release-compiler.service.ts

apps/backend/core/platform/src/modules/capability-release/validator/
└── release-validator.service.ts
```

如果首轮不想新增过多文件，也可以先通过：

1. 强化 `compiler/index.ts`
2. 强化 `validator/index.ts`
3. 让现有 service 明确分工

### 6.3 建议修改文件

1. `capability-release-build-validation.service.ts`
2. `capability-release-browser-recording.service.ts`
3. `browser-recording-action-policy.service.ts`
4. `browser-recording-execution-plan-validator.service.ts`
5. `compiler/index.ts`
6. `validator/index.ts`
7. `capability-release.module.ts`

### 6.4 切分原则

进入 `compiler` 的逻辑：

1. 生成中间结构
2. 生成编译结果
3. 生成可供发布的装配对象

进入 `validator` 的逻辑：

1. 判断能否发布
2. 判断动作是否合法
3. 判断执行计划是否满足门禁规则

### 6.5 验证范围

编译验证：

1. `apps/backend/core/platform` typecheck 通过

测试验证：

1. `capability-release-temporal-schema.test.ts`
2. `capability-release-core.test.ts`
3. 与 Browser Recording 校验直接相关的测试

行为验证：

1. 至少验证一条 browser recording 相关发布前校验链路

### 6.6 回滚点

若本 PR 引入回归：

1. 先回滚 `compiler / validator` 委托接线
2. 不影响前两刀已经稳定的 façade 与 publisher 拆分

---

## 7. 每个 PR 的建议提交粒度

建议每个 PR 内部仍保持多 commit，避免回滚困难。

### `PR-1`

1. 新建 `release-runtime-binding.service.ts`
2. 模块注册与 `publisher/index.ts` 导出
3. `CapabilityReleaseRuntimeService` 改委托
4. 测试调整

### `PR-2`

1. 新建 `release-draft.service.ts`
2. 模块注册与 `release/index.ts` 导出
3. `CapabilityReleaseService` 改委托
4. 测试调整

### `PR-3`

1. `compiler` / `validator` 分工调整
2. 模块注册与导出调整
3. 主流程接线修改
4. 测试调整

---

## 8. 每个 PR 的 Done 标准

### 通用 Done 标准

1. 对外 controller 路由无变化
2. 相关 module 注入关系稳定
3. 目标服务 typecheck 通过
4. 至少跑过直接相关测试
5. 至少做过一条行为级验证

### `PR-1` Done

1. `CapabilityReleaseRuntimeService` 的 runtime binding 逻辑已有明确协作者承接
2. 主 service 不再直接拼装完整 runtime binding 细节

### `PR-2` Done

1. `CapabilityReleaseService` 不再直接承载主要 release draft 组装逻辑
2. 主 service 更接近 façade

### `PR-3` Done

1. `compiler` 与 `validator` 的主要职责不再混写在同一服务内
2. Browser Recording 的“装配”和“校验”边界开始清晰

---

## 9. 建议验证清单

### 9.1 编译

建议至少执行：

```bash
npm --prefix apps/backend/core/platform run typecheck
```

### 9.2 测试

建议按 PR 粒度跑最小相关测试：

```bash
npm --prefix apps/backend/core/platform test -- capability-release-runtime.service.test.ts
npm --prefix apps/backend/core/platform test -- capability-release-core.test.ts
npm --prefix apps/backend/core/platform test -- capability-release-skill-draft.test.ts
npm --prefix apps/backend/core/platform test -- capability-release-temporal-schema.test.ts
```

### 9.3 行为验证

建议至少做其中一项：

1. 用现有 release 相关 HTTP 接口做一次真实请求
2. 验证一条 release 草稿读取或发布前校验主链路
3. 若本地依赖环境允许，验证一条发布后 runtime binding 主链路

说明：

如果本批次涉及容器挂载或服务加载问题，必须通过 `./docker/start-smart.sh` 启动对应服务，并再次验证行为结果，而不是只看“服务启动成功”。

---

## 10. 风险与防漂移规则

### 10.1 本批次最容易漂移的方向

1. 趁拆分顺手改 release 侧对外 DTO
2. 趁拆分顺手改控制器路由
3. 趁拆分顺手把 `registry-release/release-manager` 包路径一起切掉
4. 趁拆分顺手调整数据库 Schema 或 Prisma 查询结构

### 10.2 明确禁止

在这三个 PR 中统一禁止：

1. 改 controller 路由
2. 改数据库 Schema
3. 改 `control-plane` 对发布侧的调用协议
4. 改 Compose 路径
5. 改 workspace 配置

---

## 11. 推荐执行顺序

如果现在立即开工，建议顺序如下：

1. `PR-1`：先拆 `publisher` 的 runtime binding
2. `PR-2`：再拆 `release` 的 draft 组装
3. `PR-3`：最后切 `compiler / validator`

这个顺序的好处是：

1. 第一刀边界最清晰
2. 第二刀能让主入口明显变薄
3. 第三刀在前两刀稳定后更容易判断边界

---

## 12. 结论

`capability-release` 的第一批 PR 不应该追求“快速迁目录”，而应该按以下顺序建立真实可迁移的内部结构：

1. 先把发布后 runtime binding 从 `CapabilityReleaseRuntimeService` 中抽出来
2. 再把 release draft / 主流程前置组装从 `CapabilityReleaseService` 中抽出来
3. 最后切开 `compiler` 与 `validator`

做到这三步后，`capability-release` 才算真正进入“可以迁到 `release-manager`”的状态，而不是继续停留在“逻辑上像 release-manager、实现上还是巨型中心 service”的过渡阶段。
