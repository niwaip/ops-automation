# PDF 翻译协议失败自愈修复：2026-11-09

针对 12:04 结束的调用（Run `b3bd1013395e4d579156b9490bb49f5d`），补齐协议失败恢复、格式保持路由和失败取证。

## 改动

- 新增 `response_protocol.py`，先解析完整 JSON，避免译文内部代码围栏干扰；仍拒绝不完整 JSON 和非对象响应，不凭空补写内容。
- 翻译协议失败记录 `translation-rejected/*.json`：原始响应、call_id、模型、结束标记、usage、解析错误与位置，权限 0600；批次 attempt 引用该证据，主运行账本收到 `pdf_model_protocol` guard。
- 文本翻译批次遇到协议异常后，对本批各失败 ID 各纠正一次，反馈具体错误类别。数字占位符错误不会把外国/其他 ID 的 token 重新注入提示。
- 首轮预取保持最多两个批次；某批局部纠正未收敛时继续保存其他批次的有效结果，再汇总失败。预算/其他不可恢复异常仍终止；失败清单保留全部未解决 ID。
- `model_protocol_failed` 纳入检查点恢复，按 manifest 的实际 layout/translate 阶段各最多恢复一次，复用已校验来源、布局和译文；阶段次数共享并阻止重复完整 auto。
- 删除固定工作流额外的恢复分支，由 `execute_shell` 统一执行恢复，避免重复尝试和吞异常。
- 新增 `pdf_translation_routing.py`：单 PDF 明确要求保持格式、未指定其他输出格式时，纠正模型推断的 DOCX 类型和契约，再进入固定 PDF 工作流。显式 Word 等转换、多附件、复合任务、咨询和显式技能调用保留原契约。
- 固定工作流对格式保持请求使用 preserve 布局；同步更新 PDF 技能说明。原有译文/结构、候选、逐页验收和最终发布检查继续执行。

`runner.py` 仅增加调用独立路由模块的入口，避免继续堆积路由实现。本次涉及 11 个源码/测试/技能文件；保留工作区原有未提交改动。本轮独立差异见证据目录的 `implementation.patch`。

## 验证

所有容器测试从仓库根目录通过 `./docker/start-smart.sh docker-compose.pdf-test.yml run --rm pdf-translation-test ...` 执行，日志确认 `PROJECT_ROOT` 为当前仓库，测试 Compose 挂载使用 `${PROJECT_ROOT}`。

- PDF 翻译完整回归：**116 项通过**，见 `regression-final.log`。
- 最后小步调整后，协议恢复、检查点修复和布局协议专项：**27 项通过**，见 `targeted-final.log`。
- 新增测试包括：非法/非对象 JSON、含内嵌代码围栏的合法 JSON、私有原始响应留存、纠正反馈与单 ID 隔离、后续批次进度保全、预算停止、分阶段恢复限制、格式保持路由和显式转换排除。
- 本地 HTTP 模拟代理与真实 CLI 子进程联调：首次局部协议纠正失败，恢复只补缺失 ID，布局仅调用一次，候选继续进入发布检查；持续失败时只恢复一次、不覆盖原输出、再次 auto 被拒绝。
- 修正后的交付契约跳过通用规划/主模型循环，直接使用固定翻译工作流；页面验收在测试中使用固定 PASS 响应。
- 完整回归初次发现数字占位符错误反馈回灌问题，修正为只反馈错误类别后通过。保留初次日志 `regression.log`，不将其计为通过。

## 活动环境

已同步活动技能目录中的网关、翻译器、新协议模块及技能说明。通过运行中的用户沙箱读取哈希，确认 **9 个活动技能/运行时文件均与本轮源码一致**，见 `sandbox-code-hashes.json`。

DSH 每次请求启动独立 CLI/Python 进程；活动沙箱检查时仅有 tail 常驻进程，没有仍在执行的 DSH。运行时模块直接挂载仓库，技能使用已同步的共享目录，因此无需重启容器，下一次调用会加载新代码。

没有重新调用生产模型或重跑原 39 页文档，也没有改写原会话/检查点；上述测试验证恢复控制流和发布边界，尚不代表原文已成功翻译或通过真实模型页面审阅。

## 证据

目录：`docs/artifacts/reviews/pdf-translation-fix-20261109-1204/`。

- `implementation.patch`：相对于本次审计快照的独立修复差异；原本未改动的 SKILL.md 使用 Git HEAD 为基线。
- `code-hashes.json`、`sandbox-code-hashes.json`、`skill-sync.json`：源码与当前活动环境核对。
- `regression-final.log`、`targeted-final.log`、`protocol-final.log`：测试结果。

原失败原因与历史证据见 `docs/audits/pdf-translation-call-audit-2026-11-09-1204.md`；原审计快照和复现脚本保留原样。
