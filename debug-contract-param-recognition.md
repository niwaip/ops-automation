# Debug Session: contract-param-recognition
- **Status**: [OPEN]
- **Issue**: 创建技术服务合同时，用户已在自然语言中提供部分字段，但执行单仍提示“首次还是无法识别参数”，需要定位补充输入在端到端链路中的丢失点。
- **Debug Server**: Pending
- **Log File**: .dbg/trae-debug-log-contract-param-recognition.ndjson

## Reproduction Steps
1. 发起“创建技术服务合同”请求，并在首轮输入中提供“验收期限为30天，委托方名称为广州日产通商贸易有限公司”等字段。
2. 等待工作流进入“等待输入”状态。
3. 观察系统返回的待补充字段列表是否仍包含已在首轮提供的字段。
4. 补充剩余字段后，再次观察是否仍无法识别参数。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 自然语言提取后的字段键名与模板工作流期望键名不一致，导致已识别值未命中必填字段 | High | Med | Pending |
| B | 补充输入合并逻辑只保留当前轮次或覆盖已有值，导致首轮识别结果在进入校验前被清空 | High | Med | Pending |
| C | “技术服务合同”模板的必填字段映射缺少同义词归一，如“验收期限”未映射到“验收期限天数” | High | Low | Pending |
| D | 执行单恢复/等待输入状态回填时读取了旧上下文，最新消息未参与二次识别 | Med | Med | Pending |
| E | 参数在编排层已存在，但 `template-workflow.service.ts` 或 DTO 转换阶段过滤掉了字段 | Med | Med | Pending |

## Log Evidence
[Pending]

## Verification Conclusion
[Pending]
