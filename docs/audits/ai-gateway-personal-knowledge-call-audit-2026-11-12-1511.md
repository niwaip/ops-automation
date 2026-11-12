# 调用审计（已更正）：AI 网关个人资料未召回，2026-11-12 15:11

## 1. 更正后的核心结论

**用户截图正确：个人空间原文件的正文和 YAML frontmatter 均有 `AI网关` 标签。沙箱实际检索的是另一份没有该标签的旧内容副本，两份文件不同步。**

此前只检查沙箱副本，随后把 UI 的标签解释为 `digest.keyTopics`，未对照 WorkspaceNode.storagePath 对应的原文件，属于审计取证遗漏。“真实资料文件头没有 AI网关”“截图只是 AI 与网关两个 keyTopics”的解释不成立，现撤回。

以个人空间原文件内容做隔离只读回放，**同一句 `关于ai网关呢` 可以命中，返回 2,744 字符上下文**；以沙箱现有副本回放，同句返回 0。两次都未调用模型，未修改真实用户资料。

因此本例最直接的工程根因是**个人空间展示内容与沙箱检索副本不一致**。分词、历史补全和正文门禁是另行发现的召回限制，不能替代这个主要原因，也不需要用户改问法才能证明原标签有效。

## 2. 同一资料的两份文件

| 核对项 | 个人空间展示的原文件 | 沙箱检索副本 |
| --- | --- | --- |
| 所属用户 | e7fce333-a8f4-4097-9a53-f0a4c729da46 | 同一用户 |
| 业务标题 | 阿里云AI应用开发新范式：Agent+LLM架构与云原生实践 | 同标题 |
| 来源定位 | WorkspaceNode e37e4e74-f51c-48a6-9000-3b0c093d0cc1 的 storagePath | /workspace/deliverables 下同主题归档 |
| 文件头 tags | AI Agent、MCP协议、函数计算FC、**AI网关**、云原生架构、技术白皮书 | 阿里云、AI Agent、大模型开发、云原生、AI Stack |
| 正文核心标签 | 与截图一致，包含 `#AI网关` | 仍为旧标签组合 |
| ai_refined | true | 没有该字段 |
| 原问题回放 | 命中，2,744 字符 | 零命中，0 字符 |
| 文件 SHA-256 前缀 | 6ab25d3179 | 9729867116 |
| 当前 mtime（UTC） | 2026-11-04 01:14:26 | 2026-11-05 08:18:46 |

原文件位置：`data/storage/workspaces/personal/c8d19632-da7e-4197-8f0d-275d8934750f/e37e4e74-f51c-48a6-9000-3b0c093d0cc1_查看和归纳内容 总结.md`。

沙箱副本位置：`data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/deliverables/20261104_技术调研_阿里云AI应用开发新范式/阿里云AI应用开发新范式：Agent+LLM架构与云原生实践.md`。

两份文件的 source.session_id 和 source.message_id 对应同一原始归档；标题一致但内容、标签、摘要与文件夹命名已经分叉。副本 mtime 较晚并不代表内容更新，无法仅凭时间推断同步成功。

## 3. 真实执行与证据边界

- 目标会话：`chat-session-1794465832344-2amzk5d2`，本轮问题 `关于ai网关呢`。
- 15:11:02 开始，15:11:27 完成，Asia/Shanghai；个人 chat 模式。
- 已加载上一轮 2 条历史，模型 `default` → `qwen36-35b-a3b`。
- 实际 1 次 `web_search`，查询 `阿里云 百炼 AI 网关 AI Gateway 核心能力`；2 次模型请求。
- HTTP / Harness / DSH 耗时分别为 24.922 / 24.880 / 24.076 秒；锁等待 1 毫秒。
- 模型合计 18.367 秒；输入/输出 token 12,035 / 1,135；退出码 0、finishReason=stop。
- 未记录 `scan_knowledge` 或 `read_file` 工具调用；前置个人资料自动扫描发生在工具循环外，不计入该工具数量。

原运行未保存完整模型 payload 或独立知识扫描回执；精确零命中原因来自同源回放和目录对照，不冒充原始请求抓包。两份现有文件修改时间均早于本次调用，且检索代码挂载到本仓库。可以确认当前真实分叉及其对召回的影响；没有历史文件版本与写入日志，不能断言最初是同步失败、后续旧内容覆盖还是其他写入路径导致分叉。

## 4. 同步与检索代码

`workspace-note.service.ts:270–299` 先保存工作空间原文件，再将初始内容复制到用户 deliverables。`:327` 起异步调用 `WorkspaceNoteAiHelper.refineFolderAndNoteWithAi` 重构资料。

`workspace-note-ai.helper.ts:235–264` 将 refinedTags 同时写入 YAML 和正文徽标；`:321` 更新存储原文件，`:341–383` 尝试重命名并刷新沙箱成果副本。代码存在同步意图，但当前磁盘证据说明两份内容没有保持一致。仅看到同步代码不能证明历史某次写入成功。

`personal_knowledge_search.py:445–493` 只扫描个人 /knowledge、/workspace/deliverables、/workspace/outputs，当前没有将上述 storagePath 原文件作为权威读取源。`:547–602` 仅从候选本地文件头解析 tags/title。因此 UI 原文件中的正确标签没有进入本次候选标签集。

## 5. 已验证的辅助召回限制

旧副本的原问题关键词是 `ai`、`网关呢`，目标候选没有文件名、tag、title 或正文有效命中。其总分 250 已高于阈值 200，但 matched_kw=false，最终被拒绝。单纯调低阈值或增大 top-k 无法解决。

对旧副本的问法对照：`关于ai网关呢`、`ai网关`、`AI 网关`、`网关` 均零命中；加“阿里云”可召回同主题 3 项、6,295 字符。这是旧副本规则下的对照，不应作为要求用户改问法的根本解决方式。

隔离标签对照：文件头有 `AI网关` 或 `网关` 时，原问题可命中；`AI网关` 与 `AI 网关` 缺少空格归一化。自动模式还要求文件名/tag/title 命中，正文相关不能单独通过；检索仅接收当前问题，没有继承上一轮“阿里云”。以上均为独立限制，但原文件标签回放已证明它们不是本例漏召回的必要原因。

## 6. 修复与验收重点

1. **优先解决副本一致性**：明确个人空间 storagePath 对应内容为权威源，通过节点 ID/内容版本/哈希将精炼后的文件与标签同步给沙箱，不能仅按同名或 mtime 判断版本。
2. 对异步归档精炼、重命名、旧副本清理增加可追踪状态；同步失败应有明确重试与审计记录，避免 UI 成功更新但执行侧继续读旧资料。
3. 验收必须使用本次原问题 `关于ai网关呢`：真实 UI 文件和沙箱候选都应含 AI网关，召回应能定位同一个 WorkspaceNode，注入原资料片段及来源。只改关键词或手工补 tag 不足以验收同步修复。
4. 后续再补空格/语气词归一化、短追问补全、结构化正文标题召回和隐式扫描事件。

本次仅更正审计报告并保存新证据，未修改业务代码或真实资料。

## 7. 证据

目录：`docs/artifacts/reviews/ai-gateway-personal-kb-audit-20261112-1511/`。

新增：`workspace-canonical.md`、`sandbox-stale-copy.md`、`copy-divergence.json`、`canonical-replay.json`。分别保存原文件、副本、来源/时间/哈希和原文件隔离回放结果。

原证据：`session.json`、`dsh-session.json`、`answer.md`、`events.jsonl`、`trace.json`、`evidence.json`、`personal-workspace-metadata.json`、`knowledge-replay.json`、服务日志与源码片段。`report-before-screenshot-correction.md` 仅保留历史审计过程，其主要标签解释已撤回。`manifest.json` 已更新。
