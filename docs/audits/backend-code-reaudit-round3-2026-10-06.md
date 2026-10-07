# Backend 第三轮审查

日期：2026-10-06（Asia/Shanghai）。基线：`613e1b70` 加当前未提交修改。重点复核上轮 R1、R2，检查相关生成、改进流程，以及原有清理项是否回退。本报告只涵盖后端，前端并行改动不属于本轮范围。

结论：上轮 R1 已修复；R2 中 `v10/v20/v30` 的误判已修复，但非法版本仍可通过兼容门禁，留下 1 个 P2 行为问题。没有确认新的 P1。4 个未接入包、复制实现和大文件债务仍在。

本轮只新增本报告并更新历史报告提示，没有修改业务源码，也没有启动或重启容器。

## R3 · P2：非法版本字符串仍被认作旧版本

[matchesVersionSegment](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft-plan.helpers.ts:823) 已改为版本片段匹配。但 [主版本分支](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft-plan.helpers.ts:838) 只检查开头的数字及紧随其后的点号，没有验证后续字符串。

使用默认兼容列表 `v1,v2,v3`，当前源码的实际返回值：

| 输入 | 当前结果 |
| --- | --- |
| `v10.0.0` / `v20.0.0` / `v30.0.0` | 新版本，已修复 |
| `v1garbage` | 新版本，已修复 |
| `v1.garbage` / `v1..0` / `v2.foo` / `v3.` | **旧版本，仍误判** |

[完整版本配置分支](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft-plan.helpers.ts:844) 也允许继续追加数字段：设置 `OPS_LEGACY_WORKFLOW_VERSIONS=v1.0.0` 时，`v1.0.0.1` 返回 `true`。

完整生成复现：模拟模型返回版本为 `v1.garbage`、含 `builtin:aiStructuredTransform` 的计划；其余配置有效，包括非空 `outputSchema`。调用实际公开入口 `TemporalWorkflowService.generateAiWorkflowDraft`，资源列表使用真实 BuiltinActivityRegistry，数据库和模型 HTTP 调用为模拟依赖，保留实际解析、修复、校验和物化过程。结果：

```json
{
  "malformedGenerationReturned": true,
  "activityRefs": ["builtin:aiStructuredTransform"],
  "warnings": []
}
```

影响：当模型产出的版本格式非法、但以旧主版本加点号开头时，兼容逻辑会错误授权旧 Activity；新增的两处强制拒绝均依赖同一版本函数，因此无法拦截。已确认到草稿返回行为，没有断言发布或执行端也会放行。

建议：先验证完整版本字符串符合明确的允许格式，再进行旧版本比较；非法值应按未知版本处理。保留 `v1` 这种明确支持的主版本写法，但不能仅靠开头匹配授予兼容权限。补充上述非法版本、完整版本环境变量及完整草稿生成用例。

## 上轮修复确认

| 项目 | 当前结论 | 验证 |
| --- | --- | --- |
| R1 禁止能力变成警告 | 已修复 | [修复后的最终问题处理](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft.service.ts:657) 对禁止能力抛出 BadRequestException；[物化入口](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft.service.ts:775) 再次检查。模型持续返回 `v4.0.0` 的旧 Activity 时，生成和改进两个公开入口均拒绝，并匹配禁止能力错误消息 |
| R2 主版本前缀误判 | 主要案例已修复 | `v10/v20/v30` 和 `v1garbage` 测试通过；非法点号后缀残留为 R3 |
| F1 校验器断线 | 保持修复 | 正式 helper 包含边界规则，服务和测试调用同一入口 |
| F2 队列透传 | 保持修复 | runtime → HTTP server → start_workflow 的配置传递仍在 |
| F5 五个无调用符号 | 保持清理 | 图谱与源码检索均无残留；凭据测试与类型检查通过 |
| F7 过时说明 | 保持修复 | 后端 README 与 FreezeService 说明仍为修正后的内容 |
| 上轮 EOF 格式问题 | 已修复 | `git diff --check -- apps/backend` 通过 |

现有新增测试对生成入口断言异常类型；本轮额外运行了匹配禁止能力错误消息的生成、改进流程验证，避免将其他 BadRequestException 误作门禁验证成功。

## 原有迁移及维护债务

- `master-planner`、`agent-catalog`、`template-registry`、`audit-policy` 仍存在。仓库包名引用仍只有各自 manifest，未确认真实消费者。属于尚未接入的迁移包，不能仅据静态无引用直接删除。
- `temporal-worker` 与 `sandbox-worker` 的 6 组运行时文件仍逐字相同，SHA-256 验证一致。应提取共享实现，保留各自启动/API 边界。
- `input-label.ts` 与 `filename-encoding.util.ts` 两组工具副本仍分别相同。
- 8 个业务源码超过 1200 行建议线，另有 1 个 Python 测试；1600 行红线检查通过。具体文件及拆分建议保留在[首次报告](/Users/chain/Documents/MyProject/ops-automation/docs/audits/backend-code-audit-2026-10-06.md)。
- 旧校验器文件现为轻量 re-export，仍不属于重复逻辑实现；是否移除兼容导入路径应另行确认消费者。

上述项目没有因本轮改动增加新的已确认行为故障。

## 验证与限制

通过：

1. 当前源码映射下的 6 个草稿相关 Jest 套件：65 个测试通过。覆盖 draft、normalization、validation compiler、helpers、output 和 plan validation；模块映射从 `dist` 临时改为 `src`，没有改仓库测试配置。
2. 凭据 resolver 套件：5 个测试通过。仓库内相关测试合计 **7 个套件、70 个测试**。
3. 临时源级行为验证：5 个检查通过，确认非法版本实际放行、完整生成返回、合法新版本生成/改进均拒绝，以及完整版本配置仍接受多余数字段。这些是对当前行为的观察验证，不能解释为 R3 已修复。
4. workflow-registry 与 replay-engine 类型检查：通过。
5. 工作区架构门禁：51 个包通过；复杂度门禁：通过，9 个建议线警告仍在。
6. Studio 生成一致性、两个修改后 Python 文件语法、后端 diff 格式检查：通过。
7. 移除符号引用检索、未接入包引用核对、重复文件内容比较：完成。

没有运行完整后端测试集、真实模型调用、数据库集成或容器端到端流程，不能确认运行中的服务已加载修改。图谱已刷新，关键判断结合源码和实际入口执行核实。

核心源码快照 SHA-256：

```text
temporal-workflow-draft-plan.helpers.ts
fa338d76e5a7b0ae103ec10cb7915908429b78eacb1bc3cd83113886c0fa9269
temporal-workflow-draft.service.ts
09ae96a4a5613078e60a84fc6bd0e1e459c7dca02c056564471cd25b18f40146
```
