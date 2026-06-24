# Governance Boundaries

本文件用于说明 `core/platform/src` 中属于未来 `governance` 平面的能力边界。

## 当前治理资产

- `modules/auth`
  - 登录、令牌签发、认证入口
- `modules/organization`
  - 组织、部门、归属管理兼容入口
  - 读写主体已迁入 `governance/organization`
- `modules/user`
  - 用户信息与账户侧管理兼容入口
  - 主体已迁入 `governance/identity-access`
- `guards/*`
  - 认证、角色、RBAC 访问控制
- `decorators/*`
  - 角色、权限声明装饰器
- `strategies/*`
  - JWT、LDAP 等认证策略

## 当前规则

- 这些能力逻辑归属都应视为 `governance`
- 新增 IAM、组织、访问控制相关逻辑不应进入 `registry-release`
- 它们当前仍位于 `core/platform`，只是迁移期物理位置，不代表长期归属
- 不应再把组织归属实现新增回 `modules/user`，应统一收敛到 `modules/organization`

## 与其它平面的边界

- 不负责 Skill、Workflow、Release 等设计时注册与发布逻辑
- 不负责 Control-plane 执行编排与 Runtime 调度
- 只提供治理能力、访问控制和身份组织上下文
