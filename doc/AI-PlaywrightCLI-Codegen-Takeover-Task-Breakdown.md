# AI + Playwright CLI + Codegen Hybrid Takeover Task Breakdown

日期：2026-05-20

## 1. 文档目的

本文将 takeover 方案拆解到可执行任务粒度，目标是支持以下工作：

- 直接创建 issue / task
- 明确 P0 / P1 / P2 边界
- 安排并行开发顺序
- 定义每项任务的依赖关系和验收标准

本文默认基于以下三份设计文档：

- `doc/AI-PlaywrightCLI-Codegen-Takeover-Design.md`
- `doc/AI-PlaywrightCLI-Codegen-Takeover-Implementation-Plan.md`
- `doc/AI-PlaywrightCLI-Codegen-Takeover-DTO-and-Pseudocode.md`

## 2. 里程碑定义

### M1：P0 最小闭环可用

目标：

- AI 执行失败后可以进入人工接管
- 停止接管后可以拿到 patch steps
- 可以基于当前 observation 继续执行

上线标准：

- 至少支持 click/fill 类失败恢复
- 前后端接口可联调
- UI 可完成接管和恢复

### M2：P1 自动恢复策略

目标：

- 自动判断 `replace_failed_step` / `insert_patch_steps` / `replan_from_current_state`
- 减少用户手动判断负担

上线标准：

- 至少覆盖登录失败、弹窗遮挡、错误点击三类常见场景

### M3：P2 无缝接管体验

目标：

- takeover 更接近同一条执行流中的自然接管
- 审计、可视化和体验更完善

上线标准：

- UI 中可回看接管记录
- 状态流更稳定
- 用户感知接管成本更低

## 3. 团队分工建议

可按以下角色拆分：

- `Runtime / Browser Worker`
  - 负责 takeover 控制器、编排、录制桥接、session 状态
- `AI Orchestrator`
  - 负责 reconcile、resume plan、恢复 prompt
- `Frontend / Portal`
  - 负责失败态、接管态、恢复态 UI 和 API 联调
- `QA / Integration`
  - 负责关键场景联调与回归用例

建议 owner 只是参考，可按团队实际情况调整。

## 4. P0 任务拆解

## P0-A：定义类型与协议

### 任务说明

补充 takeover 相关 DTO、状态枚举、错误码，形成后续开发统一接口约束。

### 产出

- `takeover.types.ts`
- DTO interface
- 错误码定义

### 建议 owner

- Runtime / Browser Worker

### 优先级

- `P0 / Highest`

### 前置依赖

- 无

### 验收标准

- 文档中的 DTO 和实际代码定义一致
- `StartTakeoverRequest`、`StopTakeoverResponse`、`ResumeAfterTakeoverRequest` 可直接被 controller 使用

## P0-B：新增 TakeoverController

### 任务说明

在 `browser-worker` 新增 takeover HTTP 接口，作为前端接管流程入口。

### 产出

- `POST /browser/takeover/start`
- `POST /browser/takeover/stop`
- `POST /browser/takeover/resume`
- `GET /browser/takeover/:runtimeSessionId`

### 建议 owner

- Runtime / Browser Worker

### 优先级

- `P0 / Highest`

### 前置依赖

- `P0-A`

### 验收标准

- controller 可独立启动
- DTO 校验通过
- swagger 或接口定义可读

## P0-C：实现 TakeoverOrchestratorService

### 任务说明

实现 takeover 生命周期核心编排：

- freeze
- start recording
- stop recording
- parse patch
- observe
- resume

### 建议 owner

- Runtime / Browser Worker

### 优先级

- `P0 / Highest`

### 前置依赖

- `P0-A`
- `P0-B`

### 验收标准

- `startTakeover()` 能冻结 session 并切为 `HUMAN_CONTROL`
- `stopTakeover()` 能返回 patch script 与 observation
- `resumeTakeover()` 能恢复执行

## P0-D：扩展 RecorderService 为 takeover 模式

### 任务说明

在不破坏 legacy 手动录制的前提下，为 runtime 增加接管录制能力。

### 建议 owner

- Runtime / Browser Worker

### 优先级

- `P0 / Highest`

### 前置依赖

- `P0-A`

### 验收标准

- 可按 `runtimeSessionId` 启动/停止录制
- 原手动录制功能不回归
- 停止录制能返回 raw script

## P0-E：实现 CodegenScriptParserService v1

### 任务说明

实现第一版脚本解析器，将 codegen 输出转成统一 `BrowserActionStep[]`。

### 首批支持语句

- `page.goto(...)`
- `page.click(...)`
- `page.fill(...)`
- `page.getByRole(...).click()`
- `page.getByText(...).click()`
- `page.keyboard.press(...)`

### 建议 owner

- Runtime / Browser Worker

### 优先级

- `P0 / High`

### 前置依赖

- `P0-A`

### 验收标准

- 单测覆盖首批高频语句
- 未识别语句不会导致整个解析失败
- 可返回 `patchSteps`

## P0-F：扩展 Browser Session Registry

### 任务说明

将 takeover 相关状态纳入 session registry 统一管理。

### 建议 owner

- Runtime / Browser Worker

### 优先级

- `P0 / High`

### 前置依赖

- `P0-A`

### 验收标准

- 可查询 `takeoverStatus`
- 可查询 `activeTakeoverSessionId`
- 执行/接管/恢复状态转换一致

## P0-G：提供基础 Observation 能力复用

### 任务说明

在 stop takeover 后统一调用 snapshot / inspect / text read 形成 observation。

### 建议 owner

- Runtime / Browser Worker`

### 优先级

- `P0 / High`

### 前置依赖

- `P0-C`

### 验收标准

- `stopTakeover()` 响应中包含 observation
- observation 至少包含 `currentPageUrl`、`title`、`timestamp`

## P0-H：ai-orchestrator 提供最简 resume 入口

### 任务说明

第一阶段先不追求复杂自动 reconcile，但需要有一个可从 observation 继续规划的入口。

### 建议 owner

- AI Orchestrator

### 优先级

- `P0 / High`

### 前置依赖

- `P0-C`
- `P0-G`

### 验收标准

- 接管结束后，可基于 observation 继续生成后续 commands
- 输入结构稳定，可供前端联调

## P0-I：前端接管态 UI

### 任务说明

在 `AIControls.tsx` 和 `RecorderPage.tsx` 中增加 takeover 交互。

### UI 最小要求

- 失败后显示 `人工接管`
- 接管中显示 `正在人工接管`
- 接管结束显示 patch steps 数量
- 提供 `继续执行`

### 建议 owner

- Frontend / Portal

### 优先级

- `P0 / Highest`

### 前置依赖

- `P0-B`
- `P0-C`

### 验收标准

- 用户能完成接管启动、结束、继续执行闭环
- 不影响原纯 AI 模式

## P0-J：P0 联调与集成测试

### 任务说明

打通前后端流程，验证最小闭环。

### 核心场景

- click 失败 -> 人工补点 -> 继续执行
- fill 失败 -> 人工补填 -> 继续执行

### 建议 owner

- QA / Integration

### 优先级

- `P0 / Highest`

### 前置依赖

- `P0-C`
- `P0-E`
- `P0-I`

### 验收标准

- 至少 2 个场景联调通过
- 关键日志完整

## 5. P1 任务拆解

## P1-A：实现 ExecutionReconcileService

### 任务说明

根据失败命令、patch steps、observation 自动生成恢复策略和恢复命令。

### 建议 owner

- AI Orchestrator

### 优先级

- `P1 / Highest`

### 前置依赖

- `P0-H`

### 验收标准

- 能输出 `strategy`
- 能输出 `resumeCommands`
- explanation 可读

## P1-B：扩展 RecorderDebugService 作为恢复编排入口

### 任务说明

在现有 debug service 中加入 takeover 后恢复相关能力。

### 建议 owner

- AI Orchestrator

### 优先级

- `P1 / High`

### 前置依赖

- `P1-A`

### 验收标准

- 有 `reconcileAfterTakeover()` 入口
- 能构造恢复 prompt

## P1-C：前端显示恢复策略

### 任务说明

在 UI 中展示：

- 恢复策略类型
- AI 解释
- 是否继续执行

### 建议 owner

- Frontend / Portal

### 优先级

- `P1 / High`

### 前置依赖

- `P1-A`

### 验收标准

- 用户能看见 `replace / insert / replan`
- 用户可确认或直接继续

## P1-D：补 parser 规则和 patch 可视化

### 任务说明

增强 codegen parser 的覆盖面，同时在前端显示 patch steps 明细。

### 建议 owner

- Runtime / Browser Worker
- Frontend / Portal

### 优先级

- `P1 / Medium`

### 前置依赖

- `P0-E`
- `P0-I`

### 验收标准

- 支持更多 locator 形式
- patch steps 可视化可读

## P1-E：P1 典型场景自动恢复测试

### 核心场景

- 登录失败后人工登录，AI 自动重规划
- 弹窗遮挡，AI 自动插入 patch steps
- 错误按钮点击，AI 选择 replace_failed_step

### 建议 owner

- QA / Integration

### 优先级

- `P1 / High`

### 前置依赖

- `P1-A`
- `P1-C`

### 验收标准

- 三种策略至少各成功一次

## 6. P2 任务拆解

## P2-A：优化同 session takeover 体验

### 任务说明

尽量降低“像在切模式”的用户感受，增强 continuity。

### 建议 owner

- Runtime / Browser Worker

### 优先级

- `P2 / High`

### 前置依赖

- `P0` 全部完成

### 验收标准

- 接管与恢复过程中页面/预览状态切换更平滑

## P2-B：审计与历史记录

### 任务说明

保存接管过程的关键事件和 patch 历史。

### 建议 owner

- Runtime / Browser Worker
- Frontend / Portal

### 优先级

- `P2 / Medium`

### 前置依赖

- `P1` 核心流程完成

### 验收标准

- 可查看 takeover 历史
- 可查看 patch step 数和策略

## P2-C：自动化恢复优化

### 任务说明

降低用户确认频率，提高自动继续执行比例。

### 建议 owner

- AI Orchestrator

### 优先级

- `P2 / Medium`

### 前置依赖

- `P1-A`

### 验收标准

- 高频场景自动恢复成功率提升

## 7. 并行开发建议

### 可并行组 1

- `P0-A` 类型定义
- `P0-D` recorder takeover 扩展
- `P0-E` parser v1

### 可并行组 2

- `P0-B` controller
- `P0-F` session registry

### 可并行组 3

- `P0-I` 前端 UI 骨架
- `P0-H` AI 最简 resume 入口

### 串行关键路径

- `P0-C TakeoverOrchestratorService`
- `P0-J 联调与测试`

## 8. Issue 模板建议

建议每个 issue 统一包含：

- 背景
- 目标
- 修改文件
- 非目标
- 验收标准
- 风险点

示例标题：

- `[P0][Runtime] Add takeover controller and DTOs`
- `[P0][Runtime] Implement codegen patch parser v1`
- `[P0][Frontend] Add takeover UI flow in AIControls`
- `[P1][AI] Implement execution reconcile strategy`

## 9. 关键依赖图

```text
P0-A -> P0-B -> P0-C -> P0-J
P0-A -> P0-D -> P0-C
P0-A -> P0-E -> P0-C
P0-A -> P0-F -> P0-C
P0-C -> P0-G -> P0-H -> P0-J
P0-B -> P0-I -> P0-J
P0-H -> P1-A -> P1-B
P1-A -> P1-C -> P1-E
P0-E -> P1-D
```

## 10. 建议排期

如果资源允许，建议按 2 周一个里程碑估算：

- 第 1 周
  - `P0-A`
  - `P0-B`
  - `P0-D`
  - `P0-E`
  - `P0-F`

- 第 2 周
  - `P0-C`
  - `P0-G`
  - `P0-H`
  - `P0-I`
  - `P0-J`

- 第 3 周
  - `P1-A`
  - `P1-B`
  - `P1-C`
  - `P1-D`
  - `P1-E`

- 第 4 周以后
  - `P2-A`
  - `P2-B`
  - `P2-C`

## 11. 最终建议

如果现在要开始真正执行，我建议实际起手顺序是：

1. 先建 5 个 P0 issue
2. 优先做 Runtime 的 DTO、controller、recorder bridge、parser
3. 并行让前端把 takeover UI 骨架先搭出来
4. AI 侧先做最简 continue/resume，再补 reconcile
5. 先跑通闭环，再追求自动化恢复质量

这能最大化降低复杂度，同时尽快验证这条混合路线的真实价值。
