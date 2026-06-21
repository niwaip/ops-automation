# 企业级技能平台 Browser Mock ERP 评测站页面矩阵与任务集

**Browser Mock ERP Evaluation Site Matrix v4.0**  
日期：2026-06-21

> 本文定义 `tests/mock-erp/` 在浏览器语义识别、命令生成、候选定位与回放验证中的正式定位。  
> 目标不是把 `mock-erp` 做成完整业务系统，而是把它建设为可持续回归、可持续扩展、可量化评测的受控样本网站。

---

## 1. 文档目标

本文回答以下问题：

- 当前 `mock-erp` 应承担哪些评测职责
- 应优先保留和扩展哪些页面与数据场景
- 哪些页面适合验证通用语义，哪些适合验证业务语义
- 页面应如何提供稳定标注，以支持候选召回与定位评测
- 任务集应如何分层，才能同时服务规则版本化与目录重组回归

---

## 2. 当前样本站现状

基于当前 [app.js](file:///Users/chain/Documents/MyProject/ops-automation/tests/mock-erp/app.js) 的真实逻辑，`mock-erp` 已具备以下页面与流程基础：

- 登录页：用户名、密码、登录按钮
- MFA 页：验证码输入与提交
- Dashboard：待审数、已审数、平均毛利率
- 审批列表页：项目表格、全局搜索、行点击进入详情
- 审批详情页：项目详情、毛利率卡片、人工接管提示、承认/拒绝按钮、审计时间线
- 日志页：审计日志列表
- 设置页：毛利率阈值配置、重置 mock 数据
- 新建申请页：项目创建、金额/利润输入、毛利率计算、文件上传
- 通知面板：人工介入待办通知

这说明它已经不是“空白测试页”，而是可以覆盖登录、列表、详情、条件分支、人工接管、配置影响和表单提交流程的受控样本站。

---

## 3. 定位原则

### 3.1 它是评测站，不是业务真相

- `mock-erp` 只负责为浏览器链路提供受控样本
- 核心能力必须落在通用观察、通用候选、通用解析与通用执行链上
- 页面中的业务词汇只用于验证，不应反向污染 `browser-command.service.ts`

### 3.2 它必须既能“走通”，也能“打断”

- 不能只有一条顺滑 happy path
- 必须包含文案变化、结构变化、弱标注页面和人工接管场景
- 必须允许解析链路暴露真实短板，而不是靠页面过度配合掩盖问题

### 3.3 它必须可回放、可对比、可扩展

- 每个任务都要定义输入、前置状态、期望解析结果和期望执行结果
- 每个页面变体都要可被独立命名和引用
- 每次规则版本迭代都要能在同一批样本上回放对比

---

## 4. 页面矩阵

### 4.1 一级页面

| 页面类型 | 当前现状 | 主要用途 | 优先级 |
| --- | --- | --- | --- |
| 登录页 | 已存在 | 验证通用登录语义、字段识别、提交动作 | P0 |
| MFA 页 | 已存在 | 验证分阶段认证、验证码输入、条件跳转 | P0 |
| Dashboard | 已存在 | 验证读取型语义、指标卡定位、导航起点 | P1 |
| 审批列表页 | 已存在 | 验证搜索、列表选择、第 N 行定位、候选消歧 | P0 |
| 审批详情页 | 已存在 | 验证详情读取、字段别名、区域定位、动作执行 | P0 |
| 日志页 | 已存在 | 验证表格读取、事件回溯、只读列表语义 | P2 |
| 设置页 | 已存在 | 验证配置修改、阈值影响、跨页面行为变化 | P1 |
| 新建申请页 | 已存在 | 验证复杂表单、计算字段、上传区、提交 | P1 |
| 通知面板 | 已存在 | 验证浮层/侧边面板/未读项语义 | P2 |

### 4.2 二级子视图

审批相关页面应继续明确拆成两个子视图：

- `approvals-list-subview`
- `approvals-detail-subview`

这样可以稳定覆盖以下关键能力：

- 从列表进入详情
- 从详情返回列表
- 基于列表选中行理解当前详情实体
- 在详情页执行审批动作

### 4.3 路由与入口建议

当前样本页以 hash 路由工作，至少应稳定保留：

- `#dashboard`
- `#approvals`
- `#logs`
- `#settings`
- `#new-request`

登录态建议继续支持以下入口变化：

- 默认用户名/密码登录
- `force_mfa=true`
- `skip_mfa=true`

这样能覆盖：

- 普通登录
- 强制二次验证
- 条件性跳过验证

---

## 5. 数据场景矩阵

### 5.1 当前基础样本

当前真实数据中，至少已有以下可复用场景：

| 项目编号 | 毛利率 | 状态 | 场景用途 |
| --- | --- | --- | --- |
| `PRJ-2026-001` | `25.5%` | `pending` | 高于阈值，可自动承认 |
| `PRJ-2026-002` | `17.8%` | `pending` | 低于阈值，触发人工接管 |
| `PRJ-2026-003` | `12.0%` | `pending` | 明显低于阈值，验证强提示与拒绝路径 |
| `PRJ-2026-004` | `42.0%` | `approved` | 已承认状态读取 |
| `PRJ-2026-005` | `8.5%` | `rejected` | 已拒绝状态读取 |

### 5.2 必须新增的数据状态

为支持更稳定的评测，建议补以下数据状态：

- 边界值项目：`20.0%`
- 接近边界值项目：`19.9%` 和 `20.1%`
- 空字段项目：客户名为空或备注为空
- 长文本项目：项目名和备注超长
- 同名客户项目：验证列表消歧
- 多通知未读项目：验证通知筛选和点击跳转

### 5.3 数据重置原则

- 每次任务回放前都应支持重置到标准种子数据
- 每个数据版本应有明确版本号
- 任务不依赖上次运行遗留的 localStorage 状态

---

## 6. 页面变体设计

### 6.1 文案变体

同一语义至少准备以下文案别名：

| 语义 | 变体示例 |
| --- | --- |
| 详情 | `详情` / `明细` / `查看` |
| 承认动作 | `承认` / `批准` / `审批通过` |
| 毛利率字段 | `粗利率` / `毛利率` / `gross margin` |
| 区域名 | `审批区` / `决策区` / `操作区` |
| 列表页 | `一览` / `列表` / `表格` |

### 6.2 结构变体

同一页面至少要支持这些结构变化：

- 列表列顺序变化
- 行点击入口从整行变成按钮
- 详情页字段从上下布局变成左右卡片布局
- 承认/拒绝按钮位置互换
- 人工接管提示从顶部横幅变成右侧面板
- Dashboard 指标卡从 3 卡变成 4 卡

### 6.3 标注强弱变体

每类关键页面建议维持三档页面：

| 档位 | 特征 | 用途 |
| --- | --- | --- |
| 强标注 | 完整 `data-ai-*` + `data-testid` | 验证结构化候选链路 |
| 半标注 | 仅部分 `data-ai-*` + role/text | 验证候选退化能力 |
| 弱标注 | 无专用标注，依赖文本/role/区域上下文 | 验证真实站点接近场景 |

---

## 7. 标注协议建议

### 7.1 页面级

- `data-ai-page`
- `data-page-variant`
- `data-fixture-version`

### 7.2 区域级

- `data-ai-region`
- `data-region-type`
- `data-region-priority`

推荐区域名至少包括：

- `auth-form`
- `mfa-form`
- `global-search`
- `approval-list`
- `approval-detail`
- `decision-actions`
- `takeover-alert`
- `settings-panel`
- `upload-zone`
- `notification-panel`

### 7.3 元素级

- `data-ai-action`
- `data-ai-field`
- `data-stable-name`
- `data-row-key`
- `data-entity-id`
- `data-testid`

### 7.4 原则

- 标注必须表达“稳定语义”，不是表达当前视觉文案
- 标注名优先用英语稳定键，展示文案可以继续多语言
- 标注只服务测试与观测，不意味着线上业务站点也必须具备同等标注密度

---

## 8. 任务集分层

### 8.1 L0 通用交互任务

这层验证通用规则，不应依赖业务特定词汇。

| 任务编号 | 任务描述 | 预期能力 |
| --- | --- | --- |
| `L0-LOGIN-01` | 输入用户名和密码并登录 | 字段识别、登录动作 |
| `L0-LOGIN-02` | 完成 MFA 验证 | 二阶段登录 |
| `L0-NAV-01` | 打开审批列表页 | 导航 |
| `L0-LIST-01` | 搜索指定项目编号 | 搜索框识别 |
| `L0-LIST-02` | 打开第 2 条记录详情 | 第 N 行定位 |
| `L0-DETAIL-01` | 从详情页返回列表 | 返回动作 |

### 8.2 L1 结构化语义任务

这层验证候选召回和结构化定位能力。

| 任务编号 | 任务描述 | 预期能力 |
| --- | --- | --- |
| `L1-READ-01` | 读取当前案件毛利率 | 字段读取 |
| `L1-REGION-01` | 在审批区点击承认 | 区域 + 动作定位 |
| `L1-REGION-02` | 在操作区点击拒绝 | 区域消歧 |
| `L1-LIST-ROW-01` | 打开客户为某某的项目详情 | 行级匹配 |
| `L1-NOTIFY-01` | 打开未读通知中的人工介入案件 | 面板项定位 |

### 8.3 L2 业务语义任务

这层验证业务语义规则版本化，不应全部压在通用解析器里。

| 任务编号 | 任务描述 | 预期能力 |
| --- | --- | --- |
| `L2-BIZ-01` | 读取当前案件粗利率 | `粗利率 -> grossMargin` 别名映射 |
| `L2-BIZ-02` | 读取当前案件利润率 | 字段别名容错 |
| `L2-BIZ-03` | 在决策区选择审批通过 | `决策区`、`审批通过` 业务别名映射 |
| `L2-BIZ-04` | 如果 gross margin 低于阈值则进入人工审核 | 业务条件理解 |
| `L2-BIZ-05` | 把需要人工介入的案件承认 | 业务状态理解 + 动作执行 |

### 8.4 L3 回归与鲁棒性任务

这层验证规则升级和目录迁移期间是否回归。

| 任务编号 | 任务描述 | 预期能力 |
| --- | --- | --- |
| `L3-VARIANT-01` | 在文案变体页中打开明细 | 文案变体鲁棒性 |
| `L3-VARIANT-02` | 在弱标注页中读取毛利率 | 无强标注回退能力 |
| `L3-VARIANT-03` | 阈值修改后重新判断某案件状态 | 配置影响验证 |
| `L3-UPLOAD-01` | 新建申请并上传文件 | 表单 + 上传 |

---

## 9. 任务样例定义

### 9.1 样例：读取当前案件毛利率

任务：

- 文本：`读取当前案件毛利率`

前置条件：

- 已登录
- 当前位于审批详情页
- 当前实体为 `PRJ-2026-002`

期望解析结果：

```json
{
  "semanticIntent": "read_field",
  "fieldAlias": "grossMargin",
  "entityScope": "current-detail"
}
```

期望执行结果：

```json
{
  "success": true,
  "value": "17.8%"
}
```

### 9.2 样例：在审批区点击承认

任务：

- 文本：`在审批区点击承认`

前置条件：

- 已登录
- 当前位于审批详情页
- 页面存在 `decision-actions` 或同义区域

期望解析结果：

```json
{
  "semanticIntent": "approve",
  "regionAlias": "decision-actions"
}
```

期望执行结果：

```json
{
  "success": true,
  "status": "approved"
}
```

### 9.3 样例：低于阈值时进入人工审核

任务：

- 文本：`如果 gross margin 低于阈值则进入人工审核`

前置条件：

- 当前实体 `grossMargin=17.8`
- 当前阈值 `20.0`

期望解析结果：

```json
{
  "semanticIntent": "conditional_takeover",
  "fieldAlias": "grossMargin",
  "operator": "lt",
  "compareTarget": "threshold"
}
```

期望执行结果：

```json
{
  "success": true,
  "takeoverRequired": true
}
```

---

## 10. 回放样本格式建议

建议每条评测样本至少记录：

```json
{
  "id": "L1-READ-01-case-002",
  "page": "approval-detail",
  "variant": "baseline",
  "fixtureVersion": "v1",
  "precondition": {
    "loggedIn": true,
    "route": "#approvals",
    "activeProjectId": "PRJ-2026-002"
  },
  "input": "读取当前案件毛利率",
  "expectedSemantic": {
    "semanticIntent": "read_field",
    "fieldAlias": "grossMargin"
  },
  "expectedExecution": {
    "success": true,
    "value": "17.8%"
  }
}
```

这样可以同时用于：

- 规则回放
- parser 回归
- 目录迁移回归
- A/B 对比不同规则版本

---

## 11. 指标与目标值

### 11.1 基础指标

- `candidate_recall`
- `candidate_top1_accuracy`
- `candidate_topk_accuracy`
- `intent_accuracy`
- `step_success_rate`
- `flow_success_rate`
- `fallback_to_ai_rate`
- `rule_hit_rate`
- `rule_misfire_rate`

### 11.2 建议首期门槛

| 指标 | L0/L1 目标 | L2 目标 |
| --- | --- | --- |
| `intent_accuracy` | `>= 95%` | `>= 85%` |
| `step_success_rate` | `>= 95%` | `>= 80%` |
| `candidate_top1_accuracy` | `>= 90%` | `>= 80%` |
| `fallback_to_ai_rate` | `<= 20%` | `<= 40%` |
| `rule_misfire_rate` | `<= 3%` | `<= 5%` |

说明：

- L0/L1 更接近通用能力，门槛应更高
- L2 仍允许业务语义持续迭代，但必须可量化改善

---

## 12. 实施顺序建议

### Phase A：基线固化

- 固化当前已有页面和样本数据
- 给关键页面补 `data-ai-*` 标注
- 定义 L0/L1 最小任务集

### Phase B：变体扩展

- 增加文案变体
- 增加结构变体
- 增加强标注/半标注/弱标注页面

### Phase C：业务语义与回放

- 引入 L2 任务
- 为每个任务定义期望语义输出
- 接入规则版本化回放

### Phase D：长期回归

- 将目录迁移、解析器重构、规则升级都纳入统一回放任务
- 每次改动都产出评测报告

---

## 13. 与其他文档的关系

- 设计总稿：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Plan_v4.0.md)
- 实施 Backlog：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md)
- 执行基线：[Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md)

本文解决的是“评测站长什么样、任务怎么定义”；它不替代规则版本化方案，也不替代目录重组方案。

---

## 14. 一句话总结

> `mock-erp` 的价值不在于“像不像真实 ERP”，而在于它能否稳定覆盖登录、列表、详情、审批、人工接管、配置影响和变体鲁棒性，并把这些能力沉淀成可回放、可量化、可比较的浏览器评测基线。
