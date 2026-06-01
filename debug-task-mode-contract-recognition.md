# Debug Session: task-mode-contract-recognition
- **Status**: [OPEN]
- **Issue**: 任务模式下用自然语言端到端生成技术服务合同时，需要确认首轮参数抽取与 waiting_input 恢复阶段是否存在参数识别异常。
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-task-mode-contract-recognition.ndjson

## Reproduction Steps
1. 使用任务模式直接发起“生成技术服务合同”的自然语言请求。
2. 观察 planner / createExecution 产出的首轮参数与缺失字段。
3. 如进入 waiting_input，继续用自然语言补充缺失信息。
4. 对比 recognizer / planner fallback / submitExecutionInput 的实际入参与输出。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 首轮 planner 未把自然语言中的已知合同信息完整抽取进执行单 input。 | High | Med | Pending |
| B | waiting_input 入口只接受 JSON 或标签式文本，普通自然语言在入口阶段被漏掉。 | High | Low | Pending |
| C | recognizer 在 waiting_input_resume 场景下对技术服务合同 schema 抽取不完整。 | Med | Med | Pending |
| D | planner fallback 识别到了字段，但后续 allowedKeys 过滤导致提交 payload 被裁剪。 | Med | Med | Pending |

## Log Evidence
- `employee(test/test123)` 登录后访问 `GET http://127.0.0.1:3001/skills` 返回 `{"skills":[]}`，说明当前普通员工账号看不到任何可执行技能。
- 使用 `employee` 对 `POST http://127.0.0.1:3007/ai/chat/stream` 发起自然语言技术服务合同请求时，任务未进入 control-plane 执行单链路，而是回退到 ReAct `flow_execute`。
- 同次流式事件中模型路由原因为 `task_type_code`；请求文案包含“直接测试”，命中了 `model-router.service.ts` 的 code 任务关键词规则。
- 回退后的通用流命中模板 `文档生成流程`（templateId `5ba1159a-f362-43ea-b5dd-15cca063d9be`），第 2 步 `AI生成参数` 直接报 `API调用失败: Request failed with status code 404`。
- `admin(admin/admin123)` 登录后访问 `GET http://127.0.0.1:3001/skills` 可见“技术服务合同渲染”等技能，说明技能可见性与角色相关。
- 使用 `admin` 对相同自然语言请求发起 `POST http://127.0.0.1:3007/ai/chat/stream` 时，响应中的参数识别 `llmResponseText` 返回了嵌套 JSON：
  - 形如 `{"contract":{"contractNo":...},"payment":{"bankAccount":...},"items":[...]}`；
  - 没有使用扁平字段键名，例如 `contract.partyA.name_cn`、`payment.bankAccount_cn`、`items[].productName_cn`；
  - 双语字段被合并丢失后缀，数组字段也被改写为对象数组。
- 本次调试会话未收到 waiting_input 插桩日志，原因是最新两次复现都未进入 `buildWaitingInputPayload()`：`employee` 直接回退通用流失败，`admin` 在首轮识别阶段已暴露格式错误。

## Verification Conclusion
- 假设 `A` 部分成立：首轮链路确实有问题，但当前更前置的阻塞点是“技能不可见导致回退通用流”。
- 假设 `B`、`D` 本轮未验证：请求未进入 waiting_input 提交流程。
- 假设 `C` 成立：在管理员可见技能的真实请求中，参数识别结果未遵守扁平 schema，说明“技术服务合同”的自然语言识别目前仍有问题。
- 当前结论：
  1. 普通员工账号下，直接 E2E 无法验证目标技能参数识别，因为 `/skills` 为空，任务会回退到通用流。
  2. 管理员账号下，目标技能可见，但自然语言参数识别仍存在明显问题，表现为返回嵌套 JSON 而非 schema 约定的扁平字段键。
  3. 因此，“目前参数识别是不是有问题”的答案是：**有问题，而且在当前环境下还叠加了角色可见性/路由回退问题。**
