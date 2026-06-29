# Backend Domain Migration Layer

`apps/backend/domain` 已不再代表长期目标架构中的“核心业务统一落点”。
当前它仅作为迁移期保留层，继续承载尚未完成物理迁移的真实运行单元与少量历史路径说明。

## 当前定位

- `browser-template` 的逻辑归属已经切向 `capabilities/browser-domain/*`，旧目录当前仅保留历史 README。
- 历史 `browser-semantics` 逻辑归属已切向 `capabilities/browser-domain/semantics`，旧物理路径已完成删除。
- `document-engine`、`report` 的逻辑归属已经切向 `capabilities/document-domain/*`。
  其中默认运行入口也已经切到 `apps/backend/capabilities/document-domain*`。
- 这里保留现有服务，是为了降低一次性目录搬迁、Compose 调整和回归验证的风险。

## 冻结规则

- `domain/*` 不再接收新的能力域需求。
- 新的浏览器能力域需求必须优先进入 `capabilities/browser-domain/*` 的逻辑视图。
- 新的文档能力域需求必须优先进入 `capabilities/document-domain/*` 的逻辑视图。
- 迁移期间允许在 `domain/*` 后方增加兼容壳或最小桥接，但不应把新功能继续堆积在旧目录语义下。

## 迁移约束

- 第一阶段优先统一 README、边界说明、共享契约和稳定导出面，不要求立即搬目录。
- 物理迁移必须以“单个服务”为单位推进，不能把多个真实运行单元混在一个批次横向搬运。
- 涉及真实服务迁移时，必须同步验证 workspace、Compose、启动脚本和接口行为，确认容器加载的是当前 worktree 代码。

## 依赖原则

- 允许依赖稳定共享契约与必要的平台兼容层。
- 不应新增对运行时原子执行细节的深层耦合。
- 不应把新的发布编排、通用 Planner 逻辑或执行控制职责回流到本层。
