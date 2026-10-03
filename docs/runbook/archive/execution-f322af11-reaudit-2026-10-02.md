# 执行 f322af11 修复后复审

执行 ID：`f322af11-e67c-4c89-97d8-c927fe39f60e`。复审日期：2026-10-02，约北京时间 21:52–22:03。

## 结论

**部分修复有效，但尚不能判定审计闭环通过。** 本次核对当前源代码、三个容器的编译产物、目标执行的持久化数据，并运行隔离单元测试与边界诊断。发现两个新的 P1 审计问题：尚未批准的接管被输出成“人工已批准”；重复解决同一阶段会误关闭其他阶段的待决接管。

这条执行的原始业务成功结论不变：三条案件完成审批，其中两次人工介入；没有新增执行、重新审批或修改历史记录。上述新问题通过当前编译代码的内存模拟复现，不能倒推为这条历史执行曾发生审批绕过。

## 修复核对

| 原问题 | 复审结果 | 验证依据及剩余边界 |
| --- | --- | --- |
| pending 与 requested 契约不一致 | 基本路径已修复 | 新建使用 requested；resolver 同时接受 pending/requested，且仅在更新到记录后更新摘要；跨阶段兜底存在 P1 问题 |
| 新接管缺少运行会话关联 | 单阶段路径已修复 | 编译 helper 从步骤/阶段取得 runtimeSessionId；内存诊断生成 requested、session-A |
| 17+24+27 累计历史膨胀 | 串行路径已修复 | 编译 appendSteps 串行三次提交后 27 行；并发仍可能重复，数据库没有对应唯一约束 |
| 动作开始时间记录过晚 | 正常执行入口已修复 | 编译 BrowserService 在调用动作前传入时间；模拟 30ms 动作测得开始早于观察 32ms |
| 阶段步骤不映射时间 | 部分修复 | click 的 attemptedAt/observedAt 正确映射；branch 生产端没有时间，映射仍为 null |
| 恢复后步骤尝试号重置 | 已修复核心路径 | 从历史恢复 step_7=2、step_10=1，下一次分别为 3、2；阶段 attempt 仍固定为 1 |
| 当前接管状态残留 | 修复引入回归 | 恢复初始化会清理当前 reason；但输出 adapter 在未恢复时也删 reason 并声称已批准 |
| oldStatus 首次错误为 queued | 修复未成立 | 更新状态后才查询“旧”状态，复现 human_control → human_control |
| 业务结果摘要与处置凭证不足 | 尚未完成 | 历史结果仍为整页文本；未见本次修复建立案件、接管 occurrence、处理人及时间的完整输出关联 |

三个服务均于北京时间 21:09 左右启动。核对的编译时间先于 Node 服务进程启动，且晚于对应源码修改：

- control-plane：编译 21:09:39–40，服务 Node 21:09:42 启动。
- platform/release-manager：编译 21:09:49，服务 Node 21:09:58 启动。
- browser-worker：编译 21:09:38，服务 Node 21:09:39 启动。

因此这里发现的问题存在于当前容器编译版本，不能用“容器尚未重启”解释。

## 需要继续修复的问题

### P1：未批准的接管被输出成已批准

[BrowserLegacyOutputAdapter.build](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/release-manager/src/publisher/browser-runtime-result/browser-legacy-output.adapter.ts:13) 无条件删除 takeoverReason，只要 lastBranchDecision.result 为 takeover，就改成 resumed_approved 并设置 resolvedByHuman=true。它没有校验执行是否恢复、是否收到人工处置或处置对应哪个 occurrence。

实际调用链：分支接管 → runtime 的 failWithAudit 闭包 → buildRuntimePayload → adapter.build → buildFailureResult。失败和暂停响应也使用同一个 adapter。

在平台容器中直接调用编译 result service，以“首次触发接管、无人审批”的状态构造返回值：

```json
{
  "status": "takeover_required",
  "success": false,
  "requiresTakeover": true,
  "returnedEvidence": {
    "lastBranchDecision": {
      "result": "resumed_approved",
      "stepId": "step_9",
      "resolvedByHuman": true
    }
  }
}
```

这会生成相互矛盾的审计证据；本次没有证明顶层接管阻断被绕过。建议 adapter 原样保留当前状态和原始分支判断，在确认 reconcile 对应 occurrence 后另写 resolution（takeoverId、处理人、时间、理由）。恢复入口也不能仅凭 resumeFromStepId 推定人工批准，因为它还用于重试。

### P1：reconcile 后再 resume，可能关闭另一阶段的接管

[resolveTakeoverRecord](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/state/execution-phase.service.ts:680) 在指定阶段更新到零行时，改为按 executionId 关闭最新 requested/pending，移除了 phaseId 限制。

正常流程在 reconcile 中调用 resolver，resume 的 resolvePhaseTakeoverAndMarkRunning 又调用一次。第一次已关闭 A 阶段，第二次 A 阶段匹配不到，便可能关闭 B 阶段，并将 A 的处理人与说明写到 B 上。

编译服务配合内存数据库替身复现：

| 操作 | A 阶段 | B 阶段 |
| --- | --- | --- |
| 初始 | pending | requested |
| 第一次 resolve(A)，模拟 reconcile | resolved | requested |
| 第二次 resolve(A)，模拟 resume | resolved | **resolved（B 未批准）** |

同一阶段存在多个遗留 occurrence 时，也会误关闭另一 occurrence。建议使用明确 takeoverId，重复调用返回既有处置结果；不允许因匹配不到而关闭其他待决行。执行摘要应从实际剩余待决记录推导，而不是解决任意一条后就宣称全部 resolved。

### P2：步骤更新再插入不具备并发幂等性

[appendSteps](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/state/execution-phase.service.ts:465) 采用 UPDATE，零行时 INSERT。两个并发提交可以同时更新零行，再各自插入。

只读查询 pg_indexes：该表只有 id 主键唯一索引和普通 phase_id 索引，没有 `(phase_id, step_index)` 唯一约束。编译方法内存并发诊断对同一个 ordinal 提交两次，得到两行；串行累计 17→24→27 的诊断得到 27 行。

建议先审查并清理旧重复数据，定义稳定 occurrence 身份，再加唯一约束并使用原子 INSERT ON CONFLICT。若采用现有 phaseId+stepIndex，应同时保证 ordinal 在恢复历史中稳定；不能只按 stepId 去重不同循环。

### P2：事件 oldStatus 查询发生在状态变更之后

[handleTakeoverRequiredStep](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/plan-runtime/deterministic-plan-scheduler.helpers.ts:476) 在第 411 行已把执行改成 human_control，第 479 行才查持久化状态，得到的已是新状态。

编译 helper 模拟“内存 queued，数据库原先 running”，最终事件为 oldStatus=human_control、newStatus=human_control，原 running 转移仍然丢失。建议从状态转换前的读取或原子更新结果取得 oldStatus，避免先写后读。

### P2：验收脚本吞掉失败断言，仍声称全部通过

[verify-audit-fixes-e2e.ts](/Users/chain/Documents/MyProject/ops-automation/tests/verify-audit-fixes-e2e.ts:299) 的 catch 包住了时间戳倒挂断言。时间倒挂、缺失时间字段或接口失败，都不能让这部分验收失败；最后仍打印 ALL E2E VERIFICATIONS PASSED。

提取原脚本对应代码块、用内存 axios 替身返回 attemptedAt 比 observedAt 晚 10 秒，实际输出包含“attemptedAt is later than observedAt”，随后仍输出全部通过。

此外，脚本第 3 步只断言 checkpoint 中的 attemptByStepId，没有执行恢复并检验 reason 清理；第 2 步直接构造非空 startedAt/endedAt，没有覆盖 runtime producer → mapper 的真实链路。所以它不能证明分支时间完整或输出批准状态正确。建议断言异常直接失败；环境不可用明确记为 skipped，并补上未批准接管、重复 resolve、并发提交和分支时间场景。

## 历史数据状态

与首次审计快照相比，本次读取的七个共有部分（execution、steps、events、phases、phaseSteps、takeovers、sessions）完全一致。首次快照另有 plan，本次没有重读该部分。

- 执行仍 succeeded，摘要 takeover_status=resolved；updated_at 仍为北京时间 20:42:00.244。
- 两条接管仍 pending；resolved_by、resolved_at、runtime_session_id 均为 null。
- 阶段步骤仍 68 行、27 个独立 ordinal；68 行均缺 started_at/ended_at。
- 原最终摘要与原始时间倒挂仍保留。

代码修复不会自动更改已结束执行。这些旧记录需要独立的数据修复或审计补充，依据原 reconcile/resume 事件逐条关联，保留原始证据；不应重新执行 ERP 审批来修复审计表。

## 验证范围

通过仓库根目录的 `./docker/start-smart.sh full exec -T ...` 完成容器验证，PROJECT_ROOT 指向当前仓库。

现有单元测试：**6 组、21 个用例全部通过**。

| 服务 | 测试文件 | 结果 |
| --- | --- | --- |
| control-plane | execution-phase.service、execution-phase-sync.service、recovery-checkpoint.mapper、execution-human-control.service 的 test.ts | 4 组 / 16 用例通过 |
| release-manager | capability-release-browser-runtime.service.spec.ts | 1 组 / 2 用例通过 |
| browser-worker | browser-post-action-state.service.spec.ts | 1 组 / 3 用例通过 |

另做编译模块隔离诊断：首次接管返回证据、重复 resolver、串行和并发累计历史、旧状态事件、恢复计数、动作前时间戳、阶段时间映射；验收脚本代码块用 VM 和 axios 替身验证。

没有直接运行会写数据库并调用浏览器的完整 E2E 脚本，没有触发新的审批、迁移历史数据、修改业务代码或重启服务。现有单测通过与边界复现失败同时成立，修复验收仍需补齐上述场景。

建议顺序：先修复两项 P1，再完成原子步骤持久化和状态事件、纠正验收脚本；补齐分支时间、阶段 attempt 和业务结果输出后，使用隔离数据运行三轮、两次人工接管的完整验收。
