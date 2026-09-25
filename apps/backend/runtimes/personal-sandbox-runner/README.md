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
| `--web-search` | `-s` | `False` | 显式开启实时联网检索 |
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
   - Excel (`xlsx`)：支持公式、财务报表、多工作表分析；
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

# 运行全量 75 个自动化测试用例
python3 -m unittest discover tests

# 快速验证健康状态
python3 bin/dsh doctor
```
