# personal-sandbox-runner (DeepSeek Harness / dsh)

`apps/backend/runtimes/personal-sandbox-runner` 是个人专属安全沙箱（User Sandbox）内部的智能体运行时核心模块。

---

## PDF 模板生成与显示验收

个人模式仅发送 `/pdf` 时，聊天后端直接返回排版选择、需求写法与可复制的
`handout.pdf` 讲义提示词，不调用模型或启动沙箱。`/pdf <需求>` 仍走正常 PDF 技能流程。
帮助正文维护在 ai-orchestrator 的 `src/modules/chat/chat-pdf-help.ts`。

新建 PDF 默认由 `skills/pdf/scripts/generate_report_pdf.py` 生成，保留原命令参数，
内部采用 Markdown/JSON → 本地 HTML/CSS → 固定 WeasyPrint 68.1。版式包括
`report`、`handout`、`editorial`、`mobile`，支持主题色、可选封面和页数范围。
中文使用镜像内 Noto Sans/Serif CJK SC 的 Regular/Bold，字体嵌入产物；无远程字体或 MCP。

生成器检查 PDF 解析、pypdf/pdfplumber 文本覆盖、页数、字体嵌入和页面边界，
再输出逐页 PNG 与带 SHA-256 的质量报告到 `.pdf-preview/<文件名>/`。
程序检查通过后才原子发布 PDF；失败不覆盖原件。PNG 仍需由模型逐页查看，程序不声明视觉验收完成。
保留内容源文件；图片须预先保存到源目录。Word 原版式转换使用 LibreOffice Writer，
已有表单、阅读、合并和拆分走独立处理路径。参数见 `skills/pdf/references/report_pdf.md`。

普通新建 PDF 任务由 `pdf_content_workflow` 编排：模型撰写完整 Markdown，由程序识别用户指定的分页结构，程序调用 `render_pdf` 和逐页审核，由固定生成器处理字体与排版，
不开放临时编写排版脚本；转换、表单、显式指定其他引擎、研究和混合格式交付保留原流程。
基于附件、统计计算或图表的复合任务也保留完整工具链。
该路径跳过独立长规划；“时间天气”等记录卡字段不会触发前置天气检索。`render_pdf` 支持 Markdown、
主题、版式、标题/副标题/署名和页数上下限，默认无封面；`![叶片示意](leaf.svg)` 使用本地素材。
每次调用保留唯一源文件与 `.pdf-preview/<文件名>/<runId>/` 回执，失败不采信上一版 QA。
原生工具先生成隐藏候选文件；`inspect_pdf_page(file_path, page)` 从本轮回执取图，不对不存在的 PNG
做文件名模糊匹配。它核对 PDF 哈希并检查指定页，全部页通过后原子发布目标 PDF；失败不覆盖旧件。
模板路径由程序调用 `render_pdf`，渲染后自动逐页检查并记录 `execution_origin=runtime_workflow`，
无需模型额外选择图片。此路径禁止旧编译兜底放宽页数；终态回复由真实发布回执生成。
文件名、明确页数、版式、暖色、无封面、标题/副标题/署名从用户原话绑定；显式逐页要求中的
引号分隔表头、表格对象列表、记录卡名称、插图和引导问题数量在渲染前检查，压页不能删除这些内容。
这只检查已支持的明确文字结构，不宣称覆盖所有语义约束。常用 emoji 由本地 SVG 渲染，不依赖 emoji 字体；奖牌排名转为数字，避免清理符号时丢失排名。未收录图符显示为可读 Unicode 名称标签，不因装饰图标中断整份文档；国旗显示地区标识，肤色和 ZWJ 组合整体处理，不生成缺字方框或拆散组合含义。
handout 正文保持 11.5pt、1.5 倍行距，章节/表格间距统一维护；叶片素材使用独立尺寸规则。
正文不重复模板已排版的标题/副标题/署名，清除手工 `<br>` 空行和重复装饰分隔线，
把旧 `<block type="tip">` 转成支持的提示块；保留表格分隔语法及填写用下划线。

每轮增量事件写入 `.dsh/sessions/<sessionId>.events/<runId>.jsonl`，记录模型请求起止、工具起止和错误；
它是未验收的执行记录，不能替代最终 evidence 或证明交付成功。三次同类字体/渲染失败会停止无效重试。
平台管理的模型请求随下游断开取消，避免沙箱已停止而上游仍持续生成。

所有本轮新 PDF（含 bash 脚本和旧导出器生成的文件）在最终导出前经过统一验收。
`pdf_external_delivery` 将候选移入隐藏预览目录，独立运行检查器，检查真实退出码、
`qa.valid`、文件哈希、页数和预览，再按相同发布协议逐页视觉审阅；失败不外发，
不能以 shell 成功、文件存在或普通图片内容描述代替验收。上传原件和旧文件不进入此流程。
联网检索后新建纯 PDF 的任务保留 web_search 与受控 render_pdf，不再开放临时 bash 排版；
已有文件转换、编辑或混合格式仍保留原工具链并通过最终 PDF 门禁。
失败页的审阅结果按当前渲染版本缓存，修改源稿后必须重新渲染；重复读取文档不再重审旧页面。
联网任务同样绑定 render_pdf 的单页 schema。渲染失败按阶段和原因分别累计修复预算，
任务总预算仍有效；即使所有渲染都在候选注册之前失败，也返回具体 PDF 错误，不退回泛化的“补充条件”。

依赖和字体变化需要重建镜像并刷新 broker 的依赖清单哈希：

```bash
./docker/start-smart.sh dev --profile sandbox-build build user-sandbox-image
./docker/start-smart.sh dev up -d --no-deps session-broker
```

沙箱在新建/替换时校验镜像；不强制中断正在运行的用户任务。

---

## 表格查询工具契约

`aggregate_spreadsheet` 面向模型统一接收 `file_path` 和 `query`。查询内使用
`source / fields / where / group_by / metrics / having / order_by / limit / offset / distinct`，
按 WHERE → GROUP BY → HAVING → ORDER BY → LIMIT 执行。WHERE使用原始列，HAVING使用
`metrics.id`聚合别名。前缀匹配使用 `starts_with` / `not_starts_with` 和 `values` 数组。

查看原始明细只提交 `source` 和 `where`，默认返回全部原始列及 `_row` 来源行号。
用户指定选列时再填 `fields`；不需要 `metrics`、`group_by` 或额外的 `calculations`。
明细交付门禁拒绝用分组汇总或未经请求的去重结果替代原始记录。
纯明细任务仅向模型开放结构读取与统一查询两个工具，使用专门的明细提示词，避免注入派生公式和内部事实引用规则。

```json
{
  "file_path": "当前附件.xlsx",
  "query": {
    "source": {"sheet": "明细", "header_row": 1, "data_range": "A2:G100"},
    "where": {"field": "员工姓名", "op": "eq", "value": "目标姓名"}
  }
}
```

比率、增长率、期间差额和跨表公式使用 `analyze_spreadsheet` 的
`file_path / tables / calculations`。公式引用同计划 calculation id，不引用查询引擎的内部事实ID。
旧顶层查询参数、tables/calculations混合计划仍由内部执行器兼容，普通查询工具不再向模型暴露这些写法。
原件附件限制、SHA-256、覆盖范围和执行证据门禁仍由原生引擎执行。

源码通过只读挂载进入用户沙箱，每次 `dsh run` 启动独立Python进程。修改这类Python模块后应验证
实际挂载路径、容器内文件指纹和新进程导入结果；现有长任务不应被视为自动重载。

---

## 标准柱状图的本轮交付闭环

单表分组求和并生成柱状图（不含显式 Excel/Word/PPT/PDF 输出或混合图表）使用受管交付路径：

1. 模型仅提交 `aggregate_spreadsheet` 查询；保留原件、筛选、覆盖范围和执行证据门禁。
2. 核算证据完整后，运行时调用内置 `render_spreadsheet_chart` 能力；该名称在遥测中标记
   `execution_origin=runtime_workflow`，不增加一轮模型调用，不是新的模型 function-call 接口。
3. 每轮创建 `/workspace/.sessions/<sessionId>/runs/<turnId>/`，保存 `inputs/verified-data.json`、
   `outputs/index.html` 和 `manifest.json`。模型无本路径的 bash/写文件权限；不会扫描共享 `index.html`。
4. 状态推进为 calculating → calculated → generating → validating → validated → published。
   SVG与表格逐组绑定精确数值、单位、源文件SHA-256和证据ID；验收核对柱形几何、组数、数据和来源。
5. 渲染或验收失败最多自动修复两次，复用已核验数据，不重复计算。失败保留证据和manifest，
   不发布普通表格兜底页，也不显示成功横幅。后续自动恢复尚未实现，manifest保留恢复所需信息。
6. 通过后以唯一 `chart-<sessionId>-<turnId>-<artifactId>.html` 文件名发布到现有工作区交付接口，
   下载链接精确指向该产物；复制后再次校验数据与文件哈希。现有公共文件API无需按同名文件搜索会话目录。

SVG离线绘制，支持负数和零值及悬浮精确数值，不依赖CDN。自定义复杂页面和其他图表仍走现有流程；
本改动不宣称整个通用沙箱已迁移到按轮次隔离的工作目录。公共HTML导出器还会拒绝将明确交付失败的正文包装为成功产物。

图表指标选择只匹配“用户指令：”之后的当前指令，并排除已核验来源文件的路径及文件名。
附件清单中的“工数”等字段词不会被视为绘图要求；用户明确选择多个求和指标或未能唯一选择时，仍保留歧义门禁。

模型代理返回唯一 `call_id`，遥测ledger保留该字段。同一调用经辅助统计和上层响应统计时，
Token、耗时和请求数只累计一次，响应指纹、结束原因及首轮计时仍保留。
去重不使用Token数、耗时或父span；无call_id的旧响应保留原有累计行为。此变更不回写历史会话统计。

最小回归：`PYTHONPATH=src python3 -m unittest discover -s tests -p test_spreadsheet_chart_delivery.py`。
指标隔离与记账回归：同样运行 `test_chart_metric_selection.py` 和 `test_llm_accounting.py`。
容器中的Python模块为只读源码挂载；每次dsh启动新进程加载。验证实际挂载和新进程指纹，无需重建服务。

---

## 一、职责与系统定位

### 办公运行环境与目标格式

办公依赖在镜像中预装，不能依靠用户任务中的临时 pip 安装完成部署。从仓库根目录构建：

```bash
./docker/start-smart.sh dev --profile sandbox-build build user-sandbox-image
```

构建与启动均以非 root 用户、忽略用户 site-packages 的方式检查办公库，并写入、重读测试 PPTX。
通过后镜像带 `ops.sandbox.runtime-contract=office-v1` 标识。统一入口同时计算依赖清单指纹并传给构建和 Broker；
Session Broker 校验运行时标识、依赖指纹和实际镜像 ID，拒绝未构建或依赖清单过期的镜像；
已停止的旧镜像沙箱会在下次启动时替换，工作区和知识目录挂载保留。运行中或暂停的旧沙箱不会被强制终止，
需在任务结束并停止后重试。修改镜像后，仅重启原容器不会应用新镜像；销毁旧容器时其可写层会丢失，
持久文件应保存到 `/workspace` 或 `/knowledge`。

用户明确要求 PPT、Word、Excel 或 PDF 时，任务契约保留对应目标格式，即使技能准入转通用能力执行。
明确要求 HTML 演示稿时保留 HTML；后续明确切换格式时以新要求为准。发送 HTML 附件不能让缺失的 PPTX 契约通过。

bash 工具使用 Bash 的 `pipefail` 传播流水线失败，`pip ... | tail -5` 不再掩盖安装失败。
显式使用 `||` 处理的失败仍按命令自身结果返回。Markdown 写入异常也返回结构化 error。
遇到预装办公库缺失时，自愈提示要求修复镜像，不再引导模型重复安装系统依赖。

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
│       ├── final_answer.py     # 最终回复呈现、已有产物恢复与终态验收
│       ├── retrieval_answer_validation.py # 基于本轮检索回执的正文完整性检查
│       ├── retrieval_answer_recovery.py   # 同模型、无工具、有截止时间的一次正文补全
│       ├── response_observability.py      # 清洗前后长度、SHA-256 与流结束来源
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
| `--timeout` | `-t` | 不设置 | 显式总时限（秒）；默认由 Broker 按执行进展监控停滞 |
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

### 检索答案完整性交付

文件成功声明在循环最终返回前另做一次物理检查，不受普通纠偏次数或生成/只读意图分类影响。明确声称“已生成”“生成了文件”等，但对应文件不存在、为空或早于本轮时，最终答复改为未完成提示并记录 `artifact_delivery/reject`。仅引用输入文件、询问示例路径或明确说明失败不会触发成功声明检查。安装依赖、写出脚本不等于生成目标文件。回归：`tests/test_artifact_terminal_claims.py`。

本轮存在成功且非空的 `web_search` / `fetch_page` 执行回执时，终态检查拒绝“仅标题、仅目录层级、空正文”的结构性未交付。前置搜索、思考规划检索与执行循环检索统一传递本轮证据，规划原始资料在预算内传入呈现阶段。正常的短事实、明确的不确定性说明、具体澄清问题以及用户明确要求的标题保留；不使用统一最小字数门槛。历史工具消息不作为本轮触发条件。

未通过时，最多追加一次同模型、无工具的正文综合。该调用关闭思考与 runner 传输重试，缓冲输出；使用已有检索资料，不重复搜索，不执行副作用工具。时间窗口取 30 秒、单次调用预算和任务剩余时间的最小值；不足 5 秒不启动补全。代理已有的瞬时网络重试仍可能发生，但受本次客户端截止时间约束。补全仍为空、仅标题、工具协议、流提前关闭或 `length` 时，返回明确的“本次回答未完成”提示。总任务超时继续按原有超时路径退出，不伪装成完成。

`metrics.answerValidation` 表示该结构检查的终态：`status=completed|needs_input|incomplete`、`reason` 和 `attempts=0|1`；未适用时为空对象。`completed` 仅表示通过结构验收，不代表事实已经全部核实。`exitCode=0` 表示进程正常完成；判断答案是否完整还须检查此字段。决策进入 `guardDecisions`，并随现有链路保存到会话的 `executionTrace.metrics`。

`metrics.modelResponses` 按模型调用顺序保存 `rawChars`、`cleanChars`、两份 SHA-256、`finishReason`、`receivedDone` 和 `finishReasonSource`。结束来源区分代理明确返回的 `upstream`、仅收到 `[DONE]` 的 `done_fallback` 与 `stream_closed`。这些新增字段不保存响应正文、思考正文或密钥，便于区分生成不足、输出清洗和流传输异常。

沙箱将模块目录只读挂载到 `/usr/local/bin/dsh_modules`，每次 `dsh run` 启动新 Python 进程。此类 Python 模块修复可由下一次请求加载，需实际导入并核对挂载源代码；无此挂载的部署需要更新镜像并重建沙箱。Compose 入口仍统一为仓库根目录的 `./docker/start-smart.sh`。

新增回归：`test_retrieval_answer_validation.py`、`test_retrieval_answer_recovery.py`、`test_response_observability.py` 与 `test_planning_retrieval_delivery.py`。相关既有回归覆盖 `test_dsh.py`、`test_dsh_skills.py`、`test_small_model_protocol.py`、`test_table_comparison.py`、`test_spreadsheet_analysis.py`、`test_financial_workbook_fixes.py`。完整契约见 [检索答案交付验收方案](../../../../docs/design/Retrieval-Answer-Delivery-Validation_v1.0.md)。

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

### 门禁复核与澄清

门禁异常交给 `task_completeness_judge.py` 根据请求、真实表头、计划、范围、来源和事实分类为 `recheck`、`repair` 或 `clarify`。同一上下文复用判定；缓存绑定全部筛选条件、选中行、来源及契约。`analysis_gate_review.py` 对误报建议重新验证，目前只允许有原生分组证据支持的稀疏指标告警被撤销；来源失效、缺少计算或未执行的查询阶段不允许通过裁判直接豁免。复核总时限最多18秒，不重试同一失败上下文；复核不可用时保留原校验结果。工具循环最多额外预留两轮修复或提问机会，仍遵从总截止时间。

缺少数据或口径不明时允许以用户能理解的问题进入 `awaiting_user`，用户要求先澄清时不强迫本轮计算；工具选择保持自主，执行证据门禁在模型选择后校验结果。带长解释的澄清另行核对字段含义、公式等断言，保留问题并去掉没有来源支持的业务推断。有来源支持的部分结果可以与问题一起交付，每个数值断言仍检查当前原件。附件包装文字不参与任务实体、指标或期间解析。QueryIR 的最终结果按引擎已执行的 HAVING、排序与截断顺序直接呈现，后续纠正回执替代前期全组试算。公开的 `aggregate_spreadsheet` 参数与执行器保持一致，支持单独的 `query`，无需附带旧式 `calculations`；去重清单与去重数量分开验收。显式表级分组继承到聚合表达式，分组原字段可以作为真实并列排序键。

### 查询后计算与来源口径复核

`query` 可以与 `calculations` 同时提交：查询完成后，声明的派生表达式交给现有来源计算引擎执行；所有计算成功才返回组合证据。派生计算只能引用查询最终事实覆盖的单元格，不能读回被 WHERE、HAVING 或 LIMIT 排除的数据。查询事实可用精确事实 ID 做 `ref`，支持单元格及 sum/min/max 多行数值汇总；程序把事实还原为原聚合方法和精确 `row_ids` 后重新计算，不将查询结果替换成模型常量。计数、均值等不能安全还原的引用明确报错，需显式声明来源表达式。注册关系补算复用同一绑定模块。已编译成查询度量的旧式聚合不会重复执行。`checks`、`rules` 和 `profile_tables` 仍使用独立调用，混入查询时明确报错。查询聚合也调用领域语义验证；期间利润率不能通过平均月度比率交付，原件单值可直接读取。

期间与业务口径由已有 LLM 语义合约识别。语义合约包含期间时，`SemanticFilterJudge` 只接收意图 LLM 识别的期间、业务条件与实体，以及实际来源绑定，不接收整项任务的指标清单。它根据实际取数列表头、已执行过滤、范围、来源哈希，以及程序从原件读取的同表标题和选中行标签核对期间；允许标题与月份行共同说明年度，不要求月份 WHERE。裁判分别返回规范化的请求期间与实际来源期间，程序检查其与布尔判定的一致性；没有新增年份提取正则或固定年份、文件名、财务坐标规则。合法科目选行及派生操作数不自动视为缩小业务范围。裁判无法确认时报告 `source_scope_unverified`，明确矛盾时报告 `source_scope_mismatch`。已有执行结果但被来源核验拒绝时明确说明核验未通过，不误报为“尚未执行计算”。

复核缓存包含表头和来源绑定；不同工作簿、实际列、范围或选中行不能复用同一结论。模型裁判只判断来源口径；金额、百分比、来源单元格、文件哈希和计算结果仍由执行器核验。

### 用户报告与来源明细分离

`report_presentation.py` 从已核验回执生成用户视图，与计算和证据验收独立。正文优先展示请求指标、极值分组、实际/预算及有符号差额；常规统计显示千位分隔和最多两位小数，极小非零值保留精度；QueryIR 最终行保留引擎精度及执行顺序。辅助指标、完整口径、声明范围、坐标、语义版本和证据 ID 放入默认折叠的“查看来源与核算明细”。核验仍使用未舍入的回执数值；完整回执照常归档。偏差正文单独经过证据验收，不能依赖折叠明细中的正确数值掩盖错误正文。未完成项、期间变化、业务适用性限制和待验证解释保留在正文。

折叠采用严格的独立行 `<details>` / `<summary>` 标记。共享聊天渲染器仅识别无属性、完整闭合、位于代码围栏外的标记，以 React 原生 details 展示，内部仍使用原有安全 Markdown 渲染；不启用任意 HTML。纯文本模式保留明细文字并去除折叠标记。根工作区原件通过已有登录态下载端点提供，其他路径只显示文件名，避免猜测链接。展示层不包含固定财务 Sheet、问题句式或结果，其他领域可复用。

PDF 分页修复（2026-10-29）：原生 render_pdf 模型工具要求 `pages: string[]`，由程序插入分页；适配器保留旧 `markdown` 调用兼容。缺少分页标记先报分页结构错误，不再误报第二页全部栏目遗漏。内容预检前在工作区 `.dsh/pdf-attempts/` 保存权限 0600 的完整输入、归一化正文、哈希与按页字符数，错误回执返回 attempt_path 与 stage；按现有会话数据保留策略管理。内容预检终止会明确说明尚未生成 PDF 或进行预览。

### PDF 内容、填写空间与计量（2026-10-29）

原生PDF不再要求模型填写工具参数：由 `pdf_content_workflow` 使用独立精简写作上下文生成正文，程序绑定用户元信息并渲染，最多四次正文生成/修复（仍受总预算约束），逐批回传已检查页的结果，失败后停止剩余队列。模型正文使用 pagebreak 分页。手动 render_pdf 工具仍支持 pages 数组与明确页数schema约束。正文一级标题统一转为区块标题，防止被CLI当作文档标题移除。handout的空白两列表格在请求包含记录卡时转换为有边界和22mm内容行高的记录表，包含数据的表格不变。

每页审核最多并发2个请求，每批至多2页，先绑定本轮文件哈希，完成后在锁内复验并发布；任一页失败均不发布。失败批次结束后停止后续排队页面，逐批实时上报进度和结果。审核同时核对原始要求、可操作性、清单重复及书写空间，采用短结论，禁止仅因风格偏好拒收。视觉调用保留既有非流式传输，usage、时延、call_id纳入统一账本；并发时llmDurationMs为调用时长之和，不能视为墙钟时间。PDF审阅显式请求vision，实际视觉模型由代理能力路由和回退决定，账本记录响应中的真实模型名。

PDF交付状态由原生发布回执、全部页通过、当前实体文件哈希共同验证，写入verified及逐页evidence_id。交付回复注明内容、分页、字体和预览检查；模型审核仍不等同人工教学审校。

对于显式“不要独立封面”的逐页请求，移除重复元信息后清除前置空页；仅当第2页及以后所指定的首个小节标题在正文中唯一且顺序一致时，程序按这些标题设置分页，保持文本内容和顺序，标题缺失或有歧义仍走拒收修复。记录卡标签的外层Markdown加粗由转换层规范化，正文重复页码由模板统一接管。

明确列举的空白记录卡字段由原请求绑定，合并模型自行拆开的日期天气项，保留用户字段顺序；已有填写值的表格不改写。请求浅色提示块时，排版器将提示小节规范为引用色块，模型不再承担背景色和页码布局。

内容预检要求用户明确提出的交流分享建议具有独立小节和实际动作，不能用“分享要快乐”等口号替代。手册正文列表会补齐Markdown所需空行，避免准备清单被显示为行内星号。


### 长任务与停滞检测

默认不再设置 300 秒总截止时间（RuntimePolicy 总预算为 0，即不设总时限）。
Orchestrator 不注入默认 timeoutMs；Broker 只在连续 360 秒没有模型完成或工具成功检查点时停止任务。
任意日志、排队通知、模型调用开始、失败工具不续期；模型与工具仍受单次调用限制和有限修复轮数约束。
Redis 执行锁每 60 秒按所有者 token 续租到 420 秒；续租失败则停止当前所有者，结束时清理计时器。
显式 timeoutMs、CLI --timeout 或 DSH_TOTAL_TIMEOUT_SECONDS 仍表示总截止时间，用户停止仍立即生效。
无附件的新 PDF 模板任务在语义准入不可用时保留原先受控模板候选，避免退回自由编写 FPDF；转换、研究和附件任务保持原准入逻辑。


### PDF 提示词、字体与修复预算

PDF 执行说明按实际工具选择：有 render_pdf 时交给模板；只有 bash 时优先固定 Markdown/WeasyPrint CLI。
不再对所有 PDF 强制写 FPDF 脚本。仅用户明确要求自定义 FPDF 时说明字体注册：add_font 的文件路径和 set_font 的家族名不同；常规字体注册不代表 B/I 已注册。
生成任务的确定性脚本异常累计至 3 次即停止，字体、TypeError、NameError 等共享预算；help/ls 等诊断成功不清零。
真实渲染结果或发布验收凭证才构成对应恢复；网络瞬断不计入此确定性脚本预算。


### 通用 PDF 内容与质量契约

写作与审阅提示只描述通用质量，不包含某份讲义的对象、材料或警告。可用插图通过本地素材目录提供；不得因为目录存在素材就添加无关内容。
正文使用 Markdown 和明确分页，程序支持按用户小标题对齐页边界（含 Markdown 标题与独立加粗标题），绑定用户元信息；保留 pages 对象响应兼容。输出预算随页数增长、受模型上限限制，修复轮数有界，不设置默认 300 秒总截止。
空白记录字段（空表格、仅空标签或填写占位）统一转换为有真实书写高度的记录表；具体已填值保持。Markdown 清单渲染为打印方框，表格加粗标记中的空格会规范化。
视觉审阅区分 PASS、REPAIR、FAIL：重复内容、不一致建议和填写空间不足须修复；纯审美建议标 OPTIONAL，不阻断发布。PASS 下夹带修复建议也不能绕过门禁。
语义准入仍然保留；只有在语义确认本轮独立后才省略无关历史上下文。模型逐字回显已确认契约时可以去掉重复字段，任何不同字段或未知字段仍拒绝。
遥测 ttftScope=pdf_content_model 明确表示正文模型调用延迟，不代表用户端首次可见正文延迟。


### PDF 分页与验收故障隔离

未指定页数的 PDF 请求优先提交连续 `markdown`，由排版引擎自动分页；兼容 `pages` 时按正文块连接，表格行连续连接，不将每段变成独立页。没有用户页数要求时忽略模型自行填入的页数范围和分页标记；明确指定页数时保留分页与严格页数校验。

视觉审阅显式请求 `vision`，1200 tokens；代理回退保留 thinking=false、工具参数、真实模型名和 finish_reason，空正文不得报成功。`pdf_preview_failed` 仅代表已取得有效结论的内容缺陷；服务/协议失败为 `pdf_review_unavailable`，状态校验失败为 `pdf_review_state_invalid`，均停止正文重写。跨版本内容修复最多3个审阅版本，本轮所有目标共享累计验收窗口120秒，单页40秒（同一页面最多两次、单次20秒，服务重试不生成新稿）；独立于研究/正文生成，不恢复全局默认300秒截止。逐页验收与文件哈希门禁保留。
