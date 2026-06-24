# skill -> skill-registry

当前目录仍物理位于 `core/platform`，但逻辑归属已经切换为未来的
`registry-release/skill-registry`。

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

- 根入口：优先通过 `modules/skill/index.ts` 访问稳定导出面
- `registry/`: Skill 注册与查询入口
- `binding/`: Skill 与工具目录绑定
- `access/`: Skill 授权、角色绑定与可见性判断
- `matching/`: Skill 匹配与 AI 匹配返回契约
- `enrichment/`: Skill 发布态补充与运行时元数据富化
- `validation/`: 注册期校验与匹配辅助
