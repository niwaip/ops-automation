# skill -> skill-registry

当前目录仍物理位于 `core/platform`，但逻辑归属已经切换为未来的
`registry-release/skill-registry`。旧 `core/platform/src/skill-registry/*` 纯 facade
已在后续 Phase E 删除，平台内消费方现直接依赖本目录下的稳定子层。

## 该模块负责

- Skill 定义管理与基础查询
- Skill 可见性、访问与补充元数据
- Skill 与工具目录的绑定关系
- 面向注册阶段的校验与匹配辅助

## 该模块不负责

- Release 编译、发布、回滚
- Workflow 模板编排与运行时执行
- Control-plane 执行状态推进

## 与发布链的关系

- Skill 是设计时注册资产，不是可直接执行资产。
- Skill 必须先经过 release-manager 绑定、编译、校验并生成 Release Manifest，
  才能被 control-plane 消费。

## 当前逻辑分组

- `modules/skill/index.ts` 根聚合 barrel 已在后续 Phase E 删除；当前应直接通过本目录下的真实实现文件或仍保留的稳定子层消费
- `registry/`: Skill 注册与查询入口
- Skill 与工具目录绑定、访问控制、匹配、富化、校验能力当前均由本目录下真实实现文件承接；旧根入口与 `access`、`binding`、`matching`、`enrichment`、`validation` 分组 `index.ts` compat 壳已在后续 Phase E 删除
