# @ops/browser-runtime-facade

浏览器能力域面向执行链路（`control-plane` 与 `browser-worker`）的稳定域桥接契约包：
- 执行和解策略与接管观察契约（`types/ResumeStrategy`、`TakeoverObservation`、`ReconcileAfterTakeoverRequest`）
- 执行桥接端口定义（`ports/BROWSER_EXECUTION_RECONCILER`、`BROWSER_PHASE_RECOVERY`）
