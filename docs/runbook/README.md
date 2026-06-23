# Runbook 导航

`runbook/` 用于存放可执行的操作手册、阶段性验证记录和排障文档。

当前内容：

- `document-semantic-phase1.md`
  文档语义链路阶段性落地说明。
- `archive/`
  一次性验证记录和历史排障样例归档。

使用原则：

- runbook 面向操作和验证，不承担架构总纲职责。
- 一次性的执行记录、临时排障样例和已失效的手工验证结果，应迁入 `archive/`。
- 若 runbook 中的结论与代码现态冲突，应以代码和 `docs/design/README.md` 为准。
