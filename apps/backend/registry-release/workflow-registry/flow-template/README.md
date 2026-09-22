# Flow Template

Execution Flow 模板注册和设计时服务的真实实现位于 `../src/flow-template/`。控制器、模块、模板服务和类型应从该源码目录或包的正式导出入口定位。此目录保留职责说明，不是独立运行包。

执行状态推进由 `execution-control/control-plane` 负责；发布态资产由 `release-manager` 生成。
