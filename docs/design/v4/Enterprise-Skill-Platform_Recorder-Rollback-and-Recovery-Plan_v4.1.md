# 企业级 Skill 平台 Recorder 回退与恢复能力方案

**Recorder Rollback and Recovery Plan v4.1**  
日期：2026-07-03

> 本文定义 recorder-debug 链路在"固定业务流一次性生成成果物"目标下，补齐录制期回退、自动多步规划触发、视觉识别兜底三项能力的设计方案。
> 范围收窄于"固定业务流的录制鲁棒性"——不涉及通用 agent 演进、MCTS 回溯、跨任务知识沉淀等开放性能力。
> **能力边界声明**：本方案的 rollback 仅覆盖 history rollback + browser state restore（部分），**不含业务副作用回滚**（详见 §2.4）。后端已 commit 的业务变更无法通过本方案撤销。
> 当前状态：后端已具备 `ExecutionReconcileService`（失败后多步规划，三种策略 + LLM 决策）与 `RecorderReplayService` 的 4 步 grounding 阶梯（含 `visual-fallback-required` 槽位）；但录制期回退完全缺失，reconcile 只在人工接管后被动触发，视觉 grounding 实现被 deferred。

## 0. 变更日志

| 版本 | 日期 | 变更 |
|---|---|---|
| v4.1.0 | 2026-07-03 | 初稿——方案 a/b/c 对比、P0/P1/P2 三期计划 |
| v4.1.1 | 2026-07-03 | 采纳第一轮审查——storage state 一次性开支定性、文件体积风险、异步路径与多模态确认 |
| v4.1.2 | 2026-07-03 | 采纳第二轮审查——adapter 拆分前置、`RecorderDebugRollbackService` 抽取、`/tmp` 路径与轮询复用确认 |
| v4.1.3 | 2026-07-03 | 采纳第三轮审查——能力边界声明（§2.4）、高副作用打标（§2.5）、captureState 时机修正（§4.3.4）、多 origin 恢复与支持矩阵（§4.4）、sessionRevision 版本戳（§5.2）、点击前二次校验（§5.3）、接口收敛为 `rollbackLastStep` |
| v4.1.4 | 2026-07-03 | 采纳第四轮审查——`executionIndex` 独立于 history、状态采集挂到执行编排层、收紧 `session.revision` 递增条件、`rollback/confirm` 增加确认绑定字段 |
| v4.1.6 | 2026-07-03 | 落地前复查——`playwright-cli.adapter.ts` 实为 CLI 子进程架构（`execFile` 调用 `playwright-cli` 二进制，`page.context().storageState()` 在子进程内执行），原计划的 3-way 拆分对 session 基础设施与 action 方法的耦合估计不足；改为"deferred split + additive state methods"路径，详见 §3.4 修订 |

---

## 1. 文档目标

本文回答以下问题：

- 在"固定业务流 + 一次性生成成果物"的约束下，recorder 需要补哪些能力
- 录制期"回退错误步骤"应当实现到什么程度，三种浏览器状态恢复方案如何选择
- 已有的 `ExecutionReconcileService` 三策略（replace/insert/replan）如何从"被动触发"改为"主动触发"
- `RecorderReplayService` 的 `visual-fallback-required` 槽位如何落地实现
- 这三项能力如何按低风险顺序分期落地到现有仓库

---

## 2. 背景与目标约束

### 2.1 用户场景

用户的实际使用模式：

1. 业务流是**固定的**——例如"工单审批"或"采购单录入"，每次跑的步骤集合确定
2. 目标是**生成一次成果物**——一次录制产出可复用的 CLI 脚本 + skill 草稿，不是反复执行
3. 录制过程**会出错**——用户可能点错按钮、填错字段、走错分支
4. 出错后期望的恢复路径：
   - **回退**：把错误的录制步骤从历史里移除，回到出错前的页面状态
   - **多次规划 + 视觉识别**：当录制中 verification 失败，让 AI 自动规划恢复步骤；当文字 grounding 失败，让视觉模型兜底

### 2.2 不在范围内的事项

明确排除以下方向（不属于本次方案）：

- 通用任务规划层（Plan-then-Execute for open-ended tasks）
- MCTS 风格的多路径探索与回溯
- 跨任务 skill RAG 与自学习
- 完整视觉理解（截图→自然语言描述）——仅做视觉 grounding 兜底
- **业务副作用回滚**（详见 §2.4）

### 2.3 与 v4.1 既有设计的关系

本方案是 v4.1 recorder 设计族的后继补充，与以下既有文档相关但**不修改**它们：

- `Enterprise-Skill-Platform_Recorder-Outcome-TypeSpec_v4.1.md`（统一 outcome 协议）
- `Enterprise-Skill-Platform_Recorder-Verification-Rules_v4.1.md`（六类 verifier）
- `Enterprise-Skill-Platform_Recorder-Snapshot-Identity-and-Diff-Rules_v4.1.md`（快照身份与 diff）
- `Enterprise-Skill-Platform_Recorder-Unified-Outcome-and-Snapshot-Reuse-Draft_v4.1.md`（统一结果与快照复用）

本方案复用上述文档已定义的 `RecorderOutcome.verification` / `RecorderArtifacts.snapshotPathBefore` / `RecorderArtifacts.snapshotPathAfter` 等字段，不引入新的协议层。

### 2.4 能力边界声明 🔴

**本方案的 rollback 不是"完整撤销操作"。** 必须明确区分三层恢复语义：

| 恢复层 | 是否本期范围 | 说明 |
|---|---|---|
| history rollback | ✅ 在范围内 | 从 `session.history` 移除错误 turn 及其衍生状态（loopDraft / pendingCapture） |
| browser state restore | ✅ 在范围内（部分） | 恢复 cookies / localStorage / URL；sessionStorage / IndexedDB / SW / Cache 不保证（详见 §4.4 支持矩阵） |
| business side-effect rollback | ❌ **不在范围内** | 后端已 commit 的业务变更（审批提交、表单保存、流程发起、记录删除）**无法通过本方案撤销** |

**产品语义约束**：

- rollback 后用户面对的浏览器状态接近"出错前"，但后端业务状态可能已不可逆改变
- 对 `sideEffectLevel: 'persist'` 的动作（详见 §2.5），rollback 跨越时**强制弹窗告警**，用户必须二次确认
- 告警文案模板："此步骤已触发后端持久化操作（{actionDescription}），浏览器回退不会撤销该操作。后端状态需手动处理或联系管理员。是否继续回退？"

### 2.5 高副作用动作打标 🔴

在 `BrowserCommand` 上增加可选字段：

```ts
interface BrowserCommand {
  // ...existing fields
  sideEffectLevel?: 'none' | 'read' | 'mutate' | 'persist';
}
```

| 级别 | 含义 | 典型动作 | rollback 行为 |
|---|---|---|---|
| `none` | 无副作用 | snapshot / get_text / observe | 直接回退，无告警 |
| `read` | 只读 | navigate / hover / click(查询类) | 直接回退，无告警 |
| `mutate` | 前端状态变化但未持久化 | fill / type_text / click(展开折叠) | 回退时提示"前端状态已变，浏览器恢复中" |
| `persist` | **后端持久化** | click(提交/审批/删除/保存) | **强制告警 + 二次确认** |

**判定机制**：

- 规则层：基于命令描述/目标文本关键词匹配（`/(提交|审批|审批通过|审批驳回|保存|删除|发起|发布|确认|退出登录|审核)/`）
- LLM 层：规则不匹配时调用 LLM 判定（复用 `ExecutionReconcileService` 的 model 调用模式）
- 默认值：无法判定时按 `persist` 处理（保守策略，宁可误报）

**字段来源**：

- AI planner 生成命令时填充
- 录制时人工补录的命令由 `mapPatchStepToCommand` 时填充
- 历史已录制命令无此字段时，rollback 前做一次回溯判定

---

## 3. 当前架构资产评估

### 3.1 已具备但未必被主动调用的资产

#### 3.1.1 `ExecutionReconcileService`（多步规划已实现）

文件：`apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/execution-reconcile.service.ts`

已实现三种失败后恢复策略：

| 策略 | 触发条件（启发式） | 行为 |
|---|---|---|
| `replace_failed_step` | 人工补录与失败动作等价（`areActionsEquivalent`） | 用补录替换失败命令，继续执行后续 |
| `insert_patch_steps` | 补录是前置条件 | 先跑补录，再重试失败命令 |
| `replan_from_current_state` | URL 已变 / 进入新阶段 / 登录态切换 | 丢弃原计划，基于当前 observation 重新规划 |

决策双轨：

- `decideStrategy()` 基于规则（`shouldReplanFromCurrentState` / `shouldReplaceFailedStep`）
- `tryModelDecision()` 调用 LLM 在规则不确定时决策

接入情况：

- 已注入 `RecorderDebugService`（recorder-debug.service.ts:68）
- 已通过 `POST /ai/recorder-debug/reconcile` 端点暴露
- **但**：只在"人工接管后"被动调用，录制中 verification 失败不会自动触发

#### 3.1.2 `RecorderReplayService`（视觉槽位已预留）

文件：`apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder/recorder-replay.service.ts`

4 步 grounding 阶梯：

```
snapshot-ref → semantic-match → relative-position → visual-fallback-required
```

第 4 步 `visual-fallback-required` 在 `resolveCommandTarget` line 128 显式标记：

```ts
// Step 4: visual fallback (deferred — caller must invoke vision grounding)
return {
  command,
  resolutionMode: 'visual-fallback-required',
  reason: 'ref/structure/region all failed; visual grounding is required to resolve target',
};
```

接入情况：

- **未注入** `RecorderDebugService`，未在 `browser.module.ts` providers 列表
- 仅在自身 spec 文件中被引用
- 当前是"已定义但不在 active code path"的状态

#### 3.1.3 快照与状态路径已采集

`RecorderArtifacts`（recorder-debug.types.ts）已包含：

- `snapshotIdBefore` / `snapshotIdAfter`
- `snapshotPathBefore` / `snapshotPathAfter`

每轮 `RecorderDebugOutcomeService.buildArtifacts` 自动填充。**回退到某个历史步骤的"前状态"在数据上是可行的**——只要补齐浏览器执行层的状态恢复能力。

### 3.2 完全缺失的能力

| 能力 | 状态 | 影响 |
|---|---|---|
| 录制期回退（undo） | 完全缺失 | `session.history` 只追加；用户点错只能放弃整个 session 重录 |
| verification 失败自动 reconcile | 缺失（仅有被动版） | 失败后必须用户手动接管，无法自动恢复 |
| 视觉 grounding 实现 | 槽位存在，实现 deferred | 文字 grounding 失败时整条命令卡住 |

### 3.3 关键代码位置参考

- 控制器：`apps/backend/intelligence/ai-orchestrator/src/modules/browser/api/recorder-debug.controller.ts`
- 主服务：`apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug.service.ts`（当前 886 行，接近合理阈值）
- 响应与 history 落盘：`apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-response.service.ts`
- outcome/verification：`apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-outcome.service.ts`
- observation 刷新：`apps/backend/intelligence/ai-orchestrator/src/modules/browser/observe/recorder-debug-observation-refresh.service.ts`
- 执行与恢复：`apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-execution.service.ts`（当前 771 行，接近合理阈值）
- 浏览器适配层：`apps/backend/runtimes/browser-worker/src/modules/browser/adapters/playwright-cli.adapter.ts`（**当前 3049 行，严重超标**）

### 3.4 文件体积现状与拆分需求 🔴

实测行数（2026-07-03）：

| 文件 | 行数 | 项目规范上限 | 状态 |
|---|---|---|---|
| `playwright-cli.adapter.ts` | 3049 | 1200 | 🔴 严重超标 2.5 倍 |
| `recorder-debug.service.ts` | 886 | 800 | 🟡 超标 10% |
| `recorder-debug-execution.service.ts` | 771 | 800 | 🟢 临近阈值 |

**约束：在向超标文件添加新方法之前，必须先拆分，否则会进一步恶化体积问题。**

> **v4.1.6 修订（落地前复查）**：本节原计划的 3-way 文件拆分在落地前发现一项架构事实——`playwright-cli.adapter.ts` 实为 CLI 子进程架构，不持有 in-process Playwright Page/Context 对象。它通过 `execFile` 调用 `playwright-cli` 二进制（line 2783），所有 `page.context().storageState()` / `clearCookies` / `addCookies` 调用都通过 `execCli(sessionId, ['run-code', script])` 在子进程内执行（与 `handleNavigate` line 539 等 20+ 现有 action 方法同模式）。
>
> 这意味着三类方法（session/action/state）的耦合点不是"Page 对象所有权"，而是**共享的 `sessions: Map<string, CliSessionState>` 私有状态 + `execCli` / `getOrCreateSession` / `ensureSessionReady` 私有方法**。原计划"session.adapter / action.adapter / state.adapter 各自独立"的拆分需要解决 sessions map 的归属问题——要么引入公共基类 + protected sessions（破坏当前 sealed 私有边界），要么引入新的 SessionRegistry 服务并迁移所有引用（风险与回报不成比例）。
>
> **修订决策（v4.1.6）**：
>
> - **P0 不做 3-way 拆分**——改为在 `playwright-cli.adapter.ts` 内**追加** 4 个 state 方法（`captureState` / `restoreState` / `cleanupStateFilesAfter` / `cleanupAllStateFiles`），约 80 行，沿用既有 `execCli` + `run-code` 模式
> - **3-way 拆分 defer 到独立后续 PR**——它是 behaviorally neutral 的纯重构，可在 P0 落地后任意时机做，不阻塞 P0
> - **文件体积权衡**：3049 → ~3130 行（+2.6%），仍超标但恶化幅度远小于"拆分引入的 100+ 行新文件 + 50 行 re-export plumbing"
> - **风险权衡**：拆分引入的 sessions map 归属重构风险 ≫ 80 行同模式追加的风险
> - 本修订偏离 §3.4 字面（"必须先拆分"），但符合其精神（"不要让文件无谓膨胀"）
>
> 原 §3.4 拆分需求保留为"P0 落地后的独立重构 PR"参考，但**不再是 P0 的硬前置**。

#### 拆分需求

**P0 前置（必须）**：拆分 `playwright-cli.adapter.ts`

本方案 §5.1 适配层要求在该文件新增 `getStorageState` / `restoreState` 方法，但当前 3049 行已严重超标。建议拆分方向：

| 新文件 | 职责 | 来源方法 |
|---|---|---|
| `playwright-cli-session.adapter.ts` | 会话管理（init/reset/freeze/resume） | 现有 init/reset/freeze/resume 系列 |
| `playwright-cli-action.adapter.ts` | 命令执行（click/type/navigate/screenshot） | 现有 execute 系列 |
| `playwright-cli-state.adapter.ts` | 状态管理（storageState/cookies/localStorage） | **新增 P0 能力的目标文件** |

拆分后 `playwright-cli.adapter.ts` 退化为聚合入口（re-export），保持向后兼容。

**P0 同步评估**：`recorder-debug.service.ts` 是否需要抽 `RecorderDebugRollbackService`

当前 886 行，新增 `rollbackTo` 方法约 60-80 行会突破 950 行。两个选项：

| 选项 | 行为 | 优点 | 缺点 |
|---|---|---|---|
| A. 直接在 `recorder-debug.service.ts` 新增 `rollbackTo` | 方法挂主服务上 | 改动最小 | 主服务继续膨胀 |
| B. 抽取 `RecorderDebugRollbackService` | 新文件 `execute/recorder/recorder-debug-rollback.service.ts` | 主服务不增长；rollback 逻辑内聚 | 改动稍大；需调整 DI |

**推荐选项 B**——`rollbackTo` 涉及 state store + adapter + history 截断 + loop 清理，是独立的责任域，抽取后主服务不增长且便于测试。

`recorder-debug-execution.service.ts`（771 行）本次 P0 不增加方法，暂不拆分。

---

## 4. 浏览器状态恢复方案选择

回退能力的真正难点不是"从 history 弹出最后一轮"——那只是 `session.history.pop()`。难点是**把浏览器恢复到出错前的页面状态**，否则用户回退后面对的依然是错误页面，无法继续录制。

本节列出三种方案，给出对比与选择建议。

### 4.1 三种方案

#### 方案 a：只回退历史，不动浏览器

**行为**：

- `session.history.pop()` 移除最后一个 assistant turn
- 同步清理 `pendingLoopCaptureStartCommandIndex` / `loopDraft` 中依赖该 turn 的状态
- 浏览器保持当前页面不变
- 前端提示用户："已撤销该步录制，请手动回到对应页面后继续录制"

**实现复杂度**：最低（约 100 行后端 + 1 个端点 + 前端按钮）

**回退完整性**：低
- 历史层回退完成
- 浏览器层未回退

#### 方案 b：用 `snapshotPathBefore` 重新导航

**行为**：

- 从被回退 turn 的 `beforeObservation` 中提取 `currentPageUrl`
- 调用 Playwright `page.goto(url)` 回到该 URL
- 表单填写状态丢失（页面是全新加载）
- 认证状态依赖 cookies 是否仍然有效

**实现复杂度**：中（约 250 行后端 + 端点 + 前端按钮 + 适配层 goto 调用）

**回退完整性**：中
- URL 回退完成
- 表单状态丢失
- 认证状态可能失效（取决于 cookies 是否过期）

#### 方案 c：录制时由 browser-worker 持久化 storage state + URL，回退时通过 worker API 恢复

**行为**：

- 每轮进入执行编排层、真正下发浏览器命令之前，由 ai-orchestrator 调用 worker API 触发 `page.context().storageState(...)` 采集
- 状态文件仅在 `browser-worker` 容器内落盘，ai-orchestrator 不感知真实路径
- ai-orchestrator 只保存 `stateHandle + metadata`，逻辑内容仍等价于 `{ url, storageState, snapshotId, timestamp }`
- 回退时：
  1. 读取目标 `executionIndex` 的状态文件
  2. `page.context().clearCookies()` 清空当前 cookies
  3. `page.context().addCookies(state.cookies)` 恢复 cookies
  4. `page.goto(originUrl)` 导航到 origin（用于恢复 localStorage）
  5. `page.evaluate` 写入 localStorage 项
  6. `page.goto(targetUrl)` 导航到目标 URL

**实现复杂度**：中高（约 400 行后端 + 端点 + 前端按钮 + 适配层 storage state API + 状态文件清理）

**回退完整性**：高
- URL 回退完成
- cookies / localStorage 恢复
- 认证状态保持
- 表单字段值不恢复（需用户重填或从快照提取后 fill）

### 4.2 方案对比矩阵

| 维度 | 方案 a | 方案 b | 方案 c |
|---|---|---|---|
| 历史层回退 | ✅ | ✅ | ✅ |
| URL 回退 | ❌ | ✅ | ✅ |
| 认证态保持 | ❌ | 部分 | ✅ |
| 表单字段恢复 | ❌ | ❌ | ❌（需配合快照 fill） |
| localStorage 恢复 | ❌ | ❌ | ✅ |
| 实现复杂度 | 低 | 中 | 中高 |
| 每轮存储成本 | 0 | 0 | 5-50KB JSON |
| 用户手动操作 | 高（需手动导航） | 中（需重填表单） | 低（仅重填非持久字段） |
| 失败可恢复性 | 低（页面错位） | 中（认证失效则废） | 高（认证态保持） |

### 4.3 选择建议：方案 c

**结论：采用方案 c，并保留方案 b 作为跨域 iframe 场景的降级路径。**

#### 4.3.1 选择 c 的理由

**理由 1：业务流固定，且 storage state 采集是录制期一次性开支**

用户明确说明业务流是固定的，且目标是"生成一次成果物"。这意味着：

- **storage state 采集只发生在录制期**——`RecorderStateStoreService.capturePreActionState` 仅在 recorder-debug 的执行编排层触发，导出/回放链路不进入该路径
- **导出后的脚本零开销**——`recorder-script-export.service.ts` 产出的是 `const { chromium } = require("playwright")` 自包含 Node 脚本（line 42），运行时不经过 recorder-debug 的执行编排与状态存储链路，没有 `RecorderStateStoreService`、没有 storage state 采集
- **导出服务只读取 history**——`recorder-template-export.service.ts` 和 `recorder-export-assembly.service.ts` 把 `session.history` 作为输入生成模板/脚本，不依赖 recorder-debug runtime
- 因此这是**每次录制会话的一次性开支**，不是脚本每次执行的开支

固定业务流下单次录制的存储成本：

- 页面集合有限，cookies 与 localStorage 范围有界
- 单轮 storage state JSON 大小通常 5-50KB（企业应用认证态 + 业务缓存）
- 10-20 轮录制总存储 0.5-1MB，且 session 销毁后清理
- 不会出现"开放任务下页面无限膨胀"导致存储失控的情况

**理由 2：回退语义需要完整，否则等同于半成品**

用户原话："错误的录制步骤，希望可以回退"。这暗示用户期望的是真正的回退，不是"回退一半 + 手动收尾"。

- 方案 a 让用户手动导航——违背"回退"的本意，等同于"撤销录制但保留错误现场"
- 方案 b 让用户重填表单——业务流经常涉及表单（审批意见、提单字段），重填等于把错误步骤的副作用留给了用户
- 方案 c 是唯一让用户回退后能直接继续录制的方案

**理由 3：Playwright storage state 是原生 API**

`page.context().storageState({ path })` 和 `clearCookies` / `addCookies` / `page.evaluate` 都是 Playwright 内置能力，无需自研。实现风险可控——遇到 edge case 时 Playwright 社区已有成熟方案。

**理由 4：方案 c 是唯一能处理认证续期的方案**

企业应用通常有登录态过期。用户在录制中点错一步跳到登录页（例如误点退出按钮）后：

- 方案 a：浏览器停在登录页，用户要重新登录
- 方案 b：`page.goto(url)` 会跳到登录页（因为 cookies 失效），用户要重新登录
- 方案 c：通过恢复 cookies 保持登录态，用户可以直接回到目标页面

对固定业务流而言，"录到一半被迫重新登录"等同于整次录制作废——这是方案 c 相对于 a/b 的关键优势。

**理由 5：方案 c 的局限在企业业务流下可接受**

方案 c 不能恢复的状态：

- 滚动位置：不重要，回退后用户会重新定位
- 内存中 JS 状态：业务流通常每步触发后端同步，前端内存状态可由重新加载恢复
- WebSocket 连接：录制器主要做点击/填表触发 REST，不依赖 WS

这些局限与"固定业务流"的执行模式相容——业务流不依赖前端 SPA 内存状态，每次操作都会触发后端持久化。

#### 4.3.2 不选 a / b 的具体原因

**不选 a**：违背用户"希望可以回退"的意图。只回退历史不动浏览器，用户面对的依然是错误页面，无法继续录制——这相当于"撤销了记录但保留了错误结果"，使用价值有限。

**不选 b**：表单状态丢失让回退不完整。固定业务流下表单填写是常见操作（审批意见、提单字段、备注），丢失意味着用户要重填。更严重的是认证态可能失效——一旦 `page.goto` 跳到登录页，整次录制就废了。方案 b 的"中完整性"在实际企业业务流下会退化为方案 a 的"低完整性"。

#### 4.3.3 方案 c 的降级路径

当遇到以下场景时，方案 c 自动降级为方案 b：

- **跨域 iframe**：`storageState` 只覆盖主上下文，不包含跨域 iframe 内的 storage。检测到目标页面有跨域 iframe 时，只回退 URL 并提示用户"iframe 内状态需手动恢复"
- **HttpOnly cookies 未被 storageState 覆盖**：少数情况下 Playwright 可能无法读取某些 HttpOnly cookies。检测到恢复后页面仍跳登录页时，降级提示用户重新登录
- **状态文件丢失**：`/tmp` 被清理或跨容器重启时，状态文件可能丢失。降级为方案 b（仅 URL 回退）

降级策略保证：即使方案 c 的完整恢复失败，回退能力不会完全失效——至少能回到方案 b 的 URL 回退水平。

#### 4.3.4 方案 c 的实现要点

**存储时机（重新定义，修正 off-by-one）** 🔴

**关键修正**：状态采集必须绑在"执行前"，且索引必须使用独立的 `executionIndex`，不能复用 `session.history.length`。

原设计的语义错位：

```
chat() → resolveFlow → executeCommands [状态突变] → observePage →
  pushAssistantTurn {
    captureState(history.length=N) ← 此时状态是执行后，索引却混入 user/assistant turn
    history.push(turn N)
  }
```

这会同时带来两个问题：

- **时机错位**：采集到的是执行后状态，回退到执行前必然 off-by-one
- **索引错位**：`history` 同时包含 user/assistant turn，`history.length` 不是"第几个可回退执行步"

**修正后的时机**：

```
chat() → resolveFlow →
  recorderDebugChatExecutionService.capturePreActionState(executionIndex=N)
    ← 执行前采集，状态确定是"execution N 前"
  executeCommands [状态突变] →
  observePage →
  pushAssistantTurn {
    history.push(assistant turn carrying executionIndex=N)
  }
```

- `executionIndex` 是**独立于 `session.history` 的单调递增执行编号**，建议放在 `session.nextExecutionIndex`
- `preActionState[N]` 语义明确："execution N 执行前的可恢复状态"
- assistant turn 若由一次真实执行产生，应记录其 `executionIndex`
- rollback to N = restore `preActionState[N]` + 删除所有 `executionIndex >= N` 的执行痕迹
- 执行失败时 `preActionState[N]` 仍是上一个稳定态，可直接回退
- 索引与语义对齐，不会再受 user/assistant 混合 history 干扰

**采集位置**：挂到**执行编排层**，不挂到 flow 解析层。推荐入口：

- `RecorderDebugChatExecutionService` 在调用 `BrowserExecutionControllerService.executeAndResolve` 之前触发 `capturePreActionState`
- `RecorderDebugBranchFacade`、follow-up 执行等其他路径若复用 `RecorderDebugChatExecutionService`，则天然共享同一采集时序
- 若未来新增执行入口，必须先接入相同编排层，再允许落浏览器命令；禁止在 `RecorderDebugChatFlowService.resolveFlow` 内采集状态

**状态落盘边界**：

- 真实状态文件由 `browser-worker` 持有，建议落在 `PLAYWRIGHT_CLI_ARTIFACT_DIR` 下级目录，例如 `/backend-var/tmp/browser-worker/recorder-state/{runtimeSessionId}/{executionIndex}.json`
- ai-orchestrator 不保存绝对路径，只保存 `stateHandle`
- `executionIndex` 取自 `session.nextExecutionIndex`，与 `history.length` 解耦；建议从 `1` 开始单调递增
- session 销毁时由 orchestrator 调 worker `cleanup-all`，不做跨容器目录删除

**worker 内部状态文件格式（示意）**：

```json
{
  "executionIndex": 5,
  "timestamp": "2026-07-03T10:30:00.000Z",
  "url": "https://erp.example.com/approvals/pending",
  "storageState": {
    "cookies": [...],
    "origins": [
      {
        "origin": "https://erp.example.com",
        "localStorage": [...]
      },
      {
        "origin": "https://sso.example.com",
        "localStorage": [...]
      }
    ]
  },
  "snapshotId": "runtime-1:5",
  "capturedBefore": "execution-of-step-5"
}
```

**回退流程**（伪代码，已修正多 origin 恢复）：

```ts
async rollbackTo(sessionId: string, targetExecutionIndex: number, confirmation?: {
  sessionRevision: number;
  sideEffectDigest: string;
}) {
  // 1. 读取目标 executionIndex 对应的状态句柄，并通过 worker API 恢复
  const stateHandle = await this.getStateHandle(sessionId, targetExecutionIndex);
  
  // 2. 副作用检查——跨越 persist 级动作时强制告警
  const sideEffects = this.findPersistSideEffectsBetween(
    session.executedCommands,
    targetExecutionIndex,
    (session.nextExecutionIndex || 1) - 1
  );
  if (sideEffects.length > 0) {
    const digest = this.hashSideEffects(sideEffects);
    if (
      !confirmation ||
      confirmation.sessionRevision !== session.revision ||
      confirmation.sideEffectDigest !== digest
    ) {
      return {
        status: 'requires_confirmation',
        targetExecutionIndex,
        sessionRevision: session.revision,
        sideEffectDigest: digest,
        sideEffects,
        message: `回退将跨越 ${sideEffects.length} 个后端持久化操作，浏览器回退不会撤销这些操作。`,
      };
    }
  }
  
  // 3. 截断执行态，而不是直接按 history.length 切片
  session.executedCommands = session.executedCommands.filter(
    (cmd) => (cmd.executionIndex || 0) < targetExecutionIndex
  );
  session.history = session.history.filter((turn) => {
    if (turn.role !== 'assistant') return true;
    if (typeof turn.executionIndex !== 'number') return true;
    return turn.executionIndex < targetExecutionIndex;
  });
  
  // 4. 调 worker 恢复浏览器状态
  const restoreResult = await this.recorderStateStoreService.restoreState(
    sessionId,
    targetExecutionIndex,
    runtimeSessionId
  );
  
  // 5. 恢复失败或部分恢复时，向调用方回传 partial/browserRestoreFailed 状态
  
  // 6. 清理 targetExecutionIndex 及之后的状态文件
  await this.cleanupStateFilesAfter(sessionId, targetExecutionIndex);
  
  // 7. 清理依赖被回退 execution 的 loopDraft / pendingCapture 状态
  this.cleanupLoopStateAfterExecution(session, targetExecutionIndex);
  
  // 8. 回滚成功后推进执行游标并递增 sessionRevision
  session.nextExecutionIndex = targetExecutionIndex;
  session.revision = (session.revision || 0) + 1;
}
```

**P0 第一期接口收敛**：

- 第一期只实现 `rollbackLastStep(sessionId)`——撤销最近一轮
- `rollbackTo(sessionId, targetExecutionIndex)` 留到第二期——任意回退会引入 loopDraft / 条件分支 / 控制符一致性问题
- `rollbackLastStep` 内部等价于 `rollbackTo(sessionId, session.nextExecutionIndex - 1)`，但只暴露单步语义，避免前端误用

### 4.4 storageState 恢复支持矩阵

**in-place patch 模式（P0 采用）** 的覆盖范围：

| 状态类型 | 是否恢复 | 说明 |
|---|---|---|
| cookies | ✅ 完全恢复 | `clearCookies` + `addCookies` |
| localStorage | ✅ 完全恢复 | 遍历 `storageState.origins` 全部恢复 |
| URL | ✅ 完全恢复 | `page.goto(state.url)` |
| sessionStorage | ❌ 不恢复 | Playwright `storageState` 不包含此项 |
| IndexedDB | ❌ 不恢复 | 同上 |
| Service Worker | ❌ 不恢复 | 同上 |
| Cache Storage | ❌ 不恢复 | 同上 |
| 跨域 iframe 内 storage | ❌ 不恢复 | `storageState` 只覆盖主上下文 |
| 内存中 JS 状态 | ❌ 不恢复 | 不可序列化 |
| WebSocket 连接 | ❌ 不恢复 | 不可序列化 |
| 滚动位置 | ❌ 不恢复 | 接受局限 |
| 表单字段值 | ❌ 不恢复 | 可后续从 `beforeObservation.interactiveState.inputs` 提取并 fill |

**局限缓解**：

- sessionStorage / IndexedDB / SW 不恢复：企业业务流通常每步触发后端同步，前端这些状态可由重新加载恢复——录制期可接受
- 跨域 iframe：检测到时降级为方案 b（仅 URL 回退），提示用户 iframe 内状态需手动恢复
- 表单字段值：P1 可选增强——从 `beforeObservation` 提取 value 并在恢复后 fill

**升级路径（P2 之后可选）**：迁移到 "new context with state" 模式——关闭当前 page/context，用 `storageState` 创建新 context。覆盖范围更广（sessionStorage/IndexedDB 在新 context 下重置为干净态），但破坏性更高（page 句柄变化、`runtimeSessionId` 关联失效）。P0 不做此升级。

---

## 5. 实施计划

按低风险顺序分三期落地。每期可在 1-2 个 PR 内完成，互不阻塞。

### 5.1 P0：录制期回退（方案 c）

**目标**：用户可以撤销最近一轮错误录制，浏览器恢复到该轮执行前的状态。

**前置硬条件**（详见 §9.2）：

- ✅ 已确认：**不以共享 volume 为默认前提**，`RecorderStateStoreService` 采用"orchestrator 编排 + worker API 调用 + worker 持有状态文件"边界
- ✅ `playwright-cli.adapter.ts` 3-way 拆分已 defer 到独立后续 PR（**v4.1.6 修订**，详见 §3.4 修订说明）——P0 改为在 adapter 内追加 4 个 state 方法（~80 行，沿用 `execCli` + `run-code` 模式）

**改动点**：

#### 前置：拆分 `playwright-cli.adapter.ts` 🔴

> **v4.1.6 修订**：原计划的 3-way 拆分已 defer 到独立后续 PR。原因是落地前复查发现该 adapter 是 CLI 子进程架构，session/action/state 三类方法共享 `sessions` 私有 map + `execCli` 私有方法，clean split 需要 sessions 归属重构，风险 ≫ 回报。P0 改为在 adapter 内追加 4 个 state 方法（~80 行），详见 §3.4 修订说明。

P0 直接进入以下主体改动；3-way 拆分作为 P0 落地后的独立重构 PR 处理。

#### 后端

2. 新增 `RecorderStateStoreService`（文件：`execute/recorder/recorder-state-store.service.ts`）
   - `capturePreActionState(sessionId, executionIndex, runtimeSessionId)`：调用 worker API 采集 storageState，并登记 metadata
   - `getStateHandle(sessionId, executionIndex)`：读取该执行步对应的状态句柄与 metadata
   - `restoreState(sessionId, executionIndex, runtimeSessionId)`：基于已登记的状态句柄调用 worker API 恢复浏览器状态
   - `cleanupAfter(sessionId, executionIndex)`：通知 worker 清理指定执行步之后的状态文件，并同步删除 metadata
   - `cleanupAll(sessionId)`：session 销毁时通知 worker 全量清理，并清空 metadata
   - **职责边界（已确认）**：本服务不直接读写 browser-worker 容器内文件；负责"session/executionIndex -> stateHandle" 的索引、幂等与错误包装，底层文件生命周期由 worker 持有（详见 §9.2）
   - 依赖：依赖 worker API client 与 session store；不依赖 recorder 其他服务，不在 ai-orchestrator 中引入跨容器文件 IO

3. `RecorderDebugChatExecutionService`（**执行编排层，修正采集位置**）注入 `RecorderStateStoreService`
   - 在调用 `BrowserExecutionControllerService.executeAndResolve` 之前调用 `capturePreActionState`
   - 使用独立 `executionIndex`，不复用 `session.history.length`
   - `RecorderDebugBranchFacade`、follow-up 执行等路径统一复用该执行编排层
   - 采集失败 log warn 后继续——不应阻塞执行

4. `BrowserCommand` 类型增加 `sideEffectLevel?: 'none' | 'read' | 'mutate' | 'persist'` 字段（详见 §2.5）
   - 类型定义在 `intent/browser-command.types.ts`
   - AI planner 生成命令时填充
   - 历史命令无此字段时由 `RecorderDebugRollbackService` 回溯判定

5. 抽取 `RecorderDebugRollbackService`（文件：`execute/recorder/recorder-debug-rollback.service.ts`，**推荐**，详见 §3.4 选项 B）
   - `rollbackLastStep(sessionId)` 方法（**第一期只暴露单步回退**）
   - 内部调用 `rollbackTo(sessionId, session.nextExecutionIndex - 1)`，但只暴露单步语义
   - 调用 `RecorderStateStoreService.getStateHandle` / `restoreState`
   - **副作用检查**：调用 `findPersistSideEffectsBetween` 找跨越的 `persist` 级动作，有则返回 `requires_confirmation`
   - `requires_confirmation` 响应必须带 `targetExecutionIndex` + `sessionRevision` + `sideEffectDigest`
   - 截断 `session.history` 时按 assistant turn 上的 `executionIndex` 过滤，**不能**直接按 `history.length` 切片
   - 清理 `loopDraft` / `pendingLoopCaptureStartCommandIndex`
   - 清理被回退 execution 之后的状态文件
   - 成功回滚后回写 `session.nextExecutionIndex = targetExecutionIndex`
   - **仅在成功提交 chat / rollback / reset 时递增 `session.revision`**——使进行中的异步 reconcile 建议失效
   - 注入到 `RecorderDebugService` 作为代理调用入口

6. `RecorderDebugController` 新增端点
   ```ts
   @Post('rollback')
   @ApiOperation({ summary: 'Rollback recorder last step' })
   async rollback(@Body() body: { sessionId: string }) {
     return this.service.rollbackLastStep(body.sessionId);
   }
   ```
   第一期不暴露 `targetExecutionIndex` 参数（详见 §4.3.4 接口收敛）

7. `RecorderDebugController` 新增端点（副作用确认）
   ```ts
   @Post('rollback/confirm')
   @ApiOperation({ summary: 'Confirm rollback with side-effect awareness' })
   async rollbackConfirm(@Body() body: {
     sessionId: string;
     targetExecutionIndex: number;
     sessionRevision: number;
     sideEffectDigest: string;
     confirmedSideEffects: string[];
   }) {
     return this.service.rollbackLastStep(body.sessionId, {
       targetExecutionIndex: body.targetExecutionIndex,
       sessionRevision: body.sessionRevision,
       sideEffectDigest: body.sideEffectDigest,
       forceAfterConfirmation: true,
     });
   }
   ```

8. `resetSession` 增加状态文件全量清理 + `session.revision` 重置 + `session.nextExecutionIndex` 重置

#### 适配层

9. `PlaywrightCliAdapter`（**追加方法，不新建文件——v4.1.6 修订**）暴露状态恢复能力
   - `captureState(runtimeSessionId, executionIndex)`：调用 `execCli(sessionId, ['run-code', script])` 在子进程内执行 `page.context().storageState()` + `page.url()`，把结果 JSON 落盘到 `PLAYWRIGHT_CLI_ARTIFACT_DIR/recorder-state/{runtimeSessionId}/{executionIndex}.json`，返回 `{ stateHandle, url, capturedAt }`
   - `restoreState(runtimeSessionId, stateHandle)`：读取状态文件，子进程内执行 `clearCookies` + `addCookies` + 遍历所有 origin 恢复 localStorage + `goto(url)`
   - `cleanupStateFilesAfter(runtimeSessionId, executionIndex)` / `cleanupAllStateFiles(runtimeSessionId)`：worker 负责清理本地状态文件
   - 跨域 iframe 场景检测到无法恢复时返回 `{ restored: true, partial: true, reason: 'cross-origin-iframe' }`
   - `stateHandle` 是 opaque token（如 `rw:{runtimeSessionId}:{executionIndex}:{timestamp}`），orchestrator 不解析

#### 前端

10. `AIControls.tsx` 或 `LoopRecordingPanel.tsx` 增加"撤销上一步"按钮
    - 调用 `/ai/recorder-debug/rollback`
    - 处理 `requires_confirmation` 响应——缓存 `targetExecutionIndex` / `sessionRevision` / `sideEffectDigest`，展示副作用列表，用户确认后调用 `/rollback/confirm`
    - 处理 `partial: true` 响应——提示用户 iframe 内状态需手动恢复
    - 回退成功后刷新页面状态

#### 测试

11. `recorder-state-store.service.spec.ts`：单元测试
12. `recorder-debug-rollback.service.spec.ts`：单元测试（mock state store + adapter + side-effect detector）
13. `recorder-debug.controller.spec.ts` 增加 rollback 端点测试
14. 端到端测试：录制 3 步 → 回退最后 1 步 → 验证 history 长度 + 浏览器 URL + cookies
15. **新增**：副作用告警测试——录制包含 `persist` 级动作 → 回退跨越该动作 → 验证返回 `requires_confirmation` 且不执行
16. **新增**：并发测试——异步 reconcile 进行中触发 rollback → 验证 `session.revision` 递增且旧 `pendingRecoverySuggestion` 失效

**降级处理**：

- 状态文件丢失：返回 404 + 提示"无可回退状态"
- 跨域 iframe：返回 200 + `partial: true` + 提示 iframe 内状态需手动恢复
- 适配层恢复失败：回退 history 但返回 `browserRestoreFailed: true` + 提示用户手动导航
- 副作用未确认：返回 `requires_confirmation`，不执行任何变更

### 5.2 P1：verification 失败自动触发 reconcile

**目标**：录制中 verification 失败时自动调用 `ExecutionReconcileService`，产出恢复命令候选，用户可在前端采纳/修改/取消。

**改动点**：

1. `RecorderDebugResponseService.createChatResponse` 增加 post-response hook
   - 检查 `outcome.verification.success`
   - 如果 `=== false` 且 `kind === 'action'`，调用 `executionReconcileService.reconcile`
   - 把 `failedCommand` 设为 `commands[0]`
   - 把 `observation` 设为当前 observation
   - `originalCommands` 设为 `commands`
   - `patchSteps` 暂为空（让 LLM 决定 `replan_from_current_state`）

2. **异步路径**：`createChatResponse` 立即返回主响应，reconcile 在后台执行
   - reconcile 完成后把结果写入 `session.pendingRecoverySuggestion`（新字段）
   - **复用现有 `GET /ai/recorder-debug/:sessionId` 轮询机制**——前端已有的 session 详情轮询会自动带上 `pendingRecoverySuggestion`
   - 前端拿到后展示恢复建议，用户操作后清空 `session.pendingRecoverySuggestion`
   - **不引入 SSE channel**——避免新增持久连接基础设施

3. **sessionRevision 版本戳机制** 🔴（防止旧建议覆盖新状态）

   `session` 增加 `revision: number` 字段，在以下事件时递增：
   - chat **成功提交**（assistant turn 入 history 且 session 持久化完成）
   - rollback **成功提交**（history/执行态截断完成）
   - reset

   **不递增的场景**：
   - `refreshObservationAfterExecution`
   - 纯 observation 刷新
   - `requires_confirmation` 返回但尚未真正执行 rollback

   `pendingRecoverySuggestion` 必须包含：

   ```ts
   {
     sourceExecutionIndex: number; // 哪一轮执行失败产生的
     sourceFailureId: string;      // 失败的唯一 ID（outcome.verification.failureId 或 hash）
     sessionRevision: number;      // 产生时的 session 修订号
     createdAt: string;            // ISO timestamp
     strategy: 'replace_failed_step' | 'insert_patch_steps' | 'replan_from_current_state';
     explanation: string;
     confidence: number;
     resumeCommands: BrowserCommand[];
   }
   ```

   **写入前校验**：reconcile 完成准备写入时，若 `session.revision !== 产生时的 revision`，直接丢弃——不写入，不覆盖更新的状态。

   **前端展示前校验**：前端从轮询拿到 `pendingRecoverySuggestion` 时，若 `sessionRevision !== currentSessionRevision`，自动丢弃，不展示给用户。

4. 响应体增加字段
   ```ts
   {
     ...existingFields,
     recoverySuggestion?: {
       sourceExecutionIndex: number;
       sourceFailureId: string;
       sessionRevision: number;
       createdAt: string;
       strategy: ...;
       explanation: string;
       confidence: number;
       resumeCommands: BrowserCommand[];
     }
   }
   ```
   `GET /:sessionId` 响应也带上 `pendingRecoverySuggestion`（若存在且 revision 匹配）

5. 前端 `AIControls.tsx` 增加恢复建议展示
   - 从 session 轮询响应中读取 `pendingRecoverySuggestion`
   - **校验 `sessionRevision`**——不匹配则丢弃
   - 显示 `strategy` + `explanation`
   - 三个按钮：「采纳并执行」「编辑后执行」「取消」
   - 采纳时把 `resumeCommands` 作为下一轮 chat 的候选
   - 任意按钮点击后调用清除接口（或下次 chat 自动覆盖）

6. 测试：构造一个 verification 失败的 outcome，验证 reconcile 异步触发 + 轮询可读到 `pendingRecoverySuggestion`

7. **新增并发测试**：reconcile 进行中触发 rollback / 新 chat / reset → 验证：
   - `session.revision` 递增
   - 旧 `pendingRecoverySuggestion` 被丢弃（不写入 / 不展示）
   - 进行中的 reconcile 在 cancel 信号到达前完成时，写入被 revision 校验拦截

**风险**：

- 增加 LLM 调用：reconcile 内部 `tryModelDecision` 会调一次 LLM。异步路径下不阻塞主响应，但需要超时保护——reconcile 超过 10s 未完成时回写 `pendingRecoverySuggestion = { error: 'timeout', sessionRevision }`
- 轮询间隔：前端已有的轮询频率决定恢复建议的可见延迟。如需更快可见，可在 `createChatResponse` 响应头加 `X-Recovery-Pending: true`，前端收到后立即触发一次 `GET /:sessionId` 而非等下次轮询
- 并发：用户在 reconcile 还在跑时继续发 chat / 触发 rollback / 触发 reset，应取消正在进行的 reconcile（避免旧建议覆盖新状态）——通过 sessionRevision 校验兜底，即使 cancel 信号丢失也不会污染状态

### 5.3 P2：视觉 grounding 兜底实现

**目标**：解冻 `RecorderReplayService` 的 `visual-fallback-required` 槽位，让前 3 步 grounding 失败时由视觉模型兜底。

**改动点**：

1. `browser.module.ts` 把 `RecorderReplayService` 加入 providers（当前完全缺席，详见 §3.1.2）
2. `RecorderDebugService` / `BrowserExecutionControllerService` 注入 `RecorderReplayService`
3. `BrowserExecutionControllerService.executeAndResolve` 恢复路径接入 replay
   - 当 selector 重试也失败时，调用 `recorderReplayService.resolveReplayPlan(commands, observation)`
   - 对 `visual-fallback-required` 的命令触发视觉 grounding

4. 新增 `VisualGroundingService`（文件：`intent/ai-planner/visual-grounding.service.ts`）
   - `ground(command, observation, screenshotPath)`：调用视觉模型
   - 输入：失败 selector 描述 + before/after 截图 + observation.buttons
   - 输出：`{ boundingBox: { x, y, width, height }, confidence: number, matchedText?: string }`
   - **不直接调用 `page.click`**——必须先经过 §5.3 第 8 项的"点击前二次校验"

5. 视觉模型选型
   - **采用系统默认高级模型**——`ModelService.getPreferredDefaultModel({ mode: 'task', userRoles: [] })` 返回的模型已支持视觉（多模态）
   - 无需指定特定 vision 模型 ID，复用 `ExecutionReconcileService.tryModelDecision` 的调用模式
   - 输入图像为 base64 编码的 PNG，作为 `content` 数组的 `image` block 传入
   - 若 `ModelService` 当前未配置多模态模型，需先在 `ModelService` 配置层确认默认模型的多模态能力（不引入新依赖）

6. 截图采集
   - `recorder-debug-observation-refresh.service.ts` 在 `observePage` 末尾增加截图采集
   - 截图路径加入 `RecorderDebugObservation.screenshotPath`
   - 截图路径加入 `RecorderArtifacts.screenshotPathBefore` / `screenshotPathAfter`

7. 测试
   - 单元：`visual-grounding.service.spec.ts` mock 模型返回，验证 bounding box 解析
   - 集成：构造一个文字 grounding 失败的场景，验证视觉兜底触发

8. **点击前二次校验** 🔴（硬阈值，不可省略）

   视觉模型返回 bbox 后，执行 click 前必须依次通过以下校验，任一失败则返回 `unresolved`，**不点击**：

   ```ts
   async function validateAndClick(bbox, command, page): Promise<{ clicked: boolean; reason?: string }> {
     const centerX = bbox.x + bbox.width / 2;
     const centerY = bbox.y + bbox.height / 2;
     
     // 校验 1：bbox 中心点附近存在可交互元素
     const element = await page.evaluate(([x, y]) => {
       const el = document.elementFromPoint(x, y) as HTMLElement | null;
       if (!el) return null;
       const rect = el.getBoundingClientRect();
       return {
         tag: el.tagName.toLowerCase(),
         role: el.getAttribute('role'),
         text: (el.textContent || '').trim().slice(0, 100),
         isVisible: rect.width > 0 && rect.height > 0,
         isDisabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
         rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
       };
     }, [centerX, centerY]);
     
     if (!element) return { clicked: false, reason: 'no-element-at-bbox-center' };
     if (!element.isVisible) return { clicked: false, reason: 'element-not-visible' };
     if (element.isDisabled) return { clicked: false, reason: 'element-disabled' };
     
     // 校验 2：元素 role/tag 与命令工具类型一致
     const expectedRoles = command.tool === 'click'
       ? ['button', 'link', 'a', 'button', 'tab', 'menuitem']
       : command.tool === 'fill'
         ? ['textbox', 'input', 'textarea', 'searchbox']
         : [];
     if (expectedRoles.length && !expectedRoles.includes(element.role || element.tag)) {
       return { clicked: false, reason: `role-mismatch: expected ${expectedRoles.join('/')}, got ${element.role || element.tag}` };
     }
     
     // 校验 3：元素文本/role 与命令意图大体一致（如命令是 click "提交"，元素文本应包含"提交"或同义词）
     const intentText = command.params?.text || command.locator?.value || command.params?.target || '';
     if (intentText && element.text) {
       const intent = intentText.trim().toLowerCase();
       const actual = element.text.trim().toLowerCase();
       if (!actual.includes(intent) && !intent.includes(actual)) {
         return { clicked: false, reason: `text-mismatch: intent "${intentText}", actual "${element.text}"` };
       }
     }
     
     // 校验 4：模型置信度阈值
     if (bbox.confidence < 0.7) {
       return { clicked: false, reason: `low-confidence: ${bbox.confidence}` };
     }
     
     // 全部通过——执行点击
     await page.mouse.click(centerX, centerY);
     return { clicked: true };
   }
   ```

   **黑名单兜底**：即使校验通过，若元素文本/role 命中以下黑名单，仍拒绝点击并返回 `unresolved`：

   ```
   /(删除|delete|remove)|退出登录|sign\s*out|log\s*out|注销|销毁|destroy|清除数据|reset\s*all/i
   ```

   这是最后一道防线——防止视觉模型把"删除"按钮误识别为"提交"按钮。

9. **视觉 grounding 失败的降级**

   - 二次校验任一失败 → 返回 `unresolved`，不点击
   - 调用方（`BrowserExecutionControllerService`）收到 `unresolved` 后，按现有失败路径处理——触发 reconcile 或返回用户接管提示
   - **绝不盲目点击**——宁可让用户手动接管，也不点错位置

**风险**：

- 视觉模型成本：每次兜底调用都是多模态模型调用——成本和延迟都高于文字 grounding
- 必须严格限定在"前 3 步全部失败"时才触发
- 跨容器截图：Playwright 在 browser-worker 容器内截图，需要确保截图文件可被 ai-orchestrator 读取（共享 volume 或通过现有 adapter API 传输 base64）
- **点击前二次校验是硬阈值**——不可省略，不可降级为"日志告警后仍点击"

---

## 6. 风险与权衡

### 6.1 方案 c 的已知局限

| 局限 | 缓解 |
|---|---|
| 跨域 iframe storage 不在 storageState 范围 | 检测到 iframe 时降级为方案 b，提示用户 iframe 内状态需手动恢复 |
| HttpOnly cookies 可能未被 storageState 完整覆盖 | 恢复后验证页面是否跳登录，若跳则降级提示重新登录 |
| `/tmp` 跨容器重启可能丢失 | 可选：把状态文件路径改为持久 volume；默认接受丢失，降级为方案 b |
| 表单字段值不恢复 | 接受局限；如需恢复，可后续从 `beforeObservation.interactiveState.inputs` 提取 value 并 fill |

### 6.2 P1 自动 reconcile 的延迟权衡

- 同步路径：用户每次看到 verification 失败都要等 LLM 决策完成才能继续——延迟可能 1-3 秒
- 异步路径：响应快但前端要处理"恢复建议后到"的状态——增加复杂度
- **决定采用异步路径 + 现有 session 轮询**：
  - `createChatResponse` 立即返回主响应
  - reconcile 在后台执行，完成后写入 `session.pendingRecoverySuggestion`
  - 前端通过现有 `GET /ai/recorder-debug/:sessionId` 轮询读取该字段
  - **不引入 SSE channel**——避免新增持久连接基础设施与运维成本
  - 若需降低可见延迟，可在响应头加 `X-Recovery-Pending: true`，前端收到后立即触发一次轮询
  - 超时保护：reconcile 超过 10s 未完成时回写 `pendingRecoverySuggestion = { error: 'timeout' }`
  - 并发保护：用户在 reconcile 还在跑时继续发 chat，应取消正在进行的 reconcile

### 6.3 P2 视觉 grounding 的成本权衡

- 每次视觉兜底都是多模态模型调用——成本和延迟都高于文字 grounding
- 必须严格限定在"前 3 步全部失败"时才触发
- 视觉模型返回的 bounding box 不准时，必须降级为 `unresolved` 而不是盲目点击——避免点错位置引发更严重副作用
- **采用系统默认高级模型**（已支持多模态），无需引入新模型依赖；通过 `ModelService.getPreferredDefaultModel` 获取

### 6.4 不引入 MCTS 的理由

用户目标是"固定业务流一次性生成成果物"，不是"开放任务的最优路径探索"。AgentQ 式 MCTS 适合：

- 任务空间开放，每步有多种合理动作
- 失败后需要尝试不同路径
- 有 reward model 评估路径质量

固定业务流下：

- 任务空间确定，每步"对的下一步"通常唯一
- 失败后有明确的恢复路径（replace / insert / replan 三选一即可）
- 不需要 reward model——`RecorderVerification` 已经是结构化判分

引入 MCTS 会增加：

- 执行树存储与回溯成本
- 多次 LLM 调用做节点扩展
- 复杂的回溯后状态恢复（比单步回退难得多）

**结论**：固定业务流场景下，`ExecutionReconcileService` 三策略已足够，MCTS 是过度设计。

---

## 7. 落地清单

### 7.1 P0 落地清单（录制期回退）

**前置 0：按已确认边界落地 worker-owned state store**（P0 启动硬条件，详见 §9.2）

- [ ] 在 `browser-worker` 增加状态接口：`/browser/state/capture` / `/restore` / `/cleanup-after` / `/cleanup-all`
- [ ] 在 ai-orchestrator 定义 `stateHandle + metadata` 索引模型，不保存 worker 绝对路径
- [ ] 明确 worker 内部状态目录位于 `PLAYWRIGHT_CLI_ARTIFACT_DIR` 下级目录，并补清理策略

**前置 1：`playwright-cli.adapter.ts` 拆分**（**v4.1.6 修订：defer 到独立后续 PR**）

- [~] ~~抽取 `playwright-cli-session.adapter.ts`（init/reset/freeze/resume）~~ — defer
- [~] ~~抽取 `playwright-cli-action.adapter.ts`（click/type/navigate/screenshot）~~ — defer
- [ ] 在 `playwright-cli.adapter.ts` 内追加 `captureState` / `restoreState` / `cleanupStateFilesAfter` / `cleanupAllStateFiles` 方法（~80 行，沿用 `execCli` + `run-code` 模式，**不新建文件**）
- [~] ~~`playwright-cli.adapter.ts` 退化为聚合入口（re-export）~~ — defer
- [ ] 追加方法前后行为等价性测试（state 方法仅追加，不修改既有方法）

> 拆分 defer 的依据：adapter 实为 CLI 子进程架构，session/action/state 共享 `sessions` 私有 map + `execCli`，clean 3-way split 需 sessions 归属重构，风险 ≫ 回报。详见 §3.4 修订。

**P0 主体**

- [x] `BrowserCommand` 类型增加 `sideEffectLevel?: 'none' | 'read' | 'mutate' | 'persist'`（详见 §2.5）
- [x] 新增 `RecorderStateStoreService`（`execute/recorder/recorder-state-store.service.ts`，按已确认的 worker API 边界实现）
- [x] `session.nextExecutionIndex` 字段与 assistant turn `executionIndex` 元数据（独立于 `history.length`）
- [x] `RecorderDebugChatExecutionService` 在 `executeAndResolve` 前调用 `capturePreActionState`（**执行编排层统一采集**，详见 §4.3.4）
- [x] 新增 `RecorderDebugRollbackService`（`execute/recorder/recorder-debug-rollback.service.ts`，选项 B）
- [x] `RecorderDebugRollbackService` 实现副作用检查 `findPersistSideEffectsBetween`
- [x] `RecorderDebugService` 注入 `RecorderDebugRollbackService` 作为代理调用入口
- [x] `PlaywrightCliAdapter` 暴露 `captureState` / `restoreState`（**追加方法，不新建文件——v4.1.6 修订**，遍历所有 origin）
- [x] `POST /ai/recorder-debug/rollback` 端点（**只暴露 `rollbackLastStep`，不暴露 `targetExecutionIndex`**）
- [x] `POST /ai/recorder-debug/rollback/confirm` 端点（带 `targetExecutionIndex` + `sessionRevision` + `sideEffectDigest` 绑定确认）
- [x] `session.revision` 字段与递增逻辑（仅 chat commit / rollback commit / reset 时递增）
- [x] `resetSession` 增加状态文件全量清理 + `session.revision` / `session.nextExecutionIndex` 重置
- [x] 前端"撤销上一步"按钮（处理 `requires_confirmation` + `partial: true`）
- [x] 单元测试：state store
- [x] 单元测试：rollback service（mock state store + adapter + side-effect detector）
- [ ] 端点测试：rollback + rollback/confirm
- [ ] 端到端测试：3 步录制 → 回退最后 1 步 → 验证 history + URL + cookies + revision 递增
- [x] **新增**：副作用告警测试——录制包含 `persist` 级动作 → 回退跨越该动作 → 验证返回 `requires_confirmation` 且不执行
- [x] **新增**：并发测试——`session.revision` 递增且旧 `pendingRecoverySuggestion` 失效（revision bump 已验证，P1 接入 pendingRecoverySuggestion 后补端到端校验）

### 7.2 P1 落地清单（自动 reconcile，异步 + 现有轮询 + 版本戳）

- [ ] `session` 增加 `revision: number` 字段（若 P0 未做则补做）
- [ ] `RecorderDebugResponseService.createChatResponse` 增加 verification 失败检测
- [ ] 异步触发 `executionReconcileService.reconcile`（不阻塞主响应）
- [ ] 完成后写入 `session.pendingRecoverySuggestion`（带 `sourceExecutionIndex` / `sourceFailureId` / `sessionRevision` / `createdAt`）
- [ ] **写入前校验**：`session.revision !== 产生时 revision` 则丢弃
- [ ] `GET /ai/recorder-debug/:sessionId` 响应带上 `pendingRecoverySuggestion`（带 revision 校验）
- [ ] 响应头 `X-Recovery-Pending: true`（前端收到立即触发一次轮询）
- [ ] 超时保护：reconcile 超过 10s 未完成回写 `{ error: 'timeout', sessionRevision }`
- [ ] 前端展示前校验 `sessionRevision`——不匹配则丢弃
- [ ] 前端展示恢复建议 + 采纳/编辑/取消按钮
- [ ] 测试：verification 失败触发 reconcile
- [ ] 测试：reconcile 失败/超时降级为无建议
- [ ] **新增**：并发测试——reconcile 进行中触发 rollback / 新 chat / reset → 验证旧建议被丢弃

### 7.3 P2 落地清单（视觉 grounding，多模态默认模型 + 点击前二次校验）

- [ ] `browser.module.ts` 注册 `RecorderReplayService`（当前完全缺席）
- [ ] `BrowserExecutionControllerService` 注入 `RecorderReplayService`
- [ ] 恢复路径接入 `resolveReplayPlan`
- [ ] 新增 `VisualGroundingService`（`intent/ai-planner/visual-grounding.service.ts`）
- [ ] 通过 `ModelService.getPreferredDefaultModel` 调用系统默认多模态模型（确认配置）
- [ ] `recorder-debug-observation-refresh.service.ts` 增加截图采集
- [ ] `RecorderDebugObservation` 增加 `screenshotPath`
- [ ] `RecorderArtifacts` 增加 `screenshotPathBefore` / `screenshotPathAfter`
- [ ] 跨容器截图可读性：共享 volume 或 base64 API 传输（P2 启动前确认）
- [ ] 单元测试：visual grounding bbox 解析
- [ ] 单元测试：点击前二次校验（elementFromPoint + role 校验 + 文本匹配 + 置信度阈值）
- [ ] 单元测试：黑名单兜底（删除/退出登录等关键词命中时拒绝点击）
- [ ] 集成测试：文字 grounding 失败 → 视觉兜底触发 → 二次校验通过 → 点击成功
- [ ] 集成测试：视觉 bbox 不准 → 二次校验失败 → 返回 `unresolved` 不点击
- [ ] 视觉失败时降级 `unresolved`，不盲目点击
- [ ] 解冻 memory `project_visual_fallback_deferred.md`

---

## 8. 与既有 v4.1 设计的兼容性

本方案不修改以下既有协议：

- `RecorderOutcome` 类型与 `RecorderOutcomeKind` / `RecorderOutcomeStatus` 枚举
- `RecorderVerification` 与六类 verifier 路由
- `RecorderArtifacts` 现有字段（仅 P2 阶段增加 `screenshotPathBefore/After`）
- `RecorderDebugObservation` 现有字段（仅 P2 阶段增加 `screenshotPath`）
- 控制符系统（`[循环开始]` / `[循环结束]` / `[条件分歧]` / `[循环对象:xxx]` / `[人工介入:label|...]`）
- loopDraft 结构与 `splitRecordedCommandsForExport` 分裂逻辑

本方案新增的字段与端点：

- 端点：`POST /ai/recorder-debug/rollback`
- 端点：`POST /ai/recorder-debug/rollback/confirm`
- 响应字段（P1）：`recoverySuggestion`
- session / assistant turn 内部字段：`nextExecutionIndex` / `executionIndex`
- observation 字段（P2）：`screenshotPath`
- artifacts 字段（P2）：`screenshotPathBefore` / `screenshotPathAfter`

所有新增均为可选字段，不破坏现有前端契约。

---

## 9. 待审查决策点

决策 1、3、4、5 已确认（2026-07-03）。请审查仍待确认的决策与新增实现细节问题，确认后开始 P0 实施：

1. ~~**方案 c 的选择是否认可**——尤其"每轮存 storage state 5-50KB"的成本是否可接受~~  
   **已确认**：storage state 采集仅在录制期发生，导出的 CLI 脚本是自包含 Playwright 脚本（`const { chromium } = require("playwright")`），运行时不经过 recorder-debug 链路，无任何采集开销。属于每次录制会话的一次性开支，可接受。

2. ~~**状态文件路径 `/tmp/recorder-state/{sessionId}/`** 是否认可——还是希望走持久 volume~~  
   **已确认**：**不把 browser-worker 与 ai-orchestrator 的共享 volume 作为默认前提**，采用 **worker-owned state store + worker API**。  
   确认依据：
   - `docker-compose.base.yml` 中，`browser-worker` 挂载 `${PROJECT_ROOT}/apps/backend/var/tmp/browser-worker:/backend-var/tmp/browser-worker`，但 `ai-orchestrator` 未挂载该目录
   - `docker-compose.runtime.yml` 与 `docker-compose.planner.yml` 按层拆分运行时，进一步说明两者不应依赖跨容器直接文件访问
   - 当前 ai-orchestrator 与 browser-worker 已通过 HTTP API 交互（如 `/browser/execute`、`/browser/inspect-state`），现有架构天然偏向 RPC 边界而非共享文件系统
   设计结论：
   - `browser-worker` 负责状态文件的采集、落盘、恢复、清理，文件路径只在 worker 内部可见
   - `ai-orchestrator` 不直接读取容器内路径，不持有绝对文件路径，只保存 `stateHandle` / metadata 索引
   - 若未来为了运维或排障需要增加共享挂载，可作为优化项，但**不改变服务边界**

3. ~~**P1 用异步路径**（响应先返回，reconcile 后到）是否认可——还是希望同步等 LLM 完成~~  
   **已确认**：采用异步路径 + 现有 `GET /:sessionId` 轮询机制，**不引入 SSE channel**。reconcile 完成后写入 `session.pendingRecoverySuggestion`，前端轮询读取。响应头 `X-Recovery-Pending: true` 触发立即轮询以降低可见延迟。超时 10s 回写 `{ error: 'timeout' }`。

4. ~~**P2 视觉模型选 Claude vision** 是否认可——还是希望对接其他模型~~  
   **已确认**：采用系统默认高级模型（已支持多模态）。通过 `ModelService.getPreferredDefaultModel({ mode: 'task', userRoles: [] })` 获取，与 `ExecutionReconcileService.tryModelDecision` 调用模式一致。无需引入新模型依赖。P2 启动时确认 `ModelService` 配置层默认模型的多模态能力即可。

5. ~~**不引入 MCTS** 的判断是否认可——还是希望在 P2 之后预留 MCTS 扩展点~~  
   **已确认**：不引入 MCTS。固定业务流场景下 `ExecutionReconcileService` 三策略（replace / insert / replan）已足够，MCTS 是过度设计。不预留扩展点——若未来出现开放任务需求，应另起方案而非在此方案上扩展。

### 9.1 新增决策点（来自审查反馈）

6. **`playwright-cli.adapter.ts` 拆分方案是否认可**  
   该文件当前 3049 行，严重超标 2.5 倍。建议拆为 `playwright-cli-session.adapter.ts` / `playwright-cli-action.adapter.ts` / `playwright-cli-state.adapter.ts`，原文件退化为聚合入口。**P0 必须先拆分再加新方法**——详见 §3.4。是否认可此拆分方向？是否有既定的拆分计划需要协调？

7. **`recorder-debug.service.ts` 是否抽 `RecorderDebugRollbackService`**  
   该文件当前 886 行，新增 `rollbackTo` 约 60-80 行会突破 950 行。建议选项 B（抽取 `RecorderDebugRollbackService` 到 `execute/recorder/recorder-debug-rollback.service.ts`），主服务不增长且便于测试。是否认可？还是倾向选项 A（直接挂主服务）？

### 9.2 已确认的实现边界

#### 9.2.1 结论：不依赖共享 volume，采用 worker API 边界

**确认结论**：P0 按 **"worker-owned state store + orchestrator metadata index + worker API restore"** 设计，不采用 ai-orchestrator 直接文件 IO。

**原因**：

- 当前 `docker-compose.base.yml` 中，`browser-worker` 独占挂载 `${PROJECT_ROOT}/apps/backend/var/tmp/browser-worker:/backend-var/tmp/browser-worker`，`ai-orchestrator` 未挂载同一路径
- `docker-compose.runtime.yml` 的 `browser-worker` 甚至未挂载任何与 `ai-orchestrator` 共用的临时目录；`docker-compose.planner.yml` 单独启动 `ai-orchestrator` 时也未声明该目录，说明服务边界设计上不应默认依赖共享文件系统
- 现有 recorder 执行链路已通过 `BROWSER_WORKER_URL` 调用 worker HTTP 接口，新增状态能力延续同一边界最稳
- `browser-worker` 当前已有 `POST /browser/execute`、`POST /browser/inspect-state` 与 `GET /browser/artifacts/:filename` 等接口，文件生成与服务暴露均在 worker 内部完成，符合"文件归 worker 持有"的既有模式

#### 9.2.2 `RecorderStateStoreService` 职责边界（确认版）

`RecorderStateStoreService` 不再定义为"跨容器文件读写服务"，而是定义为 **状态索引与编排服务**：

- 负责维护 `sessionId + executionIndex -> stateHandle + metadata` 的映射
- 负责调用 worker API 触发 capture / restore / cleanup
- 负责把 worker 返回的 `url` / `capturedAt` / `partial` / `reason` 等信息登记到 session metadata
- 不持有 worker 容器内的绝对路径，不直接 `fs.readFile` worker 目录

建议 metadata 结构：

```ts
interface RecorderStoredStateMeta {
  sessionId: string;
  executionIndex: number;
  runtimeSessionId: string;
  stateHandle: string; // opaque handle, e.g. "rw:session-1:step-5:1720000000"
  url?: string;
  snapshotId?: string;
  capturedAt: string;
  partial?: boolean;
  reason?: string;
}
```

#### 9.2.3 browser-worker 新增 API（确认版）

由 `browser-worker` 持有状态文件生命周期，建议新增以下接口：

```ts
POST /browser/state/capture
{
  runtimeSessionId: string;
  executionIndex: number;
}
-> {
  stateHandle: string;
  url?: string;
  capturedAt: string;
}

POST /browser/state/restore
{
  runtimeSessionId: string;
  stateHandle: string;
}
-> {
  restored: boolean;
  partial?: boolean;
  reason?: string;
  url?: string;
}

POST /browser/state/cleanup-after
{
  runtimeSessionId: string;
  executionIndex: number;
}

POST /browser/state/cleanup-all
{
  runtimeSessionId: string;
}
```

约束：

- `stateHandle` 必须是 opaque token，**不能**把 worker 容器内绝对路径暴露给 ai-orchestrator
- worker 内部可把真实文件落在 `PLAYWRIGHT_CLI_ARTIFACT_DIR` 或其下级目录，例如 `/backend-var/tmp/browser-worker/recorder-state`
- cleanup 以 `runtimeSessionId + executionIndex` 为主键，避免 orchestrator 需要理解 worker 内部路径结构

**实现风格约束**：

- 新接口沿用现有 `BrowserController` 的 `/browser/*` 风格，不额外引入新的微服务
- ai-orchestrator 侧继续通过 `BROWSER_WORKER_URL` + HTTP client 调用，和现有 `executeBrowserCommandBatch()` 的模式一致
- 若恢复结果为部分成功，worker 返回 `{ restored: true, partial: true, reason }`，由 orchestrator 透传给前端显示降级提示

#### 9.2.4 仍需确认的非阻塞问题

- **前端是否已有 session 轮询机制**——P1 计划复用，若不存在则需新建轮询（但成本远低于 SSE channel）
- **`RecorderDebugExecutionService`（771 行）是否在 P0 范围内同步拆分**——本方案不动该文件，但若 P0 顺手拆分可避免未来再处理

### 9.3 第三、第四轮审查新增决策点

8. **高副作用动作打标是否认可**  
   `BrowserCommand` 增加 `sideEffectLevel: 'none' | 'read' | 'mutate' | 'persist'` 字段（详见 §2.5）。rollback 跨越 `persist` 级动作时强制告警 + 二次确认。判定机制：规则层关键词匹配 + LLM 兜底，无法判定时按 `persist` 保守处理。是否认可此字段与告警机制？

9. **P0 接口收敛为 `rollbackLastStep` 是否认可**  
   第一期只暴露 `POST /rollback`（撤销最近一轮），不暴露 `targetExecutionIndex` 参数。`rollbackTo` 任意节点回退留到第二期——避免 loopDraft / 条件分支 / 控制符一致性问题。是否认可此收敛？

10. **`session.revision` 版本戳机制是否认可**  
    `session` 增加 `revision: number`，仅在 chat commit / rollback commit / reset 时递增，不在纯 observation refresh 时递增。`pendingRecoverySuggestion` 带 `sessionRevision`，写入前与展示前双重校验。是否认可此并发控制机制？

11. **点击前二次校验是否认可**  
    P2 视觉 grounding 返回 bbox 后，必须依次通过：elementFromPoint 查询 / role 一致性 / 文本匹配 / 置信度阈值 / 黑名单兜底。任一失败返回 `unresolved` 不点击。是否认可此硬阈值？

12. **storageState 恢复采用 in-place patch 而非 new context 是否认可**  
    P0 采用 in-place patch（clearCookies + addCookies + 遍历所有 origin 恢复 localStorage）。覆盖范围有限（不支持 sessionStorage/IndexedDB/SW/Cache，详见 §4.4 支持矩阵）。P2 之后可选升级到 new context 模式。是否认可此 P0 选择？

13. **独立 `executionIndex` 是否认可**  
    rollback、状态文件索引、`pendingRecoverySuggestion.sourceExecutionIndex` 全部改用独立于 `session.history` 的执行编号（建议 `session.nextExecutionIndex` 单调递增），不再复用 `history.length`。是否认可此索引模型？

14. **`rollback/confirm` 绑定确认字段是否认可**  
    `/rollback` 返回 `requires_confirmation` 时携带 `targetExecutionIndex` / `sessionRevision` / `sideEffectDigest`；前端确认时必须原样回传到 `/rollback/confirm`，后端校验匹配后才允许强制执行。是否认可此确认协议？
