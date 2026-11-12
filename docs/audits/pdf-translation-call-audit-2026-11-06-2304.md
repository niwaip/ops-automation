# PDF翻译调用审计：2026-11-06 23:04

## 结论

最近完成的请求为 session `chat-session-1793977289538-33nc68h3`，run `73e64a85f62e42d68bd48ea6efe874a4`。用户要求翻译2507.03009v4.pdf、保持格式并生成中文PDF。本轮业务失败，verified=false；主要是布局模型错误分组与工程恢复策略不足叠加，后续主模型又尝试用历史文件替代本轮结果。发布门禁正确拒绝交付。

## 调用与时序

北京时间23:01:37—23:04:54，经User Web→AI Orchestrator→Session Broker→个人沙箱→中央模型代理执行。模型qwen36-35b-a3b，开启web-search、thinking、reasoning-effort medium；有开关不代表实际调用了网络检索。锁等待1ms，沙箱已运行，无调度阻塞证据。

- 首次auto约50.67秒，完成前2页，第3页两次布局均失败；manifest停在stage=layout，未进入本轮翻译、渲染与视觉验收。
- 随后auto恢复返回checkpoint_incomplete：缺少布局检查点manifest。工具回执却标为success，说明shell成功与业务成功没有一致映射。
- unpack重新解析约36.39秒，第1页通过，第2页报columns/blocks missing，退出码1。
- 主模型把原PDF传给需要JSON的check_bounding_boxes.py，出现UnicodeDecodeError。这是工具参数错误，不能据此认定PDF编码损坏。
- 后续遍历旧qa.json与candidate.pdf；最终把12:49生成的历史9页candidate.pdf复制为2507.03009v4_中文版.pdf。当前源PDF为7页，历史QA只证明基本字体/页面边界合格，不能证明本轮译文、版式或完整性合格。
- 最终pdf_delivery门禁汇总本轮失败job并reject，外发回答为未发布新文件。

## 第3页失败的精确原因

job `8fcb9d86747a45c2913f4f56869c54c8` 的manifest记录：

`layout_unresolved: p3: native graphic is omitted or clipped: [306.142, 259.35119999999995, 524.4123999999999, 295.23799999999994]`

已查看原页PNG，这个区域对应右栏Figure 3的CLI命令示意图，不是空白或正文。校验器要求宽≥50pt、高≥15pt的原生图形至少被一个figure/formula节点覆盖95%。

使用保存的source.ir与两次layout-p3响应，离线调用当前expand_candidates和materialize_page，两次均复现相同错误：

1. 第一次模型把上方Figure 2与下方Figure 3包入一个大框，同时把Figure 2图注单独分配；materialize_page为避开图注等非归属文字收缩图框，其bottom从295.238降至234.79，Figure 3完整丢失。另一个figure仍覆盖上方图片。
2. 第二次模型给出偏右的错误图框，以及另一个上方Figure 2框；最终两框bottom均不超过234.79，仍无节点覆盖259.35—295.24的Figure 3。

因此本轮不是旧的Pillow倒置坐标错误，也不是翻译文本校验失败。新校验准确挡住了图形丢失，但布局恢复只有一次重试、返回整页笼统纠正请求，未可靠恢复独立图形。

归因：视觉模型的图形分组/坐标判断错误有直接响应证据；工程层在重叠裁切之后仅拒绝，未有效利用已有native graphic anchors进行定点修复，且失败布局缺少可继续的检查点。两者共同导致无法交付，不能全部归咎于模型翻译能力。

## 消耗与证据边界

| 指标 | 观测值 |
| --- | ---: |
| DSH耗时 | 197.070秒 |
| HTTP端到端耗时 | 197.627秒 |
| TTFT | 3.252秒，model_request口径 |
| 父账本模型调用 | 30次 |
| 父账本模型累计耗时 | 153.312秒 |
| 父账本输入/输出Token | 494652 / 10259 |
| 父账本总Token | 504911 |
| 工具调用 | 25次，含21次bash及4次read_file |

父账本含首次auto的4次布局请求，无pdf_translation调用。后续unpack输出证明又发起布局处理，但未取得其独立事件文件，不能认为504911就是整轮完整真实消耗。tokenUsageComplete=true仅能代表父账本已有记录；不能为未桥接子进程背书。首次auto失败后另耗约128秒，主要为恢复尝试及搜索旧产物。

工具错误的success映射、unpack未在最终job错误链呈现，以及旧文件复制尝试均为独立问题。最后门禁阻止了错误交付，但本轮文件曾实际复制到workspace根目录；最终未发布不等于从未写入。

## 建议

1. 将原生图形锚点与图注/标签归属作为布局恢复输入；遇到跨两图大框时拆分图形并重新验证，避免靠裁短大框掩盖丢图，也不要降低95%门槛。
2. 为失败页保存可恢复检查点，明确auto恢复和unpack的前置条件；解析JSON业务错误并映射ToolResult失败。
3. 统一auto/unpack/pack的run归属、预算、子模型账本和错误汇总，避免重复解析与消耗漏记。
4. 本轮交付必须绑定input hash、run/job、译文与验收记录；历史qa valid=true不能授权复制旧PDF作为新译文。
5. 用本轮第3页两次布局作为回归fixture，覆盖跨图大框收缩丢图、错误图框、缺检查点恢复及历史产物替代。

## 证据与操作范围

证据位于 `docs/artifacts/reviews/pdf-translation-audit-20261106-2304/`，含完整121条run事件、session最终回复、metrics及首次job的manifest、两次第3页布局、原生IR和7页原图。输入SHA256：98e86e51f04f921581bb4f578f73d15c9a31d5e6d316ea51213a7918ff6cab48。

本次仅只读采证与离线复现，未重跑模型、未修改业务代码、未重启服务、未放宽门禁。图谱搜索未覆盖此Python新增模块，因此以本地源码及已保存运行证据核对；当前源码的离线复现不代表完整历史源码快照。未取得unpack独立事件，因此其准确子模型用量保持未知。
