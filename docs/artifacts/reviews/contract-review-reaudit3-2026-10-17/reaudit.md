# 工作模式合同审查 skill：第三轮复审（2026-10-17）

## 结论

修复有实质进展，但当前仍不满足语义结果可靠交付门禁。此前 15 个故障回归全部通过；本轮新增 13 个 finding 一致性/正向控制测试，9 通过、4 失败，总计 24/28。4 个失败属于同一个 P1 工程缺陷，不代表 4 个独立根因。

## P1：语义准入和 finding 落地规则不一致，风险被静默转换为通过

最小模型响应：`[{"clauseIndex":0,"findings":[{"severity":"HIGH"}]}]`（对全部 3 个模拟条款逐一返回）。

真实编排函数输出：`success=true`、`reviewStatus=completed`、`healthScore=100`、`passCount=3`、`llmReviewedCount=3`、`isDegraded=false`、`warnings=[]`；条款文案被补成“该条款权责约定明确对称”“条款符合规范，可按原约定保留”。见 `fault-evidence/T01.json`。

复现组合：T01/T02 为无 ruleId、无 reason，分别无 verdict / MATCHED；T05/T06 为未知 ruleId、无 reason，分别无 verdict / MATCHED。四组均明确携带 HIGH，全部静默 PASS。带 reason 或 GENERAL-RISK 的对应组合通过，明确 PASSED 的正向对照 T13 也通过。

代码位置：`contract-review-orchestrator.ts:490-508` 允许 severity HIGH 或 MATCHED 通过语义准入；`:551-583` 只有规则目录命中、GENERAL-RISK、reason/riskSummary 才生成实际 finding；`:615-627` 无落地 finding 且无顶层 riskLevel 时兜底 PASS。因此这不是模型自行判断 PASS，而是工程把未落地的风险变成 PASS。输入字段不完整可以拒绝/降级；也可以按统一规范接收并保留风险；当前静默通过不可接受。

建议把 finding 规范化、有效性判断、规则补全和风险推导合并为一次领域转换，返回有效 finding 或明确拒绝原因；后续只消费规范化结果。有效语义判定应建立在转换后的 findings 或明确顶层风险等级上。没有明确 PASS 依据时不得默认 PASS，改为降级并提示。增加“被接收的非 PASS 风险必须保留或披露降级”的不变量测试，避免只围绕上一轮三个反例补条件。

## 已验收修复

F01-F08、R01-R04、S01-S03 共 15/15 通过，包括批次完整性、重复/未知 ID、证据引用、模型故障、评分边界、缺失有效语义字段等。S01 仅 summary、S02 无效 riskLevel 加 summary、S03 findings=[{}] 均不再静默视为有效审查。

真实文档渲染服务复核 F05 模型全超时结果：HTTP 200；摘要明确标示“部分条款降级”，100 分旁有“评分仅供参考，不可作完整合规评价”，保留告警。见 `degraded-render.json` 和 `degraded-render.html`。

## 版本与日志边界

容器源码 SHA-256：`e6509d5e3c921b243d9b619e8620f281fd59cb5aa2c12dde6d1e36b4cc9889e5`。编译产物时间 2026-10-17 12:25:24 +0800，包含 hasDerivableFindings；控制面 12:25:28 重启成功，已核实新代码实际进入运行产物。证据 `runtime-version.txt`。

检查三服务 04:20 UTC 起日志，修复前可见 12:20 文档解析请求；不能把这些请求或之前 11:44/11:48 的五个用例视作 12:24 最新源码的 E2E 验证。过滤日志见 `runtime-filtered.log`。本轮 28 个 Jest 用例使用真实编排函数，mock 下游 HTTP，是隔离故障测试，不是实际模型 E2E。

本次未修改业务源码；新增第三轮测试和审计证据。此前完整 E2E 的覆盖结论仍有历史参考价值，但不等于本轮重新全量执行。

## 本轮补跑真实 E2E

当前修复编译部署后，重新从真实认证聊天接口执行 C01，执行单 `b7af13a2-c272-42d5-b0dc-702d1432d82f`，通过，耗时 87.360 秒。证据目录 `../contract-review-work-2026-10-16/run-2026-10-17T05-25-05.004Z/`，包括 request、SSE、execution、output、usage 与下载产物。工作模式链路为认证聊天 → 确定性单节点计划 → control-plane 内置合同审查 → carbone 解析 → 批次语义模型 → 报告渲染 → 成果下载。该正常路径通过不能否定上述故障输入复现，也不构成本轮 12 例全量回归。
