# 第三次复审审计记录

使用相同 54 份语料、相同增强门禁、35B 和并发 2；真实 API E2E；本轮未改业务源码。重启 ai-orchestrator/control-plane 后确认编译产物含标题过滤和数组转换。31/31 故障注入、57/57 参数与探测回归通过。

P1: 字符串数组修复未覆盖真实 schema 投影链路。CT03-zh-ja-docx 首轮 INPUT_SCHEMA_VIOLATION，冻结 customCheckpoints 为五个字符串。CapabilityCandidateSelectorService.toRecognizerProperty (538-561) 和 pickSchemaConstraints (564-577) 未保留 items；_rawInputSchema 实际也是有损投影。运行编译代码最小复现 schema-projection-probe.json：完整 schema 的 normalizeBySchema 转为对象；投影后 items 消失，返回原字符串数组。不能再归因成仅模型不守格式，也不是容器未加载修复。

建议完整 schema 与用于 LLM 提示的摘要分开保存；转换/冻结前用执行端同源完整 schema 校验；新增从 manifest 经 projection、recognizer、binder 到 scheduler 的组合回归。不要通过放松调度器门禁消除报错。

对 generic binder 新转换的边界观察：它硬编码 title/rule，只检查 object 而未递归 properties/required，也可能丢弃不兼容元素。合同当前宽松 schema 可兼容，但不应当作通用递归 schema 校验已经完成。此点为代码审计建议，不能冒充本轮已发生的 E2E 故障。
