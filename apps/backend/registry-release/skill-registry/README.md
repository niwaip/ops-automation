# Skill Registry

本包 `src/registry/` 承接 Skill 注册、访问控制、工具绑定、匹配、校验和元数据富化；`src/builtin/` 承接内置 Skill 的注册、授权、配置和供应流程。Nest 模块及控制器也位于本包源码内。

Skill 注册记录属于设计时资产。发布编译与审批由 `release-manager` 负责，执行状态由 `control-plane` 管理。新增 Skill 注册逻辑应放在本包对应子目录，不再引用已移除的 `core/platform` 旧路径。

入口与实际导出以 [package.json](package.json) 和 `src/registry/index.ts`、`src/builtin/index.ts` 为准。
