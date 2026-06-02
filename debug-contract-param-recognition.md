[OPEN] contract-param-recognition

# Debug Session

## User Request
- 直接端对端
- 用任务模式
- 生成技术服务合同
- 需要自然语言
- 生成全部参数
- 不写脚本，直接测试
- 判断目前参数识别是不是有问题

## Hypotheses
1. 任务模式未命中“技术服务合同”模板或意图。
2. 参数抽取阶段字段映射错误或层级不一致。
3. 编排阶段覆盖或裁剪了已抽取参数。
4. “生成全部参数”未触发参数补全策略。
5. 任务模式入口与其他入口行为不一致。

## Constraints
- Steps 1-4 不修改业务逻辑。
- 第一处代码变更仅允许加入取证日志。
- 优先通过直接运行现有入口完成复现。

## Reproduction
- 登录：`POST http://127.0.0.1:3001/auth/login`
- 任务入口：`POST http://127.0.0.1:3007/ai/chat`
- 模式：`config.mode=task`
- 输入：`.tmp/tech_service_natural_request.txt`

## Runtime Evidence
- 本次执行单：`66f72a19-839a-40a3-80fe-c07902a27110`
- 最终状态：`succeeded`
- 下载地址：`http://192.168.100.143:3009/studio/download/1faa9ec9-e472-439d-b99c-b5fabd948b72`
- Temporal：`http://192.168.100.143:8088/namespaces/default/workflows/agent-session-activity-1780057141575-9zxph6`
- planner 请求上下文包含 `auto_fill_missing_required: true`
- 同次执行的 `normalizedInput.requiredInputs` 暴露识别错误：
  - `contract.partyA` => `（待补充）`
  - `items[].productName` => `["（待补充）"]`
  - `items[].projectName` => `["（待补充）"]`
  - `items[].maintenanceFee` => `[0]`
  - `contract.serviceName` => `合同`
  - `contract.partyB.representative` 错填成甲方代表内容
  - `otherTerms.title` => `is Technical Service Contract / Technical Service Contract in Japanese bilingual layout.`
  - 多个字段带入英文句子残片，如 `contract.partyA.name` / `contract.partyA.phone` / `contract.partyA.fax`

## Hypothesis Status
1. 任务模式未命中“技术服务合同”模板或意图。=> 否
2. 参数抽取阶段字段映射错误或层级不一致。=> 是
3. 编排阶段覆盖或裁剪了已抽取参数。=> 待进一步验证
4. “生成全部参数”未触发参数补全策略。=> 否，本次有自动补齐兜底
5. 任务模式入口与其他入口行为不一致。=> 高概率是

## Interim Conclusion
- 当前参数识别仍然有问题。
- 本次 E2E 的“成功执行”不等于“识别正确”，更像是被自动补齐/兜底策略掩盖。
