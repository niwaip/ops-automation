# Release Publisher

真实实现位于 `../src/publisher/`。该层负责发布写入、部署绑定、运行时凭证与上下文、浏览器及文档运行时桥接、发布后 smoke 校验。它消费发布态结果；Manifest 主装配在 `release`，顶层执行状态在 `control-plane`。
