# PDF翻译标准修复与验证记录

日期：2026-11-06。针对20:52调用审计，修复实现版本为 `layout-html/3`。

## 方案与边界

使用同一CLI语法、版本化检查点、来源独立复核和统一子进程桥接。保持服务链路、工具schema、planning/agent_loop/导出/最终门禁的调用顺序；没有增加服务或修改前端协议。

### 1. 布局事实与语义角色

- 原生词按基线聚行，兼容上标与正常字号的top差异，保持作者姓名的横向顺序；旋转页边文字独立分组。
- VLM要求作者行使用author，机构独立成段。带贡献标记的紧凑姓名行误归为paragraph时要求结构补正，不能靠“把所有失败正文免译”绕过校验。
- 对所有几何避让、裁切完成后的图形框重新检查正面积、页边界、最小尺寸及本图标签完整性。倒置/细条图框明确拒绝，进入既有有限布局补正，不交换坐标掩盖问题。

### 2. 一套命令契约与预算

- `pdf_translation_command.py`为CLI和shell桥共用解析器；支持auto/unpack/pack、续行、末尾2>&1及受限的timeout包装。
- 错误选项产生invalid_arguments；不再把换行或--unpack登记成来源/输出路径。复合命令、shell替换及任意同名脚本不获得可信入口待遇。
- unpack与auto/pack统一注入父run/job、deadline和模型上下文，逐步归并子调用账本。unpacked是布局准备成功状态，不是发布成功。
- 每次尝试独立私有目录；用户指定准备目录必须为空，防止覆盖manifest、混写不同尝试的model-events。

### 3. 可恢复且可验证的检查点

```bash
# 首次完整执行
python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py auto INPUT.pdf OUTPUT.pdf --lang zh-CN

# 恢复：复用布局及通过的译文，仅补失败块
python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py auto INPUT.pdf OUTPUT.pdf \
  --lang zh-CN --resume CHECKPOINT_DIR

# 分步准备也进入相同预算与账本
python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py unpack INPUT.pdf NEW_EMPTY_DIR
python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py auto INPUT.pdf OUTPUT.pdf --resume NEW_EMPTY_DIR
```

检查点必须满足实现版本、输入哈希、来源IR哈希、逐页原生行重提取、节点文字映射和资源哈希检查。来源改写、版本变化或不完整布局不能恢复。目标语言变化时不复用旧译文；每个复用块仍经过当前译文规则检查。

手动pack只接受完整的ID→字符串译文字典translated.json，不执行翻译。缺少字典返回translation_input_missing并指向auto --resume，不再只报底层FileNotFoundError。不要手改source.ir.json或从旧版本目录中拼凑产物。

### 4. 失败可审计与发布保护

- 每批、每次补译在私有job中保存source/response/errors；translation-failures.json保留具体失败原因。
- 失败ToolResult提供resume_dir；提示优先定点恢复一次，不重跑全本unpack、不跳过翻译pack。
- 最终门禁跳过成功准备job，只接受真正candidate_ready候选；仅有准备或准备失败时返回明确状态与原始错误，不错误要求它具备发布候选。
- 原件、旧合格成果、当前候选哈希绑定及全页验收规则保留。

## 已完成验证

| 验证 | 结果 |
| --- | --- |
| PDF全套回归 | 150项通过，无跳过，18.734秒（包含几何提示与漏图回归） |
| 最终修复专项 | 13项修复用例，已包含于全套回归；另有2项几何证据测试 |
| 原论文作者行 | 实际原PDF本地解析验证姓名顺序，作者行不含Funstory机构片段 |
| 结构角色 | 作者行误标paragraph会被要求补正，author角色正确后通过 |
| 裁图边界 | 原审计倒置框及交换坐标后仅1pt高的细条框均被拒绝 |
| 定点恢复 | 首次一个节点失败，resume不调用布局模型，只请求该节点；通过块保留 |
| 子进程集成 | 真实CLI子进程+本地HTTP/SSE fixture；timeout包装的unpack获得专用预算，1次布局请求及140 Token进入父账本 |
| 重试隔离 | 重复unpack到同一目录明确失败，不覆盖原IR；每次私有manifest独立 |
| 打包契约 | 缺译文字典给出明确恢复指引；非法--unpack不登记伪来源/输出 |
| 语法检查 | 修改后的模块compileall通过 |
| 工作区检查 | 本轮相关修改diff检查通过；全工作区仍有此前pdf_review_contract.py第21行尾随空格，未改动该无关文件 |

模型内容与视觉PASS/FAIL在本地集成测试中由fixture提供。上述结果不能替代原论文真实模型全本验收。

## 生效方式与真实验收

运行时Python模块已通过现有只读源码挂载生效；PDF引擎和SKILL已同步到实际 `/opt/dsh/skills` 对应的共享目录，引擎模块逐文件同步并校验哈希。未安装依赖、未改镜像；启动已有停止的用户沙箱，未重建；后续新CLI进程加载新代码。没有改动他人并行中的Broker/Compose文件。

真实验收脚本：`tests/e2e/pdf_translation_repair_validation.py`。它使用已有沙箱身份及中央代理，明确选择qwen36-35b-a3b，独立目录 `/workspace/.dsh/validation/pdf-repair-<时间戳>`，总deadline900秒、工具上限600秒；最多一次同deadline的定点恢复，随后进入现有全页PDF验收。凭据保留在原运行环境，不提取、不写入临时文件或证据。

真实模型验证已获用户授权，使用同一中央代理与模型执行。首次重新解析修复了作者顺序和图1边界；随后发现正文内脚注数字2被译文遗漏，已增加不透明数字占位符编码与严格一一还原，未放宽数字完整性规则。补译后127/127文本单元通过，候选10页，但全页视觉门禁未通过，因此没有发布该候选。

人工核对页面与原PDF后，区分出两类后续问题：

- 真实工程问题：图3被模型归为只含英文图注的figure，遗漏了上方命令截图。新版根据原生image/rect边界，将图注与图形分开，并要求重要原生图形至少95%面积被figure/formula/table覆盖。旧版检查点作废，重新解析原PDF，不能手改IR补图。
- 审阅误判：页4居中页码清晰且字符框无重叠；模型却指称右下角页码重叠，还将原文Mac脚注4及正常续段视为缺字。新增从当前哈希绑定PDF提取页脚、字符重叠、当前页文字和下一页开头作为核对事实。事实不自动授予PASS，实质缺陷仍须由视觉审阅判定。无阻断缺陷要求只输出PASS，避免将可选编辑建议混入阻断回执。

新增数字保护、图注归属、原生图像覆盖、几何辅助不可读取时降级测试均通过。真实原论文新版全本验收正在执行，结果以本记录后续验收段和summary为准，不把fixture测试当作实测通过。

本地证据目录：`docs/artifacts/reviews/pdf-translation-implementation-20261106/`。本轮代码未提交Git。
