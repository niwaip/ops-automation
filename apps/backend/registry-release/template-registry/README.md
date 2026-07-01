# template-registry

当前目录代表未来 `registry-release/template-registry` 的统一逻辑视图。

本目录用于承接浏览器模板与文档模板这两类设计时模板目录能力，
把它们从能力域运行时实现中区分出来，作为注册侧资产统一管理。

## 该目录负责

- Browser Template 目录与设计时元数据
- Document Template 目录与设计时元数据
- 模板与发布链之间的目录级绑定信息
- 模板资产的统一命名、标签与归档状态

## 该目录不负责

- 浏览器录制、回放、观察等运行时能力
- 文档渲染、报表生成等执行期能力
- Release 编译、审批、发布与回滚
- Control-plane 的执行实例生命周期

## 当前迁移状态

- 当前先落最小源码入口与对象模型，作为 `registry-release` 的真实子包。
- 旧模板实现仍可能物理位于 `domain/*` 或 `capabilities/*` 过渡层。
- 新的模板目录模型、共享查询条件与注册期元数据，应优先落到本包。
- 包根入口 `src/index.ts` 与 `package.json` 的 `.` export 已在后续 Phase E 删除；当前仅保留 `browser-template`、`document-template` 两个稳定子路径入口。

## 当前逻辑分层

- `browser-template`
  - 浏览器模板目录记录、查询条件与发布绑定元数据
- `document-template`
  - 文档模板目录记录、查询条件与发布绑定元数据

## 与发布链的关系

`template-registry` 只承接设计时模板目录资产，不直接参与运行时执行。

统一发布链应保持为：

```text
template-registry
  -> release-manager
    -> Release Manifest
      -> control-plane
        -> runtime worker
```
