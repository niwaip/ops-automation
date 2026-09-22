# Release Compiler

真实实现位于 `../src/compiler/`。该层处理浏览器录制流程编译、运行时步骤构建、Temporal Schema 与发布前构建辅助。最终 Manifest 装配由 `release` 承接，发布门禁由 `validator` 承接。
