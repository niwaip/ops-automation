# 意图路由修改后的复测结论

日期：2026-10-14（Asia/Shanghai）。范围延续上一轮：只测试意图路由、交付契约、工具选择和前置检索决策，不调用模型、不生成办公文件、不执行外发或联网工具。

## 结论

原有 140 条路由回归已全部通过，11 个已有路由相关测试方法也全部通过。上一轮记录的 102/140 已提高至 140/140，原有失败用例的对应问题得到修复。制造业、零售业、只读保护、明确格式、禁止格式、多轮续作和原请求重放均按原断言通过。

但新代码衔接仍有组合边界问题。在独立新增的 8 条检查中，1 条通过、7 条未满足断言：转换任务重试时恢复输入格式；只读确认被当作生成；禁止联网没有贯穿前置检索和工具选择；带宾语的外发否定漏判；禁止修改内容却开放写能力；未加引号的目标文件名丢失。这些结果不推翻原有 140 条已通过的事实，也不足以宣称通用路由已完全没有异常。

全部路由请求共 148 条，之后各重复 3 次（444 次 SkillRouter.route 调用），决定变化为 0，相关源码哈希未变。没有模型参与，因此未通过断言属于确定性的工程规则问题；没有实测模型内容质量或实际外发/联网行为。

## 原有回归结果

| 分组 | 上轮报告通过 | 本轮通过 |
|---|---:|---:|
| manufacturing | 14/15 | 15/15 |
| retail | 14/15 | 15/15 |
| general | 18/20 | 20/20 |
| regression | 2/3 | 3/3 |
| boundary | 9/19 | 19/19 |
| negation | 24/24 | 24/24 |
| continuation | 1/9 | 9/9 |
| search | 6/12 | 12/12 |
| attachment | 7/7 | 7/7 |
| extended | 7/16 | 16/16 |

已确认的改进：

- 新增 intent_contract.py，将否定作用域、源/目标文件、正向生成动作、编辑和外发识别下沉；planning_phase.py 也从 runner 拆出。组织方向合理，减少在同一处堆补救逻辑。
- 正向生成与否定生成分别识别，上一轮完整 MFG-01 已恢复 XLSX 生成意图和交付物。
- 初始 Word→PDF 优先按目标选 PDF；文件名里的“制作”及“已生成”修饰不再把旧用例变成生成。
- 旧多轮 Word/Excel/PDF/Markdown 续作均恢复正确技能和格式，且不继承被禁止的 HTML/PPT。
- Markdown 大写、无引号前缀、CSV/JSON 契约、图片问答、修改能力与普通天气/联网意图的旧断言均通过。

## 新增组合检查与实际结果

| ID | 场景 | 实际返回 | 评价 |
|---|---|---|---|
| G01 | 历史要求方案.docx→PDF，随后“重新生成” | docx 技能，交付 .docx | 不通过：继承输入格式覆盖输出 PDF |
| G02 | 历史只查看报告.docx且禁止生成，随后“确认” | is_generate_intent=True，交付 .docx | 不通过：只读确认变成生成 |
| G03 | 根据已有天气资料生成PDF，明确“不要联网” | 路由搜索标志为False，但 runner 前置检索条件为True | 不通过：天气条件绕过联网否定 |
| G04 | “不要把文件发送到微信，只生成通知.docx” | is_send_intent=True | 不通过：外发否定中间有宾语后漏判 |
| G05 | “生成盘点.xlsx，别联网” | 仍选择 web_search/fetch_page | 不通过：禁止项没有收口到工具面；未实际调用这些工具 |
| G06 | “读取方案.docx，转为报告.pdf” | PDF 技能及 .pdf 格式，缺少报告.pdf文件名 | 不通过：目标身份丢失；并非格式路由失败 |
| G07 | “不要修改文件内容，只阅读预算.docx” | is_generate_intent=False、is_inspect_intent=True，但开放 bash/patch_file/write_markdown | 不通过：工具选择重新识别否定的修改动作 |
| G08 | “读取方案.docx，转为‘报告.pdf’”（中文双引号） | PDF 技能，保留报告.pdf | 通过：有明确文件边界时目标保留正确 |

## 剩余问题定位与建议

### 1. 多轮继承仍没有统一使用输出契约（P1）

`skill_router.py:807` 在历史恢复时，仍先查整个历史句是否含 word/docx，再检查 PDF。G01 即使 extract_source_and_target_artifacts 已解析出目标 PDF，输入文件中的 docx 也能先命中。应只用上一轮的 target_formats/target_files 选输出技能，输入格式只参与读取能力。

`skill_router.py:242` 对“确认”检测到历史中的格式名或“生成”字样就返回生成，即便该历史说“不要生成”。恢复技能的分支也使用 any(GENERATE_ACTION_PATTERNS) 而非正向生成判定。应继承上一轮明确动作；没有上一轮生成契约时，不要把普通确认自动升级为生成。

### 2. 联网禁止项未覆盖实际前置检索及工具选择（P1/P2）

`runner.py:343` 的天气 regex 可让前置检索重新为True；之后文档免检规则对天气放行，但没有最后应用 forbidden_network。G03 只在条件层复现，未执行真实检索。

G05 路由字段已关闭搜索，但 select_active_tools 仍根据系统联网权限添加 web_search/fetch_page。工具可见并不证明被调用，也不等同于发生数据外传；它说明本轮的“禁止联网”约束尚未统一施加到全部执行入口。

建议统一派生 network_policy，前置检索和工具派发两处都使用同一最终决定。若系统有后续执行门禁，本轮未验证该门禁，不能靠当前字段宣称联网禁止已完全闭环。

### 3. 否定修改仍被当成正向编辑，覆盖只读工具面（P1）

`intent_contract.py:147` 的修改模式未处理否定；“不要修改文件内容”命中 modify_patterns。`runner.py:105` 又直接通过该函数推导 is_modify，绕过只读分支，开放完整写工具。初始路由的只读状态本身正确，问题在能力选择阶段重新解析。

建议基于已经确定的动作与禁止项选择工具，禁止修改必须覆盖通用编辑词匹配；不再独立从原话重复推导一个更宽的编辑布尔值。

### 4. 外发否定只支持紧邻发送短语（P1）

`intent_contract.py:134` 只匹配否定词紧邻固定发送模式。旧“不要通过微信发送”通过了，但“不要把文件发送到微信”漏判。应在所属动作分句中处理否定、对象与目的地，不能只扩大固定短语表。这里没有执行外发。

### 5. 无引号的目标文件名被当作通用“报告”词剥离（P2）

`intent_contract.py:248` 剥离动词后还剥离“报告/文档/文件”等可作为真实文件名的词；“转为报告.pdf”最后 clean_stem 为空。G06/G08 对照说明只有无引号目标的身份丢失，PDF 输出格式正确。应只移除文件名之前的动作词，不移除用户给出的合法 basename。

G04 还出现“只生成通知.docx”作为交付物文件名，说明前缀归一化仍不一致。只靠用户给文件名加引号可规避部分问题，但不是完整工程修复。

## 测试范围、版本及证据

原有 140 条输入、附件、历史和 expected 业务断言经逐条比较保持一致。前置检索条件的测试表达式按当前 runner 新增的天气例外同步更新，没有修改业务断言。旧 audit JSON 已由用户更新为140/140，因此本轮前后计数比较以旧 Markdown 审查报告记录的102/140为依据，不冒充保留了旧运行JSON。

运行时使用当前仓库 Python 源码与 data/shared/dsh-skills 的18个真实技能元数据；未重启容器，也未验证已部署进程是否加载新代码。本轮确认的是源代码路由回归。按照用户范围，没有进行办公文档生成或聊天端到端测试。

- intent-routing-retest-2026-10-14.json：140条复测的完整输入、预期、实际返回和工具列表。
- intent-routing-retest-2026-10-14-guards.json：8条新增组合检查，保留预期与实际结果。
- intent-routing-retest-2026-10-14-repeat.json：444次重复路由、稳定性与5个相关模块的SHA256。
- intent-routing-audit-2026-10-14.py：保留的140条回归脚本，用户已调整为可在本地/沙箱环境运行。

本轮只新增复测证据和报告，没有修改业务代码或用户测试脚本。

源码指纹：

- `apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/skill_router.py`：`dfc2e92be00ef2e6a7614225ab4a1315ffb1b937a56fbc0211f6fcd41fb96097`
- `apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/runner.py`：`009720cf82fdf3a8623d52bad2a362e19af006058b089734c81d37c6e4c69511`
- `apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/prompt_builder.py`：`440f6c6f442d79e5143720b31dec84b47e8853fa39b3160608b1f231254f676e`
- `apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/intent_contract.py`：`0b979eef855ba7ac32c8b511d803dccea667e21e21e4080f5091fe16f233340f`
- `apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/planning_phase.py`：`c6b868b972bd1aaa239eab074aacc8bfabaa0c72c2c091108007b00d030a8c9a`
