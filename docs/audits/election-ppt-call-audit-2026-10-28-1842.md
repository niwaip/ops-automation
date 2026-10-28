# 2026-10-28 18:42 小学生竞选班干部PPT调用审计

## 1. 结论

**HTML实际生成并交付，最终答复正确披露了文件形式；标准PPTX没有被尝试生成。存在两项独立问题：任务契约提前误选HTML，以及运行沙箱仍使用缺少python-pptx的旧镜像。**

应区分以下事实：

- **这次实际走向HTML的直接原因**：最初规则路由识别了`.pptx`、候选技能为`pptx`，但模型提取并复核的任务契约将产物设为`.html`；准入随后以scope_mismatch转通用能力。执行指导因此要求写HTML，没有执行原生PPTX生成或转换。
- **默认PPTX生成路径的现实障碍**：审计在原用户沙箱中验证，Python和bash中的`import pptx`均报`ModuleNotFoundError: No module named 'pptx'`。技能却声明已预装。只修改路由仍会遇到这一依赖问题。
- **不能倒置证据**：模块缺失是审计时复现的环境事实，不是本轮工具实际报告的PPTX失败；原调用既没有检查该依赖，也没有尝试PPTX生成。

归因属于**模型与工程复合问题**：模型误选格式、拒绝适用候选；工程未以原始格式要求校验语义契约，并存在镜像依赖漂移。不存在本轮PPT引擎转换崩溃、模型超时耗尽或用户信息不足的证据。

本次仅新增审计材料及只读探针，未修改业务代码、安装依赖、重启/重建镜像或重新发布用户文件。

## 2. 调用身份和时间

- 会话：`chat-session-1793184040235-pdu0fsgg`，新会话，history=2，无附件。
- 消息：`1793184046211-r1a7pss2`。
- 证据轮次：`1793184172574324680-6cb6b5bd0d89492b91494c92fa2c78d6`。
- 模型：qwen36-35b-a3b；ID `d13e0d30-87b9-4e87-b96a-d8b1b3cf78af`。
- CLI：web-search、thinking、medium、timeout=300秒；本轮没有搜索工具调用。
- 实际执行：2026-10-28 **18:40:46—18:42:53**（北京时间）。18:42为完成展示时间。
- 链路：前端 → AI Orchestrator → Session Broker → 已运行用户沙箱dsh → 模型代理及文件工具。
- 锁等待2毫秒，容器已运行。

18:40:35附近另一个会话的`#deep`请求发生TLS重试并被用户停止。它属于`chat-session-1793183470398-z23feny2`，不是本轮PPT请求，不能将其网络错误归给本次未生成PPTX。

## 3. 格式在执行前已被改选

用户明确要求生成PPT、3至4页、包含自我介绍/荣誉/目标/宣言，并未要求网页格式。

执行门禁记录：

```json
{"guard":"task_intent","action":"accept","reason":{"instruction_relation":"standalone","task_mode":"execute","output_mode":"artifact","artifact_types":[".html"]}}
```

其前的task_intent_review为accept，说明两次契约判定没有纠正格式。随后：

```json
{"guard":"skill_admission","action":"general","reason":{"initial_candidate":"pptx","skill_id":null,"use_default_rules":false,"reason":"scope_mismatch"}}
```

审计在同一沙箱使用当前实现、不调用模型复核：

| 检查点 | 结果 |
|---|---|
| 原始指令格式提取 | `.pptx` |
| 初始规则路由 | skill_id=pptx，deliverables=[.pptx] |
| 当前技能目录 | 有认证pptx技能，声明输出.pptx |
| 将保存的HTML契约送入validate_intent | 原样接受.html，没有与原始PPT要求比对 |
| 按保存契约进入general_route | skill_id=null，deliverables=[.html]，is_ppt_intent=false |
| 对该路由构造执行指导 | 明确要求HTML代码或bash写HTML |

相关位置：

- `intent_contract.py:extract_source_and_target_artifacts`：原始PPT格式识别。
- `task_intent.py:extract_task_intent / validate_intent`：提取、复核和校验任务契约。目前检查结构、原话引用及若干特殊流程，缺少通用目标格式一致性检查。
- `skill_admission.py:admit_skill`：独立契约被视为准入约束；selected为null时清除候选身份，并以verdict.artifact_types覆盖deliverables。
- `planning_phase.py:build_deliverable_execution_instruction`：按.html契约明确引导写HTML，未走python-pptx分支。

准入的scope_mismatch与错误的HTML契约一致，可能受到该契约影响。仅保存了枚举决策，没有模型完整理由，因此不能断言其内部具体判断过程。**没有证据显示它先探测到python-pptx缺失才主动降级。**

技能声明“支持新建PPT/演讲Deck、必须交付.pptx”，与此次简单4页任务相容；“不要太复杂”并不构成只能生成网页的技术限制。

## 4. 环境为什么缺少PPT生成依赖

原沙箱检查：

```text
python_executable: /usr/bin/python3
import pptx → ModuleNotFoundError: No module named 'pptx'
bash -lc 'python3 ... import pptx' → 同样失败
```

未安装任何包。原计划在临时目录生成并重读4页测试PPT，因导入缺失而停止，未创建测试PPT或用户产物。此检查证明默认python-pptx路径不可用，并不证明所有其他实现方式都不可能生成PPTX。

镜像/容器证据：

| 项目 | 实际值 |
|---|---|
| 当前用户容器创建 | 2026-10-28 16:06:11，北京时间 |
| 当前镜像及本地ops-user-sandbox:local标签 | 均为sha256:fe8c1c9492d21b69086dfaaad4b284e3f079d561bd2178ac5f2c8974bd543b96 |
| 镜像创建 | 2026-09-22 07:50:59，北京时间 |
| requirements中python-pptx==1.0.2加入时间 | 2026-09-25 22:50:23，提交02a689472 |
| 当前Dockerfile | COPY requirements.txt并在构建时pip安装 |
| 当前挂载的pptx技能 | 声称已预装python-pptx；与实际环境不一致 |

因此，**今天创建新容器仍复用了9月旧镜像；源码和技能更新没有补齐镜像中的Python依赖**。当前镜像标签也没有更新，仅重启或按现标签重建容器都不会安装缺少的库。

技能文件在运行目录与仓库快照的SHA256一致：`96b6d4c73cd3c02f82bef89f2fe74c35cc4c62f1b58b1acd2c7adac42ca6d7bc`。这是“新技能/依赖声明＋旧运行镜像”的环境漂移，不是技能文件不存在。

## 5. 本轮真正执行了什么

| 顺序 | 实际工具 | 真实结果 |
|---|---|---|
| 1 | write_markdown，目标竞选班干部.html | 失败：only accepts .md files，但被结构化回执错误标为success |
| 2 | bash，cat heredoc写同名HTML | 成功生成12242字节HTML |
| 3 | send_file | 发送该HTML，未发送.pptx |

首次写入失败是模型把Markdown工具用于HTML；`tools.py`捕获异常后返回普通字符串，导致回执为success。模型读到了失败文字并改用bash完成，所以该错误没有阻断HTML交付；它不是“PPT无法生成”的报错。

真实HTML包含slide1—slide4四页，对应自我介绍、个人荣誉、竞选目标、竞选宣言，符合用户认可的网页演示形式。本次没有再做浏览器布局验收；只核对实际文件、4页结构、回执及哈希。

交付文件SHA256：`e7b5256ab9a5c2d0902fd9d4db09549eb062cd2d3c2c397628d05428e81c4e43`。日志也记录18:43:17成功读取该文件。

最终“文件为网页形式”的披露准确。“无法生成标准PPT”则没有说明真正原因，且本轮没有进行PPT生成尝试。更可追溯的表述应区分“本次仅生成HTML”与“已检查确认PPT依赖缺失”。

终态deliverable_contract=accept、证据verified=true，只说明修改后的HTML契约得到满足，**不表示原始PPTX目标已完成**。原始目标与实际交付格式应分别记录。

## 6. 性能与遥测

| 指标 | 实际值 |
|---|---:|
| HTTP全程 | 127.003秒 |
| Harness | 126.968秒 |
| dsh | 125.950秒 |
| 模型请求 | 8次；代理完成记录也为8次 |
| 模型耗时合计 | 91.308秒，占dsh的72.5% |
| 输入/输出Token | 61163 / 10257 |
| 总Token | 71420 |
| 规划请求 | 8.847秒 |
| 首次HTML工具参数生成 | 38.809秒，输出4829tokens |
| 改为bash重写HTML | 30.750秒，输出3913tokens |
| 最终简短摘要 | 1.318秒，输入349、输出53tokens |
| 非模型残差 | 34.642秒，未有足够子阶段计时可靠细分 |

两次HTML写入相关模型输出共耗69.559秒，占模型耗时76.2%。首个工具选错导致一份长HTML在下一轮再次以bash形式生成，是主要可见浪费。

内核TTFT=38.793秒，属于主循环口径；不能等同从用户提交到首字的端到端体验。没有超出300秒预算，没有PPT转换超时记录。

上一轮修复的调用记账已实际生效：ledger中8个call_id各不相同，planning仅累计一次，8次模型请求与代理日志一致。本轮无需像上次那样扣除重复Token。

## 7. 改进优先级

1. **P1 工程：修复沙箱镜像漂移。** 用当前requirements重新构建并验证镜像，再按受控生命周期替换旧用户容器；验证实际镜像ID及非root用户下import pptx，不能仅重启旧容器。创建/复用时增加能力探测与运行版本检查，避免技能继续声称未安装的依赖已预装。
2. **P1 工程＋模型：保全原始目标格式。** 语义契约和技能准入不得无依据将PPTX改成HTML；把原始目标格式与实际交付格式分开。既有确定性格式识别已经返回.pptx，应利用其检测冲突；即使不用专用技能，通用执行仍须保留用户目标。
3. **P2 工程：结构化工具错误。** Markdown写HTML应返回error，避免正文说失败而status=success，提升恢复和遥测可信度。
4. **P2 模型/提示：减少重复长输出。** 按目标格式选正确写入工具；有能力缺口时使用真实探测结果说明原因。保留当前对HTML实际格式的明确披露，不笼统声称完成标准PPT。

以上为审计建议，未在本轮实施修复。

## 8. 证据与边界

证据目录：`docs/artifacts/reviews/election-ppt-audit-20261028-1842/`。

- redis-session.json：请求、最终回答、工具、门禁、调用ledger。
- .evidence.json及分轮证据：原始指令、结构化回执、执行轮次。
- target-window.log：相关时间窗口日志，文件访问URL中的令牌已脱敏。
- delivered-election.html：原交付文件副本。
- runtime_probe.py / runtime-probe.json：可复查的环境和路由探针、依赖导入失败、契约校验复现。
- container-image.txt、audit-findings.json：容器/镜像标识和汇总结果。
- source-snapshots：相关当前实现、依赖声明、Dockerfile及技能声明；artifact-sha256.json记录证据指纹。

运行沙箱依赖检查发生于审计时，所用容器和镜像ID已记录，未修改环境。未保留原执行进程内存，也未重放模型，因此不推断原始模型未保存的内部理由。图索引有部分滞后，代码定位以现文件与保存的源码快照为准。
