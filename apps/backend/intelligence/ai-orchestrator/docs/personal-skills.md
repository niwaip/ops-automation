# 从聊天结果保存个人技能

用户完成一次业务任务后，可以说“保存为 <名称> 的skill”“保存为 <名称> 的技能”，或“把这个逻辑保存为 skill，叫做 <名称>”。`/save-skill <名称>` 使用同一捕获入口。

自然语言入口由 `personal-skill-chat.handler.ts` 处理。已识别的保存请求在生成失败、依赖缺失、等待超时或聊天持久化失败时仍属于保存流程，不再转入普通沙箱重新执行业务任务。等待最多 45 秒，仍未完成时返回生成中状态以及 `data.personalSkillCapture`、`data.statusUrl`；只有安装回执包含技能 ID、slug、版本时回复保存完成。带客户端消息 ID 的重试使用同一捕获幂等键。

来源默认选取最近的业务任务答复，跳过保存请求及其回执、已知失败和已取消的执行。显式指定消息时严格绑定该轮；指定用户消息时选择紧随其后的助手答复。技能记录保留实际来源助手消息 ID。

业务指令中的逗号可能分隔筛选值，因此按完整规则保存，不删除短前缀。输入附件的普通文件名、Markdown 转义名和 URL 编码下载引用均不作为输出格式契约。

## 可重复执行的核算技能

表格核算不能因答复里没有 Python 代码块而退化成规则说明。保存时由当前对话模型理解用户原话与多轮纠偏，结合附件表头提出有来源依据的结构化流程；程序再编译、重放和验收。技能名称、助手口述结果不能补充业务条件。当前执行能力支持 XLSX/XLSM 的单表分组求和、前缀排除、明确字段值的包含/排除。LLM 提升语义理解，不会自动扩大可执行操作集。非核算类技能继续支持说明和脚本资源。

模型输出必须逐条覆盖来源用户消息，为分组、度量、每个筛选引用精确的消息 ID 和原话。筛选字段、操作和值要有依据；独立规则解析器可以识别的口径还需逐项一致。返回未知操作、缺失引用、丢前缀或增加“有偿”等条件均不能安装。歧义或未支持操作返回 `needs_input` 和具体问题，不伪装 ready。模型/网络故障返回保存失败，不静默降级为不完整的文字技能。

提炼遵循渐进披露：`SKILL.md` 描述实际用途、适用边界和最多五条关键方法，不依赖提炼阶段内部变量；详细规则、原话依据和验收分别放 references。模型一次设计后最多修正一次，每次传输超时 30 秒、输出最多 2400 tokens，记录模型身份、用量及校验结果。API 可用 `existingSkillId` 显式更新用户已有技能，所有权校验后重新提炼和验收，再安装新版本；自然语言同名保存仍保留防覆盖规则。

核算包包含：

- `references/workflow.json`：字段、筛选、分组、求和、执行步骤和不可关闭的验收要求。按字段定位新附件，不保存固定文件名、Sheet 名、列字母或行号作为执行参数。
- `references/authoring.json`：LLM 的精简设计、用户原话引用、模型身份、用量和提炼时延。追溯或修改口径时读取。
- `scripts/run.py`：版本固定的只读确定性解释器，可用 `python scripts/run.py --input 新附件.xlsx --receipt 回执.json` 独立重放。
- `execution.json`：固定入口、流程和程序的 SHA256 摘要。
- `references/validation.json`：保存前使用独立的 SheetJS/BigInt 实现重放来源附件的回执。验证需要唯一字段和数值、输入未变及分组总额一致；校验完成才安装。

调用时由 `personal_skill_workflow.py` 在模型调用前接管，运行受信解释器，不执行技能包中的任意代码。Python/openpyxl 全量读取本轮唯一附件，重新定位表头与字段，使用 Decimal 求和，核对输入摘要、行数守恒和分组总额。复用同一来源文件时还需与保存时独立重放的总额及行数一致。金额保留原字段单位，不自动换算。

成功表格由程序直接呈现，工具调用、技能版本/包摘要、流程摘要、来源摘要及完整回执进入该轮 `.evidence` 档案，`personal_skill_evidence=accept` 才标记 verified。旧的纯说明核算技能、文件变化、程序被修改、新口径或多个输入均不能回退给模型编造数字。旧技能需重新编译、验证并安装新版本，历史版本仍保留。可验证核算技能不接受仅追加文字的版本发布；规则变更需重新捕获来源并验收。

## 验证结果的 LLM 解读

计算成功后先按现有 Broker SSE 协议推送核验表格，再调用当前选择的模型，从程序生成的核验观察中选择最多三条解读重点，例如统计口径、覆盖行数、最高/最低分组或程序算出的占比。输出契约只接受有效事实 ID，模型不能输出任意文本、数字或未证明的因果解释。最终文字和数字由程序绑定事实呈现，并单独记录 `personal_skill_presentation` 的 accept/fallback/skipped。

解读最多 256 tokens、总预算 20 秒，不流出未验收草稿。模型错误、超时、截断或未知引用只回退为已验证表格，不影响计算验收。用户说“只要表格”“只要结果”“无需解读”会跳过 LLM，保留快速执行；也可通过 `DSH_PERSONAL_SKILL_INSIGHTS=0` 关闭解读。独立执行技能包的 `run.py` 仍为纯确定性核算，不调用模型。

## 存储与运行版本

个人技能与沙箱共用仓库根目录下的 `data/users/<userId>/knowledge`：

- `skills/<slug>/SKILL.md`：活动技能包。
- `.personal-skills-catalog.json`：用户技能目录记录。
- `.skill-versions/<skillId>/v<version>`：版本快照。

存储根目录优先使用显式 `PROJECT_ROOT`；容器未显式配置时使用 `/workspace`，本机从当前目录向上定位仓库。不能直接使用 pnpm 服务进程的 cwd，否则会写入服务包的子目录，导致管理列表可见而用户沙箱无法发现。

当前 AI-Orchestrator 运行 `node dist/main.js`，没有热更新。源码或磁盘 dist 更新后，从仓库根目录执行：

```bash
./docker/start-smart.sh dev restart ai-orchestrator
./docker/start-smart.sh dev logs --tail 50 ai-orchestrator
```

Compose 启动命令会重新构建后运行服务。验证时需核对新的启动日志、经认证的 `GET /ai/personal-skills`、真实聊天保存回执、用户目录中的包与记录，以及沙箱 `/knowledge/skills` 的发现结果。仅构建通过或目录列表返回成功，不足以证明技能可以复用。

相关回归位于 personal-skill 目录的 intent、chat handler、source-turn、root 和 service 测试，以及 chat/user-sandbox-dispatcher 测试。
