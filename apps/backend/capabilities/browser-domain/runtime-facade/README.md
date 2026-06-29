# runtime-facade

浏览器能力域中的 `runtime-facade` 子层承接面向 `control-plane`、`browser-worker` 与其他执行链路的稳定域桥接语义。

## 当前归属

- 对齐当前 `ai-orchestrator/modules/browser` 中面向执行链路的浏览器域桥接接口。

## 当前约束

- 当前先固定子层命名和逻辑入口，不在本批次新增新的私有执行桥接出口。
- 新的浏览器域运行时桥接约定应优先收敛到该子层语义下。
