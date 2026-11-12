# 个人资料：统一原件与检索

个人资料的唯一权威来源为个人空间的 `WorkspaceNode` 与其 `storagePath` 对应文件。界面预览、标签匹配与沙箱读取均使用这一份原件。数据库摘要和二进制提取文本只是派生索引，不是另一份可编辑资料源。

历史上，保存笔记、归集附件、后台 AI 精炼均向 `/workspace/deliverables` 写镜像，让隔离沙箱直接扫文件。精炼、重命名、旧文件清理与多处尽力同步形成多个写入点；没有共同的版本验收，旧副本可能长期留在检索目录。现已移除这三处镜像写入，`/knowledge` 与沙箱工作目录也不再参与个人资料检索。运行生成文件仍是临时工作文件，需通过界面“保存到个人空间”归档后成为资料。

## 访问路径

- 沙箱 → `POST /ai/proxy/v1/knowledge/search` → `POST /workspaces/my/knowledge/search`。
- 后续读取 → `read_file("personal-knowledge://<workspaceId>/<nodeId>", start_line=..., end_line=...)` → 网关 → `POST /workspaces/my/knowledge/read`。
- 网关只从签名沙箱 token 提取用户 ID，不接受请求体指定 owner 或跨空间授权。平台只查此用户拥有的 personal workspace，排除临时目录、派生缓存和目录循环；read 再次校验所属空间与节点是否仍存在。
- 文本原件每次读取，绕过 `.extracted.txt` 与 digest.cleanedContent，避免缓存遮住精炼或编辑后的内容。删除节点后读取立即失效；网关异常不会回退到本地旧文件。
- `tags/title` 从原件 frontmatter 提取，文本原件不混入旧摘要标签；二进制文档使用对应原件的派生 keyTopics 参与检索，支持 `AI网关` / `AI 网关` 归一化。返回相同节点的界面链接。

每轮自动检索记 `personal_knowledge` guard，区分 matched、no_match、partial、failed、skipped，包含扫描数量、命中数量、注入字符量、节点 ID 和内容哈希。自动预读取不增加模型工具调用次数，不能仅看工具数判断是否检索。

## 个人资料与联网混合检索

`retrieval_policy.py` 统一决定来源范围，`retrieval_workflow.py` 执行首轮检索：

- 显式联网必须执行网页检索；“只联网”不扫描个人空间。“不要联网 / 只根据我的资料”关闭网页工具。
- 未显式联网的公开技术部署、版本、选型和兼容性问题自动前置查网，优先官方文档；询问个人资料内容先查个人原件，资料不足时模型可按需补网。
- 纯附件查阅、翻译和未明确搜索的文件生成不做自动前置盲搜；已选中的 MCP 专属工作流保持其来源约束。
- 首轮以统一特征重排至多 5 个资料候选，不直接比较本地与供应商原始得分；按内容哈希/URL 去重，并兼顾个人环境约束与部署手册。没有固定的本地/网页数量配额。首轮数量不限制后续模型读取和检索。
- 当前用户环境与内部约定以原件为准；公开版本、兼容要求、安装步骤优先采用对应版本的官方资料。冲突须注明日期、版本与适用环境。
- 安装/部署查询拆成产品、官方安装手册、配置验证等方向；宣传页和新闻不能替代安装文档。
- 部署草稿的 fenced 命令、Kubernetes YAML 与引用链接会做本轮证据文本检查；未找到时共用至多一次纠错机会，要求补查/读原文，仍无支持则省略相应代码块或条目。可识别的个人文档标题引用会修正到原件界面链接，已出现的真实网页引用不会被替换成同名笔记。此检查不执行部署，也不能替代语义正确性、官方身份、版本兼容或真实运行验证。
- 最终来源附录只列正文实际链接或点名的个人资料和正文链接的网页；内部 personal-knowledge URI 转为同节点界面链接。

新增 `retrieval_policy`、`retrieval_selection`、`retrieval_coverage`、`deployment_evidence` 审计 guard，分别记录联网决策理由、首轮候选选择、主题/安装资料缺口与一次前置补查、未核实代码或引用的补查与省略。主题相关性采用共享词项与常用中英技术名词特征；文档 URL 模式只是排序线索，不是官方身份验证。`personal_knowledge` guard 仍记录原始匹配数量，不能将其直接当成最终注入数量。

回归文件：`tests/test_mixed_retrieval.py`；既有网页查询、个人原件、规划检索和答案完整性交付测试需一起验证。Python 模块通过开发挂载在下次 dsh 进程启动时加载；无需重启无变更的 Node 服务，正在运行的用户任务不能强制中断。镜像环境需要发布更新后的运行时。

## 退役历史镜像

从仓库根目录使用统一 Docker 入口。先看计划，再执行；脚本必须明确指定用户，不默认修改所有用户：

```bash
./docker/start-smart.sh dev exec -T platform node scripts/maintenance/consolidate-personal-knowledge.cjs --user <用户UUID>
./docker/start-smart.sh dev exec -T platform node scripts/maintenance/consolidate-personal-knowledge.cjs --user <用户UUID> --apply
```

脚本按原文件哈希或 Markdown 的 source.session_id + source.message_id 验证对应关系，不按同名直接删除。独有文件先迁入个人空间并完成数据库/配额登记，已验证的旧副本及随附提取缓存随后退役。退役前核对原件与副本哈希，保存可恢复审计备份；备份在审计目录，不参与知识检索。重跑应显示待处理为 0，不会重新导入同一份文件。任何仍在使用的旧归档写入服务必须先完成更新再迁移。

该用户本次迁移：29 个旧文件退役，包含 1 个独有 Markdown 先入库；个人空间原件与来源节点保留。当前 /knowledge 下仅保留技能等运行数据，未作资料清理。

## 验证

1. 构建 workbench、运行 platform 的 personal-knowledge 和 workspace-note 测试，以及 Orchestrator 的 sandbox-knowledge-proxy 测试。
2. 在具备 Office 依赖的真实个人沙箱运行 `test_knowledge_scan_and_sources.py`；普通 Node 平台容器不包含 openpyxl，不能用于完整文件工具测试。
3. 用 `关于ai网关呢` 验证能命中 e37e4e74-f51c-48a6-9000-3b0c093d0cc1，读到原件 `AI网关` tag，内容哈希与个人空间存储一致。
4. 校验跨用户节点不可读、删除失效、更新读取新字节、网络失败没有本地回退。模拟数据覆盖这些约束，不修改真实用户文档来测试删除。
5. 对保存与后台精炼检查不再生成 deliverables 镜像；临时工作文件与自定义技能不属于归档资料源。

Node 服务使用编译产物，修改后需通过 `./docker/start-smart.sh dev restart platform ai-orchestrator` 重启构建验证。Python 模块与插件在当前开发环境通过挂载供下一次沙箱进程加载；镜像部署需更新对应镜像和集中插件分发产物。

本次端到端验证证据：`docs/artifacts/reviews/personal-knowledge-unification-20261112/`。原问题在无旧副本、无网页工具条件下，一次模型调用完成并附个人空间来源链接；重点验证检索来源一致性，没有对全部回答内容逐项事实核验。
