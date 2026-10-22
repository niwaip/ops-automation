# 从聊天结果保存个人技能

用户完成一次业务任务后，可以说“保存为 <名称> 的skill”“保存为 <名称> 的技能”，或“把这个逻辑保存为 skill，叫做 <名称>”。`/save-skill <名称>` 使用同一捕获入口。

自然语言入口由 `personal-skill-chat.handler.ts` 处理。已识别的保存请求在生成失败、依赖缺失、等待超时或聊天持久化失败时仍属于保存流程，不再转入普通沙箱重新执行业务任务。五秒内未完成时返回生成中状态以及 `data.personalSkillCapture`、`data.statusUrl`；只有安装回执包含技能 ID、slug、版本时回复保存完成。带客户端消息 ID 的重试使用同一捕获幂等键。

来源默认选取最近的业务任务答复，跳过保存请求及其回执、已知失败和已取消的执行。显式指定消息时严格绑定该轮；指定用户消息时选择紧随其后的助手答复。技能记录保留实际来源助手消息 ID。

业务指令中的逗号可能分隔筛选值，因此按完整规则保存，不删除短前缀。输入附件的普通文件名、Markdown 转义名和 URL 编码下载引用均不作为输出格式契约。无脚本的任务可以保存为规则说明型技能，后续读取新附件并执行；不要求为保存技能重新制作一次报表。

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
