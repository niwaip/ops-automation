# runtime-facade

文档能力域中的 `runtime-facade` 子层承接面向执行链路的稳定运行时入口语义。

## 当前归属

- 对齐当前 `document-engine` 暴露给执行链路的正式渲染入口。
- 作为未来 `document-domain -> execution-control / runtimes` 的稳定域桥接层。

## 当前约束

- 当前先固定子层命名和逻辑入口，不在本批次新增新的私有执行入口。
- 新的文档域运行时桥接约定应优先收敛到该子层语义下。
