# Governance Boundaries

本文件用于说明 `core/platform/src` 中属于未来 `governance` 平面的能力边界。

## 当前治理资产

- `governance/identity-access/*`
  - 身份认证、登录、令牌签发、用户账户治理的 runtime bridge 绑定
- `governance/organization/*`
  - 组织、部门、归属治理的 runtime bridge 绑定

## 当前规则

- 这些能力逻辑归属都应视为 `governance`
- 新增 IAM、组织、访问控制相关逻辑不应进入 `registry-release`
- 它们当前仍位于 `core/platform` 的内容主要是 runtime bridge 绑定与基于 `PrismaService` 的 provider 实现，不代表长期归属
- 不应再把组织归属实现新增回平台目录，应统一收敛到 `governance/organization`

## 与其它平面的边界

- 不负责 Skill、Workflow、Release 等设计时注册与发布逻辑
- 不负责 Control-plane 执行编排与 Runtime 调度
- 只提供治理能力、访问控制和身份组织上下文
