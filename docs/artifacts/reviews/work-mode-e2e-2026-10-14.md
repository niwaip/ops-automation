# 工作模式端到端测试

日期：2026-10-14，Asia/Shanghai，约14:38–14:48。通过已登录 admin 的用户端真实 UI 执行；选择“企业协同”（工作模式），Auto 模型，思考等级中，联网与知识自动检索开关关闭。使用虚构输入及只读工作空间查询。未修改业务代码。

结论：基础对话、日期解析、历史持久化及精确关键词查询通过；工作空间文档查询命中分支存在可重复的输出契约错误，当前不能判定工作模式整体通过。

| 用例 | 结果 | 实际证据 |
|---|---|---|
| 工作/个人模式切换 | 通过 | 个人模式显示调研控件；切回企业协同恢复联网、知识与工作流控件 |
| `/help` | 通过 | 返回快捷命令说明；但已处于工作模式时仍提示切换至工作模式，文案待优化 |
| 虚构门店销售计算 | 通过 | 120+80=200元，两个门店占比60%、40%；显示已完成，504 tokens |
| 完成后刷新历史 | 通过 | 计算回复和会议纪要均在刷新后恢复，可读取原始输入与结果 |
| 虚构会议纪要（独立会话复核） | 通过 | 两项任务及负责人正确；明天=2026-10-15，本周五=2026-10-16；会议地点标为未提供；1158 tokens |
| `/doc E2E_WORK_MODE_NONEXISTENT_20261014` | 通过 | 实际创建执行、返回已完成；说明20个文档中未找到该关键词；执行aea9c70c-a548-44fd-875d-52f917c9f989 |
| `/doc` 完整自然语言只读查询 | 失败，重复2次 | 规划、冻结计划、调用workspace.explorer后，均因额外输出字段results失败；用户界面显示失败和详情链接 |
| `/extract` 无附件 | 部分通过 | 进入待补输入，没有编造正文；但补充提示直接显示fileBase64内部字段，未明确引导上传附件；未验证补附件后续闭环 |

## 确认的工程问题

完整查询原文：`/doc 查找标题包含“E2E_WORK_MODE_NONEXISTENT_20261014”的文档，只查询，不创建或修改任何文件。若没有找到明确说明。`

两次执行编号：`d6617941-c0e9-4aa1-b6b0-a8a7714ed93c`、`391e5e00-90cd-4507-8213-ac250991e62b`。运行日志均记录 `OUTPUT_SCHEMA_VIOLATION` / `additionalProperties`；页面明确指出未定义的额外参数 `results`。规划哈希不同，但执行阶段错误相同。两次请求流约16.4秒与16.6秒。

源码定位：`apps/backend/execution-control/control-plane/src/modules/execution/adapters/workspace/workspace-explorer.handler.ts` 的 `executeWorkspaceExplorer` 命中分支返回 `results: searchResults`（约242行）；`builtin-skills/platform.workspace.explorer/manifest.yaml` 的输出Schema设置 `additionalProperties: false`，未声明results。空结果分支不返回results，因此精确关键词查询成功。该错误属于工程输出契约不一致，不应归为模型回答质量问题。

另一个待验证问题：完整句子会被拆成多个子关键词进行兜底搜索，可能命中与目标标题无关的文档；此次请求要求精确标题匹配，而实际进入了命中分支。应进一步验证关键词兜底是否保持查询条件。

## 观察与范围

首个会话中先发送help再发送会议纪要，随后出现消息顺序变化、纪要回复未正常呈现；日志同时出现Assistant message not found。独立会话复核纪要成功。该观察尚未形成稳定最小复现，不能据此确定根因；建议专项复测消息保存与历史刷新竞争。

首个doc请求发出后刷新了页面；后端仍完成执行并留下失败记录，第二次未刷新复测同样失败，排除了仅由刷新导致失败的解释。

本轮覆盖真实UI→聊天服务→模型/规划→Control Plane→内置工作空间技能→结果/失败展示与历史恢复。未测试真实邮件发送、外部通知、日程创建、浏览器自动化、真实附件提取和文件生成；因此不将这些能力标为通过。没有修复代码或重启服务。

## 证据

- `work-mode-e2e-2026-10-14-runtime.txt`：按执行编号与测试会话筛选的运行日志。
- `work-mode-e2e-2026-10-14-query-failure.png`：第二次doc失败截图。
- `work-mode-e2e-2026-10-14-meeting-ui.txt`：刷新后的会议纪要DOM快照。
- `work-mode-e2e-2026-10-14-query-empty-ui.txt`：精确关键词空结果查询DOM快照。

环境状态通过根目录 `./docker/start-smart.sh dev ps` 检查；PROJECT_ROOT指向当前仓库，Compose源码挂载使用`${PROJECT_ROOT}`。
