# 文档空间非向量检索相关性端到端测试

入口：`tests/e2e/doc-search-relevance/run.mjs`，仅依赖 Node 20+ 内置 API。

从仓库根目录运行，先通过统一入口启动环境：

```bash
PROJECT_ROOT="$PWD" ./docker/start-smart.sh dev up -d
DOC_API_URL=http://127.0.0.1:3001 DOC_TOKEN='<测试账号令牌>' node tests/e2e/doc-search-relevance/run.mjs
```

也可使用环境变量 `DOC_USERNAME` 和 `DOC_PASSWORD` 登录。可选 `DOC_WORKSPACE_ID` 指定专用测试空间，默认使用账号个人空间；建议使用空的专用测试账号，避免已有同关键词文档影响结果。`DOC_REPORT` 指定 JSON 报告路径，默认写入 `/tmp/GREPE2E*.json`。令牌和密码不写入报告。

每次上传 15 份 Markdown 文件，真实调用 AI 清洗，逐项检查 cleanedByAi 与 cleanedContent 中的关键事实，再调用 search-content 检索。需要可用的 AI 模型配置，会产生真实清洗调用。文件名采用随机批次编号，目标内容不出现在标题，防止靠标题命中掩盖正文漏检。结束时只删除本次创建的节点；报告中的 cleanupErrors 非空时需按记录的节点 ID 清理。

| 场景 | 验收标准 |
| --- | --- |
| AI 清洗 | 必须 cleanedByAi=true；姓名、金额、日期、完整编号、口令、命令与数量等指定事实在清洗正文保留 |
| 中英文混合、多实体查询 | 完整目标文件首位，不能只凭单实体或更新时间优先 |
| 编号、口令、姓名、金额 | 目标文件唯一命中 |
| 高频噪声 | 12 份反复包含安装配置等通用词的无关文件必须被过滤 |
| 未知实体加通用词 | 返回空数组，防止低相关候选穿透门槛 |
| 无匹配、单字符、空白 | 返回空数组 |
| 证据与性能 | 返回正整数行号与非空片段，记录每次查询耗时、首位排名、MRR 单查询值和 Precision@3 |

脚本会保留完整实际结果与失败断言，不预设测试必定通过。首位命中是硬门槛；Precision@3 与耗时作为观测指标，暂未设统一 SLA。阈值验证覆盖外部可见的过滤行为；接口未暴露分数和可调阈值，精确 24/25、44/45、79/80 分边界应由打分单元测试补充，不能用这些 E2E 宣称已验证数值边界。

该套件覆盖真实上传→AI 清洗→内容接口召回→排序结果链路，测试输入格式为 Markdown，尚未覆盖二进制 .doc/.docx 提取和聊天 /doc 路由。检索阶段只调用非向量 search-content 接口；仅凭客户端请求不能证明服务端零向量调用，严格验收还需在向量服务禁用的环境运行并检查服务端调用证据。不会把关闭聊天知识开关等同于已证明无向量依赖。

## 工作模式入口

`work-mode.mjs` 通过真实 `/ai/chat/stream`，使用 `mode=task`、`webSearch=false`、`workspaceSearch=false`，检查最终事实、引用及放行结果。`routeChecks` 单独记录执行单和 explorer 路径；不将路径差异直接判为门禁失败。空结果同时检查最终回答及工具交付结果不包含命中文档链接。使用已有公司测试文档，不上传或删除业务文件。

```bash
DOC_TOKEN='<测试账号令牌>' node tests/e2e/doc-search-relevance/work-mode.mjs
```

账号变量同上；可选 `DOC_CHAT_URL`、`DOC_CONTROL_URL` 指定聊天和控制面地址。`DOC_CASES=prefix,install` 选择场景，`DOC_EVIDENCE_DIR` 指定保存 SSE、执行详情及 report.json 的目录。默认 `/tmp/doc-work-mode-e2e`，每次复测建议指定新目录以保留历史证据。该脚本使用已存在的公司 fixture，运行前应确认其原文未被修改；安装场景需对应账号可见的 DeepSeek Harness 安装语料，缺少该语料时应视作前置条件不足，不能单凭答案判定召回失败。

2026-10-16 已完成真实运行：清洗/接口辅助测试 53 项断言通过 50 项；工作模式 API 六场景通过四项、失败两项，另在浏览器 admin 工作模式复现精确编号标签误召回。详见 [本轮报告](../artifacts/reviews/doc-work-mode-2026-10-16.md)。未修改业务代码，未宣称零向量依赖已得到服务端验证。

后续新门禁复测：发现旧dist未更新，重新构建workbench并重启platform后，五个工作模式最终门禁场景及admin原失败输入通过，13项单元测试通过。后续结论见 [最终门禁报告](../artifacts/reviews/doc-final-gate-2026-10-16.md)，不把模糊候选召回视为失败。
