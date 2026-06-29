# recorder

浏览器能力域中的 `recorder` 子层承接录制、观察、导出、会话与恢复编排的统一逻辑入口。

## 当前归属

- 对齐 `apps/backend/intelligence/ai-orchestrator/src/modules/browser` 中的录制主链、观察、导出、会话和恢复逻辑。
- 个别高频自然语言动作决策后续仍可继续南向外移到 `browser-nl-agent`。

## 当前约束

- 当前先补稳定子层目录与入口，不在本批次搬迁 `modules/browser/*` 的真实实现。
- 新的浏览器录制域共享契约与导出面应优先收敛到该子层语义下。
