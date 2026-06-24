# 企业级技能平台 编排层重建 Batch R5 详细方案

**Enterprise-Skill-Platform Orchestration Batch R5 Browser Submodule Gateway Plan v4.0**  
日期：2026-06-22

---

## 1. 任务目标

`Batch R5` 的目标是为 `ai-orchestrator/browser` 下已经形成职责边界的子目录补齐稳定公开网关，并逐步收敛跨目录深链路 import。

当前 `browser` 范围内：

1. `intent/index.ts` 已存在，并已成为成功范式
2. `observe/`、`loop/`、`export/`、`session/` 尚无目录级 `index.ts`
3. `execute/`、`browser.module.ts`、`export/` 等位置仍直接依赖这些子目录中的具体文件

本批次的目标不是做目录迁移，而是建立“目录级稳定导出边界”，为后续 `RecorderDebugService` 瘦身和 `browser` 内部持续治理打基础。

---

## 2. 当前现状

### 2.1 已有范式

当前 [intent/index.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser/intent/index.ts) 已成功承担以下角色：

1. 统一公开导出
2. 屏蔽内部子目录 `profiles/`、`atomic-parsers/`、`ai-planner/`
3. 让 `browser.module.ts` 可以从一个稳定入口导入 `intent` 能力

这说明“目录网关 + 外部依赖收敛”的模式在当前仓库中已被验证可行。

### 2.2 当前缺口

以下目录仍未建立 `index.ts`：

1. `browser/observe/`
2. `browser/loop/`
3. `browser/export/`
4. `browser/session/`

### 2.3 当前深链路 import 的主要分布

根据当前代码扫描，深链路 import 主要集中在：

1. [recorder-debug.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser/execute/recorder-debug.service.ts)
2. [recorder-debug.test-helper.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser/execute/recorder-debug.test-helper.ts)
3. [recorder-debug-execution.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser/execute/recorder-debug-execution.service.ts)
4. [browser.module.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser/browser.module.ts)
5. `export/` 内部若干文件对 `loop/` 的直接依赖

说明：

这些 import 并不都属于“错误依赖”，但它们意味着：

1. 外部目录依赖具体文件路径
2. 未来重命名文件或继续拆分职责时，改动扩散面会偏大

---

## 3. 本批次范围

### 3.1 纳入范围

1. 为 `observe/`、`loop/`、`export/`、`session/` 新增目录级 `index.ts`
2. 将“目录外部”的深链路 import 逐步收敛到目录网关
3. 维护现有运行时行为不变

### 3.2 不纳入范围

1. `execute/` 内部职责拆分
2. `RecorderDebugService` 大规模瘦身
3. `browser` 目录物理迁移
4. `intent/index.ts` 重写
5. 目录内部文件之间的所有相对路径 import 全部消灭

说明：

本批次重点是“为目录建立稳定入口”，而不是“一次性消灭所有相对路径 import”。

---

## 4. 目标状态

目标新增文件：

```text
apps/backend/orchestration/ai-orchestrator/src/modules/browser/
├── observe/index.ts
├── loop/index.ts
├── export/index.ts
└── session/index.ts
```

目标原则：

1. 目录外部优先通过子目录 `index.ts` 使用能力
2. 子目录内部文件允许继续使用相对路径
3. 只导出“具备目录级公开语义”的 service / type / constant
4. 不把明显内部、仅供单文件使用的实现细节暴露成公共 API

---

## 5. 每个目录的导出建议

### 5.1 `observe/index.ts`

建议导出：

1. `RecorderObservationService`
2. `RecorderSnapshotService`
3. `RecorderStructureProbeService`
4. `RecorderDebugObservationRefreshService`
5. 必要的稳定类型，例如 `SnapshotNode`

不建议导出：

1. 仅供单实现内部使用的临时 helper

### 5.2 `loop/index.ts`

建议导出：

1. `RecorderLoopService`
2. `RecorderLoopStateService`
3. `RecorderLoopLocatorService`
4. `RecorderLoopExportService`
5. `RecorderConditionalBranchService`
6. 目录级稳定类型，例如 `RecorderManualInterventionToken`

### 5.3 `export/index.ts`

建议导出：

1. `RecorderExportService`
2. `RecorderExportAssemblyService`
3. `RecorderScriptExportService`
4. `RecorderTemplateExportService`

### 5.4 `session/index.ts`

建议导出：

1. `RecorderDebugSessionStoreService`
2. `RecorderDebugSessionCoordinatorService`

---

## 6. 建议实施步骤

### Step 1：先新增目录级 `index.ts`

按目录逐个新增，不要一开始就同步大规模改 import。

顺序建议：

1. `observe/index.ts`
2. `loop/index.ts`
3. `export/index.ts`
4. `session/index.ts`

### Step 2：优先收敛 `browser.module.ts`

当前 [browser.module.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser/browser.module.ts) 是最适合先收敛的地方，因为：

1. 它是模块装配入口
2. 导入项集中
3. 改动收益高，且行为可控

目标形态示意：

```ts
import {
  RecorderObservationService,
  RecorderSnapshotService,
  RecorderStructureProbeService,
  RecorderDebugObservationRefreshService,
} from './observe';
```

### Step 3：收敛 `execute/` 对外目录依赖

优先改动以下文件：

1. `recorder-debug.service.ts`
2. `recorder-debug-execution.service.ts`
3. `browser-execution-controller.service.ts`

原因：

这些文件未来还会继续参与 `RecorderDebugService` 瘦身，先收敛 import 可以降低后续改动扩散面。

### Step 4：谨慎处理测试辅助文件

例如 [recorder-debug.test-helper.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser/execute/recorder-debug.test-helper.ts) 这类测试文件，应优先保证：

1. 不与已有 jest mock 策略冲突
2. 不因为换成目录网关而重新引入整包 mock 劫持问题

因此：

1. 生产代码优先收敛
2. 测试辅助文件按需收敛，不强求一次性全部替换

### Step 5：保留目录内部相对引用

例如：

1. `export/` 内部继续依赖 `loop/` 的稳定类型
2. 子目录内部实现互相引用时，可继续用相对路径

原则：

本批次优先治理“目录外部依赖具体文件”的问题，而不是把所有相对路径都改掉。

---

## 7. 验收标准

### 7.1 结构验收

1. 四个目录都新增 `index.ts`
2. `browser.module.ts` 改为通过目录网关导入
3. `execute/` 关键服务对外目录依赖收敛

### 7.2 编译验收

1. `npm --prefix apps/backend/orchestration/ai-orchestrator run typecheck` 通过

### 7.3 测试验收

至少验证以下范围：

1. `recorder-debug` 相关测试
2. `browser-command` 相关测试，如本批次影响到模块装配
3. 与 `export/loop/observe/session` 交互密切的关键 spec

### 7.4 结构审计

至少验证：

1. 外部对 `observe/loop/export/session` 的深链路 import 数量明显下降
2. 未新增循环依赖

---

## 8. 风险点

### 8.1 最大风险

1. 目录网关导出过多，把内部实现再次包装成“伪公共 API”
2. 测试辅助文件切换到网关后，引发 jest mock 冲突
3. 一次性收敛过多 import，导致回归范围扩大

### 8.2 控制策略

1. 每个目录只导出稳定对象，不做“大而全 barrel”
2. 先收敛生产代码，再按需收敛测试辅助代码
3. 优先处理 `browser.module.ts` 和 `execute/` 主链路，其他位置可延后
4. 每新增一个目录网关就跑一次 `typecheck`

---

## 9. 回滚策略

若本批次引入回归，回滚顺序如下：

1. 恢复被改动的 import 路径
2. 保留目录级 `index.ts` 空壳也可以，但不再强制切换外部消费
3. 如果某个目录网关本身造成 mock 或循环依赖问题，则单独回滚该目录网关

推荐提交粒度：

1. 四个 `index.ts` 新增为一个 commit
2. `browser.module.ts` 与生产代码 import 收敛为一个 commit
3. 测试辅助文件调整为单独 commit

---

## 10. 建议的首轮 PR 范围

首轮 PR 建议只包含：

1. 新增 `observe/index.ts`
2. 新增 `loop/index.ts`
3. 新增 `export/index.ts`
4. 新增 `session/index.ts`
5. 更新 `browser.module.ts`
6. 更新少量 `execute/` 主链路文件 import

首轮 PR 不建议包含：

1. `RecorderDebugService` 进一步拆分
2. 全部测试文件 import 一次性收敛
3. 目录内部所有相对路径重写

---

## 11. 结论

`Batch R5` 的核心价值在于把 `browser` 从“局部已分层”推进到“目录边界可稳定消费”的状态。

它的收益主要体现在三点：

1. 为 `RecorderDebugService` 后续瘦身降低 import 扩散成本
2. 让 `browser.module.ts` 与外部目录依赖更稳定
3. 把 `intent/index.ts` 已验证成功的模式扩展到 `observe/loop/export/session`

如果 `R5` 做稳，`R6/R7` 的 `RecorderDebugService` 拆分会明显更顺畅。
