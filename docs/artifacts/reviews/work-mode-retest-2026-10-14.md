# 工作模式修复后端到端复测

日期：2026-10-14，Asia/Shanghai，22:02–22:06。通过已登录admin的用户端真实浏览器，在企业协同模式、Auto模型、思考中、联网及知识自动检索关闭状态执行。没有修改业务代码。

结论：上轮工作空间查询的输出Schema错误已通过真实空结果和命中结果两条链路验证修复；帮助文案修复生效。无附件提取仍显示内部字段fileBase64，未达到友好提示验收要求。

| 用例 | 结果 | 证据 |
|---|---|---|
| 原失败完整自然语言查询原样重放 | 通过 | 状态已完成，明确未检索到E2E_WORK_MODE_NONEXISTENT_20261014；执行301a79a9-1a48-44d8-9a2a-c19bc94716fa；聊天流33.383秒 |
| `/doc 保密合同`真实命中分支 | 通过 | 页面报告30项相关文档，呈现4项文档链接及行引用；执行58204936-bb49-40dd-963c-2ea1163ecb2e；聊天流15.926秒 |
| `/help`工作模式帮助 | 通过 | 显示“企业工作能力（当前已就绪）”，不再要求切换模式；聊天流9毫秒 |
| 原样无附件`/extract` | 友好提示未通过；缺参拦截通过 | 待补输入、没有伪造正文，但页面仍在“待补字段”列出fileBase64；没有显示待提取的文档附件或上传引导；聊天流7.085秒 |
| 完成后刷新 | 已有结果及待补状态可恢复 | 刷新后可读取命中文档结果与提取任务待补输入状态，fileBase64仍可见；不将此检查视为完整历史排序专项通过 |

## 生效与执行证据

服务状态检查显示AI Orchestrator及Control Plane已在21:57附近重启，测试时约运行4分钟。通过仓库根目录的`./docker/start-smart.sh dev ps`和`logs`核查。PROJECT_ROOT指向当前仓库。

源码差异确认：工作空间handler删除results输出，新增引号关键词提取及兜底限制；帮助按task模式调整；后台缺参展示新增友好标签逻辑。本轮两项工作空间执行均在Control Plane完成全部确定性步骤，AI Orchestrator记录终态succeeded；本轮收集日志中未出现OUTPUT_SCHEMA_VIOLATION。

首次完整查询现明确返回未找到目标词，而非因命中无关文档进入旧Schema错误分支；额外的保密合同查询验证了命中分支也通过，避免只覆盖空结果路径。

## 残留问题

后端标签映射的修改尚未使真实用户界面显示友好名称。`TaskMessageBlocks.tsx`中的待补项读取name、description、group_label、display_name，再通过resolveWaitingInputDisplayLabel显示；后端presentation改动提供的是label。字段传播或前端映射需要继续核查，此为定位线索，未凭源码差异直接认定唯一根因。

本轮没有上传附件继续提取，没有执行邮件发送、通知或日程创建。未对工作模式所有能力做全面验收。保密合同用例只查询已有测试文档，不修改或发送它们。

## 证据文件

- work-mode-retest-2026-10-14-runtime.txt：测试会话、执行编号、终态与耗时日志。
- work-mode-retest-2026-10-14-fingerprints.json：相关源码SHA-256。
- work-mode-retest-2026-10-14-empty-ui.txt：原失败请求复测成功DOM。
- work-mode-retest-2026-10-14-hit-ui.txt：真实命中结果DOM。
- work-mode-retest-2026-10-14-help-ui.txt：修复后的help DOM。
- work-mode-retest-2026-10-14-extract-ui.txt：仍显示fileBase64的DOM。
- work-mode-retest-2026-10-14-history-ui.txt：刷新后的结果与待补状态DOM。
- work-mode-retest-2026-10-14-extract-after-refresh.png：刷新后残留问题截图。
