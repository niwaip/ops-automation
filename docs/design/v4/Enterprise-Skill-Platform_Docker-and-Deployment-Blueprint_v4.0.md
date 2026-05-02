# 企业级 Skill 平台 Docker 与部署分层蓝图

**Docker and Deployment Blueprint v4.0**  
日期：2026-05-01

> 本文是 `v4` 稳定接口方案在部署层的正式补充文档。  
> 目标是把当前“本地开发方便启动的 compose 结构”重构为“与平台逻辑边界一致的部署分层模型”，同时为后续外部团队独立开发 Runtime Adapter、Tool Provider、业务接入服务提供统一部署原则。

---

## 1. 文档目标

本文回答以下问题：

- 当前 `docker compose` 为什么容易让职责看起来不清楚
- `v4` 应如何把平台部署拆成清晰分层
- 哪些服务属于核心平台，哪些属于可插拔运行时
- 外部团队独立开发能力时，应该部署到哪里
- 环境变量、网络、存储、日志、构建方式应如何收敛

---

## 2. 当前部署结构的问题

### 2.1 当前 compose 的定位

当前 `docker/docker-compose.base.yml` 更接近：

- 本地全栈开发启动入口
- 所有服务的便利聚合层
- 工作流联调环境

它不是一份严格表达平台架构边界的部署蓝图。

### 2.2 当前认知偏差的来源

由于当前 compose 中多数组件都同时出现，因此很容易产生以下误判：

- 误以为所有服务都是同一层
- 误以为所有服务都能长期相互直接耦合
- 误以为外部能力应直接接到现有任一服务中
- 误以为“当前能访问到”就等于“以后应当依赖”

### 2.3 `v4` 的核心改进方向

`v4` 不要求立即重写所有 compose 文件，但要求先统一以下认知：

- 逻辑分层先于物理拆分
- Compose 文件必须反映部署职责，而不只是开发便利
- 外部能力默认作为 `Runtime Adapter` 或独立接入服务部署
- 平台核心服务必须有最小稳定运行组合

---

## 3. `v4` 正式部署分层

`v4` 推荐将系统部署正式划分为五组：

1. `基础设施组`
2. `核心控制组`
3. `规划与理解组`
4. `运行时组`
5. `体验组`

### 3.1 基础设施组

包含：

- `postgres`
- `redis`
- 后续对象存储
- 后续日志与指标基础设施

职责：

- 持久化
- 缓存
- 任务与状态协作基础能力

原则：

- 不承载业务逻辑
- 对所有上层服务提供稳定基础依赖

### 3.2 核心控制组

包含：

- `control-plane`
- `auth`

职责：

- 身份与授权
- Skill Registry
- Capability Release
- Execution Control Plane

原则：

- 这是平台最小控制核心
- 后续即使 Planner 或某类 Runtime 不可用，该组仍应可独立运行

### 3.3 规划与理解组

包含：

- `ai-orchestrator`

职责：

- Skill 匹配
- 参数识别
- PlanDraft 生成
- 失败分类
- 结果验证

原则：

- 该组是“智能理解层”，不是正式业务主状态层
- 可以替换实现，但接口语义必须稳定

### 3.4 运行时组

包含：

- `session-broker`
- `browser-worker`
- `carbone-engine`
- `temporal-worker`
- 后续第三方 Runtime Adapter

职责：

- RuntimeSession 分配
- 结构化能力执行
- snapshot / artifact / logs 输出
- 人工接管相关执行支撑

原则：

- 运行时组应视为“可插拔能力层”
- 不应与核心控制组混为一谈

### 3.5 体验组

包含：

- `portal`
- `office-addin`
- 后续业务端入口

职责：

- 展示、发起、管理任务
- 展示发布、接管、审批、产物

原则：

- 不直接依赖某个 Runtime 私有接口
- 优先通过 `Execution API` 和治理 API 与平台交互

---

## 4. `v4` 最小运行组合

### 4.1 平台最小核心组合

建议定义为：

- `postgres`
- `redis`
- `auth`
- `control-plane`

这组服务可以视为“无智能执行器时的平台核心骨架”。

### 4.2 带 Planner 的标准组合

建议定义为：

- 最小核心组合
- `ai-orchestrator`

适用于：

- Skill 匹配
- 参数识别
- 规划与验证联调

### 4.3 带 Runtime 的执行组合

建议定义为：

- 标准组合
- `session-broker`
- 至少一种 Runtime Adapter

例如：

- 浏览器场景：增加 `browser-worker`
- 文档场景：增加 `carbone-engine`
- 工作流场景：增加 `temporal-worker`

### 4.4 全量开发组合

建议定义为：

- 核心控制组
- 规划与理解组
- 运行时组
- 体验组

这才对应当前本地开发常用的“全栈联调模式”。

---

## 5. `v4` Compose 文件拆分建议

### 5.1 推荐文件结构

建议后续逐步拆分为：

- `docker-compose.yml`（基础设施）
- `docker-compose.core.yml`
- `docker-compose.planner.yml`
- `docker-compose.runtime.yml`
- `docker-compose.experience.yml`
- `docker-compose.addin.yml`
- `docker-compose.full.yml`

### 5.2 每个文件的职责

#### 5.2.1 `docker-compose.yml`

承载：

- `postgres`
- `redis`

用途：

- 基础设施单独启动
- 数据库/缓存基线验证
- 本地开发底座准备

#### 5.2.2 `docker-compose.core.yml`

承载：

- `postgres`
- `redis`
- `auth`
- `control-plane`

用途：

- 平台最小核心启动
- API 基线测试
- Skill / Release / Execution 控制面验证

#### 5.2.3 `docker-compose.planner.yml`

承载：

- `ai-orchestrator`

用途：

- 规划与理解能力挂载
- 模型联调
- Planner API 验证

#### 5.2.4 `docker-compose.runtime.yml`

承载：

- `session-broker`
- `browser-worker`
- `carbone-engine`
- `temporal-worker`
- 后续外部 Runtime Adapter

用途：

- 能力执行联调
- Runtime Contract 验证
- 外部能力接入验证

#### 5.2.5 `docker-compose.experience.yml`

承载：

- `portal`

用途：

- UI 联调
- 业务路径验收

#### 5.2.6 `docker-compose.addin.yml`

承载：

- `carbone-api`
- `office-addin`

用途：

- Office Add-in 本地联调
- Manifest / HTTPS / 插件链路验证
- 与平台主链路解耦的体验层补充入口

#### 5.2.7 `docker-compose.full.yml`

承载：

- 上述全部组合

用途：

- 本地全链路联调
- Demo 环境
- 端到端回归

---

## 6. 服务部署职责规则

### 6.1 `control-plane`

部署规则：

- 必须归属于核心控制组
- 必须可在无浏览器、无文档、无工作流 Runtime 时独立存活
- 不应内置某个 Runtime 的私有执行逻辑

### 6.2 `auth`

部署规则：

- 必须归属于核心控制组
- 当前可继续承载 Identity 与 Registry / Release 逻辑
- 后续逻辑拆分时，部署边界可以细化，但对上游网关语义应保持稳定

### 6.3 `ai-orchestrator`

部署规则：

- 归属于规划与理解组
- 不应成为外部能力团队的首要接入服务
- 应通过稳定 API 与核心控制组协作

### 6.4 `session-broker`

部署规则：

- 归属于运行时组
- 只负责 RuntimeSession 与资源分配
- 不应承担业务状态和审批语义

### 6.5 `browser-worker`

部署规则：

- 归属于运行时组
- 可独立扩容
- 应通过统一 Runtime Contract 接入
- 不应被 Portal 或外部系统直接依赖其私有执行接口

### 6.6 `carbone-engine`

部署规则：

- 归属于运行时组
- 作为 Document Runtime Adapter 存在
- 不承载 Skill 治理逻辑

### 6.7 `temporal-worker`

部署规则：

- 归属于运行时组
- 作为 Workflow Runtime Adapter 存在
- 可与核心控制面分开部署和扩缩容

### 6.8 `portal`

部署规则：

- 归属于体验组
- 应优先依赖 `Execution API`、`Skill API`、治理 API
- 不应绕过控制面直接拼接多个下游私有协议

---

## 7. 外部能力团队的部署模型

### 7.1 外部 Runtime Adapter 团队

推荐部署方式：

- 独立服务
- 加入运行时组网络
- 通过统一 Runtime Contract 接入

不推荐：

- 直接把代码并入 `control-plane`
- 直接把代码并入 `ai-orchestrator`
- 让前端直接依赖其私有接口

### 7.2 外部 Tool Provider 团队

推荐部署方式：

- 作为独立微服务或外部 API 提供方
- 平台侧通过 Tool 封装接入
- 通过 Tool Catalog 进入治理面

### 7.3 外部 Flow / Workflow 团队

推荐部署方式：

- 只交付流程定义、工作流 DSL、Activity 资产或构建产物
- 不直接接管平台主状态
- 最终通过 Release Pipeline 进入正式 Skill 发布链

---

## 8. 网络与服务发现规则

### 8.1 网络原则

所有平台内服务应遵循：

- 统一服务发现网络
- 平台核心服务与运行时服务可在同一网络，但必须保留分组语义
- 外部 Runtime Adapter 接入时，只暴露必要端口

### 8.2 主机名规则

建议统一使用逻辑服务名，而不是依赖具体容器名：

- `auth`
- `control-plane`
- `ai-orchestrator`
- `session-broker`
- `browser-worker`
- `carbone-engine`
- `temporal-worker`

### 8.3 访问规则

- 组内服务通过内部服务名访问
- 面向浏览器或外部客户端的入口统一由网关或公开域名暴露
- 不应让外部使用者直接依赖容器内网地址

---

## 9. 环境变量治理规则

### 9.1 当前问题

当前多个服务都直接声明了彼此 URL，虽然开发方便，但容易引发：

- 服务职责边界模糊
- 环境切换复杂
- 外部团队接入成本高

### 9.2 `v4` 建议分类

环境变量建议分为四类：

1. `基础设施类`
2. `平台控制类`
3. `Planner 类`
4. `Runtime 类`

### 9.3 基础设施类

例如：

- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`

### 9.4 平台控制类

例如：

- `AUTH_SERVICE_URL`
- `CONTROL_PLANE_URL`
- `INTERNAL_API_SHARED_SECRET`
- `JWT_SECRET`

### 9.5 Planner 类

例如：

- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `ALIBABA_BAILIAN_API_KEY`

### 9.6 Runtime 类

例如：

- `BROWSER_WORKER_URL`
- `CARBONE_SERVICE_URL`
- `TEMPORAL_SANDBOX_AGENT_URL`
- 第三方 Runtime Adapter 地址

### 9.7 规则

- 核心控制组不应依赖过多具体 Runtime 私有配置
- Runtime 相关变量应尽量限制在运行时组与桥接层中
- 对外接入文档中必须明确哪些变量属于平台公共契约，哪些只是本地开发便利项

---

## 10. 存储与状态边界

### 10.1 `postgres`

建议作为以下对象的主持久化：

- Identity 数据
- Skill Registry 数据
- Capability Release 数据
- Execution 数据
- 审计与事件索引

### 10.2 `redis`

建议作为以下对象的协作层：

- RuntimeSession 锁
- 临时会话状态
- 流式事件暂存
- 资源租约

### 10.3 对象存储

建议后续正式引入对象存储，用于：

- 文档产物
- 浏览器快照
- 报表文件
- 构建包
- 工作流生成代码归档

### 10.4 规则

- 执行事实进入结构化持久化
- 大体积产物进入对象存储
- Redis 不持有长期业务真相

---

## 11. 日志、监控与审计

### 11.1 日志分层

建议至少分为：

- 平台控制日志
- Planner 日志
- Runtime 执行日志
- Audit 日志

### 11.2 审计规则

以下动作必须可审计：

- Execution 创建
- 审批与拒绝
- takeover / resume
- Skill 发布
- Tool 配置变更
- Runtime 高风险执行

### 11.3 指标规则

建议统一输出：

- 执行成功率
- Planner 匹配率
- Runtime 可用率
- Tool 拒绝率
- takeover 触发率
- 审批等待时长

---

## 12. 部署拓扑建议

### 12.1 本地开发

建议：

- 使用 `full` 组合
- 允许快速联调
- 但在认知上仍按五组理解系统

### 12.2 测试环境

建议：

- 核心控制组独立
- Planner 独立
- Runtime 按需挂载
- 体验组可独立部署

### 12.3 生产环境

建议：

- 核心控制组高可用
- Planner 可水平扩容
- Runtime 组按类型独立扩容
- 外部 Runtime Adapter 可独立发布

---

## 13. `v4` 迁移顺序

### 13.1 第一阶段：认知和命名收敛

工作项：

- 在文档中明确五组部署模型
- 在 README 和启动脚本中体现分组概念
- 统一“核心控制组 / 运行时组 / 体验组”的术语

### 13.2 第二阶段：Compose 文件拆分

工作项：

1. 新增 `core`
2. 新增 `planner`
3. 新增 `runtime`
4. 新增 `experience`
5. 保留 `full`

### 13.3 第三阶段：Runtime 独立接入

工作项：

1. 定义 Runtime Capability Contract
2. 让 `browser-worker` 按该契约对齐
3. 让 `carbone-engine` 按该契约对齐
4. 为第三方 Runtime Adapter 提供接入模板

### 13.4 第四阶段：生产部署模型收敛

工作项：

1. 核心控制组独立发布
2. Planner 独立发布
3. Runtime 分类型独立发布
4. 体验组独立发布

---

## 14. `v4` 正式部署原则

从 `v4` 开始，平台部署必须长期遵守以下原则：

1. 平台最小核心必须可独立运行
2. Planner 不是平台唯一核心，而是可替换理解层
3. Runtime 默认是可插拔适配层
4. 外部能力优先作为独立 Runtime Adapter 或独立 Tool Provider 部署
5. Compose 文件必须逐步表达架构分层，而不只是开发便利
6. 平台对外使用者不应依赖容器内部拓扑

---

## 15. 最终结论

`v4` 的部署蓝图不是为了把所有服务拆得更碎，而是为了把以下认知正式固定下来：

- 哪些是平台核心
- 哪些是智能理解层
- 哪些是可插拔运行时
- 哪些是体验入口
- 外部能力到底应该部署到哪里

如果后续某个新能力既不属于核心控制组，也不属于体验组，又承担执行职责，那么它默认应当先被建模为 `运行时组` 组件，再决定是否进入更深的平台治理链路。
