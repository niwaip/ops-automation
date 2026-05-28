# Debug Session: tech-service-first-pass [OPEN]

## 用户症状
- 技术服务合同在首次参数识别时失败
- 用户预期：即使是首轮识别，也应结合 AI 指南中的完整参数情报完成识别

## 当前假设
- H1: 首次识别走了 `direct-ai-identify-multistage` 的快速分支 `quickNameParameters()`，但该分支没有消费 `skill`，因此忽略了 AI 指南。
- H2: 前端虽然持有 `aiSkillGuide`，但首次识别请求没有把它传到后端，导致后端 Prompt 中没有 AI 指南内容。
- H3: 后端已经接收到 `skill`，但快速分支内部构造 Prompt 时没有注入 `templateDescription` / `parameters`，因此模型仍按通用规则命名。
- H4: 首次识别使用的并不是多阶段快速分支，而是另一条直调路径，导致我们修复了错误的链路。
- H5: 即使 Prompt 中有 AI 指南，返回结果在解析或映射阶段被覆盖，最终没有体现为正确字段名。

## 调试计划
- 检查前端首次识别调用链与后端路由
- 复现首次识别请求并确认实际执行分支
- 对快速分支增加最小化运行时证据日志
- 根据证据实施最小修复
- 进行端到端验证并对比修复前后结果

## 结果记录
- 待更新
