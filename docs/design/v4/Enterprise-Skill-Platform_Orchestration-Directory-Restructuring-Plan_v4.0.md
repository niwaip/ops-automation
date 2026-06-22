# 企业级技能平台 编排层目录重构与文件整理设计方案

**Enterprise-Skill-Platform Orchestration Directory Restructuring Plan v4.0**  
日期：2026-06-22

---

## 1. 重构背景与痛点

当前后端编排模块（`apps/backend/orchestration`）的业务职责逐步演进为确定性控制面与智能协调器两大块。然而，随着后续浏览器画像能力（LOGIN, NAVIGATION, READ, ACTION, SEARCH, FIELD_FILL）的全面铺开，现有的文件目录面临以下两个关键问题：

1.  **“大平层文件超载”（Flat-file Bloat）**：
    *   `ai-orchestrator/src/modules/browser/intent` 下堆积了近 50 个文件，将原子文本处理、画像配置规则、大模型规划器和主入口编排强行放在同一个平级目录下，违背了 NestJS 单一职责与模块化包管理的规范。
    *   `control-plane/src/modules/execution` 扁平放置了近 40 个文件，将步骤生成、自愈、人工干预以及适配器混合在一处，逻辑结构模糊。
2.  **空置的“僵尸目录”**：
    *   根目录下残留了 `execution-flow/`、`planner/`、`release-orchestrator/` 等空目录，增加了代码浏览的干扰与心智负担。

---

## 2. 目标态目录树结构设计

我们仅对项目文件与文件夹进行物理迁移，**不更改任何业务逻辑**。同时，本次重构增加“稳定公开入口”约束：模块外部依赖应收敛到根级 `index.ts` 或模块主服务，不允许跨层深链路引用内部实现文件。整理后的项目树形结构如下：

```text
apps/backend/orchestration/
├── ai-orchestrator/src/modules/browser/
│   └── intent/                             # 浏览器意图解析模块
│       ├── ai-planner/                     # 【新增】存放 AI 规划与大模型交互逻辑
│       │   ├── browser-execution-planner.service.ts
│       │   ├── browser-planner-components.spec.ts
│       │   ├── browser-planner-prompt.builder.ts
│       │   ├── browser-planner-response.parser.ts
│       │   └── browser-planner.constants.ts
│       ├── profiles/                       # 【新增】存放能力画像规则解析服务
│       │   ├── browser-command-action.*    # 动作画像相关服务与类型
│       │   ├── browser-command-field-fill.*# 填写画像相关服务与类型
│       │   ├── browser-command-login.*     # 登录画像相关服务与类型
│       │   ├── browser-command-navigation.*# 导航画像相关服务与类型
│       │   ├── browser-command-read.*      # 读取画像相关服务与类型
│       │   └── browser-command-search.*    # 搜索画像相关服务与类型
│       ├── atomic-parsers/                 # 【新增】存放基础文本/正则等原子解析器
│       │   ├── action-intent.builder.ts
│       │   ├── browser-command-atomic.service.ts
│       │   ├── browser-command-context-normalizer.service.ts
│       │   ├── browser-command-sequential.service.ts
│       │   └── click-command.factory.ts
│       ├── browser-command.service.ts      # 主入口编排服务（保留在根）
│       ├── browser-command.types.ts
│       ├── index.ts                        # 【新增】intent 模块公开导出网关
│       └── ...                             # 其他主控/上下文格式化服务
│
├── control-plane/src/modules/
│   └── execution/                          # 确定性流程执行模块
│       ├── adapters/                       # 【新增】运行时适配器与注册表
│       │   ├── browser-runtime.adapter.ts
│       │   ├── capability-runtime.adapter.ts
│       │   ├── document-runtime.adapter.ts
│       │   ├── workflow-runtime.adapter.ts
│       │   └── runtime-adapter.registry.ts
│       ├── state/                          # 【新增】状态机、事件流及 DTO 转换
│       │   ├── execution-state.service.ts
│       │   ├── execution-event.service.ts
│       │   ├── execution-transition-policy.ts
│       │   ├── execution.mapper.ts
│       │   └── execution.dto.ts
│       ├── step-runner/                    # 【新增】步骤调度与执行链生成器
│       │   ├── execution-flow-runner.service.ts
│       │   ├── execution-step-executor.service.ts
│       │   ├── execution-step.service.ts
│       │   ├── execution-planning.service.ts
│       │   ├── execution-plan-normalization.service.ts
│       │   └── runtime-execution.orchestrator.ts
│       ├── human-control/                  # 【新增】人工干预与审批步骤
│       │   ├── execution-approval.service.ts
│       │   └── execution-human-control.service.ts
│       ├── recovery/                       # 【新增】异常处理与自愈策略
│       │   ├── browser-phase-recovery.planner.ts
│       │   └── execution-failure.service.ts
│       ├── execution.module.ts             # 模块核心注册（保留在根）
│       ├── execution.controller.ts
│       ├── execution.service.ts
│       └── index.ts                        # 模块导出网关
│
└── 【清理】删除以下空置的僵尸目录（确认无引用后移除其 .gitkeep 即可）：
    ├── execution-flow/
    ├── planner/
    ├── release-orchestrator/
    └── workflow-orchestrator/
```

### 2.1 稳定公开入口约束

为避免“内部目录重构导致外部模块批量改 import”，本次整理同步建立公开导出边界：

1. `ai-orchestrator/src/modules/browser/intent/index.ts` 作为 `intent` 模块唯一公开导出网关，对外统一暴露稳定 API。
2. `control-plane/src/modules/execution/index.ts` 继续作为 `execution` 模块唯一公开导出网关。
3. 模块外部禁止直接引用 `ai-planner/`、`profiles/`、`atomic-parsers/`、`adapters/`、`state/`、`step-runner/`、`human-control/`、`recovery/` 下的实现文件。
4. 如确有内部实现需要复用，必须先在对应根级 `index.ts` 显式导出，再由外部模块使用。

### 2.2 依赖方向约束

目录层级加深后，必须同步约束依赖方向，防止产生新的隐式循环依赖：

1. `intent/` 根级编排服务可以依赖 `ai-planner/`、`profiles/`、`atomic-parsers/`。
2. `ai-planner/` 可以依赖 `profiles/` 与 `atomic-parsers/`，但不得反向被它们依赖。
3. `profiles/` 仅允许依赖 `atomic-parsers/`、共享类型与常量，不得依赖 `ai-planner/`。
4. `atomic-parsers/` 仅承载基础解析能力，不得依赖 `profiles/`、`ai-planner/` 或根级编排服务。
5. `execution/` 根级模块可以依赖 `adapters/`、`state/`、`step-runner/`、`human-control/`、`recovery/`。
6. `step-runner/` 可以依赖 `adapters/` 与 `state/`；`recovery/` 可以依赖 `state/`；`adapters/` 不得反向依赖 `step-runner/` 或 `human-control/`。
7. 如某个场景违反以上依赖方向，应通过接口下沉、事件抽象或根级网关导出来消除反向依赖，而不是直接跨层引用。

### 2.3 非浏览器内置能力覆盖说明

本次重构并非只覆盖浏览器能力，同时必须显式覆盖平台内置的 `workflow` 执行能力与文档生成功能，避免目录设计只对浏览器链路友好、却遗漏其他运行时能力。

1. `workflow` 执行能力纳入本次 `execution/` 模块重构范围，不允许仅通过“保留旧目录”或“临时兼容路径”规避整理。
2. 文档生成内置能力纳入本次 `execution/` 模块重构范围，至少应覆盖模板渲染调用、参数传递、文件产物处理与失败回传链路。
3. `workflow-runtime.adapter.ts` 与 `document-runtime.adapter.ts` 仅代表运行时接入层，不应被误认为已覆盖全部领域职责。
4. 若现有 `workflow-orchestrator/` 或文档生成相关目录中仍承载编排、状态推进、恢复、审批衔接、结果回写等逻辑，则必须在新结构中明确其落位后，方可删除旧目录。
5. 本次设计的默认归属是：`workflow` 与文档生成的“运行时接入”放入 `adapters/`，“执行推进”收敛到 `step-runner/`，“状态转换”收敛到 `state/`，“失败处理”收敛到 `recovery/`；若存在例外，必须单独在迁移清单中标记并说明原因。

### 2.4 `workflow` 与文档生成的依赖边界

为防止两类内置能力在迁移后再次演化成“隐式平行 orchestrator”，需额外约束：

1. `workflow-runtime.adapter.ts` 只负责对接 workflow 运行时，不负责承载步骤编排、状态持久化或审批流决策。
2. `document-runtime.adapter.ts` 只负责对接文档渲染/生成运行时，不负责承载模板业务规则编排或产物流转编排。
3. `step-runner/` 可以调用 `workflow-runtime.adapter.ts` 与 `document-runtime.adapter.ts` 执行具体步骤，但不应直接耦合底层模板引擎或 workflow SDK 的细节。
4. `recovery/` 可以基于 `state/` 的执行结果对 workflow 和文档生成失败做重试/自愈决策，但不应直接替代 adapter 的运行时调用实现。
5. 若 workflow 或文档生成存在专用 mapper、dto、result normalizer，应优先收敛到 `state/` 或 `step-runner/`，避免在 `adapters/` 下继续堆积业务编排逻辑。

---

## 3. 文件迁移映射表

以下映射用于定义迁移规则与目标位置。为避免实施时出现漏迁，本节除规则表外，增加“执行前必须生成完整清单”的要求。

### 3.1 `ai-orchestrator` 的文件搬移映射

| 原文件名 (在 `modules/browser/intent/` 下) | 新目标路径 (相对 `intent/`) |
| :--- | :--- |
| `browser-command-login.*.ts` / `*.profile.ts` | `profiles/` |
| `browser-command-navigation.*.ts` / `*.profile.ts` | `profiles/` |
| `browser-command-read.*.ts` / `*.profile.ts` | `profiles/` |
| `browser-command-action.*.ts` / `*.profile.ts` | `profiles/` |
| `browser-command-search.*.ts` / `*.profile.ts` | `profiles/` |
| `browser-command-field-fill.*.ts` / `*.profile.ts` | `profiles/` |
| `browser-execution-planner.service.ts` | `ai-planner/` |
| `browser-planner-components.spec.ts` | `ai-planner/` |
| `browser-planner.constants.ts` | `ai-planner/` |
| `browser-planner-prompt.builder.ts` | `ai-planner/` |
| `browser-planner-response.parser.ts` | `ai-planner/` |
| `action-intent.builder.ts` | `atomic-parsers/` |
| `browser-command-atomic.service.ts` | `atomic-parsers/` |
| `browser-command-context-normalizer.service.ts` | `atomic-parsers/` |
| `browser-command-sequential.service.ts` | `atomic-parsers/` |
| `click-command.factory.ts` | `atomic-parsers/` |

### 3.2 `control-plane` 的文件搬移映射

| 原文件名 (在 `modules/execution/` 下) | 新目标路径 (相对 `execution/`) |
| :--- | :--- |
| `*runtime.adapter.ts` / `runtime-adapter.*` | `adapters/` |
| `execution-state.service.ts` / `execution-event.service.ts` | `state/` |
| `execution-transition-policy.ts` | `state/` |
| `execution.mapper.ts` / `execution.dto.ts` | `state/` |
| `execution-flow-runner.service.ts` | `step-runner/` |
| `execution-step-executor.service.ts` | `step-runner/` |
| `execution-step.service.ts` | `step-runner/` |
| `execution-planning.service.ts` | `step-runner/` |
| `execution-plan-normalization.service.ts` | `step-runner/` |
| `runtime-execution.orchestrator.ts` | `step-runner/` |
| `execution-approval.service.ts` / `execution-human-control.service.ts` | `human-control/` |
| `browser-phase-recovery.planner.ts` / `execution-failure.service.ts` | `recovery/` |

### 3.3 `workflow` / 文档生成专项迁移要求

除通用映射规则外，`workflow` 与文档生成能力必须做专项盘点，不得仅因为目录中存在 `workflow-runtime.adapter.ts`、`document-runtime.adapter.ts` 就视为已完成覆盖。至少需要额外确认以下内容：

| 能力域 | 必查文件类型/职责 | 推荐目标位置 |
| :--- | :--- | :--- |
| `workflow` 执行 | workflow runtime adapter、workflow step executor、workflow result mapper、workflow retry/recovery、workflow approval bridge | `adapters/`、`step-runner/`、`state/`、`recovery/` |
| 文档生成 | document runtime adapter、template 参数映射、document result mapper、产物处理、生成失败恢复 | `adapters/`、`state/`、`step-runner/`、`recovery/` |

专项要求如下：

1. 必须全量扫描现有 `workflow-orchestrator/`、文档生成相关目录、template workflow 相关 service，确认职责归属。
2. 若旧目录内仍有 service、dto、mapper、planner、spec、fixture，不允许只迁移 adapter 文件而遗漏其他配套文件。
3. 所有与 workflow、文档生成相关的 spec 文件，也必须跟随实现文件一起迁移或重写引用路径。
4. 若文档生成链路涉及外部模板引擎、Temporal/Activity、Carbone 或其他内置模板工作流，必须在清单中单独标记“外部运行时耦合点”。
5. 若 workflow 或文档生成当前仍有独立目录，但最终目标是并入 `execution/` 分层，则必须在清单中给出“旧目录职责 -> 新目录职责”的逐项映射。

### 3.4 执行前必须生成完整迁移清单

以上映射表描述的是规则，不替代实际迁移清单。正式实施前，必须在仓库内生成一份完整、可勾选、可审计的清单，至少包含以下字段：

| 序号 | 源文件绝对/相对路径 | 目标路径 | 所属批次 | 是否影响公开导出 | 是否已 `git mv` | 编译验证 | 测试验证 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `intent/browser-command-login.service.ts` | `intent/profiles/browser-command-login.service.ts` | Batch A | 否 | 已完成 | `ai-orchestrator` `npm run typecheck` 通过 | 相关 `browser-command` / `execute` 测试通过 |
| 2 | `intent/index.ts` | `intent/index.ts`（新增公开网关） | Batch C 收尾 | 是 | 新增文件 | `ai-orchestrator` `npm run typecheck` 通过 | 相关 `browser-command` / `execute` 测试通过 |
| 3 | `execution/execution-state.service.ts` | `execution/state/execution-state.service.ts` | Batch D | 否 | 已完成 | `control-plane` `npm run typecheck` 通过 | 相关 `execution state` 测试通过 |
| 4 | `execution/workflow-runtime.adapter.ts` | `execution/adapters/workflow-runtime.adapter.ts` | Batch D | 否 | 已完成 | `control-plane` `npm run typecheck` 通过 | `workflow-runtime.adapter.test.ts` 通过 |
| 5 | `execution/document-runtime.adapter.ts` | `execution/adapters/document-runtime.adapter.ts` | Batch D | 否 | 已完成 | `control-plane` `npm run typecheck` 通过 | `document-runtime.adapter.test.ts` 通过 |
| 6 | `execution/execution-browser-orchestration.service.ts` | `execution/step-runner/execution-browser-orchestration.service.ts` | Batch E | 是 | 已完成 | `control-plane` `npm run typecheck` 通过 | `execution-browser-orchestration.service.test.ts` 通过 |
| 7 | `execution/execution-input-resolution.service.ts` | `execution/human-control/execution-input-resolution.service.ts` | Batch F | 是 | 已完成 | `control-plane` `npm run typecheck` 通过 | `execution-input-resolution.service.test.ts` 通过 |
| 8 | `execution/browser-phase-recovery.planner.ts` | `execution/recovery/browser-phase-recovery.planner.ts` | Batch F | 是 | 已完成 | `control-plane` `npm run typecheck` 通过 | `browser-phase-recovery.planner.test.ts` 通过 |

要求如下：

1. 清单必须穷举所有受影响文件，不允许仅凭通配规则现场判断。
2. 每个文件必须明确归属迁移批次，避免多人并发移动时冲突。
3. 公开导出有影响的文件必须单独标记，便于重点复核 `index.ts`。
4. 清单建议与实施 commit 一一对应，以便审计和回滚。

### 3.5 `workflow` / 文档生成专项迁移清单模板

以下模板可直接复制到实施文档、任务单或 PR 描述中使用。建议每一行对应一个真实文件或一个不可拆分的最小职责单元。

| 序号 | 能力域 | 旧目录/旧文件 | 旧职责说明 | 新目标路径 | 新职责归属 | 所属批次 | 外部运行时耦合点 | 是否影响公开导出 | spec 是否已同步 | 风险备注 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `workflow` | `workflow-orchestrator/workflow-runtime.adapter.ts` | workflow 运行时调用入口 | `execution/adapters/workflow-runtime.adapter.ts` | 运行时接入 | Batch D | Temporal SDK | 否 | 是 | 需验证配置读取 |
| 2 | `workflow` | `workflow-orchestrator/workflow-result.mapper.ts` | workflow 结果映射 | `execution/state/workflow-result.mapper.ts` | 状态转换 | Batch D | 无 | 否 | 是 | 需验证 DTO 兼容 |
| 3 | 文档生成 | `document-generation/document-runtime.adapter.ts` | 模板引擎调用入口 | `execution/adapters/document-runtime.adapter.ts` | 运行时接入 | Batch D | Carbone | 否 | 是 | 需验证模板参数 |
| 4 | 文档生成 | `document-generation/document-output.service.ts` | 产物回传与落库 | `execution/step-runner/document-output.service.ts` | 执行推进 | Batch E | 文件存储/对象存储 | 否 | 否 | 需验证产物回写 |

填写规则：

1. `旧职责说明` 必须写清该文件原本承担的是“运行时接入”“状态转换”“执行推进”“失败处理”还是“人工控制”。
2. `新职责归属` 必须与本文定义的 `adapters/`、`state/`、`step-runner/`、`recovery/`、`human-control/` 保持一致。
3. `外部运行时耦合点` 需显式标记 Temporal、Carbone、模板引擎、对象存储、审批系统等外部依赖。
4. 若某个旧文件没有对应 spec，需要在 `风险备注` 中注明“缺少自动化回归保护”。
5. 若同一个旧目录下存在多个高度耦合文件，可以按最小职责组打包成一行，但必须保证能被独立验证和回滚。

### 3.6 `workflow` / 文档生成当前实际清单（2026-06-22）

以下条目用于替代上方模板中的“示例占位”，反映当前仓库真实落地状态：

| 序号 | 能力域 | 旧目录/旧文件 | 旧职责说明 | 新目标路径 | 新职责归属 | 所属批次 | 外部运行时耦合点 | 是否影响公开导出 | spec 是否已同步 | 风险备注 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `workflow` | `workflow-orchestrator/workflow-runtime.adapter.ts` | workflow 运行时调用入口 | `execution/adapters/workflow-runtime.adapter.ts` | 运行时接入 | Batch D | Auth Service capability runtime / Temporal workflow | 否 | 是 | 已补 `workflow-runtime.adapter.test.ts` |
| 2 | `workflow` | `execution.service.ts` 中的 workflow activity progress 逻辑 | workflow activity 进度同步与 phase 状态回写 | `execution/state/workflow-activity-progress.service.ts` | 状态转换 | 专项收口 | workflow activity / execution phases | 是 | 是 | 本轮从根级 Service 下沉到 `state/` |
| 3 | 文档生成 | `document-generation/document-runtime.adapter.ts` | 模板引擎调用入口 | `execution/adapters/document-runtime.adapter.ts` | 运行时接入 | Batch D | Auth Service capability runtime / Carbone | 否 | 是 | 已补 `document-runtime.adapter.test.ts` |
| 4 | 文档生成 | 文档产物提取与结果持久化逻辑 | 下载链接提取、MIME 推断、结果落库 | `execution/adapters/document-runtime.adapter.ts` + `execution/step-runner/runtime-result.interpreter.ts` | 运行时接入 + 执行推进 | Batch D/E 收尾 | 下载链接 / 文件产物 / MIME 类型推断 | 否 | 是 | 当前未拆独立 `document-output.service.ts`，但已由专项测试覆盖 |
| 5 | `workflow` / 文档生成 | `execution-failure.service.ts` | 运行时失败、等待输入、审批阻塞统一兜底 | `execution/recovery/execution-failure.service.ts` | 失败处理 | Batch F | runtime step failure / approval bridge | 否 | 是 | workflow/document 失败兜底已统一收敛到 `recovery/` |

---

## 4. 分批迁移与回滚策略

由于本次调整涉及大约 80 个文件的重构与移动，不建议一次性整体搬迁。推荐采用“小批次迁移 + 小批次验证 + 小批次提交”的方式执行。

### 4.1 推荐迁移批次

建议按依赖由低到高的顺序迁移：

1. **Batch A：`intent/profiles/`**
   - 搬移所有 `browser-command-*.profile.ts`、各画像相关 service/type 文件。
   - 更新 `intent/index.ts` 对外导出，但暂不调整业务逻辑。
2. **Batch B：`intent/atomic-parsers/`**
   - 搬移基础原子解析器与工厂类。
   - 重点检查是否有解析器反向引用上层画像逻辑。
3. **Batch C：`intent/ai-planner/`**
   - 搬移 AI Planner、Prompt、Response Parser、相关 spec/constants。
   - 重点检查测试发现路径、Mock 路径与相对导入。
4. **Batch D：`execution/adapters/` 与 `execution/state/`**
   - 先迁移下层适配器和状态服务。
   - 重点检查 NestJS provider 注册与 DTO/Mapper 导出。
5. **Batch E：`execution/step-runner/`**
   - 搬移执行流、步骤调度、计划归一化与 orchestrator。
   - 重点检查运行时 orchestrator 对状态层和适配层的引用方向，以及 workflow/document 步骤是否已正确收敛。
6. **Batch F：`execution/human-control/` 与 `execution/recovery/`**
   - 最后迁移人工干预与异常恢复逻辑。
   - 重点检查审批流、自愈流与主执行链的耦合点，以及 workflow/document 失败恢复的落位。
7. **Batch G：清理空目录与收尾**
   - 完成所有迁移后，再统一删除僵尸目录并做全量验证，确认 `workflow-orchestrator/` 和文档生成相关旧目录职责已全部吸收。

### 4.2 每批次执行动作

每个批次都必须执行同样的步骤：

1. 先根据完整迁移清单逐项执行 `git mv`。
2. 修正当前批次涉及的 `index.ts`、NestJS module 注册、测试引用与相对导入。
3. 运行最小编译校验与最小测试集，确认当前批次可独立通过。
4. 通过后单独提交一个 commit，提交信息中带上批次编号。
5. 批次验证未通过时，不继续下一批，先在当前批次内修复。

### 4.3 回滚策略

回滚策略必须前置写明，避免现场失控：

1. 每个批次单独一个 commit，不允许把多个批次混在同一提交。
2. 当前批次若出现大面积 import 崩溃、循环依赖、测试发现异常，可直接回退当前批次提交。
3. 若仅个别文件失败，应优先在该批次内修复，不要临时改变下一批目录设计。
4. 任何目录设计变更都必须先回写本文档，再执行新的搬移动作。

---

## 5. 追加重构实践建议 (Additional Practices)

由于本次调整涉及大约 80 个文件的重构与移动，在执行物理搬移与 Import 相对路径重写时，建议强制执行以下“追加最佳实践”，以保证修改完全透明、历史可查。

### 5.1 Git 物理提交历史保护 (Git Blame Protection)
*   **最佳实践**：严禁在 IDE 内直接拖拽或手动删除再新建。这会导致 Git Blame 丢失，历史代码归属人记录断裂。
*   **标准操作**：统一在命令行使用 `git mv` 进行移动。
    ```bash
    git mv browser-command-login.service.ts profiles/browser-command-login.service.ts
    ```

### 5.2 IDE 自动重构引用关联 (IDE Auto-refactor)
*   **最佳实践**：充分利用 VS Code / WebStorm 的文件移动侦测。
*   **标准操作**：在重构前，团队所有人必须确认在 VS Code 个人/工作区配置中，如下选项已设为 `"always"`，这样移动文件时，外部所有引用它的 relative/alias imports 都会被 IDE 自动重写：
    ```json
    "typescript.updateImportsOnFileMove.enabled": "always",
    "javascript.updateImportsOnFileMove.enabled": "always"
    ```

### 5.3 静态循环依赖拦截 (Circular Dependency Prevention)
*   **最佳实践**：层级加深后，非常容易产生隐式循环依赖。
*   **标准操作**：每完成一个批次以及重构全部完成后，都使用 `madge` 静态分析工具验证代码是否有循环引用环路。
    ```bash
    npx madge --circular --extensions ts apps/backend/orchestration/ai-orchestrator/src
    npx madge --circular --extensions ts apps/backend/orchestration/control-plane/src
    ```
    目标是确保重构后输出结果为无循环环路；若扫描发现历史循环依赖，则必须把结果记录进批次执行记录与最终检查清单，不能以“已执行扫描”替代“已清零”。

### 5.4 双重防御自动验证 (Build and Test Validation)
*   **第一道防线：静态编译校验**：
    在 `ai-orchestrator` 和 `control-plane` 目录下分别独立运行 TypeScript 编译，验证全量相对/别名导入正常：
    ```bash
    npx tsc --noEmit
    ```
*   **第二道防线：全量单元测试**：
    由于测试文件位置发生了迁移，需要使用 Jest 确保所有 spec 文件仍能被发现并顺利通过：
    ```bash
    npm run test
    ```
*   **第三道防线：模块装配检查**：
    对 NestJS 模块执行一次装配性复核，重点确认 `@Module()` 中的 `imports/providers/exports/controllers` 没有因路径变化漏改。
*   **第四道防线：公开导出检查**：
    对 `intent/index.ts` 与 `execution/index.ts` 做一次显式导出巡检，确保外部模块不需要深链路 import。

### 5.5 `workflow` / 文档生成专项验证要求
*   **workflow 执行链验证**：
    至少验证 workflow 步骤可被正常发现、调度、执行，且执行结果能够正确进入 `state/` 与后续步骤推进。
*   **workflow 异常链验证**：
    至少验证一次 workflow 失败后的重试、自愈或人工介入链路，确保旧目录逻辑没有在迁移中丢失。
*   **文档生成链验证**：
    至少验证模板参数传递、渲染执行、文件产物回传这三段链路在新目录结构下仍可正常工作。
*   **文档生成异常验证**：
    至少验证模板缺参、渲染失败、产物回写失败中的一种异常场景，确认 `recovery/` 或人工控制链路仍可接住。
*   **外部运行时耦合点验证**：
    若 workflow 或文档生成依赖 Temporal、Carbone、模板工作流或其他外部内置引擎，必须单独验证路径迁移后调用入口、配置读取与错误处理未受影响。

### 5.6 删除僵尸目录前的引用扫描
*   **最佳实践**：空目录不等于“无引用”，CI、脚本、README、脚手架模板都可能仍然引用旧目录名。
*   **标准操作**：删除 `execution-flow/`、`planner/`、`release-orchestrator/`、`workflow-orchestrator/` 以及文档生成相关旧目录前，先在全仓库搜索目录名，确认无脚本、文档、配置依赖后再删除 `.gitkeep`。

### 5.7 统一网关暴露规范 (Consolidated Module Exports)
*   **最佳实践**：外部模块（如 `Audit` 或 `Mcp` 模块）应当保持相对稳定，不随模块内部的子结构重构而跟着修改引用路径。
*   **标准操作**：保留并修改 `control-plane/src/modules/execution/index.ts` 与新增的 `ai-orchestrator/src/modules/browser/intent/index.ts` 内部导出相对路径。这样，外部模块导入相关服务时，可以继续沿用稳定入口：
    ```typescript
    import { ExecutionService } from '../execution';
    ```
    或：
    ```typescript
    import { BrowserCommandService } from '../intent';
    ```
    实现内部重构、外部无感知。

---

## 6. 全仓扫描 Checklist

在删除旧目录、合并 PR 或执行最终回归前，建议逐项完成以下扫描：

### 6.1 旧目录引用扫描

- [x] 搜索 `workflow-orchestrator`（已执行；当前命中主要来自本方案与归档设计文档中的历史说明）
- [x] 搜索 `execution-flow`（已执行；除本方案文档外，仍命中边界外 `apps/backend/core/platform/src/modules/execution-flow`）
- [x] 搜索 `planner`（已执行；命中范围过广，仍需结合具体路径人工过滤，暂不作为“旧目录已清零”的直接依据）
- [x] 搜索 `release-orchestrator`（已执行；当前命中主要来自本方案与归档设计文档中的历史说明）
- [x] 搜索文档生成相关旧目录名（已执行；当前命中主要保留在方案文档中的 `document-generation` 说明项）
- [ ] 确认 README、设计文档、任务脚本、生成器模板中不再引用旧路径（`.github`、`docker`、`scripts` 范围未发现旧目录字符串，但 `docs/` 仍保留设计/归档说明，因此暂不能整体勾选）

### 6.2 深链路 import 扫描

- [x] 搜索外部模块是否直接引用 `execution/adapters/`（源码侧未发现模块外部违规命中；当前命中集中在 `control-plane/test` 内部测试）
- [x] 搜索外部模块是否直接引用 `execution/state/`（源码侧未发现模块外部违规命中；当前命中集中在 `control-plane/test` 内部测试）
- [x] 搜索外部模块是否直接引用 `execution/step-runner/`（源码侧未发现模块外部违规命中；当前命中集中在 `control-plane/test` 内部测试）
- [x] 搜索外部模块是否直接引用 `intent/ai-planner/`（未发现模块外部深链路引用）
- [x] 搜索外部模块是否直接引用 `intent/profiles/`（未发现模块外部深链路引用）
- [x] 确认需要暴露的能力均已通过 `intent/index.ts` 或 `execution/index.ts` 导出（`mcp.service.ts` 等外部消费已收敛回稳定入口）

### 6.3 `workflow` / 文档生成专项扫描

- [x] 搜索 `workflow-runtime.adapter`（已执行；命中与当前 `execution/adapters/workflow-runtime.adapter.ts` 及专项测试一致）
- [x] 搜索 `document-runtime.adapter`（已执行；命中与当前 `execution/adapters/document-runtime.adapter.ts` 及专项测试一致）
- [x] 搜索 `template workflow`（已执行；命中主要为策略语义与文档说明，未发现旧目录路径残留）
- [x] 搜索 `Carbone`（已执行；命中主要为当前运行时接入、前端代理与设计文档）
- [x] 搜索 `Temporal`（已执行；命中主要为当前运行时链路、前端链接展示与边界外 `core/platform/temporal-workflow`）
- [x] 搜索 workflow/document 相关 spec、fixture、mock 是否仍引用旧路径（`workflow-runtime.adapter.test.ts`、`document-runtime.adapter.test.ts`、`workflow-activity-progress.service.test.ts` 等已与新路径同步）
- [x] 确认 workflow 失败恢复、文档生成失败恢复相关实现已迁入 `recovery/` 或明确保留原因（当前已统一收敛到 `execution/recovery/execution-failure.service.ts`；`core/platform` 与 `domain/document-engine` 保持边界外职责）

### 6.4 配置与脚本扫描

- [x] 检查 `tsconfig` 路径别名是否仍指向旧目录（`apps/backend/orchestration` 范围未发现旧目录配置）
- [x] 检查 Jest 配置、`moduleNameMapper`、测试发现规则是否仍指向旧路径（当前 `jest.config.js` / `package.json` 未发现旧目录残留）
- [x] 检查 NestJS 模块装配和 barrel export 是否存在旧相对路径（已完成 `execution.module.ts`、`execution/index.ts`、`browser.module.ts`、`intent/index.ts` 复核）
- [ ] 检查 CI、构建脚本、代码生成脚本是否仍写死旧目录（`.github`、`docker`、`scripts` 范围未发现旧目录字符串，但尚未补齐所有生成器/外部脚本的人工审计）
- [ ] 检查部署或运行时配置中是否仍存在旧目录名（当前未见直接命中，但尚未完成完整运行态审计）

### 6.5 删除前确认

- [x] 旧目录职责已逐项映射到新目录（见 `3.4`、`3.6`、`8.4`、`9.6`）
- [ ] 全仓搜索无剩余有效引用（`docs/` 的设计/归档说明与边界外 `core/platform/execution-flow` 仍有合法命中）
- [x] 相关测试与最小回归已通过（`typecheck` 通过，workflow/document/state/step-runner 相关专项测试已通过）
- [ ] 当前批次已单独提交，可独立回滚（当前工作区尚未形成按 Batch 拆分的 commit 序列）
- [ ] 删除 `.gitkeep` 前已确认不存在仅靠空目录占位的构建或脚本依赖（当前 `execution/` 范围未发现需删除的残留空目录，但仓库级删除动作尚未单独审计）

### 6.6 当前扫描结论（2026-06-22）

1. 编排层源码范围内，公开入口收敛与专项路径迁移已经基本完成，当前未发现模块外部直接深链路依赖 `intent/*` 或 `execution/*` 内部子目录实现。
2. 旧目录名的剩余命中主要来自两类来源：  
   - 本方案及归档设计文档中的历史说明  
   - 本次物理迁移范围之外的边界目录，如 `apps/backend/core/platform/src/modules/execution-flow`
3. `madge` 审计已实际执行，当前 `ai-orchestrator` 与 `control-plane` 两侧源码范围均已清零循环依赖。
4. 因此，第 6 节 checklist 的当前状态应理解为“扫描动作与循环依赖治理已完成，但仓库级彻底清零仍待后续文档治理与提交审计链补齐”，而不是“全仓已经完全无旧名残留”。

---

## 7. 建议搜索命令清单

以下命令用于配合上一节 Checklist 执行全仓扫描。为保证结果一致，建议统一在仓库根目录运行。

### 7.1 旧目录引用扫描命令

```bash
grep -RIn "workflow-orchestrator" .
grep -RIn "execution-flow" .
grep -RIn "planner" .
grep -RIn "release-orchestrator" .
grep -RIn "document-generation" .
```

适用说明：

1. 用于确认代码、脚本、文档、配置中是否仍存在旧目录字符串。
2. 若 `planner` 命中过多，需结合具体路径人工过滤，避免把通用业务词误判为旧目录引用。

### 7.2 深链路 import 扫描命令

```bash
grep -RIn "from '.*execution/adapters/" apps/ packages/
grep -RIn 'from ".*execution/adapters/' apps/ packages/
grep -RIn "from '.*execution/state/" apps/ packages/
grep -RIn "from '.*execution/step-runner/" apps/ packages/
grep -RIn "from '.*intent/ai-planner/" apps/ packages/
grep -RIn "from '.*intent/profiles/" apps/ packages/
```

适用说明：

1. 用于发现模块外部是否仍在直接深链路引用内部实现目录。
2. 若仓库存在路径别名导入，还应补充对别名写法的搜索。

### 7.3 `workflow` / 文档生成专项扫描命令

```bash
grep -RIn "workflow-runtime.adapter" apps/ packages/
grep -RIn "document-runtime.adapter" apps/ packages/
grep -RIn "template workflow" apps/ packages/ docs/
grep -RIn "Carbone" apps/ packages/ docs/
grep -RIn "Temporal" apps/ packages/ docs/
grep -RInE "(workflow|document).*(spec|fixture|mock)" apps/ packages/
```

适用说明：

1. 用于盘点 `workflow` 与文档生成相关的实现、测试与文档痕迹。
2. `Carbone`、`Temporal` 搜索结果应重点核查是否仍指向旧目录或旧封装入口。

### 7.4 配置与脚本扫描命令

```bash
grep -RIn "workflow-orchestrator\|execution-flow\|release-orchestrator" .github/ docker/ scripts/ docs/ apps/ packages/
grep -RIn "moduleNameMapper\|testMatch\|testRegex" apps/ packages/
grep -RIn "paths" apps/ packages/
grep -RIn "from '../execution'\|from \"../execution\"" apps/ packages/
```

适用说明：

1. 用于定位 Jest 配置、`tsconfig` 别名、脚本和 CI 配置中的旧路径痕迹。
2. 最后一条可辅助确认外部模块是否已通过稳定入口导入 `execution`。

### 7.5 建议使用方式

1. 每个批次迁移前先跑一次旧目录引用扫描，确认当前影响范围。
2. 每个批次迁移后跑一次深链路 import 扫描和专项扫描，确认没有新增违规引用。
3. 最终删除旧目录前，完整执行本节全部命令，并将结果摘要附在 PR 描述或批次记录中。

---

## 8. 批次执行记录模板

以下模板用于记录每一个 Batch 的实施过程、验证结果和回滚点。建议一个批次对应一份记录。

### 8.1 模板正文

```markdown
## Batch X 执行记录

- 批次名称：
- 负责人：
- 执行日期：
- 关联提交：
- 关联迁移清单：

### 1. 迁移范围
- 涉及目录：
- 涉及文件数：
- 重点能力域：browser / workflow / document / recovery / state / adapters

### 2. 已执行动作
- 已完成 `git mv`：
- 已更新公开导出：
- 已修正 NestJS module 注册：
- 已修正测试引用：
- 已删除旧目录占位：

### 3. 验证结果
- `tsc --noEmit`：
- `npm run test`：
- `madge --circular`：
- workflow 专项验证：
- 文档生成专项验证：

### 4. 风险与遗留项
- 当前遗留问题：
- 是否允许带风险进入下一批：
- 后续跟进人：

### 5. 回滚信息
- 回滚方式：
- 回滚提交：
- 回滚触发条件：
```

### 8.2 填写要求

1. `迁移范围` 必须明确到目录级或文件级，不能只写“执行模块调整”这类宽泛描述。
2. `验证结果` 不能只写“通过”，应尽量附上测试范围、关键日志或失败重试结果摘要。
3. 若批次覆盖 `workflow` 或文档生成，必须填写专项验证结果，不能留空。
4. 若本批次未删除旧目录，也应明确写出“未删除，原因是仍存在引用/待后续批次吸收”。
5. `回滚信息` 必须在批次开始前预先定义，不要等问题发生后再补写。

### 8.3 建议提交格式

建议将批次记录与代码提交、PR 描述保持一致，例如：

```text
Batch D - execution adapters/state migration
- moved workflow/document adapters into execution/adapters
- updated execution state mappers and DTO exports
- verified tsc, targeted tests, madge
- rollback point: commit <sha>
```

### 8.4 当前实际执行记录（2026-06-22）

以下记录用于补充上方模板，反映当前仓库已经落地的真实执行情况：

#### Batch A-C：`ai-orchestrator/browser/intent`

- 迁移范围：`profiles/`、`atomic-parsers/`、`ai-planner/`，以及根级 `intent/index.ts`
- 已执行动作：
  - 已完成 `git mv`，将画像、原子解析器、AI planner 相关文件迁入目标子目录
  - 已新增 `intent/index.ts`，并将 `browser.module.ts`、`execute/*`、`loop/*`、`export/*`、`observe/*` 的外部引用收敛到根级网关
  - 已补齐迁移后暴露的历史相对路径问题
  - 已新增 `execute/recorder-debug.types.ts`，将 `BrowserExecuteResponse`、`RecorderDebugObservation` 等共享类型从 `recorder-debug.service.ts` 下沉
  - 已移除 `react-engine/tool-executor.ts` 对 `./tools/index.ts` 的直接类型依赖，改为通过 `ToolDefinition` 网关调用 `flow_execute`
- 验证结果：
  - `apps/backend/orchestration/ai-orchestrator` 下 `npm run typecheck` 通过
  - `recorder-debug-execution.service.spec.ts`、`recorder-debug-chat-flow.service.spec.ts`、`browser-execution-controller.service.spec.ts`、`browser-command.service.spec.ts` 通过
  - 已执行 `npx --yes madge --circular --extensions ts apps/backend/orchestration/ai-orchestrator/src`
  - 当前 `ai-orchestrator` `madge` 结果为 `No circular dependency found`
- 风险与遗留：
  - 当前工作区尚未按批次单独提交 commit，因此“逐批回滚点”仍待后续补齐

#### Batch D-G：`control-plane/execution`

- 迁移范围：`adapters/`、`state/`、`step-runner/`、`human-control/`、`recovery/`、根级 `execution/index.ts`
- 已执行动作：
  - 已完成 `git mv`，将 execution 目录按文档目标树分层落位
  - 已完成 `execution/index.ts` 公开导出收敛，并将 `mcp.service.ts` 等外部消费切回根级入口
  - 已把 workflow activity progress 从 `execution.service.ts` 下沉到 `state/workflow-activity-progress.service.ts`
  - 已补齐 `workflow-runtime.adapter.ts`、`document-runtime.adapter.ts` 的专项测试保护
  - 已新增 `step-runner/browser-phase.types.ts`，将 `BrowserPhaseCommand` 从 `browser-phase.executor.ts` 中抽离，消除 `step-runner` 与 `recovery` 的类型级反向依赖
- 验证结果：
  - `apps/backend/orchestration/control-plane` 下 `npm run typecheck` 通过
  - 已通过的专项/回归测试包括：
    - `workflow-runtime.adapter.test.ts`
    - `document-runtime.adapter.test.ts`
    - `workflow-activity-progress.service.test.ts`
    - `execution-phase.service.test.ts`
    - `execution-phase-sync.service.test.ts`
    - `runtime-step-request.factory.test.ts`
    - `runtime-adapter.registry.test.ts`
    - `runtime-result.interpreter.test.ts`
    - `execution-browser-orchestration.service.test.ts`
    - `execution-plan-normalization.service.test.ts`
    - `execution-planning.service.test.ts`
    - `execution-plan-step.builder.test.ts`
    - `execution-input-resolution.service.test.ts`
    - `browser-phase-recovery.planner.test.ts`
  - 已执行 `npx --yes madge --circular --extensions ts apps/backend/orchestration/control-plane/src`
  - 当前 `control-plane` `madge` 结果为 `No circular dependency found`
- 风险与遗留：
  - `execution-flow/`、`planner/`、`release-orchestrator/`、`workflow-orchestrator/` 在当前 `execution/` 目录下未发现真实残留目录，因此未执行物理删除
  - 文档中的“按批次单独提交 commit / 回滚点”在当前工作区尚未形成，需要后续补齐提交序列
- 回滚信息：
  - 当前仅具备“按文件/按目录回退本轮改动”的工作区级回滚条件
  - 尚未形成文档要求的批次级 commit rollback point

### 8.5 当前 Git 审计状态（2026-06-22）

基于当前仓库 `git status --short` 与 `git log --oneline -n 12` 的审计结果，可确认如下事实：

1. 当前工作区仍处于“大量迁移文件未提交”的状态，包含大批 `R` / `RM` / `M` / `??` 记录，说明 Batch A-G 的真实文件移动与收尾修改尚未沉淀为独立提交。
2. 最近可见提交历史中虽然存在若干浏览器相关提交，但并未形成与本文 `Batch A` 到 `Batch G` 一一对应的规范命名与回滚点，例如当前 `HEAD` 附近提交仍是业务语义提交而非批次迁移提交。
3. 因此，当前无法在“不改写既有历史”的前提下，把文档里的每个 Batch 补写成“真实已存在的 commit sha”；若强行补写，会把“文档期望态”误写成“Git 已实现态”。
4. 当前最准确的仓库状态表述应为：  
   - 代码侧迁移、类型校验、专项测试、循环依赖治理已完成  
   - 批次级 commit 审计链与 rollback point 尚未形成  
   - 若要满足本文 `4.3`、`8.1`、`10.8` 的最终要求，后续必须在清理工作区后以明确的批次边界重新整理提交序列，或在 PR/任务系统中补充外部审计映射
5. 基于以上结论，本文后续所有关于 commit / rollback point 的描述，当前都应理解为“待补齐的治理项”，而不是“仓库中已经存在的事实”。

---

## 9. 当前仓库静态盘点（初版）

以下盘点基于当前仓库实际代码结构得出，目的是把本方案从“目标态设计”进一步收敛到“可直接执行的第一版迁移底稿”。

### 9.1 本次重构的实际物理范围

静态扫描确认，本次文档的“物理迁移范围”应继续限定在编排层内的两个目录：

1. `apps/backend/orchestration/ai-orchestrator/src/modules/browser/intent`
2. `apps/backend/orchestration/control-plane/src/modules/execution`

同时确认以下目录虽然与 `workflow` 或文档生成强相关，但**不属于本次目录物理迁移的直接目标**，应在文档中作为边界说明保留：

1. `apps/backend/core/platform/src/modules/temporal-workflow`
2. `apps/backend/core/platform/src/modules/execution-flow`
3. `apps/backend/domain/document-engine`

这三类目录的职责更接近平台工作流引擎、执行模板平台能力和文档引擎领域服务。当前方案应关注它们与编排层的依赖接口，而不是把它们误纳入本次 `git mv` 范围。

### 9.2 `ai-orchestrator/browser/intent` 实际盘点结论

静态扫描确认，`intent/` 目录下除了已在目标树中点名的 profile / planner / atomic parser 文件外，还存在一批尚未在迁移映射表中显式落位的真实文件。

建议补充如下分类：

| 当前文件 | 建议目标位置 | 归类原因 |
| :--- | :--- | :--- |
| `action-target-resolver.service.ts` | `atomic-parsers/` | 属于动作目标解析，偏基础解析能力 |
| `browser-action-validator.service.ts` | `atomic-parsers/` | 属于动作合法性校验，接近原子规则校验 |
| `browser-command-click-context.service.ts` | `atomic-parsers/` | 属于点击上下文补全与解析 |
| `browser-candidate-context.formatter.ts` | `intent/` 根级保留 | 更偏编排输入输出格式化，不适合下沉到原子层 |
| `browser-command-semantic-log.service.ts` | `intent/` 根级保留 | 更偏运行时日志与主控协作 |
| `browser-command-semantic-runtime.service.ts` | `intent/` 根级保留 | 更偏语义运行时协调能力 |
| `recorder-disambiguation.service.ts` | `intent/` 根级保留 | 更偏歧义消解编排 |
| `recorder-parameter.service.ts` | `intent/` 根级保留 | 更偏参数收集与编排 |

补充说明：

1. 所有迁移到 `profiles/`、`ai-planner/`、`atomic-parsers/` 的实现文件，其对应 `*.spec.ts` 也应一并迁移。
2. `browser-command.service.ts`、`browser-command.types.ts` 以及后续新增的 `intent/index.ts` 仍应作为稳定入口保留在根级。
3. 当前扫描未发现 `intent/` 目录内已有 `index.ts`，因此该文件属于本次整理需要新增的公开导出网关。

### 9.3 `control-plane/execution` 实际盘点结论

静态扫描确认，`execution/` 目录下除文档前文已点名的文件外，还存在一批尚未被迁移映射表覆盖的真实文件。若不补齐，这批文件会在正式实施时成为“现场判断项”，带来漏迁风险。

建议补充如下分类：

| 当前文件 | 建议目标位置 | 归类原因 |
| :--- | :--- | :--- |
| `browser-execution-constants.ts` | `step-runner/` | 服务于浏览器执行链与步骤运行 |
| `browser-loop-workflow-plan.builder.ts` | `step-runner/` | 属于 workflow/browser loop 步骤计划生成 |
| `browser-phase.executor.ts` | `step-runner/` | 属于 phase 级执行推进 |
| `execution-browser-orchestration.service.ts` | `step-runner/` | 属于浏览器执行编排服务 |
| `execution-input-resolution.service.ts` | `human-control/` | 直接服务人工补参与输入收敛 |
| `execution-phase.service.ts` | `state/` | 偏执行 phase 状态维护 |
| `execution-phase-sync.service.ts` | `state/` | 偏执行 phase 状态同步 |
| `execution-plan-step.builder.ts` | `step-runner/` | 属于执行步骤构建 |
| `execution-result-normalizer.ts` | `state/` | 属于执行结果标准化 |
| `execution-runtime-session.service.ts` | `adapters/` | 更接近运行时会话协调 |
| `recovery-constants.ts` | `recovery/` | 属于异常恢复常量 |
| `runtime-adapter.interface.ts` | `adapters/` | 属于适配层契约 |
| `runtime-result.interpreter.ts` | `step-runner/` | 属于运行结果解释与步骤推进 |
| `runtime-step-request.factory.ts` | `step-runner/` | 属于运行步骤请求构建 |

补充说明：

1. 当前 `execution/index.ts` 已实际导出 `execution-browser-orchestration.service.ts`、`runtime-result.interpreter.ts`、`runtime-step-request.factory.ts`、`execution-input-resolution.service.ts`、`execution-runtime-session.service.ts` 等文件，说明它们已是模块公开能力的一部分，不能在迁移时遗漏。
2. 上述结论属于“初版静态盘点”时的状态；截至 `2026-06-22`，`adapters/`、`state/`、`step-runner/`、`human-control/`、`recovery/` 已全部真实创建并完成迁移。
3. `execution.service.ts` 在迁移过程中已完成 import 重写和 NestJS 注入验证，但仍然是较大的根级编排服务；当前已额外把 workflow activity progress 下沉到 `state/workflow-activity-progress.service.ts` 以继续削薄职责。

### 9.4 `workflow` / 文档生成在编排层的真实触点

静态扫描确认，编排层内部已经存在若干与 `workflow` 执行和文档生成协同的真实触点，不能只盯住 `control-plane/src/modules/execution`：

| 文件 | 触点类型 | 说明 |
| :--- | :--- | :--- |
| `ai-orchestrator/src/modules/react-engine/tools/flow-execute.tool.ts` | workflow 执行入口 | AI 编排侧已存在 flow execute 工具 |
| `ai-orchestrator/src/modules/react-engine/tools/document-render.tool.ts` | 文档生成入口 | AI 编排侧已存在 document render 工具 |
| `ai-orchestrator/src/modules/chat/chat-orchestrator.service.ts` | 执行单创建入口 | 通过 control-plane 创建 execution，属于编排侧关键接入点 |
| `control-plane/src/modules/execution/workflow-runtime.adapter.ts` | workflow runtime 接入 | control-plane 的 workflow 运行时适配器 |
| `control-plane/src/modules/execution/document-runtime.adapter.ts` | document runtime 接入 | control-plane 的文档运行时适配器 |
| `control-plane/src/modules/execution/browser-loop-workflow-plan.builder.ts` | workflow/browser loop 计划构建 | browser 与 workflow 在执行层有真实交叉 |

因此，本次重构虽然物理范围限定在两个目录内，但实施验证时必须把这些触点纳入最小回归集合。

### 9.5 需补充到正式迁移清单的初版待办

基于当前静态扫描，正式迁移清单至少还需要新增以下检查项：

1. 为 `intent/` 目录中未落位的 8 个真实文件补充目标路径。
2. 为 `execution/` 目录中未落位的 14 个真实文件补充目标路径。
3. 在迁移清单中单独标记 `flow-execute.tool.ts` 与 `document-render.tool.ts` 作为“编排侧触点验证项”。
4. 在范围说明中明确：`core/platform/temporal-workflow`、`core/platform/execution-flow`、`domain/document-engine` 不在本次物理迁移范围内，但在依赖验证范围内。

### 9.6 第一版实际迁移清单（按 Batch 拆分）

以下清单基于当前仓库真实文件分布整理，可直接作为实施阶段的第一版底稿。为控制表格体量，相同前缀且目标一致的文件按“文件组”列示；实际执行时仍应在任务单中展开为逐文件 `git mv` 清单。

#### Batch A：`intent/profiles/`

| 来源文件组 | 目标目录 | 备注 |
| :--- | :--- | :--- |
| `browser-command-action.constants.ts` / `browser-command-action.profile.ts` / `browser-command-action.service.ts` / `browser-command-action.service.spec.ts` / `browser-command-action.types.ts` | `intent/profiles/` | 动作画像能力 |
| `browser-command-field-fill.constants.ts` / `browser-command-field-fill.profile.ts` / `browser-command-field-fill.service.ts` / `browser-command-field-fill.service.spec.ts` / `browser-command-field-fill.types.ts` | `intent/profiles/` | 填写画像能力 |
| `browser-command-login.constants.ts` / `browser-command-login.profile.ts` / `browser-command-login.service.ts` / `browser-command-login.service.spec.ts` / `browser-command-login.types.ts` | `intent/profiles/` | 登录画像能力 |
| `browser-command-navigation.constants.ts` / `browser-command-navigation.profile.ts` / `browser-command-navigation.service.ts` / `browser-command-navigation.service.spec.ts` / `browser-command-navigation.types.ts` | `intent/profiles/` | 导航画像能力 |
| `browser-command-read.constants.ts` / `browser-command-read.profile.ts` / `browser-command-read.service.ts` / `browser-command-read.service.spec.ts` / `browser-command-read.types.ts` | `intent/profiles/` | 读取画像能力 |
| `browser-command-search.constants.ts` / `browser-command-search.profile.ts` / `browser-command-search.service.ts` / `browser-command-search.service.spec.ts` / `browser-command-search.types.ts` | `intent/profiles/` | 搜索画像能力 |

#### Batch B：`intent/atomic-parsers/`

| 来源文件组 | 目标目录 | 备注 |
| :--- | :--- | :--- |
| `action-intent.builder.ts` | `intent/atomic-parsers/` | 原子意图构建 |
| `browser-command-atomic.service.ts` / `browser-command-atomic.service.spec.ts` | `intent/atomic-parsers/` | 原子命令解析 |
| `browser-command-context-normalizer.service.ts` | `intent/atomic-parsers/` | 上下文标准化 |
| `browser-command-sequential.service.ts` / `browser-command-sequential.service.spec.ts` | `intent/atomic-parsers/` | 顺序命令解析 |
| `click-command.factory.ts` | `intent/atomic-parsers/` | 点击命令工厂 |
| `action-target-resolver.service.ts` / `action-target-resolver.service.spec.ts` | `intent/atomic-parsers/` | 动作目标解析 |
| `browser-action-validator.service.ts` | `intent/atomic-parsers/` | 动作校验 |
| `browser-command-click-context.service.ts` | `intent/atomic-parsers/` | 点击上下文补全 |

#### Batch C：`intent/ai-planner/` 与根级保留文件

| 来源文件组 | 目标目录 | 备注 |
| :--- | :--- | :--- |
| `browser-execution-planner.service.ts` | `intent/ai-planner/` | 浏览器执行规划 |
| `browser-planner-components.spec.ts` | `intent/ai-planner/` | planner 组件测试 |
| `browser-planner-prompt.builder.ts` | `intent/ai-planner/` | prompt 构建 |
| `browser-planner-response.parser.ts` | `intent/ai-planner/` | 响应解析 |
| `browser-planner.constants.ts` | `intent/ai-planner/` | planner 常量 |
| `browser-command.service.ts` / `browser-command.service.spec.ts` | `intent/` 根级保留 | 模块主入口 |
| `browser-command.types.ts` | `intent/` 根级保留 | 模块主类型 |
| `browser-candidate-context.formatter.ts` / `browser-command-semantic-log.service.ts` / `browser-command-semantic-runtime.service.ts` / `recorder-disambiguation.service.ts` / `recorder-parameter.service.ts` | `intent/` 根级保留 | 编排侧辅助服务 |
| `index.ts` | `intent/` 新增 | 稳定公开导出网关 |

#### Batch D：`execution/adapters/` 与 `execution/state/`

| 来源文件组 | 目标目录 | 备注 |
| :--- | :--- | :--- |
| `browser-runtime.adapter.ts` / `capability-runtime.adapter.ts` / `document-runtime.adapter.ts` / `workflow-runtime.adapter.ts` | `execution/adapters/` | 运行时适配器 |
| `runtime-adapter.interface.ts` / `runtime-adapter.registry.ts` | `execution/adapters/` | 适配层契约与注册表 |
| `execution-runtime-session.service.ts` | `execution/adapters/` | 运行时会话协调 |
| `execution-state.service.ts` / `execution-event.service.ts` / `execution-transition-policy.ts` | `execution/state/` | 状态机与事件流 |
| `execution.mapper.ts` / `execution.dto.ts` | `execution/state/` | DTO 与映射 |
| `execution-phase.service.ts` / `execution-phase-sync.service.ts` | `execution/state/` | phase 状态维护与同步 |
| `execution-result-normalizer.ts` | `execution/state/` | 执行结果标准化 |

#### Batch E：`execution/step-runner/`

| 来源文件组 | 目标目录 | 备注 |
| :--- | :--- | :--- |
| `execution-flow-runner.service.ts` | `execution/step-runner/` | 执行流运行器 |
| `execution-step-executor.service.ts` / `execution-step.service.ts` | `execution/step-runner/` | 步骤执行链 |
| `execution-planning.service.ts` / `execution-plan-normalization.service.ts` / `execution-plan-step.builder.ts` | `execution/step-runner/` | 执行计划生成与归一化 |
| `runtime-execution.orchestrator.ts` / `runtime-result.interpreter.ts` / `runtime-step-request.factory.ts` | `execution/step-runner/` | 运行时执行推进 |
| `execution-browser-orchestration.service.ts` | `execution/step-runner/` | 浏览器执行编排 |
| `browser-phase.executor.ts` / `browser-loop-workflow-plan.builder.ts` / `browser-execution-constants.ts` | `execution/step-runner/` | browser/workflow 步骤推进相关 |

#### Batch F：`execution/human-control/` 与 `execution/recovery/`

| 来源文件组 | 目标目录 | 备注 |
| :--- | :--- | :--- |
| `execution-approval.service.ts` / `execution-human-control.service.ts` | `execution/human-control/` | 审批与人工控制 |
| `execution-input-resolution.service.ts` | `execution/human-control/` | 补参与输入收敛 |
| `browser-phase-recovery.planner.ts` / `execution-failure.service.ts` / `recovery-constants.ts` | `execution/recovery/` | 恢复策略与失败处理 |

#### Batch G：根级保留文件、导出收敛与空目录清理

| 文件 | 处理方式 | 备注 |
| :--- | :--- | :--- |
| `execution.module.ts` / `execution.controller.ts` / `execution.service.ts` / `index.ts` | 根级保留并重写相对导出 | 模块稳定入口 |
| `browser-command.service.ts` / `browser-command.types.ts` / `intent/index.ts` | 根级保留并收敛导出 | intent 稳定入口 |
| `execution-flow/` / `planner/` / `release-orchestrator/` / `workflow-orchestrator/` | 最后统一清理 | 仅在职责迁移完成且全仓无引用后执行 |

### 9.7 编排侧触点验证清单（不在本次物理迁移范围内）

以下文件不是本次目录搬移的直接对象，但它们依赖或调用重构后的编排结构，必须纳入每轮最小回归验证：

| 文件 | 验证重点 |
| :--- | :--- |
| `ai-orchestrator/src/modules/react-engine/tools/flow-execute.tool.ts` | workflow 执行入口是否仍能正确触发 control-plane 执行链 |
| `ai-orchestrator/src/modules/react-engine/tools/flow-execute.tool.spec.ts` | workflow 工具测试是否仍能发现并通过 |
| `ai-orchestrator/src/modules/react-engine/tools/document-render.tool.ts` | 文档生成入口是否仍能正确调用 document runtime |
| `ai-orchestrator/src/modules/react-engine/tools/document-render.tool.spec.ts` | 文档生成工具测试是否仍能发现并通过 |
| `ai-orchestrator/src/modules/chat/chat-orchestrator.service.ts` | 创建 execution 的编排路径是否受导出/DTO 变化影响 |
| `ai-orchestrator/src/modules/planner/planner.service.ts` | 对 execution / tool 能力的调用契约是否保持兼容 |

建议执行要求：

1. 每完成 Batch D、E、F 中任一批次，都至少回归一次 `flow-execute` 与 `document-render` 两条链路。
2. 若 `execution.dto.ts`、`execution.mapper.ts`、`index.ts` 发生导出变化，需额外验证 `chat-orchestrator.service.ts` 的执行单创建流程。
3. 若本次批次未覆盖触点文件本身，也必须在批次记录中写明“已做触点验证”或“延后到下一批验证”的决定。

### 9.8 当前落地状态更新（2026-06-22）

为避免与 `9.1`-`9.7` 的“初版静态盘点”语义混淆，补充当前真实状态如下：

1. `ai-orchestrator/src/modules/browser/intent/index.ts` 已新增并生效，`browser` 模块外部不再直接深链路引用 `profiles/`、`atomic-parsers/`、`ai-planner/` 下的实现文件。
2. `control-plane/src/modules/execution/index.ts` 已完成公开导出收敛，源码侧未发现模块外部直接引用 `execution/adapters/`、`execution/state/`、`execution/step-runner/`、`execution/human-control/`、`execution/recovery/` 的情况。
3. `workflow` 与文档生成当前不只是 adapter 落位：
   - workflow 运行时接入位于 `execution/adapters/workflow-runtime.adapter.ts`
   - 文档生成运行时接入位于 `execution/adapters/document-runtime.adapter.ts`
   - workflow activity 状态回写位于 `execution/state/workflow-activity-progress.service.ts`
   - 文档产物提取与结果落库当前由 `document-runtime.adapter.ts` 与 `runtime-result.interpreter.ts` 共同承担
   - 运行时失败兜底已统一收敛到 `execution/recovery/execution-failure.service.ts`
4. `flow-execute` / `document-render` 所在的 `react-engine` 触点仍属于“依赖验证范围”，但不属于本次物理 `git mv` 范围；这条边界保持不变。
5. 当前尚未满足文档 `10.8` 提到的“形成可审计 commit 序列”条件，因此最终完成态应视为“代码与最小验证已完成，提交审计链待补齐”。

### 9.9 循环依赖治理记录（2026-06-22）

本轮已把之前 `madge` 暴露的 `5` 条循环依赖全部收口，相关处理如下：

| 序号 | 原循环依赖 | 本轮治理动作 | 当前状态 |
| :--- | :--- | :--- | :--- |
| 1 | `modules/browser/execute/recorder-debug.service.ts -> modules/browser/execute/recorder-debug-chat-execution.service.ts -> modules/browser/execute/browser-execution-controller.service.ts` | 新增 `execute/recorder-debug.types.ts`，将共享类型从主服务下沉并切断类型反向依赖 | 已清零 |
| 2 | `modules/browser/execute/recorder-debug.service.ts -> modules/browser/execute/recorder-debug-execution.service.ts` | 将 `BrowserExecuteResponse`、`RecorderDebugObservation` 改为共同依赖 `recorder-debug.types.ts` | 已清零 |
| 3 | `modules/browser/execute/recorder-debug.service.ts -> modules/browser/observe/recorder-debug-observation-refresh.service.ts` | 将 observation refresh 改为依赖 `recorder-debug.types.ts` | 已清零 |
| 4 | `modules/react-engine/tool-executor.ts -> modules/react-engine/tools/index.ts -> modules/react-engine/tools/script.tool.ts` | 移除 `tool-executor.ts` 对 `./tools/index.ts` 的直接类型依赖，改为通过 `getTool('flow_execute')` 调用稳定网关 | 已清零 |
| 5 | `modules/execution/step-runner/browser-phase.executor.ts -> modules/execution/recovery/browser-phase-recovery.planner.ts` | 新增 `step-runner/browser-phase.types.ts`，把 `BrowserPhaseCommand` 抽离为共享类型 | 已清零 |

收口结论：

1. `npx --yes madge --circular --extensions ts apps/backend/orchestration/ai-orchestrator/src` 当前为 `No circular dependency found`
2. `npx --yes madge --circular --extensions ts apps/backend/orchestration/control-plane/src` 当前为 `No circular dependency found`
3. 文档第 `10.4` 项的当前阻塞项已从“循环依赖未清零”切换为“按 Batch 拆分的 commit 审计链尚未补齐”

---

## 10. 最终执行检查清单

在宣告重构完成前，必须满足以下全部条件：

1. 完整迁移清单中的所有文件已按目标路径完成 `git mv`。
2. `intent/index.ts` 与 `execution/index.ts` 已完成公开导出收敛。
3. 不存在模块外部直接引用子目录内部实现文件的情况。
4. 每个迁移批次均已独立完成编译、测试与循环依赖检查。
5. NestJS 模块装配项已逐项复核，无 provider/export 漏改。
6. `workflow` 执行链与文档生成链已经完成专项验证，确认关键成功路径与失败路径可用。
7. `workflow-orchestrator/` 与文档生成相关旧目录在确认“职责已迁移完毕且全仓无引用”后才被删除。
8. 最终形成可审计的 commit 序列，能够清晰对应各批次迁移动作。

### 10.1 当前完成度（2026-06-22）

1. 第 `1`、`2`、`3`、`5`、`6` 项已按当前工作区真实状态完成，相关代码迁移、公开入口收敛、NestJS 装配复核以及 `workflow` / 文档生成专项验证均已落地。
2. 第 `4` 项当前已补齐 `madge --circular` 审计记录，且 `ai-orchestrator` 与 `control-plane` 两侧源码范围均已清零循环依赖，因此该项按当前工作区状态已满足。
3. 第 `7` 项当前处于“物理范围内无待删旧目录、全仓层面仍有合法历史命中”的状态，因此只能视为部分满足，不能提前宣告仓库级旧目录清理完成。
4. 第 `8` 项当前尚未满足；根据 `8.5` 的 Git 审计结果，当前问题不只是“还没写 sha”，而是仓库本身尚未形成按 Batch 拆分的真实提交序列，因此后续如需达到文档定义的最终完成态，必须先补齐可审计的提交链与回滚点。
