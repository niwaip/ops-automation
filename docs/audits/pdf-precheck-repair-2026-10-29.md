# PDF 内容预检与分页修复（2026-10-29）

已修复 10:07 调用审计定位的工程缺陷，未放宽交付验收。

- 模型工具要求 pages 字符串数组与 output_path，每页正文独立提交，程序插入分页；适配器兼容旧 markdown 调用。
- 先诊断分页结构，再核对按页内容。缺少分页不再误报第二页所有栏目缺失。
- 每次调用（包括不完整参数）保存私有完整输入；内容预检前保存原始与归一化正文、SHA256、逐页字符数。文件位于 .dsh/pdf-attempts，权限 0600；失败回执返回 attempt_path、stage 和针对性指导。
- 内容预检终止明确报告尚未生成 PDF 或逐页预览；统一工具说明，删除过时 vision_inspect 指引。
- 文档：personal-sandbox-runner/README.md；新增 test_pdf_precheck_recovery.py。

验证：最终沙箱镜像内 PDF 回归 41 项全部通过（含真实中文 PDF、分页、嵌入字体、逐页回执绑定与旧文件保护）；执行日志检查相关测试 4 项通过；git diff --check 通过。

运行环境：通过 ./docker/start-smart.sh 构建 ops-user-sandbox:local。最终镜像 config SHA 为 e2ecf7269a5d9e8b7fec3cce1d3a3bd5820bcd0e3970fed41ed664d1b325534e。通过正式 Broker 停止并更新用户沙箱，保留工作区后重放原始请求，无 slash、无显式文件名，模型及 thinking/medium 参数保持原请求。

最终重放 session：pdf-precheck-repair-final-20261029。Broker HTTP201、success=true、exitCode=0，约 83.4 秒，最终输出“已生成并逐页检查：城市自然观察手册.pdf（2 页）”。本轮成功发布两页 A4，字体嵌入、逐页视觉检查通过。

性能边界：本轮经历 7 次渲染调用，其中 6 次因参数/内容/不存在的插图资源等问题拒绝，最终一次成功；随后自动检查两页。此次完成证明本轮可恢复并交付，不代表无需重试或所有类似任务均可靠。正文仍有轻微排版瑕疵（表格粗体标记显示、记录栏偏短），此修复没有宣称文档审美已完善。

中间验证任务 pdf-precheck-repair-20261029 因协议调整主动停止，exit137 是本次更新操作导致；不可将其中断记为最终镜像成功结果，也不可解读为 OOM。首次更新遇到镜像版本保护409后，经确认空闲才停止原用户沙箱。

证据：docs/artifacts/reviews/nature-handout-audit-20261029-1007/repair/，包含最终事件、指标、PDF、两页 PNG 和 QA。父目录 repair-final-e2e.json 是正式 Broker 回执。未提交或覆盖其他未提交代码改动。
