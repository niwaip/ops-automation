# Runbook 导航

`runbook/` 用于存放仍有复用价值的操作手册、仓库整理清单和排障文档。

当前内容：

- `repository-cleanup-candidates.md`
  当前仓库中可清理对象、归档候选和风险判断清单。
- `archive/`
  一次性验证记录和历史排障样例归档。

使用原则：

- runbook 面向操作和验证，不承担架构总纲职责。
- 一次性的执行记录、阶段性专项手册和已失效的手工验证结果，应迁入 `archive/` 或直接清理。
- 若 runbook 中的结论与代码现态冲突，应以代码和 `docs/design/README.md` 为准。
