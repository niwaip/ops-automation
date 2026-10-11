# personal-sandbox-runner (DeepSeek Harness / dsh)

`apps/backend/runtimes/personal-sandbox-runner` 是个人专属安全沙箱（User Sandbox）内部的智能体运行时核心模块。

---

## 一、职责与系统定位

- **执行主体**：运行在每个用户的独立隔离沙箱容器（`ops-user-sandbox:local`）内部，以非 root 用户（`sandbox`）权限运行；
- **核心角色**：DeepSeek Harness (`dsh`) CLI 智能体引擎，负责自主推理（ReAct 循环）、多格式工具调用、技能检索、联网事实检索、办公文档处理与产物导出；
- **上层编排交互**：
  - **调度层**：`intelligence/ai-orchestrator`（`user-sandbox-dispatcher.service.ts`）通过 SSE 流式接口向 Session Broker 发起调度，并接收实时增量内容与交付物下载卡片；
  - **控制层**：`execution-control/session-broker`（`UserSandboxService`、`UserSandboxContainerService`、`UserSandboxHarnessService`）负责容器生命周期、配额管理与非 root 命令分发；
  - **模型网关**：通过 `ai-orchestrator` 提供的内部安全模型代理（`http://ops-ai-orchestrator:3007/ai/proxy/v1`）与大语言模型通信。
- **运行环境空间**：
  - **工作区**：`/workspace`（用户主工作目录，读写可用，持久化挂载）
  - **知识库**：`/knowledge`（用户个人空间与参考知识库，读写可用，持久化挂载）
  - **技能库**：`/opt/dsh/skills`（系统认证技能库，集中只读）与 `/knowledge/skills`（用户自定义技能库）
  - **插件库**：`/opt/dsh/plugins`（系统认证插件目录，集中只读）

---

## 二、模块架构与目录设计

整个运行时严格遵循单一职责与高内聚低耦合原则拆分为各专业子模块：

```text
personal-sandbox-runner/
├── README.md                   # 运行时设计与使用说明（本文件）
├── requirements.txt            # Python 运行时依赖库
├── bin/
│   └── dsh                     # CLI 可执行脚本入口（参数解析与子命令分发）
├── src/
│   └── dsh_modules/            # 核心领域业务模块
│       ├── __init__.py         # 版本与包定义
│       ├── config.py           # 环境变量、常量配置、路径定义与 Banner
│       ├── doctor.py           # 环境与健康诊断（dsh doctor）
│       ├── runtime_policy.py   # 运行策略、执行预算、契约轮数动态解析
│       ├── context_budget.py   # 上下文预算管理、逆向滑动窗口与原子轮次裁剪
│       ├── skill_router.py     # 语义意图路由（TF-IDF）、Slash 命令与产物契约
│       ├── skills.py           # 系统/用户技能资产发现、加载与元数据解析
│       ├── eval_skill.py       # 技能触发意图精准度自动化评测（dsh eval-skill）
│       ├── prompt_builder.py   # System Prompt（前缀稳定促缓存）与动态 User Turn 组装
│       ├── llm.py              # 模型代理流式通信、SSE 解析、多协议工具调用解析与输出清洗
│       ├── tools.py            # 工具定义注册表（SANDBOX_TOOLS）与工具分发执行器
│       ├── reminder_tools.py   # 个人日程与提醒事项创建、参数别名容错与带外协议封装
│       ├── web_tools.py        # 联网检索、权威气象、网页 Markdown 提取与 SSRF 安全防御
│       ├── file_tools.py       # 知识库扫描、多模态视觉检查/OCR、文件读写补丁与外发
│       ├── office_tools.py     # Word(.docx)、Excel(.xlsx)、PDF(.pdf)、PPT(.pptx) 高性能解析
│       ├── analysis_contract.py# 指标、比较基准、排序口径的任务契约
│       ├── analysis_validation.py# 检查分析回答是否覆盖指标及正确比较基准
│       ├── comparison_tool_schema.py# 可复用列比较工具的公开参数契约
│       ├── comparison_context.py# 来源表头候选列对、目录与按需上下文
│       ├── spreadsheet_units.py# 从原件声明字段读取金额单位及来源
│       ├── table_comparison.py # 显式列对与范围的只读计算、排序与来源证据
│       ├── comparison_evidence.py# 本轮执行证据及极值结论一致性验证
│       ├── agent_loop.py       # ReAct 智能体多轮执行循环、防死锁反推与物理产物拦截断言
│       ├── artifact_exporter.py# HTML 原型与各类交付物提取、Token 截断自动闭合与自愈
│       └── telemetry.py        # 遥测指标收集（TTFT、Token、耗时）与协议标记外发
├── plugins/                    # 系统扩展插件目录
│   ├── image_gen.py            # 文生图插件
│   ├── knowledge_scanner.py    # 知识库探针插件
│   ├── modsearch.py            # 模块检索插件
│   ├── weather.py              # 天气插件
│   └── web_search.py           # 联网搜索插件
├── skills/                     # 随镜像分发的预置高质量技能库
│   ├── docx/                   # 专业 Word 文档生成规范
│   ├── xlsx/                   # 财务与业务 Excel 报表生成规范
│   ├── pdf/                    # 报告型与表单型 PDF 生成规范
│   ├── pptx/                   # PowerPoint 演示文稿生成规范
│   ├── html-ppt/               # 基于 Web 现代技术的幻灯片生成规范
│   ├── guizang-ppt/            # 硅藏风格精品 PPT 设计技能
│   ├── web-prototype/          # 单页应用与高保真原型设计规范
│   ├── frontend-design/        # 前端交互与视觉设计技能
│   ├── research/               # 深度网络调研与研报撰写技能
│   └── ...                     # 其他专题技能
└── tests/                      # 自动化单元测试套件
    ├── test_dsh.py             # 核心循环、工具调用、SSRF与协议解析测试 (47 cases)
    ├── test_dsh_skills.py      # 技能语义路由、亲和度匹配与产物断言测试 (19 cases)
    ├── test_dsh_reminder.py    # 个人日程提醒创建、参数别名容错与协议标记测试 (4 cases)
    └── test_office_sandbox.py  # 办公文档提取与多格式沙箱实测 (5 cases)
```

---

## 三、命令行（CLI）完整用法

```bash
# 1. 环境与健康诊断（全面检查 Python 依赖、命令行引擎、沙箱挂载权限及模型代理连通性）
dsh doctor

# 2. 版本与环境信息
dsh version
dsh info

# 3. 技能管理与评测
dsh skills                          # 列出所有已就绪的系统与自定义技能
dsh skill <skill-name>              # 查看指定技能的完整 Prompt / 规范定义
dsh eval-skill <skill-name>         # 评测提示词对该技能的语义意图命中率
dsh eval-skill <skill-name> -v      # 详细展示每个用例的命中特征与亲和度得分

# 4. 插件查询
dsh plugins                         # 列出当前沙箱可用的认证扩展插件

# 5. 执行智能体任务
dsh run "查询上海实时天气"
dsh run "生成一个电商管理后台原型" --session-id "sess_123"
dsh run "对比调研 DeepSeek V3 与 Qwen 2.5" --web-search --research
dsh run "分析这个合同的法律风险" --files "合同草案.docx" --model "uuid-model-id" --timeout 180

# 6. 直接在工作区执行 Shell 指令
dsh exec ls -la /workspace
dsh exec python3 -c "import docx; print(docx.__version__)"
```

### `dsh run` 参数说明

| 参数 | 缩写 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `query` | (必填) | - | 用户输入的任务 Prompt 或指令 |
| `--web-search` | `-s` | `True` | 实时联网检索（默认开启） |
| `--no-web-search` |  | `False` | 为本次运行显式关闭联网检索 |

联网检索采用统一的分层链路：沙箱只负责实体、时效和来源意图拆分，随后通过签名虚拟令牌调用平台搜索网关；Tavily、Exa、Firecrawl 等真实凭据始终保留在控制面。平台会对最多 3 个扩展查询并行检索、按 URL 去重，并在 `official-first` 策略下优先官方文档、开发者站点和 GitHub/GitLab 来源。供应商返回空结果属于软失败，会继续尝试下一通道。平台不可用或未返回有效结果时，仍保留 `modsearch`、Bing HTML、DuckDuckGo 以及微博/B站/天气专用接口作为免 Key 兜底。
| `--research` | `-r` | `False` | 显式激活深度研报调研技能规范 |
| `--model` | `-m` | `None` | 指定模型标识（缺省时使用平台默认模型） |
| `--model-display-name` | - | `None` | 模型的友好可读名称（便于日志与追踪展示） |
| `--timeout` | `-t` | `300` | 任务总硬截止时间（秒） |
| `--session-id` | - | `None` | 会话 ID，用于加载和持久化多轮对话上下文 |
| `--files` | - | `None` | 逗号分隔的本轮会话附件文件名（隔离作用域） |

---

## 四、核心通信协议与标记规范

`dsh` 与宿主机 `session-broker` / `ai-orchestrator` 之间通过标准输出协议标记实时解耦与通讯：

1. **增量流式打字机**：`<<<DSH_DELTA:"内容">>>`
   - 当模型返回流式 Token 时，逐字向 stdout 吐出此标记，由上层以 SSE 格式秒级直推前端用户界面。
2. **流式重试重置标记**：`<<<DSH_DELTA_RESET>>>`
   - 当遭遇网络抖动或上游 Socket 断开重试时输出，通知上层调度器重置累积的 Delta 缓存，彻底杜绝打字机重复打印。
3. **遥测性能指标**：`<<<DSH_METRICS:{...}>>>`
   - 输出首字延迟（TTFT）、总耗时（durationMs）、循环轮数（rounds）、工具调用次数（toolCalls）及 Token 消耗。
4. **交付物主动外发**：`<<<DSH_OUTBOUND_FILE:{"filePath":"/workspace/...","fileName":"..."}>>>`
   - 当执行工具生成或显式交付文件时输出，通知上层调度器将其转化为下载卡片或内联预览。
5. **日程提醒带外协议标记**：`<<<DSH_REMINDER_CREATE:[{"title":"...","runAt":"...","sendWechat":true}]>>>`
   - 当调用 `create_reminders` 工具创建个人日程与提醒时原子化输出，由上层 `PersonalReminderBridgeService` 拦截并代理转发至控制面 `ReminderService` 落盘入库并挂载后台到点调度。
6. **最终回复正文**：`<<<DSH_FINAL_OUTPUT>>>正文内容`
   - 剔除所有工具痕迹、内部标签与中间垫话后的纯净 Markdown 文本。

---

## 五、关键技术亮点与纵深防御

1. **工作区目录边界严格受限（Directory Confinement & Anti-Traversal）**：
   - 文件工具（`read_file`、`patch_file`、`send_file`、`inspect_image`）经由 `resolve_sandboxed_path` 严格锁定根边界：
     - 用户工作区：`/workspace`（完全读写）
     - 个人知识库：`/knowledge`（完全读写）
     - 只读系统技能库：`/opt/dsh`（只读，禁写）
     - 临时脚本目录：`/tmp`（仅限执行临时脚本，严禁作为外发交付物）
   - 所有路径解析均执行 `.resolve()` 解析真实物理路径，`scan_personal_knowledge()` 严格限定扫描解析路径位于 `/knowledge` 内部，图片插件及外发接口严格校验普通文件类型与工作区边界，彻底杜绝 `..` 目录穿越、符号链接越权逃逸至系统目录（如 `/etc`、`/root`、`/proc`）。
2. **防 Prompt Injection 与命令隔离原则**：
   - 严禁将普通 markdown ```bash 或 ```python 文本代码块自动推断升级为系统命令执行；
   - 工具执行必须由模型原生 Function Calling、结构化 DSML 或显式工具调用标签触发；
   - 系统提示词注入“外部数据安全隔离准则（Rule 8）”，将所有用户上传附件与网络检索摘要标记为不可信外部数据，**显著降低间接提示词注入风险**（注：受限于大语言模型概率特性，系统提示词属于模型级纵深防御，而非绝对权限边界，系统底层同时结合非 root 用户、容器隔离及文件白名单进行多层纵深防御）。
3. **SSRF 与 DNS Rebinding 深度防护网关**：
   - 网页读取（`fetch_page`）执行前置 IP 校验，严格拦截回环（`127.0.0.0/8`）、私网（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`）、链路本地（`169.254.0.0/16`）及云元数据地址；
   - 采用套接字 IP Pinning 机制（`SSRFPinnedHTTPConnection` / `SSRFPinnedHTTPSConnection`），将 TCP 连接直接绑定至已校验的 IP，保留 TLS SNI 与域名证书校验，彻底消除 DNS Rebinding 窗口；
   - 定制 `SSRFSafeRedirectHandler`，杜绝 301/302 重定向绕过；
   - 响应内容 5MB 封顶流式截断，防止内存耗尽 DoS 攻击。
4. **动态轮次扩展与真实物理产物断言（Assertion Guard & Loop Resilience）**：
   - 采用动态 `while round_idx < max_rounds` 调度循环，当模型声称已生成交付物但物理磁盘未见文件时，系统自动拦截并动态扩充轮次，强制引导模型调用原生工具实际落盘；
   - 自动检测并阻断模型重复调用相同参数工具的死循环；
   - 智能识别模型“准备去搜索”的过渡性承诺垫话，无工具调用时主动推进继续执行。
5. **HTML 截断自愈与双模式前端预览**：
   - 模型无论是通过工具落盘保存 `index.html`，还是在对话中输出完整 ````html```` 单页，`ArtifactExporter` 均自动适配捕获，并在前端无缝挂载交互预览、全屏模式与直链下载；
   - 若模型生成长篇 HTML 单页时因 Token 限制中断，自动安全闭合未结束的 `<style>`、`<script>`、`<body>`、`</html>`，并注入优雅恢复提示卡片，杜绝前端 iframe 白屏。
6. **全套 Office 与演示文稿原生技能支持**：
   - Word (`docx`)：支持样式生成、模板填充、修订留痕（Tracked Changes）与原生批注（Comments）；
   - Excel (`xlsx`)：支持公式、财务报表、多工作表分析。附件元数据进入技能路由；专业方法放入System上下文，附件内容保留为用户数据。有完整实际/预算候选列对时，初始上下文只加载目录、表头和候选结构；其他格式保留原读取流程。候选来自原件，不含预先计算的极值；模型选择或修正列、范围与口径，调用 `compare_spreadsheet_columns` 核算，再解释结果。
     工具不匹配固定问句，不限定月份；模型选择计划，程序由成功回执生成答案。按操作和类型选择工具能力，执行层严格检查当轮工具列表；未提供的工具不得执行。完整计算证据保留在本轮运行时，模型只接收去除逐行明细的结构化摘要。验收指标、基准、排序、来源哈希、极值与金额单位；历史文字不能替代执行证据。
   - PDF (`pdf`)：支持图文研报、高保真表格、表单填写与文本提取；
   - PowerPoint 原生幻灯片 (`pptx`)：基于 `python-pptx` 原生生成标准 16:9 物理 `.pptx` 文件，支持排版、图形与主题定制；
   - 交互式网页演示文稿 (`guizang-ppt` / `html-ppt`)：生成现代化单文件交互式 HTML 演示文稿（电子杂志/横滑翻页），支持实时网页全屏预览与幻灯片交互演示。
7. **个人日程与定时提醒端到端全链路闭环（Natural Language Scheduling & Protocol Decoupling）**：
   - 具备从自然语言时间（如“明天上午10点提醒我参加技术评审”、“18:40 提醒看花灯”）到绝对 ISO 8601 时间与 Cron 表达式的精准换算；
   - 具备大模型跨架构参数别名兼容（自适应支持 `title`/`name`/`subject`、`message`/`content`、`run_at`/`time`/`remind_at` 等同义词，及布尔值标准化与 JSON 字符串自动反序列化）；
   - 在沙箱内部实现带外协议标记与 LLM 历史会话的严格隔离（模型仅接收自然语言确认，不接收内部协议字串，彻底消除模型回显导致的重复创建）。

---

## 六、单元测试与验证

本模块所有测试均可独立于外部网络和容器完整运行：

```bash
cd apps/backend/runtimes/personal-sandbox-runner

# 运行自动化测试
python3 -m unittest discover tests

# 快速验证健康状态
python3 bin/dsh doctor
```

## 通用 Excel 分析验收

只读 xlsx 分析使用来源结构与带坐标样本作为初始上下文，不把长表样本作为完整数据。金额单位、公式验证、业务范围和过滤条件进入执行证据。`aggregate_spreadsheet`、`check_spreadsheet_equations`、`validate_spreadsheet_rows` 分别承载聚合/加权比率、跨表等式、字段规则与全列概况；共用受限表达式与只读计算引擎；模型选择计划，程序核算，最终通过证据ID生成数值报告。偏差极值使用 `compare_spreadsheet_columns`，其数值与并列极值同样由程序从当前回执生成，模型正文中的额外排名、数值或原因不进入报告。

最终无工具回复不能绕过证据验收，修复最多受四轮硬上限约束；失败尝试不证明已计算。普通分析的 `evidence_ids` 由运行时从当前回执生成；模型可提供无数字的待验证假设，错误可选字段不会阻断已核验事实。程序呈现实际计算值、范围、残差、规则及原件行号。规则依据和业务适用假设仍需模型或用户选择，受限表达式不等于自动理解所有业务语义。

会话将每轮完整回执、错误和门禁状态归档到 `<session>.evidence/<turn_id>.json`；`<session>.evidence.json` 保留最新轮兼容视图。独立任务状态按当前附件哈希校验后限量注入上下文，即使上游仅同步 role/content 也不会丢失执行状态；历史回执只用于定位和恢复，不构成本轮完成证据。保存失败明确记录告警。telemetry 记录证据ID、计划/原件哈希、错误类别与门禁决策。读取状态中的 `coverage_complete` 只表达已声明范围的完成度；`extraction_mode` 与覆盖状态分开，非空行数包含标题和表头，不能当作业务记录数。

Python CLI 每次请求启动新进程；开发容器将仓库 `src/dsh_modules` 只读挂载到 `/usr/local/bin/dsh_modules`。代码改动通过下一次进程加载并核对哈希生效。共享技能由 session-broker 的工作区准备流程从 canonical skills 同步；不带源码挂载的镜像部署需重新构建用户沙箱镜像并滚动更新。所有 Docker 操作使用仓库根目录 `./docker/start-smart.sh`。

期间标签中的半年、季度、月份需与原件分组值相符；启用领域包后，已知直接指标需与实际字段相符。不符时拒绝整个计划并返回修正原因。字段概况保留低频值的原件坐标。规则判定仅表示符合已声明规则，其业务适用性未经独立证明；无法据此声称业务合规。失败回执保留计划与哈希，最终数值由当前成功回执编译，分析草稿不直接流式发布。

协议编译支持同一计划中通过 `ref`（兼容单字段 `id`）引用计算表达式，拒绝循环/未知引用；展示单位始终属于计算项。明确同表地址的四则算式可编译成受限 AST，不执行代码或猜引用。字段范围允许单边边界，未声明的边界不会补造；规则缺字段一次返回全部位置。财务概念契约定义盈利能力需要的金额和比率，实际表/列仍由来源计划选择；公式检查拒绝将简单加减合计的单个分项冒充恒等式，明确分项比较可声明 `relation_type=component_comparison`。

## Excel 与领域语义分层

`analysis_semantics.py` 是轻量语义注册表，领域包定义稳定指标 ID、别名、类型、分子分母关系、概念所需指标、工具能力和验证钩子。`analysis_domain_finance.py` 与 `analysis_domain_commerce.py` 分别维护财务及商业词汇，不保存任何工作簿名、Sheet 名、坐标或结果。它们不依赖 openpyxl；`spreadsheet_semantic_bindings.py` 将 Excel 来源转为逻辑字段与范围绑定，其他数据适配器以后可复用该协议。

`DSH_ANALYSIS_DOMAIN=generic|finance|commerce|auto` 控制领域。默认 `auto` 是兼容性的请求词汇路由；未知或同时命中多个领域时采用 generic。显式配置优先于词汇路由，未知配置报错。领域在单次工具调用作用域中注入，不修改进程环境，不跨调用泄漏。直接调用 `calculate_spreadsheet_analysis` 默认 generic；领域策略由调用方显式传入。模型不能通过工具参数启用领域。

AI 负责将自然语言转换成受限 JSON 计划并选择真实来源；可选 `metric_id` 使用稳定语义标识，减少对展示标签的依赖。通用引擎执行聚合、单位换算、比率、等式、全量字段规则和证据生成。业务规则的标准定义与数据绑定验证独立维护，添加销售、库存或实验等领域无需复制 Excel 引擎。

当前注册表是轻量语义层，不是完整 OWL/RDF 推理系统；来源歧义、未注册派生指标、复杂财务等式的完整性和因果解释仍需额外业务依据。重算验证、范围覆盖和表达式计算正确不自动证明业务解释正确。

### 小模型的通用工程边界

工具能力先于提示词选择，当前能力列表是执行授权边界；只读提示不再要求调用未提供的 bash。结构读取统一使用正常/流式工作表的真实范围，样本保留列位置，未知范围不伪造 A1:A1。初始上下文使用紧凑表头、范围候选和单行样本；`inspect_spreadsheet_structure` 可按需展开指定表，不重算或宣称全表完成。

数值报告屏蔽模型草稿流式输出，保留全部当前成功回执，重复事实按来源、表达式、实际行范围、单位和语义 ID 去重。字段规则任务只呈现被检查字段的概况；完整概况保留在归档回执。以上机制不依赖固定工作簿名、财务 Sheet、问题句式或答案。语义计划仍可能选错未注册的业务定义，这需要领域注册表和明确来源绑定，不能由计算通过推定业务理解正确。

### 执行状态与注册语义的确定性补算

`analysis_task_state.py` 将执行凭据和任务覆盖独立于模型呈现 JSON 验证，一次返回缺失指标 ID、类型与其他执行问题。`analysis_turn.py` 管理本轮状态、补算和交付，证据 ID 由程序维护。完整的已注册指标任务可在工具执行后直接通过程序交付，省去让模型重新组织证据协议的轮次；未知任务仍保留后续探索机会。未核验的模型正文和思考流均不直接发布。

`registered_metric_completion.py` 根据领域注册表的分子/分母关系生成受限派生计划，要求当前原件、当前领域版本、唯一字段绑定、同表头与同选中行范围。只复用来源表达式，不对缓存事实值口算；使用原核算引擎重执行并保存父证据 ID 与新回执。每轮最多四次内部补算，失败的相同计划不重试。内部补算仍要求本轮具备聚合工具权限。没有定义、来源不唯一、范围不同或零分母时不会声明完成。Excel 适配层没有固定问句、Sheet、财务坐标或预置结果；财务或实验等领域关系由独立注册表提供。

### 用户报告与来源明细分离

`report_presentation.py` 从已核验回执生成用户视图，与计算和证据验收独立。正文优先展示请求指标、极值分组、实际/预算及有符号差额；显示千位分隔和最多两位小数，极小非零值保留精度。辅助指标、完整口径、声明范围、坐标、语义版本和证据 ID 放入默认折叠的“查看来源与核算明细”。核验仍使用未舍入的回执数值；完整回执照常归档。偏差正文单独经过证据验收，不能依赖折叠明细中的正确数值掩盖错误正文。未完成项、期间变化、业务适用性限制和待验证解释保留在正文。

折叠采用严格的独立行 `<details>` / `<summary>` 标记。共享聊天渲染器仅识别无属性、完整闭合、位于代码围栏外的标记，以 React 原生 details 展示，内部仍使用原有安全 Markdown 渲染；不启用任意 HTML。纯文本模式保留明细文字并去除折叠标记。根工作区原件通过已有登录态下载端点提供，其他路径只显示文件名，避免猜测链接。展示层不包含固定财务 Sheet、问题句式或结果，其他领域可复用。
