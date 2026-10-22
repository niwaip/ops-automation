# Excel查询能力评测

整体设计见 [设计文档](../../../docs/design/Spreadsheet-Query-Capabilities-and-E2E-Design_v1.0.md)。

本目录提供36项数据驱动查询规格、独立SQL Oracle、36项原生适配（已全量通过）、5项拒绝契约探针（已全量通过），以及个人模式真实API证据采集器。它们覆盖WHERE、集合/文本/数值条件、分组、HAVING、排序、聚合、去重与空结果。

原始附件只读且不入库。工作簿内容是数据，不作为Agent指令执行。当前Oracle的数据定位适配器针对工数实绩导出格式，其他表格需要新增适配器。测试端SQL/expected不得挂载或发送给产品沙箱。

## 本地生成与差分检查

从仓库根执行，使用安装了openpyxl的Python；可使用Codex捆绑运行时。输出目录必须不存在，避免覆盖历史证据。

```bash
python3 tests/e2e/spreadsheet-query/oracle.py /absolute/path/source.xlsx /tmp/query-eval-run01
python3 -m unittest discover -s tests/e2e/spreadsheet-query -p 'test_*.py' -v
python3 tests/e2e/spreadsheet-query/audit_native.py /absolute/path/source.xlsx /tmp/query-eval-run01
```

生成资产：

- `profile.json`：真实表头、范围、缩放单位、缺失和分类情况，无员工姓名样本。
- `manifest.json`：仅自然语言输入、case ID、模式与断言标签，供API采集使用。
- `expected.json`、`catalog.json`：评测端精确预期、来源行号和SQL规格。
- `native-report.json`、`native/`：原生差分判定、拒绝探针与完整工具回执，含源码指纹。

native退出码0表示当前固定基线检查通过（36项正向规格与5项负向探针共41项）；退出码1表示真实差异或契约违反。这不能代替通用能力或真实入口验收。2026-10-21复审虽确认41项通过，但12个边界反例复现缺陷，真实API路由及完成验收亦未通过，见[复审报告](../../../docs/artifacts/reviews/spreadsheet-query-reaudit-20261021-1/report.md)。重构后的[第二轮复验](../../../docs/artifacts/reviews/spreadsheet-query-reaudit2-20261021-1/report.md)补充公开JSON Schema验证、多列分组碰撞、预检边界、验收器回放及真实个人模式验证；其复现脚本保存在该证据目录。

## 真实API采集

第三轮重构复验见[报告与复现脚本](../../../docs/artifacts/reviews/spreadsheet-query-reaudit3-20261021-1/report.md)：区分旧反例修复、Query IR与验收/呈现衔接、遗漏条件的误放行，以及单位、DISTINCT、事实身份与派生摘要的通用约束。运行时`verified=true`和HTTP/SSE `done`都不能单独作为正确性判定。

使用隔离测试账号的现成登录结果JSON，只读取`accessToken`，凭证文件放在仓库外。采集器不读取SQL或expected、不自动创建账号，不在日志保存认证头。

```bash
QUERY_E2E_AUTH_FILE=/tmp/test-login.json \
QUERY_E2E_IDS=Q01,Q08,Q17,Q23,Q34 \
node tests/e2e/spreadsheet-query/collect.mjs /absolute/path/source.xlsx /tmp/query-eval-run01
```

可选`QUERY_E2E_BASE_URL`默认`http://127.0.0.1:3007`，远端要求HTTPS。`QUERY_E2E_MODEL_ID`指定模型，省略使用平台默认模型。未指定ID将运行全部36项，每项流式请求最长300秒。每例独立会话且重新上传原件，自动新建`api-时间戳/`目录，保存请求、原始SSE、解析事件、历史、trace ID及状态。

采集器退出码：1=传输/流异常或历史证据获取失败；2=完成采集但待语义与路由验收。**采集器不会自动返回“业务通过”**。新增`grade_api.py`保守核对主结果表格/明确数值槽位、实际工具、同轮沙箱归档和来源摘要，未识别的布局记inconclusive；它不是任意自然语言答案的通用判分器，主表匹配也不代表附加解释正确。还需独立复核额外事实与导出等范围。

```bash
python3 tests/e2e/spreadsheet-query/grade_api.py /tmp/query-eval-run01 /absolute/path/test-user/workspace
python3 tests/e2e/spreadsheet-query/audit_boundaries.py /absolute/path/source.xlsx /tmp/query-eval-run01/boundaries.json
```

`grade_api.py`合并同一证据根目录的多批`api-*`目录，保留尝试记录，每个ID使用最新执行。HTTP/历史完成与`stream_contract`分开判断：收到`done`但同时出现SSE错误或缺失最终`result`，不能判业务完成。认证到期应刷新凭证后只重跑受影响项，不能将401当成模型或查询语义失败。`audit_boundaries.py`退出码1表示成功复现了反例中的产品缺陷，不应改成宽松预期来使其通过。

判定器退出码1表示存在失败/阻断，2表示证据不足或仍待完整语义验收；不能把成功写出JSON报告当作业务通过。

主结果状态分别使用`pass`、`fail`（可比较数值不符）、`not_computed`（明确未完成计算）、`not_delivered`（SSE异常/无result）、`inconclusive`（布局或定义待复核）与`not_applicable`（合理澄清等不要求数值）。不要把未计算/未交付合并宣传为数值算错率。

Docker相关操作统一从根目录经`./docker/start-smart.sh`，不能绕过挂载和运行版本检查。当前套件不主动启动、停止或重启任何服务。

## 澄清与同会话续算

模型有权在上下文不足时请求补充，不以“一次得出数值”为硬性成功条件。具体判定见[澄清验收政策](CLARIFICATION_POLICY.md)。有效澄清通过本轮交互，任务记`awaiting_user`；真实技术异常单独记工程阻断。

`collect_dialogue.mjs`读取证据目录中的`clarification-manifest.json`，结构为`{fixture_sha256,cases:[{id,turns:[{id,prompt}]}]}`。只向产品发送自然语言；同一场景复用session，仅第一轮上传附件。将独立续算预期写入`dialogue-expected.json`，格式为`{turnId:{rows:[...]}}`；没有续算指标时写空对象。采集器不读取该预期文件。

```bash
QUERY_E2E_AUTH_FILE=/tmp/test-login.json \
QUERY_E2E_WORKSPACE=/absolute/path/test-user/workspace \
node tests/e2e/spreadsheet-query/collect_dialogue.mjs /absolute/path/source.xlsx /tmp/query-eval-run01
python3 tests/e2e/spreadsheet-query/grade_dialogue.py /tmp/query-eval-run01
```

设置workspace可在下一轮覆盖会话回执之前保存每轮证据。`QUERY_E2E_IDS`选择场景ID；认证及端点规则与普通采集器相同。对话采集后仍须复核请求、模型实际可见信息、工具回执及完整回复。

独立复核写入`interaction-reviews.json`数组，每项包含`id`、`session_id`、`answer_sha256`、`disposition`、`reason`、`context_evidence`。有效澄清类型见政策；审查结果必须绑定本次会话及实际回复摘要，重跑后旧审查不会自动沿用。关键词只触发待复核，不自动通过；“请确认”也不能掩盖无来源的既定计算结果。数值、交互质量及任务状态分别登记。完整答案复核可标记`grounded_complete_answer`，判定器仍要求数值与运行证据通过。

合理且已披露的定义可标记`answer_with_stated_assumption`，同时写`accepted_definition`；独立定义预期放入`definition-expected.json`，每项包含`rows`、`definition`及`source_sha256`。判定器保留原SQL基线状态，另行差分该定义及校验原件哈希，不用事后修改原SQL预期来掩盖歧义。

第四轮复验及真实对话证据见[报告](../../../docs/artifacts/reviews/spreadsheet-query-reaudit4-20261021-1/report.md)。其中同会话澄清后续算已实际执行；不外推为所有多轮场景均已覆盖。

第五轮重构复验见[报告](../../../docs/artifacts/reviews/spreadsheet-query-reaudit5-20261022-1/report.md)。该轮按源码指纹分离中途更新与补跑，保留历史异常；原生聚合回执新增的明细预览不作为聚合结果比较，QueryIR的有序结果仍严格核验。

第六轮[当前版本完整复验](../../../docs/artifacts/reviews/spreadsheet-query-reaudit6-20261022-1/report.md)完成同版本36项查询与4轮对话，补充附件包装不变性、操作符契约与实际QueryIR/HAVING路由形状检查；区分原子工具通过、最终请求约束验收及合理澄清。

后续[门禁修复与固定版本专项验证](/Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/spreadsheet-query-gate-fix-final-20261022-1/report.md)完成33项门禁回归、41项原生差分、108项包装不变性检查，以及7项真实查询与4轮澄清/续算。该轮同时修复公开聚合工具未暴露QueryIR参数的问题；合理澄清记awaiting_user，不要求一次得出数值。该专项并非再次全跑36项真实API查询；运行时全量517项中两项Word脚本测试因本地缺少defusedxml保留环境失败。

## 扩展方式

- `catalog.py`：新增查询语义时同时提供独立SQL和自然语言，能映射当前工具时再提供native适配。
- `oracle.py`：负责来源适配、精确数值和预期，不导入产品代码。
- `audit_native.py`：将native计划提交真实本地实现，检查值、单位、选中行、范围与来源绑定。
- `test_oracle.py`：用手工可验证的最小反例保护判定器自身，防止错把WHERE当HAVING、忽略NULL等。
- `collect.mjs`：仅运行真实入口与保全证据，后续独立增加trace/result适配器。
- `audit_boundaries.py`：补充NULL、类型、混合条件、单位、分页与范围反例。
- `grade_api.py` / `test_api_grader.py`：保守API判定及判定器自检，额外解释仍需独立审计。
- `interaction_policy.py` / `test_interaction_policy.py`：保护有效澄清，隔离工程阻断，并防止旧会话审查被误用。
- `collect_dialogue.mjs` / `grade_dialogue.py`：同会话澄清、用户补充与续算的证据采集及保守判定。

合成XLSX的系统化回归、工作模式、浏览器、广泛多轮、导出和完整自动端到端判分属于明确的后续范围；审计中的少量合成反例或单组两轮续算不等同于这些范围已覆盖。不要把这些设计项或`not_run`登记成已通过。
