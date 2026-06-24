# browser-domain

当前目录作为浏览器能力域的目标逻辑路径，用来统一承接以下现态模块：

- `apps/backend/domain/browser-template`
- `apps/backend/domain/browser-semantics`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser`

## 模块归属说明

- `templates`
  - 对应当前 `domain/browser-template`
  - 负责浏览器模板资产的设计时定义、编译与校验
- `semantics`
  - 对应当前 `domain/browser-semantics`
  - 负责浏览器语义规则的设计时管理、发布态查询与运行时解析
- `recorder`
  - 对应当前 `ai-orchestrator/modules/browser` 中的录制、观察、导出、会话与恢复编排
  - 个别高频自然语言动作决策未来可继续外移到 `browser-nl-agent`
- `runtime-facade`
  - 表示浏览器域面对 `control-plane`、`browser-worker` 与其他执行链路的桥接接口
  - 当前仍与 `recorder` 同处于 `ai-orchestrator/modules/browser` 的物理目录中

## 该能力域负责

- 浏览器模板资产
- 浏览器语义规则
- 浏览器录制与调试编排
- 浏览器导出与运行时桥接

## 该能力域不负责

- 通用 Planner 的技能匹配与计划生成
- Release Manager 的统一发布门禁
- Browser Worker 内的原子执行实现
- Control-plane 的执行生命周期推进

## 内部结构草图

```text
apps/backend/capabilities/browser-domain/
├── templates/        # 设计时模板资产
├── semantics/        # 规则集、发布态、运行时解析
├── recorder/         # 录制、观察、导出、会话、恢复
├── runtime-facade/   # 对 control-plane / browser-worker 的域桥接
└── README.md
```

## 当前迁移原则

- 先统一逻辑归属，再逐步做物理迁移。
- 浏览器新增需求应优先判断属于 `templates`、`semantics`、`recorder` 还是 `runtime-facade`。
- 不再把模板、语义、录制、导出视为四套完全独立系统。

## 发布边界

- `templates`
  - 设计时资产接口包括模板的创建、编辑、删除、编译、校验、评审。
  - 当前仍保留本地过渡发布接口：`publish / deprecate / revoke`。
  - 这些发布动作只代表兼容期内的局部发布门禁，后续应收敛到 `release-manager`，而不是继续在模板服务内部扩张。
- `semantics`
  - `rule-set` 负责语义规则集的设计时资产管理与版本草稿。
  - `release` 代表当前本地发布态过渡接口，承载 `promote/canary`、`promote/active`、`rollback`、`validate`。
  - `runtime` 是稳定南向运行时接口，只负责基于已发布规则集做解析，不承接设计时编辑或发布审批。
- `release-manager`
  - 长期目标是统一接管浏览器模板与语义规则进入可执行发布态的门禁。
  - 浏览器域保留设计时资产管理、域内校验与运行时解析，不再演化为独立的全局发布中心。
