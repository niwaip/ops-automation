# 个人模式修改后验证与工程／模型归因

验证时间：2026-10-13 20:09–20:17，Asia/Shanghai。环境：用户端 localhost:5174，账号 admin，个人助理模式，Auto 默认模型（服务日志解析为 gemini-3.8-flash-high）。

结论：**修复部分生效，尚有三项可确定的工程问题；不以模型偶发生成失败或内容质量阻断本轮工程验收。** 本轮针对上次发现进行聚焦验证，没有重复全部14场景或做大小模型对比。

## 验证口径

- 工程验收：代码生效、前端状态、停止与历史持久化、SSE终态、文件下载真实性、固定输入的校验与展示逻辑。
- 模型观察：工具选择、探索路径、是否主动写文件、正文措辞、规划轮数、Token用量。单次不确定行为不直接认定平台缺陷。
- 归因必须有原始遥测／调用参数／服务日志或固定输入重放支持；提示文案本身不能证明网络故障或模型能力问题。
- 模型没有完成任务与平台误报成功、误报超时、丢失历史分开记录。前者可为模型表现，后者属于工程责任。

## 代码生效与测试

| 核对 | 结果 |
|---|---|
| Docker入口 | 全部通过仓库根目录 `./docker/start-smart.sh`，PROJECT_ROOT正确 |
| AI Orchestrator | 验证开始前已重启；node dist/main.js；编译文件时间12:05:13 UTC，含取消保存及existingApiLinkRegex修复标记 |
| 前端实际加载 | HTTP读取Vite模块，含EMPTY_SERVER_TEMPLATES和prevItemsRef；容器挂载源码一致 |
| 实际用户沙箱 | running；当前仓库dsh_modules只读挂载至/usr/local/bin/dsh_modules |
| Python修改模块 | analysis_validation.py与agent_loop.py容器和本地SHA256完全一致 |
| 后端单测 | user-sandbox-dispatcher.service.spec.ts：30/30通过（容器内运行） |
| 财务校验单测 | test_financial_workbook_fixes.py：37/37通过（bundled Python运行） |
| 下载去重固定输入 | 运行版本编译模块：普通API直链、带查询参数直链、workspace直链，均1个链接、不追加重复卡片 |

Python哈希：analysis_validation.py=`0caafd4c84036ca44bfe0460fa56ef6e7f270d467056e100237748ffbd16278d`；agent_loop.py=`495fc8084adf00e7f7f4cdb629e12fcd4048ce9d4de0a8dbf7fb3d81182a5e0a`。

## 端对端与固定输入重放

| 项目 | 实际结果 | 归因与验收 |
|---|---|---|
| 聊天页更新循环 | 未发模型请求时即持续Maximum update depth exceeded；堆栈改为CoordinationTaskCardModal，累计109101次；旧WorkflowSelectionDropdown堆栈0次 | 旧点修复生效，但新工程问题仍阻断无异常验收 |
| O11停止／刷新 | 启动10页PPT约5秒后停止；stop请求2xx，UI已停止；刷新后新会话消失、回到default；消息feedback请求404 Chat session not found | 工程失败：显式停止误入超时分支，未保存取消轮次 |
| O11后续聊天 | 刷新后在default会话发送恢复消息成功 | 服务未锁死；不能证明原取消会话已保留或同会话恢复 |
| O09真实CSV汇总 | 140.749秒、退出码0、有done；XLSX成功下载10450字节，openpyxl可读取2个工作表，KPI为4条原始/2条异常/470含重复/350去重；未出现上轮矛盾警告 | 本次执行交付通过，但不能凭一次输出证明校验修复完整 |
| O09原始回答重放 | 用上轮保存的原始回答和真实prompt构建契约，仍status=failed，missing=[附件中的有效金额] | 确定性工程缺口：测试只覆盖短指标“有效金额”，未覆盖真实抽取名称 |
| O08实际Word修改 | 79.2秒、退出码0、有done；5次bash均成功，但只读／搜索，未生成VERIFY_个人周报_v2.docx；最终提示上游连接中断或无最终文本 | 未交付主要列为模型执行表现；网络故障缺少直接证据，不凭文案归因；本轮去重以固定输入验证为准 |

## 必须继续处理的工程问题

### E1：关闭弹窗时的更新循环（P1）

`CoordinationTaskCardModal.tsx:68` 的 `collaborators = []` 在查询没有数据时每次渲染生成新数组。effect依赖该数组，关闭状态仍执行 `form.resetFields()` 和 `setFileList([])`（109–113行），产生新状态并再次触发effect。现场错误堆栈、初始不发模型请求即可复现和源码相互吻合。

这不是小模型不确定性，也不是旧前端未生效。建议固定空数组引用，并避免关闭状态在每次依赖变化时重复清空状态。

### E2：停止API未走取消持久化路径（P1）

会话：`9ba69fff-18b0-4785-84bd-bfcfed31e749`。20:10:53的日志依次为Stopping personal sandbox、Run harness timed out、Chat session not found；执行约5077ms，远小于300秒超时。

`stopPersonalSandbox`中止activeExec.abortController，即内部controller。fetch catch只在外部`abortSignal.aborted`为真时调用handleUserAborted；内部controller被中止则在683行直接判超时并返回，未保存历史。当前单测模拟外部abortSignal路径，未覆盖实际stop API路径，因此30项通过不能替代真实取消回归。

建议显式记录终止原因（user_stop／deadline／disconnect），停止API和客户端中止统一走用户取消保存；增加真实停止接口或内部controller分支回归。

### E3：指标名称归一化未覆盖真实契约（P1）

实际prompt“汇总附件中的有效金额”生成指标名“附件中的有效金额”。上轮回答已在表格中包含“有效金额汇总”及¥350.00/¥470.00，但当前匹配逻辑仍要求完整指标名或alias出现，导致固定重放失败。

新增测试手工构造MetricRequirement(name="有效金额")，没有使用真实prompt构建契约，所以未覆盖现场失败。应补充完整prompt→契约→原始回答的固定重放，规范化“附件中的”等上下文修饰并保持真实金额核验约束。

## 模型表现与不确定项（不作为本轮重点）

- O09模型尝试用只接受当前附件原件的结构工具读取生成文件，收到source_outside_session_scope；又尝试将数值核算降级为纯文本，收到escape_rejected。原始回执证明这是规则按设计拒绝，而非容器异常或工具崩溃。模型后续恢复并交付。
- O08模型连续查看原文、旧版本和脚本，再搜索整个workspace，没有进行目标Word写入。记录为单次模型规划／执行未完成，不要求以此评估小模型稳定性。
- O08所有模型finish reason均为stop，五次工具回执成功，模型代理日志未见对应502、ECONNRESET、鉴权失败等；“连接中断或未返回最终文本”是合并提示，不能据此证明连接中断。具体原因保留，不把无证据的提示作为模型故障结论。
- O09 176205 Tokens、O08 116880 Tokens仅作为性能观察，不能仅凭数值判定平台性能回归或小模型质量不达标。

## 证据与限制

- `personal-office-reverify-contract-replay.json`：固定原始回答重放失败。
- `personal-office-reverify-cancel-runtime.txt`：停止被判超时及会话404日志。
- `personal-office-reverify-console.json`：本轮堆栈计数和样本。
- `personal-office-reverify-o09-stream.txt`、`personal-office-reverify-o08-stream.txt`、`personal-office-reverify-metrics.json`：真实SSE与终态、工具调用、耗时。
- 两份 `personal-office-reverify-<sessionId>-receipts.json`：仅抽取当前测试会话工具状态及错误，不拷贝无关历史资料。
- `personal-office-e2e-files/VERIFY_脏数据汇总.xlsx`：本轮成功下载产物。

本轮仅验证并记录，没有修改业务代码。旧14场景报告是修改前基线，不能与本轮针对性回归合并计算成功率。三项工程问题应修复后再验收；模型偶发差异保留观察，不要求与工程修复同步消除。
