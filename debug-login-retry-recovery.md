# Debug Session: login-retry-recovery

- Status: OPEN
- User Session: `recorder-debug-1781792727204`
- Symptom: 登录仍然报错；同时需要评估并增加 AI 重试机制，第二次重试时追加当前状态和失败信息给 AI。

## Hypotheses

1. `recorder-debug-1781792727204` 的登录失败仍然是解析层问题，当前上下文没有正确命中 `candidate-first` 登录按钮。
2. 这次失败发生在执行层，解析出的点击命令是正确的，但执行时页面状态已变化、元素失效或观察滞后。
3. 当前所谓 “AI 重试” 实际不存在，失败后直接结束，因此登录场景缺少“基于失败上下文再次规划”的恢复路径。
4. 即使新增重试，如果第二次重试没有把当前页面状态和首次失败信息喂给 AI，模型仍会重复输出同样的错误动作。
5. 适合增加重试的不是所有错误，而是解析失败、元素未找到、严格模式歧义这类可恢复错误；现有链路没有做这类错误分型。

## Evidence Log

- Pending

## Next Steps

1. 从 Redis 读取 `recorder-debug-1781792727204`，确认最后一条 assistant / commands / execution。
2. 检查这条 session 的 observation、候选和失败信息，判断失败在解析层还是执行层。
3. 梳理当前 AI parser / planner / recorder-debug 执行链中是否已有自动重试与失败回灌机制。
