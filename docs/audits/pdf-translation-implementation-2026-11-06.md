# PDF翻译引擎首版实施与验收记录

日期：2026-11-06。状态：代码已落地，生产默认关闭；真实论文全本验收待完成。

## 已落地内容

兼容入口仍为 `flow_pdf_translate.py auto INPUT OUTPUT --lang zh-CN`。服务入口、工具schema、planning/agent_loop/导出/外部门禁顺序、前端文件卡片协议均保持。未增加服务或队列。

引擎位于 `apps/backend/runtimes/personal-sandbox-runner/skills/pdf/scripts/pdf_translation/`：

1. pdfplumber提取不可变原生行与坐标，几何分组减少模型处理的ID数量。
2. 页面图像与候选ID交给现有视觉网关判断结构、读序、表格和图形区域。所有原生行必须且只能归属一次，布局补正最多一轮。
3. 图形/公式从整页预览按区域裁切，保留矢量渲染结果及原标签；图中可译文本附中文图例。
4. 文本通过现有 `call_model_proxy` 分批翻译，检查缺键、空值、未翻译、数字与URL；只补译失败块一次。错误不会回填原文报成功。
5. 类型化节点经受控Jinja模板、WeasyPrint 68.1和Noto字体生成隐藏候选；长表支持合并单元格、表头重复与自然分页。
6. shell桥注入本次run/job上下文及统一deadline，将子进程模型事件按call_id归并父账本；中断调用形成失败记录。
7. 在原external_pdf_gate调用点重算来源/IR/候选/资源哈希，对照原PDF重新提取的行事实，再检查译文与输出内容覆盖，随后复用check_pdf和现有逐页视觉验收。

只有现有发布模块可以将候选替换为公开目标。失败保留原件和旧成果、清空本轮外发，不把错误说明或其他通用草稿当作译文。上传PDF翻译绕过CLI而缺少manifest时也会被拦截。

## 开关与运行方式

- `DSH_PDF_TRANSLATION_ENGINE`：默认 `disabled`。仅设置为 `layout-html-v1` 才启用；关闭时明确返回 `engine_not_enabled`。
- `DSH_PDF_TOOL_TIMEOUT`：默认300秒，受父任务剩余deadline进一步约束；当前至少预留40秒给既有后续流程，不保证长文全页验收预算充足。
- `DSH_MODEL`、`DSH_VISION_MODEL`：仍使用沙箱现有配置及中央代理。未增加厂商地址或令牌配置。context与manifest不存凭据。
- `--layout balanced`：默认，保留分栏倾向、允许自然跨页；`reading`：单栏；`preserve`：只约束源页边界和总页数，尚不支持逐像素位置一致。

开关必须进入实际沙箱DSH进程环境，单独修改宿主机shell变量不会自动透传。此次只在独立测试Compose中启用；未修改Broker容器创建参数或生产镜像默认值，也未重启用户沙箱。灰度放量前需把该环境变量纳入选定测试沙箱镜像/已有运行配置，并确认新DSH进程实际读取到配置和当前源码。

测试沿用已有 `ops-user-sandbox:local` 镜像，源码与skills只读挂载，无新增依赖。统一从仓库根目录运行：

```bash
./docker/start-smart.sh docker-compose.pdf-test.yml run --rm pdf-translation-test
./docker/start-smart.sh docker-compose.pdf-test.yml run --rm pdf-translation-test \
  -m unittest discover -s tests -p 'test_pdf_*.py'
```

真实样本入口是 `tests/e2e/pdf_translation_runtime_smoke.py --pages N`，只在隔离容器内执行，显式使用获准的模型目的地和测试凭据；需要真实模型连接，不能当作离线测试。凭据通过私有env文件提供，不写入仓库；本次临时凭据文件已在收尾删除。

## 验证结果

| 检查 | 结果与限制 |
| --- | --- |
| PDF回归 | 131项通过，无跳过；包含真实解析、HTML/PDF渲染、CLI子进程、HTTP/SSE协议和调用账本；其中模型内容及发布视觉结论由测试fixture提供 |
| 最终翻译专项 | 补充IR重算哈希篡改检查后，19项全通过；该项是新增覆盖，未重复执行整个既有PDF套件 |
| 完成判断 | `test_completion_evaluator.py` 9项通过 |
| 共享视觉/附件/DSH回归 | 99项中98项通过；知识库软链接扫描测试失败，见下文，不将其隐去 |
| 双栏候选 | 验证栏目读序和原生ID完整覆盖，遗漏/重复会失败 |
| 图形/长表 | 区域图与公式实际嵌入PDF；80行长表跨页、合并表头和最后单元格均被验证 |
| 故障与发布 | 传输失败、缺键、哈希变化、视觉FAIL、无manifest、灰度关闭、子进程中断均禁止外发；旧文件保持 |
| 离线预览 | `docs/artifacts/reviews/pdf-translation-implementation-20261106/offline-fixture/versions/v1/candidate.pdf`，已查看渲染PNG；仅为合成内容排版样本，尚未取得真实模型逐页验收，不能作为原论文译文 |
| 真实论文 | 首轮VLM逐行分组被严格覆盖检查拒绝。改用段落候选后上游视觉服务连接拒绝、备用服务socket断开，最终HTTP500，未产生可交付译文 |

共享回归中的 `test_dsh.TestDshCoreModules.test_scan_personal_knowledge_symlink_defense` 期望临时知识目录的guide.md被扫描，实际返回知识库为空。该测试与已有知识库扫描改动相关，此次没有修改相关实现来掩盖失败。PDF专用回归和共享视觉/附件测试均通过；当前不能宣称仓库全量测试通过。

真实测试证据保留于 `docs/artifacts/reviews/pdf-translation-implementation-20261106/live-*`，包含manifest、模型账本与失败原因。17:01代理日志确认：首选视觉服务连接被拒绝，备用qwen服务socket断开，最终返回500。没有把基础设施错误归为内容缺陷，也没有发布旧候选。

自动审批另拒绝了显式选择 `qwen36-35b-a3b` 继续发送原论文页面，原因是需要用户对该具体模型目的地的明确授权；该调用未执行，也未通过其他路径绕过。

## 明确的能力边界与下一步

扫描件/OCR、图内标签覆盖改写、旧list格式IR转换、全文术语表、Token精算切批、跨run自动缓存恢复、候选自动排版修版、精确输出页锚点和逐像素保真尚未实现。`unpack/pack` 接受新版本IR目录，pack必须提供按ID映射的 `translated.json`，仍只生成隐藏候选。

真实7页论文和更丰富版式尚未完成验收，不能据离线fixture宣称该案例已修复、达到保真率或性能SLO。下一步是在用户获准的模型目的地恢复真实页面验证，完成全本译文、图表关联和全页验收后，再决定启用默认引擎。现阶段保留默认关闭，符合设计中PR6完成后放量的约束。
