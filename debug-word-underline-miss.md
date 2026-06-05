# Debug Session: word-underline-miss
- **Status**: [OPEN]
- **Issue**: 英文下划线参数 "Place where the technical service is to be rendered:" 未被识别
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-word-underline-miss.ndjson

## Reproduction Steps
1. 打开包含中英双语技术服务地点/期限的 Word 模板
2. 触发参数识别
3. 观察英文下划线参数是否出现在候选结果和调试日志中

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 英文段落的空格候选没有被底层空白扫描采集到 | Med | Low | Pending |
| B | 英文空格候选采到了，但 `font.underline` 检查失败，未写入 underline anchor | High | Low | Pending |
| C | 中文段落成功、英文段落失败，但英文被镜像兜底规则显式排除 | High | Low | Pending |
| D | underline anchor 已产出，但在 `detect-rule-underline.ts` 后续构造参数时丢失 | Low | Low | Pending |
| E | 段落索引/文本映射错位，导致分析对象不是最终那条英文段落 | Low | Med | Pending |

## Log Evidence
- Waiting for user rerun

## Verification Conclusion
- Pending
