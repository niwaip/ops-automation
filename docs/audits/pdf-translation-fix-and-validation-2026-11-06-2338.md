# 23:38 PDF调用故障修复与验证

## 修复内容

在现有未提交代码基础上增量修复，没有重置工作区或修改其他服务。

1. protected_numbers：按生成规则12位十六进制签名+独立整数索引识别token，修复贪婪匹配合并相邻占位符；对missing、duplicated、unknown、malformed分别记录，恢复后仍执行数字与译文完整性检查。每个输入ID给出自己的允许token列表。
2. source_roles：在节点构建前拆出旋转且位于页边的原生行，独立归为furniture；正文†等符号留在原块。没有删除来源IR行或放宽图形覆盖校验，不把图中正常旋转标签一概当边注。该行为遵循现有furniture不进入正文翻译的契约；不是逐像素保留原版面。
3. text_translator：首轮仍批量处理，纠错逐个ID执行；禁止跨ID补全、借用邻段token或输出上下文章节标题。失败反馈不再回灌外来token，仅重新给出当前ID的输入和允许token。未知输出ID也进入有限纠错；保留每次受控响应与具体失败证据。
4. pdf_translation_recovery：运行时在原task deadline内最多自动续跑一次，复用明确的检查点，并记录failed_job/recovered_from及恢复guard；用户模型不必猜参数或重建全本布局。显式--resume不会再触发隐藏递归重试；持续失败时返回错误，保留已通过块和旧文件；同一run中对相同输入/输出再次提交auto会返回pdf_recovery_exhausted，阻止模型再次重跑。
5. shell_tools/command：识别已安装CLI的不支持包装并在启动子进程前返回invalid_arguments；本轮的“timeout ...; echo EXIT_CODE:$?”不能再脱离桥接、伪装success或产生standalone遗留任务。受支持命令继续统一预算与账本。工具/timeout预算耗尽记录budget_exhausted，终止manifest收敛为failed，并在检查点允许且deadline足够时进入一次恢复。
6. 真实验收发现模型将图注混入figure，且图中文字被扁平拼接为“File-reading China”；补充分离原生Figure图注，编号标签与示例正文分组翻译、图例按行呈现，并独立验证图例原生行覆盖及内容；相邻同栏、间距小于20pt的明确断词续段合并，避免Neural Net-/work割裂。
7. 检查点实现版本升到layout-html/6；旧版检查点明确拒绝，不把旧的旋转混合段落作为本轮可信来源。SKILL同步更新恢复责任、正确参数和停止条件。验证脚本移除额外手动重试，使用生产同样的默认300秒工具预算。

## 回归验证

从仓库根目录使用./docker/start-smart.sh docker-compose.pdf-test.yml run执行，PROJECT_ROOT由入口设置，Compose挂载使用${PROJECT_ROOT}。

最终171项全部通过，26.862秒。新增9项覆盖：

- 本轮保存的完整首次翻译响应回放：p1_b8的4个合法token可还原；p1_b13/14的跨ID污染仍拒绝。
- 两token直接相邻或以v/字母/下划线/符号分隔均正确识别；缺失、重复、未知签名、畸形token分别失败。
- 本轮原生第1页与真实模型布局重放：旋转边注独立，正文†不被吞走，所有line ID恰好归属一次。
- 纠错逐个ID，不携带上一轮foreign token反馈；每次尝试独立保存。
- 真实CLI子进程+本地HTTP/SSE模型fixture：首轮一块连续失败后运行时自动resume，仅请求失败块，布局只调一次；两个job共享parent run，4次模型调用/560 Token进入父账本，未验收目标仍保留旧内容。
- 持续失败只恢复一次，两个manifest均failed，无无限递归。
- 附加echo掩盖退出码的CLI包装被启动前拒绝，没有模型请求或standalone job。
- 极小预算返回budget_exhausted，无running遗留，旧交付文件保持原样。
- 真实失败预览的来源结构重放：图注独立、五个编号图例与示例引文分组，File-reading不与China拼接；图例内容篡改被拒绝，同栏相邻Net-/work续词恢复。

既有发布验收、历史文件隔离、来源/candidate哈希、图形覆盖、布局检查点、补译、视觉FAIL等回归保留通过。fixture的PASS不等同于真实模型验收。

## 生效与真实验证

用户沙箱dsh_modules采用当前仓库只读源码挂载；新增恢复模块由新CLI进程直接加载。9个引擎模块、2个模板及PDF SKILL已同步到实际data/shared/dsh-skills并核对字节一致，运行容器导入返回layout-html/6。没有依赖安装或常驻CLI缓存，未重启无关服务。

Compose不管理Broker动态创建的用户沙箱，实测用docker exec在已有沙箱中启动新进程，沿用其身份、中央代理及qwen36-35b-a3b，不读取或复制凭据。输入为同一7页原论文，默认balanced排版与300秒工具预算，task总deadline900秒；允许自然跨页，不把此验证冒充原7页严格不变或像素级保留。

首次真实验证（中间版本/5）：/workspace/.dsh/validation/pdf-repair-1793980304，232.819秒，167/167文本块通过，生成9页候选；第2页视觉审阅两次FAIL，未发布。人工核对原PNG，没有看到所述“图表与正文严重重叠”，但确认图注在图片内/图例串接、技术标签误译和正文断词问题。未修改审阅PASS/FAIL规则或强制通过；保留首次失败的原图、审阅与账本，再修改源结构/图例分组后重新验证。

最终实测（北京时间2026-11-07 00:02—00:07）：/workspace/.dsh/validation/pdf-repair-1793980941。**accepted=true、唯一job状态published**，总294.499秒；默认300秒工具预算内完成候选生成，156/156文本块通过，10/10页最终视觉验收通过。父账本31次请求（30完成、1失败），已记账118412 Token（输入95474、输出22938）；失败请求可能存在未知上游用量，不能把已记账值当作绝对计费总量。首次翻译批次有一个正文节点缺少单个受保护token，新增逐ID纠错在同一job内补译成功，未降低数字校验。本轮不需要重新解析或工具级自动恢复；自动恢复的失败/成功/用尽路径由真实CLI+HTTP fixture验证。

第2页首次视觉回执认为正文被裁切，既有同哈希确认机制复核为PASS；两份回执均保留。没有修改该确认机制或伪造PASS。最终人工核对第2页预览，五个中文流程标签分行显示、China归于示例引用，图注独立，正文与图形无重叠。该结果只代表这次候选按现有结构/数字/内容/视觉门禁通过，不等于所有后续模型输出都必然通过，也不代表原7页严格不变。

本轮未经绑定的旧PDF没有参与结果生成或验证，历史文件替代与退出码掩盖的回归保持失败；源码及模板与实际共享挂载逐字节核对一致。已保存验证PDF、最终第2页图、审阅确认、完整父账本、子job和每次翻译尝试。

## 证据

docs/artifacts/reviews/pdf-translation-fix-20261106-2338/包含回归日志、源码哈希及实测证据。真实失败响应回归fixture保存在tests/fixtures/pdf_translation/2338-*。代码尚未提交Git。
