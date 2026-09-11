# personal-sandbox-runner (DeepSeek Harness / dsh)

`apps/backend/runtimes/personal-sandbox-runner` 是个人专属沙箱运行时的工程化源码目录。

## 职责与定位

- **执行主体**：运行在每个用户的隔离沙箱容器（`ops-user-sandbox:local`）内部；
- **核心角色**：DeepSeek Harness (`dsh`) CLI 智能体引擎；
- **上层编排**：由 `execution-control/session-broker` 的 `UserSandboxService`（及 `UserSandboxContainerService`、`UserSandboxHarnessService`）负责容器生命周期与非 root 命令分发；由 `intelligence/ai-orchestrator` 的 `user-sandbox-dispatcher.service.ts` 负责上层多轮会话调度；
- **运行环境**：
  - 工作区：`/workspace`（持久化读写）
  - 知识库：`/knowledge`（持久化读写）
  - 插件库：`/opt/dsh/plugins`（集中式只读）
  - 技能库：`/opt/dsh/skills`（集中式只读）与 `/knowledge/skills`（用户自定义技能）

## 模块结构

```text
personal-sandbox-runner/
├── README.md
├── requirements.txt            # Python 运行时依赖
├── bin/
│   └── dsh                     # CLI 可执行入口脚本 (71 行)
├── src/
│   └── dsh_modules/            # 核心业务模块
│       ├── __init__.py         # 版本与包定义
│       ├── config.py           # 环境变量、常量配置与 Banner
│       ├── tools.py            # 内置天气、网页解析、网络检索、文件与终端工具
│       ├── skills.py           # 个人空间与系统认证技能扫描与读取
│       ├── llm.py              # 模型代理流式通信与工具调用解析
│       └── runner.py           # ReAct 智能交互主循环与命令执行器
└── tests/
    └── test_dsh.py             # 自动化单元测试
```

## 命令行用法

```bash
# 查看版本与环境绑定
dsh version
dsh info

# 查询可用技能与插件
dsh skills
dsh plugins
dsh skill <skill-name>

# 运行智能体任务
dsh run "查询上海实时天气"
dsh run "生成一个 SaaS Landing Page" --session-id "session_123"

# 在工作区执行指令
dsh exec ls -la
```
