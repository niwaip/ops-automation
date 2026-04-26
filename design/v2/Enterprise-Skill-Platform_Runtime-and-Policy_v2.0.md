# 企业级 Skill 平台运行时与权限治理草案

**Runtime and Policy v2.0**  
日期：2026-04-19

> 本文聚焦于企业级 Skill 平台中最关键的两条主线：受控 Runtime 与分层权限治理。

---

## 1. 目标

本设计的核心目标是：

- 让 Skill 可以稳定执行，而不是依赖模型临场发挥
- 让高风险动作可审批、可暂停、可接管、可回滚
- 让 Runtime 拥有明确边界，不把系统权限直接暴露给模型
- 让“人”和“Skill”之间形成受控委托关系，而非无限代理关系

---

## 2. 总体原则

### 2.1 用户不直接把全部权限交给 Skill

- 用户发起的是一次带边界的委托
- 平台为本次 `Execution` 签发受限执行权限
- Skill 只能在本次范围内访问被允许的 Capability、Runtime 和数据域

### 2.2 LLM 不直接执行高风险动作

- LLM 只负责理解、规划、建议
- 真实写操作进入 deterministic executor
- 最终是否执行由 Policy 和审批流程决定

### 2.3 Runtime 必须状态化

- 执行不是一个黑盒调用，而是明确状态机
- 必须支持暂停、续跑、接管、取消、补偿

### 2.4 高风险任务默认人工在环

- 危险任务不应在没有审批和人工确认的情况下自动完成
- 审批和接管是正式设计能力

---

## 3. 权限模型

权限应分为五层，而不是只做 API 级鉴权。

### 3.1 人对 Skill 的权限

决定：

- 谁能看到 Skill
- 谁能执行 Skill
- 谁能编辑 Skill
- 谁能发布 Skill
- 谁能查看执行日志与产物

建议动作：

- `view`
- `execute`
- `edit`
- `publish`
- `deprecate`
- `view_logs`
- `view_artifacts`

### 3.2 Skill 对 Capability 的权限

决定：

- 某个 Skill 能否调用某类原子能力
- 某个 Skill 能否访问下载、上传、外发、删除等高风险能力

示例：

- `browser.navigate` 可开放
- `browser.submit` 需要风险控制
- `document.render` 可开放
- `external.send_email` 默认受限

### 3.3 Capability 对 Runtime 的权限

决定：

- 这些能力是否允许进入真实浏览器 profile
- 是否允许访问生产环境
- 是否允许外网
- 是否允许持久会话

### 3.4 任务级权限

决定：

- 本次任务是否跨过风险阈值
- 是否涉及敏感对象、批量操作、关键业务对象
- 是否必须审批

### 3.5 步骤级权限

决定：

- 执行到某一步时是否必须暂停
- 是否需要审批后继续
- 是否必须切换为人工接管

---

## 4. 风险分级

建议定义四档风险：

- `L0`：只读/建议类
- `L1`：低风险写操作
- `L2`：高风险写操作
- `L3`：极高风险或禁止自治

### L0 示例

- 查询数据
- 生成草稿
- 读取页面信息

### L1 示例

- 填写表单但不提交
- 渲染内部文档草稿
- 更新非核心辅助字段

### L2 示例

- 提交审批单
- 修改主数据
- 对外发送文档
- 批量更新业务记录

### L3 示例

- 删除关键数据
- 财务付款确认
- 批量停用关键对象
- 对外发送不可撤销内容

原则：

- `L2` 起应默认 require approval
- `L3` 原则上 require human control 或明确双人审批

---

## 5. Runtime 分类

### 5.1 Browser Runtime

适用场景：

- 企业门户
- 审批系统
- Web 表单系统
- 无 API 或 API 不稳定系统

关键能力：

- session 管理
- step 执行
- 快照
- 断言
- 失败重试
- human takeover
- freeze / resume

关键原则：

- 不让模型直接自由式操作 DOM
- 走 `Plan -> Step -> Assertion -> Retry -> Takeover`

### 5.2 Document Runtime

适用场景：

- 模板编译
- 内容填充
- 预览
- 渲染
- 导出

关键原则：

- 文档输出先进入 `draft/proposed`
- 最终发送、归档、对外交付应由审批策略决定

### 5.3 API Runtime

适用场景：

- 企业内部系统接口
- 查询服务
- 结构化提交

关键原则：

- 明确幂等性
- 明确超时与重试
- 明确环境范围与数据影响面

### 5.4 Future Code Runtime

适用场景：

- 数据转换
- 批处理
- 规则校验

关键原则：

- 必须沙箱化
- 默认不开放文件系统和外网写权限

---

## 6. Browser Runtime 详细策略

### 6.1 Profile 治理

Profile 是企业资源，不是任意目录路径。

应具备：

- profile 所属人
- profile 类型
- 是否允许持久化
- 是否允许多会话并发
- 数据写回策略

### 6.2 锁策略

- 同一高权限 profile 默认单写锁
- 锁冲突直接拒绝或进入排队
- 关闭会话时释放锁

### 6.3 冻结与接管

- 当进入 `human_control` 时，必须冻结 agent 输入
- noVNC / 受控浏览器 UI 继续可用
- 续跑时从指定 step 恢复，而不是从头全跑

### 6.4 可观测性

至少输出：

- step log
- locator / target summary
- 截图或结构化快照引用
- retry count
- failure reason
- takeover trigger

---

## 7. 委托与执行令牌

建议将权限从“用户账号永久权限”切换为“Execution 委托权限”。

### 模型

1. 用户发起任务
2. Skill Router 选定 SkillVersion
3. Policy Engine 判断本次任务允许范围
4. 平台为本次 Execution 签发执行令牌
5. Runtime 仅接受该令牌允许的动作

### 令牌应包含

- 允许的 SkillVersion
- 允许的 Capability 列表
- 允许的 Runtime 类型
- 允许的环境
- 风险等级
- 是否需要审批
- 是否允许接管
- 过期时间

这样可以避免 Runtime 获得无限制的长期权限。

---

## 8. 审批模型

审批不是简单的“确认弹窗”，而是正式治理对象。

### 8.1 预审批

适合：

- 已知高风险任务
- 大额/关键对象操作
- 批量任务

流程：

- 创建任务
- 风险识别
- 生成 `ApprovalRequest`
- 审批通过后进入执行

### 8.2 运行中审批

适合：

- 前面步骤低风险
- 到某个关键 step 才进入高风险区域

流程：

- 运行到关键 step
- 暂停执行
- 输出影响摘要
- 等待审批
- 审批后继续或终止

### 8.3 双人审批

适合：

- 财务
- 法务
- 安全
- 批量不可逆修改

---

## 9. 人工接管模型

人工接管与审批不同。

- 审批：决定“能不能做”
- 接管：决定“由谁完成后续动作”

### 9.1 接管触发场景

- 验证码
- MFA
- 风控页
- 模型不确定
- UI 偏离过大
- 业务判断需要人工裁量

### 9.2 接管角色

- 发起人
- 接管人
- 审批人
- 审计人

这些角色不应默认混同。

### 9.3 接管流程

1. Execution 进入 `human_control`
2. 冻结 agent 输入
3. 接管人进入同一 RuntimeSession
4. 完成人工动作
5. 点击继续
6. 从指定 step 恢复

---

## 10. 执行状态机

推荐状态如下：

- `draft`
- `queued`
- `running`
- `waiting_input`
- `pending_approval`
- `human_control`
- `paused`
- `succeeded`
- `failed`
- `cancelled`
- `rolled_back`

### 状态说明

- `waiting_input`：缺少参数、凭证、用户确认输入
- `pending_approval`：等待治理层审批
- `human_control`：进入人工接管
- `paused`：可恢复暂停态
- `rolled_back`：执行结果已被撤销或补偿

---

## 11. Policy Engine 建议

建议使用统一策略引擎进行决策，至少输出以下结果：

- `allow`
- `deny`
- `require_approval`
- `require_takeover`
- `restrict_runtime`
- `redact_output`

### 输入维度

- 用户身份与角色
- Skill 风险等级
- 本次任务参数
- 当前环境
- Runtime 类型
- 数据分类
- 目标对象

### 输出例子

- 允许继续执行
- 允许只读模式运行
- 禁止使用真实用户 profile
- 必须审批后提交
- 必须人工接管最终确认步骤

---

## 12. 审计要求

所有高价值 Execution 至少记录：

- 谁发起了任务
- 使用了哪个 SkillVersion
- 调用了哪些 Capability
- 使用了哪个 RuntimeSession
- 在哪里触发审批和接管
- 最终产出了哪些 Artifact
- 是否使用了 Memory
- 最终结果是什么

审计要支持：

- 回放执行路径
- 回答“为什么这么做”
- 解释“谁批准了什么”

---

## 13. MVP 落地建议

第一阶段先落地以下能力：

- Browser Runtime 的稳定执行
- ApprovalRequest 模型
- Human Control 状态机
- Step log 与 Artifact 存储
- Policy Engine 的最小规则集

第二阶段补：

- 更细粒度的 Capability 风险矩阵
- Profile Registry
- Document Runtime 审批态输出
- 多角色审批与双人审批

第三阶段补：

- 统一委托令牌
- 跨 Runtime 联合作业
- 动态风险评分

---

## 14. 结论

企业级 Skill 平台中的权限设计，核心不是“用户能否调用某个接口”，而是：

> 谁能在什么条件下，委托哪个 Skill，调用哪些 Capability，在什么 Runtime 中，对哪些对象执行到什么程度，并在必要时由谁审批、谁接管、谁负责续跑。

只有 Runtime、Policy、Approval、Takeover 四条线一起成立，平台才真正具备企业可控性。
