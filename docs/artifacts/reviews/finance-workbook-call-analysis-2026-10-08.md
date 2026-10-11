# 财务工作簿调用流程分析

分析日期：2026-10-08，时间均为北京时间（Asia/Shanghai）。

范围：用户粘贴的《AI能力测试_财务报表.xlsx》Sheet 用途回答。依据 AI Orchestrator、Session Broker 运行日志、指定会话的 Redis 记录、沙箱会话文件、运行中的 Harness 源码及原始工作簿结构。未修改业务代码、原始工作簿、模型配置或重启服务，也未重放真实模型请求。

## 结论

用户粘贴的回答对应会话 `chat-session-1791455177989-g6z67dtm` 最后一轮：用户已经改问“总结2026年收入、毛利率、营业利润和净利润。”，系统仍返回上一轮的 Sheet 用途清单。因此这轮请求完成了技术执行，但没有完成用户任务。

已确认三个主要问题：默认 Excel 提取遗漏大部分工作表；公式缓存缺失时丢失关键指标；最终回答校验未拦截答非所问。另有独立的 Qwen 模型地址解析故障，以及工具轨迹未持久化造成的排查缺口。

## 实际时间线

| 时间 | 请求与行为 | 结果 |
| --- | --- | --- |
| 18:27:16–18:27:18 | 上传工作簿，要求列出 Sheet 与用途；指定 `qwen36-35b-a3b` | 附件同步成功，模型地址 DNS 解析失败，任务未完成。HTTP 调用总耗时约 1.528 秒 |
| 18:28:01–18:28:14 | 同一会话重新要求列出 Sheet 与用途；改用默认模型 | 实际模型为 `gemini-3.7-flash-high`；两次模型代理请求约 4.279、7.735 秒；总耗时约 12.902 秒；返回 10 张 Sheet 的用途 |
| 18:28:37–18:28:49 | 追问年度收入、毛利率、营业利润、净利润 | Session Broker 收到的新指令正确；两次模型代理请求约 3.769、7.946 秒；总耗时约 12.369 秒；仍回答 Sheet 用途。措辞与用户粘贴内容一致 |

两次模型代理请求不等于两次工具执行。现存记录不足以确认这两轮各自使用了什么工具，也不能断言已逐表读取全部内容。

实际链路：聊天流接口 → 个人沙箱 Dispatcher → 同步附件与会话附件索引 → Session Broker 获取用户沙箱锁 → 在已有个人容器中运行 `dsh run` → 技能路由、附件提取、历史与当前问题组装 → 模型代理 → 结果清理、流式返回、会话保存。

两次成功请求的沙箱锁等待均约 1 ms，容器已经运行。日志未显示这轮请求进入 Control Plane 的确定性执行计划或 Carbone 文档处理链。

## 已验证问题

### 1. Excel 提取器只读取三张表，而且顺序不等于工作簿顺序

[office_tools.py:71](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/office_tools.py:71) 将 `sheet*.xml` 按字典序排序后固定截取 `[:3]`。对当前文件，实际选择为：

| XML 文件 | 实际 Sheet |
| --- | --- |
| sheet1.xml | 使用说明 |
| sheet10.xml | 管理驾驶舱 |
| sheet2.xml | 参数 |

月度经营、利润表、预算对比、资产负债表、现金流量表、部门分析、交易明细都未进入默认提取。提取器不解析 workbook.xml 的 Sheet 名称与关系映射，也不保留单元格地址和空列位置。

在临时副本上调用实际提取函数，结果只有 33 行数据，含包装文字共约 740 字符。这不是字符预算截断，而是读取范围固定受限。`start_line/end_line` 在三表提取之后才切片，因此分页不能访问剩余七张 Sheet。

工作簿本身确实包含回答中的 10 张 Sheet，名称与顺序已核对。但默认提取结果不足以支撑全部用途说明；不能仅凭最终回答证明模型逐表验证过。

### 2. 仅取公式缓存值，关键财务指标变成空白

[office_tools.py:77](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/office_tools.py:77) 只读取单元格 `<v>`，不保留 `<f>` 公式，也不计算公式。

原始文件中，管理驾驶舱 29 个公式单元格、利润表 22 个公式单元格均没有非空缓存值。驾驶舱 B4、B5、B6、B7 分别引用年度收入、毛利率、营业利润、净利润，但提取文本只剩指标标签，没有结果数值。例如“营业收入 | 1月”把两个不同区域的标签拼在同一行，进一步损失了表格语义。

因此后续读取同一文件的普通文本，不能自动补齐这些指标。需要读取相应公式与依赖区域，执行受控计算，或在可靠的表格计算引擎中计算副本。不能把空缓存解释为零，也不能拿参数表的假设毛利率当实际毛利率。

### 3. 当前问题正确送达，但答非所问被放行

沙箱执行日志中 18:28:37 的命令明确携带新问题。沙箱会话文件的相邻 user/assistant 也直接显示问题和答案不匹配：

[会话记录:20](/Users/chain/Documents/MyProject/ops-automation/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/.dsh/sessions/chat-session-1791455177989-g6z67dtm.json:20)。

离线检查当前 prompt builder：新问题被保留；该输入没有触发上下文继承指令；当前 user turn 没有被替换成上一轮“列出 Sheet”的问题。不能据此归因于前端提交错误或确定性地认定 prompt builder 覆盖了问题。

用实际错误答案调用现有 `_check_no_tool_assertion_guard`，返回 `('pass', None, 3)`。该校验主要处理未执行计划、产物缺失、脚本泄漏、提醒和检索异常，没有验证财务问题是否包含所需指标与数据依据。

还发现“总结2026年收入、毛利率、营业利润和净利润。”被文件动作识别器判为 `(is_generate=False, is_inspect=False)`。它没有识别到这是一项只读归纳任务，应补充这一类意图覆盖。

模型重复旧任务的具体触发点仍不能唯一确定：缺少该轮完整模型请求/响应和工具事件。历史长回答的干扰、附件信息不足是合理怀疑，不能作为已证实原因。

### 4. 指定 Qwen 模型的上游地址不可解析

18:27 的失败是 `getaddrinfo ENOTFOUND sword-wanted-knit-organ.trycloudflare.com`，不是 Excel 格式或文件同步失败。日志明确提示指定模型时禁止静默切换。

18:28 使用 Gemini 的成功调用来自后续以 `default` 发起的新请求，不能描述成 Qwen 故障后的自动模型降级。面向用户的错误文字把这类 DNS 故障笼统归为“不可用或超时”，诊断精度不足。

### 5. 工具与性能遥测未随问答完整保存

[Dispatcher:803](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/chat/user-sandbox-dispatcher.service.ts:803) 向前端结果事件发送 sandbox、duration、exitCode 和 metrics；随后 [会话保存:821](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/chat/user-sandbox-dispatcher.service.ts:821) 没有传递这些结构化字段。

指定会话的 Redis 元数据包含消息 ID、附件和部分思考摘要，未保存逐轮工具参数/结果、完整模型上下文或性能指标。沙箱 session JSON 同样只保留问答。因此只能确认 HTTP 次数与耗时，不能还原全部工具行为或 token 成本。

## 建议处理顺序

1. **优先修复 Excel 读取能力**：先按 workbook.xml 和关系映射枚举全部 Sheet，返回名称、范围、列头；提供按 Sheet/范围读取的结构化只读接口，保留地址、空值、公式与缓存状态。
2. **建立财务指标读取与计算路径**：读取月度经营、利润表和驾驶舱对应区域；缺缓存时计算依赖或明确标注不可用；毛利率按全年毛利/全年收入计算，避免混用预测假设或月度比例。
3. **增加任务完成校验**：年度指标问题必须覆盖所需指标、单位、来源或明确缺失原因。Sheet 用途清单不能被判为该任务已完成。补充“总结、归纳、列出 Sheet”等只读意图场景。
4. **修复 Qwen 服务入口及错误分类**：检查已配置地址的有效性，提供明确 DNS/连接/鉴权/超时分类，继续保持显式选定模型时不静默切换。
5. **持久化适量执行证据**：关联每轮请求、实际模型、工具名称与参数摘要、结果来源/摘要、时间与 token 指标。保留脱敏后的证据，支持事后追踪。

## 验证边界

已对运行容器中 runner、prompt builder、agent loop、office tools、skill router、LLM 与 runtime policy 七个文件和当前工作区逐一比较，内容一致。本次发现的 Harness 缺陷不是这些文件的容器版本漂移。

已进行原始 XLSX 结构/缓存只读检查、临时副本上的真实提取函数复现、当前问题组装检查及错误答案校验函数复现。没有额外调用真实模型、修改系统行为或生成财务结论。
