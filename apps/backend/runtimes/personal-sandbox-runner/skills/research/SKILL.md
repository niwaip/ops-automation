---
name: research
description: "深度技术调研、竞品对比、架构选型、模型评测、近30天动态追踪与真实社区口碑分析。当用户明确要求【调研、调查、竞品对比、技术选型、背调】某个技术框架、开源项目、大模型、工具组件、技术方案或了解社区口碑评价时使用此技能。核心在于多源事实检索与验证，搜集第一手技术信息与事实，严禁空口推诿。不要用于纯天气查询、日常查看与简单问询、代码排错、纯问候闲聊或简单数学计算。"
argument-hint: "深度调研 Claude 3.7 真实评价 | 检索最新 AI 视频工具选型对比 | 调研 DeepSeek Harness 架构"
user-invocable: true
triggers:
  - "调研"
  - "调查"
  - "深度调研"
  - "技术调研"
  - "竞品调研"
  - "选型对比"
  - "技术选型"
  - "最新动态"
  - "近30天"
  - "真实评价"
  - "社区口碑"
  - "评价"
  - "口碑"
  - "社区评价"
  - "优缺点"
  - "评测"
  - "反馈"
  - "踩坑"
  - "架构对比"
  - "深度调查"
  - "背调"
metadata:
  tags:
    - research
    - multi-source
    - web
    - github
    - hackernews
    - recency
    - freshness
    - last30days
    - facts
---

# 多源深度调研与情报合成规范 (Research Skill)

本技能受 `last30days` 设计哲学启发，专注于搜集真实大众与开发者的第一手反馈（Social & Developer Relevancy），拒绝 SEO 营销号与陈旧公关稿。

---

## 1. 核心触发场景
当用户请求包含以下意图时必须主动采用此规范：
- **深度调研与背调**：如“调研 XX 公司的最新动态”、“调研某位技术大牛的近期言论与动作”；
- **技术选型与避坑对比**：如“CLI 与 MCP 架构对比调研”、“近 30 天大家对 XX 框架的真实吐槽”；
- **行业动态与产品口碑**：如“近期 AI 视频生成工具实测评价与社区争议点”。

---

## 2. 调研执行流水线 (Execution Pipeline)

### 步骤一：前置拆解 (Pre-Research Resolver)
不要直接拿用户长句去检索。在终端或搜索前，先拆解为：
- **精准实体与别名**（如 `OpenAI Operator`, `Computer-Use`, `Claude Code`）；
- **核心比对竞品或技术点**；
- **明确时间窗口**（默认近 30 天）。

### 步骤二：多源并发收集 (Multi-Source Fanout)
沙箱预置了高信噪比多源采集脚本 `/opt/dsh/skills/research/scripts/deep_research.py`：

```bash
# 执行多源并发调研（并发检索 Web + GitHub 动态 + Hacker News 真实热议）
python3 /opt/dsh/skills/research/scripts/deep_research.py "调研主题" --days 30 --html /workspace/深度调研报告.html
```

或使用沙箱内置工具（指定时间鲜活性）：
```json
{"tool": "web_search", "parameters": {"query": "主题 评价", "freshness": "month"}}
```

### 步骤三：近 30 天时效性校验 (Freshness Guard)
- 对获取到的结果，严格核查发布时间（`[发布时间: ...]`）；
- 超过时间窗口的旧方案（如 2023 年旧版本）必须明确注明 `[注: 早期过时版本]` 或剔除，禁止将过时方案当作当前最新进展。

---

## 3. 输出质量铁律 (Grounded Output Laws)

1. **大众关注加权，而非 SEO 排名**：优先采纳 GitHub 高 Star/最新 Release、Hacker News 高赞/高回复、以及专业评测中的核心观点。
2. **强制原声金句引述 (Verbatim Quotes)**：
   - 提取 1-2 条社区代表性用户的高赞发言或真实吐槽，例如：
     > *“社区热评 (128 upvotes): '虽然推理能力惊艳，但并发调用时的速率限制极为严格，生产落地需要自建缓冲池。'”*
3. **精准事实溯源 (Citation Links)**：
   - 每一个关键论断后方必须附带 Markdown 来源超链接：`[信源名称](URL)`。
4. **交付物保障**：
   - 若用户需要详细报告，生成包含交互式卡片与信源索引的独立 HTML 产物（保存在 `/workspace/xxx.html`）或 Markdown 详报。
