# 企业级 Skill 平台 `v4` 项目描述

**Project Description v4.1**  
日期：2026-07-04

> 本文只描述当前项目仍然有效的实现目标、目录主线和落地边界。  
> 历史专题、迁移批次、阶段性 backlog 与一次性验收记录不再作为 `v4` 基线的一部分。

---

## 1. 项目定位

当前项目是一个企业级 Skill 平台。

平台的主链路是：

`用户意图 -> Skill -> Workflow / Work Unit -> Release -> Execution -> Runtime`

平台当前重点不是继续扩散专题设计，而是保持以下三件事稳定：

- 系统对外以 `Skill` 和稳定契约作为交付边界
- 系统对内以 `Release` 和 `Execution` 作为设计时到运行时的主干
- 浏览器能力域与文档能力域作为平台内置能力持续演进

---

## 2. 当前项目范围

当前仓库围绕以下几个核心方向组织：

### 2.1 设计时与发布链路

- `skill-registry`
- `workflow-registry`
- `template-registry`
- `release-manager`

这一层负责资产定义、注册、校验、编译、发布和版本治理。

### 2.2 运行时执行链路

- `control-plane`
- `session-broker`
- `temporal-worker`
- `browser-worker`
- `sandbox-worker`

这一层负责执行编排、会话控制、资源分配和具体运行时落地。

### 2.3 平台内置能力域

- `browser-domain`
- `document-domain`

这一层负责平台自带的浏览器模板、录制、回放、语义规则、文档模板和渲染能力。

### 2.4 智能与代理能力

- `master-planner`
- `ai-orchestrator`
- `codegen-agent`
- `browser-nl-agent`

这一层负责意图理解、参数识别、计划生成、浏览器智能执行和专项 Agent 接入。

---

## 3. 当前项目结构判断

项目当前采用的方向是：

- 保留 `v4` 作为唯一实施基线
- 优先以代码现态和稳定入口为准
- 不再把专题拆分计划、批次 backlog、一次性验收记录当成长期设计入口

当前仍值得保留的项目级判断包括：

- 平台需要稳定的系统总纲，而不是持续堆叠阶段性专题
- 项目需要一份能对应当前仓库结构的项目描述，而不是继续依赖旧迁移计划
- 文档入口应优先服务当前开发和维护，而不是历史追溯

---

## 4. 当前实施原则

- 契约优先于局部实现细节
- 目录边界优先于临时功能堆叠
- 文档应服务当前代码，不再让旧计划主导当前认知
- Docker 入口统一通过仓库根目录的 `./docker/start-smart.sh`
- 浏览器相关实现默认兼容自签名证书与受控运行环境

---

## 5. 与其他文档的关系

- 系统级总述请看 [Enterprise-Skill-Platform_Master_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Master_v4.0.md)
- 项目架构重塑背景请看 [project_architecture_redesign.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/project_architecture_redesign.md)
- 浏览器模块与模板桥接的当前功能概要保留在 `docs/design/` 根目录，不再占用 `v4` 基线目录

---

## 6. 一句话结论

`v4` 现在只保留两类信息：系统总述，以及与当前仓库现状一致的项目描述。
