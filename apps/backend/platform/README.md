# Backend Platform Layer

平台层（Platform Layer）负责提供底座性质的、与具体业务域和执行流无关的全局治理服务。

## 典型职责

*   **身份与访问控制 (Identity & Access)**：认证、鉴权、用户、组织、租户及 API Key 生命周期管理。
*   **策略中心 (Policy Center)**：权限树、审批流控制、安全策略与风控基线。
*   **注册中心 (Artifact Registry)**：技能元数据、公共工作流模板的版本发布与物理制品追溯。
*   **审计与可观测性 (Audit & Observability)**：全链路请求追踪、系统指标、审计日志收口。

## 依赖原则

*   平台服务只允许向下依赖 `shared/*` 公共内核。
*   禁止依赖业务领域服务 (`domain/*`)、会话管理 (`sessions/*`) 或执行器 (`runtime/*`)。
