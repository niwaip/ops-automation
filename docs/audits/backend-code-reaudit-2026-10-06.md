# Backend 修改后复审

> 本报告保留第二轮审查时的证据。代码再次修改，当前结论请查看[第三轮审查](/Users/chain/Documents/MyProject/ops-automation/docs/audits/backend-code-reaudit-round3-2026-10-06.md)。

日期：2026-10-06（Asia/Shanghai）。基线：`613e1b70` 加当前未提交修改。范围：`apps/backend` 本轮修改，以及上次发现对应的调用链和残留。前端并行修改不属于本报告范围。

结论：上次发现的校验器接线、队列透传、5 个无调用符号和过时说明已有修改。仍确认 2 个行为问题：新能力边界检查在完整草稿生成流程中只产生警告；旧版本匹配会错误放行 `v10`、`v20`、`v30`。未接入包、复制实现及大文件债务仍在。

本轮没有修改业务源码，没有启动或重启容器；只新增复审报告，并为旧报告添加历史状态提示。

## R1 · P1：禁止的旧 Activity 在自动修复失败后仍进入草稿

现在正式服务确实调用了合并后的校验器：[新版本边界规则](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft-plan.helpers.ts:113) 会报告 `builtin:aiStructuredTransform` 已弃用。但 [最终问题处理](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft.service.ts:650) 将两轮自动修复后仍存在的所有问题转成 `warnings`，返回原计划。

[生成入口](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft.service.ts:233) 随后继续物化；[步骤物化](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft.service.ts:755) 只检查 Activity 是否注册，因此已注册、但新版本禁止使用的旧 Activity 仍被转换成 `type: 'activity'` 的步骤。

复现：对当前 TypeScript 源码现场转译，执行实际 `generateWorkflowDraft`。只替换资源获取、模型分析/解析和模型修复阶段，令模型两轮均保留同一个禁止步骤；使用实际校验、修复协调与草稿物化逻辑。计划其余配置有效，且不声明旧版本。

```json
{
  "returned": true,
  "repairAttempts": 2,
  "activityRefs": ["builtin:aiStructuredTransform"],
  "warnings": ["AI 草稿自动修复后仍需确认: …使用了已弃用的 builtin:aiStructuredTransform…"]
}
```

影响：校验器已接线，但“新任务必须使用独立 llm_operation”的约束仍未在草稿生成出口强制执行。已确认的是草稿返回行为；未据此断言发布或执行阶段也会放行。

建议：区分禁止能力与可由用户补齐的配置问题。禁止能力在修复结束后仍存在时应拒绝生成，或先转换成合法计划节点并重新验证；普通草稿配置问题可继续以警告呈现。补充完整 `generateWorkflowDraft` / `refineAiWorkflowDraft` 流程测试，覆盖模型持续返回禁止步骤的情况。现有新增测试只验证 `validatePlan` 返回问题，不能覆盖最终出口。

## R2 · P2：旧版本前缀匹配误认新版本

[isLegacyWorkflowVersion](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft-plan.helpers.ts:823) 默认兼容列表为 `v1,v2,v3`，但 [第 844 行](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft-plan.helpers.ts:844) 使用 `startsWith`，没有版本片段边界。

直接运行当前源码、使用默认兼容列表：

| 输入 | 当前结果 |
| --- | --- |
| `v1.0.0` | 旧版本 |
| `v4.0.0` | 新版本 |
| `v10.0.0` / `v20.0.0` / `v30.0.0` | **旧版本，误判** |
| `v1garbage` | **旧版本，误判** |
| `unknown` | 新版本 |

实际服务 `validatePlan` 对配置完整、版本为 `v10.0.0` 的 `builtin:aiStructuredTransform` 计划返回 `[]`。这条路径甚至不会产生 R1 中的能力边界警告。

建议：明确兼容列表的含义，按完整版本或主版本片段比较，校验合法版本格式；补充 `v10/v20/v30`、非法后缀以及环境变量指定完整版本的用例。仅接受具有明确边界的旧版本。

## 上次发现的复核状态

| 上次编号 | 当前状态 | 证据与说明 |
| --- | --- | --- |
| F1 校验器断线 | 接线已修复，整体约束仍未完成 | 规则已合并到正式 helper，测试调用同一入口；剩余问题为 R1、R2 |
| F2 队列写死 | 源码已修复 | [runtime.main](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/sandbox-worker/src/worker/runtime.py:36) 传递 `config.task_queue`，HTTP server 保存该值，[handle_execute](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/sandbox-worker/src/api/sandbox_http_server.py:69) 将其传给 `start_workflow` |
| F3 未接入包 | 仍在 | `master-planner`、`agent-catalog`、`template-registry`、`audit-policy` 包仍存在；仓库中包名引用只有各自 manifest，尚未发现实际消费者 |
| F4 Python 实现复制 | 仍在 | 两个 Worker 的 6 组运行时文件 SHA-256 仍完全相同 |
| F5 无调用符号 | 已清理 | `findTemporalCredentialDefaults`、`inferImageArrayPath`、`UploadTemplateDto`、`ParseTemplateDto`、`TakeoverRequestDto` 在源码检索中均无残留；相关测试和类型检查通过 |
| F6 工具复制 | 仍在 | `input-label.ts` 和 `filename-encoding.util.ts` 的两组副本仍分别完全相同 |
| F7 过时说明 | 原发现已修复 | README 更新了实际目录和 workbench 位置；FreezeService 的旧 TODO/placeholder 已改为实际行为说明 |
| F8 大文件 | 仍在 | 8 个业务源码超过 1200 行建议线，另有 1 个 Python 测试；1600 行红线检查通过 |

`temporal-workflow-draft-plan-validation.helpers.ts` 现在只有 10 行 re-export，不再重复实现校验。可作为旧导入路径的轻量兼容入口保留；它不再属于双份逻辑问题。

共享实现仍需按边界提取，不能直接删除其中一个服务的副本。尚未接入包属于迁移计划债务，删除前仍需确认仓库外消费者。具体文件与拆分建议可参照[首次报告](/Users/chain/Documents/MyProject/ops-automation/docs/audits/backend-code-audit-2026-10-06.md)。首次报告中的旧源码行号仅反映首次审查时状态。

## 验证

通过的检查：

- Jest：3 个套件、18 个测试通过。包含 `temporal-workflow-draft-plan-validation.test.ts`、`temporal-workflow-draft.output.test.ts`、`temporal-runtime-credential.resolver.spec.ts`。平台测试临时将模块映射从 `dist` 指向 `src`，避免旧构建产物影响结论。
- `pnpm --filter @ops/workflow-registry run typecheck` 与 `pnpm --filter @ops/replay-engine run typecheck`：通过。
- `node scripts/check-workspace-architecture.mjs`：51 个包检查通过。
- `bash scripts/check-file-complexity.sh`：1600 行红线通过，1200 行警告仍为 9 个文件。
- `node apps/backend/capabilities/document-domain/scripts/build-studio-web.mjs --check`：通过。
- 两个修改后的 Python 文件：`compile()` 语法检查通过。
- 从实际 Python AST 加载 HTTP server 类，以模拟 HTTP/Temporal 客户端运行 `handle_execute`：`audit-custom-task-queue` 被实际传给 `start_workflow`，接口返回 `success: true`。没有连接真实 Temporal。
- 当前源码的完整草稿生成复现和版本函数现场执行：确认 R1、R2。

未通过的格式检查：`git diff --check -- apps/backend` 报告 [replay DTO 文件](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/replay-worker/src/dto/index.ts:132) 文件末尾新增空行。属于低影响格式问题，本轮未修改用户源码。

限制：没有运行完整后端测试集、数据库集成或容器端到端验证。Python 环境缺少 `aiohttp` / `temporalio`，队列验证使用模拟依赖。知识图谱已重新索引，关键结论结合真实 import、源码和执行结果核对，未仅用零入度判定死代码。本轮不能确认已运行容器加载了这些改动。

建议先处理 R1、R2，再按迁移计划处理未接入包、共享实现与大文件。
