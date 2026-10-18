# 第二次语料全量复审：审计记录

范围：54 份既有合同（6 商业类型 × 中/日/中日 × DOCX/PDF/TXT），工作模式上传与 SSE、真实 35B、执行持久化、模型账本、HTML 下载。API 端到端，不包含浏览器上传控件；不是完整法律正确率测评。

新增门禁：受支持业务类型、已知双语账期冲突、降级诊断。旧门禁结果另列，避免因门禁变化直接比较总通过率。首轮与复测分别保存，不合并为首轮通过。

已验证问题：
1. PDF 标题抽取把 `[第 1 页]` 当标题（document-prober.service.ts:401–418），标题规则失效后正文采购关键词先于 NDA；原文“本协议不构成采购……”也匹配，CT03 中文/双语 PDF 被绑定 procurement。推断值被记录成 user_input，来源可信度不当。
2. 参数 recognizer 两次生成 customCheckpoints 字符串数组，绑定器 normalizeBySchema 只验证 Array.isArray，未递归校验 items；冻结后调度器正确以 INPUT_SCHEMA_VIOLATION 拒绝。模型格式错误与工程缺乏前置修复共同导致任务失败。
3. recognizer 网络失败或空对象时，明确用户立场未可靠保留，输出 positionSource=default。默认 buyer 数值恰好相同不等于确认用户立场。
4. CT04 日文/双语 PDF 分批语义结果解析失败，三个条款降级。新增 diagnostics 提供 modelId、attempt、elapsedMs、INVALID_JSON_RESPONSE 与截取片段，确实改善定位。rawSnippet 是截取片段，不能仅据其结尾推断 provider 截断，需完整响应证实。

31 项隔离/故障注入测试全部通过，不能替代真实模型和链路稳定性验收。
