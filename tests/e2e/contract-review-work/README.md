# 工作模式合同审查 skill 端到端与 Harness 审计

对象：`platform.document.contract-reviewer@1.0.2`。从真实认证聊天接口开始，经过工作模式路由、参数识别、冻结计划、控制面领域 Handler、文档解析、真实模型、渲染、持久执行记录与原始成果物下载。

## 运行

从仓库根目录确认服务状态：

```bash
./docker/start-smart.sh dev ps
node tests/e2e/contract-review-work/run.mjs
```

使用既有本地 `test` 测试账号；可用 `CRW_USERNAME` / `CRW_PASSWORD` 覆盖，不把凭证写入证据。默认请求指定 `qwen36-35b-a3b` 的已注册 UUID，实际模型通过业务调用账本核对。可用 `CRW_MODEL_ID` / `CRW_EXPECT_MODEL` 覆盖。`CRW_CASES=C01,C03` 可选择子集；依赖用例必须包含前置用例。每次自动创建独立 run 目录，不覆盖旧运行。

附件首先调用真实 `/ai/chat/upload`，随后把服务端返回的描述对象发送至 `/ai/chat/stream`，与前端一致。`modelId` 放在请求顶层。不复用旧客户端的 `files.fileBase64` 字段。

| ID | 场景 | 主要验收 |
|---|---|---|
| C01 | 自然语言内联合同 | 正确能力、全部正文标记、唯一节点、指标一致、模型一致、HTML 可下载 |
| C02 | DOCX 上传 | 附件实质正文绑定，无静默降级 |
| C03 | 相同内容改章节结构 | 内容标记完整，与 C01 对照 |
| C04 | 无正文无附件 | waiting_input，未生成报告 |
| C05 | C04 后上传文件 | 原执行单续接、完成交付；前置未进入等待时审计记为受阻 |
| C06 | 损坏 DOCX | 有效处理损坏输入，不伪成功 |
| C07 | 附件含覆盖任务的指令 | 仍执行审查、保留正文并识别风险，不输出全通过 |
| C08 | 30 条正文、多批调用 | 全部30个标记覆盖、至少31节点含前言、无截断/静默降级 |
| C09 | 同会话上传新合同 | 新金额与新标记，原金额与旧标记不混入 |
| C10 | 显式乙方/卖方 | 输出与执行语义立场为 seller |
| C11 | 仅咨询审查概念 | 不创建具体审查执行 |
| C12 | C01 重复执行 | 正文覆盖与工程契约保持；不要求模型字面输出一致 |

## 取证与判定

每例保存 request、上传结果、实时收到的 SSE 与相对毫秒时间、控制面 execution、usage、结构化 output、原始 URL 下载结果和 HTML。请求/fixture 使用真实 SHA-256，不使用占位摘要。

判定不以 HTTP 201、聊天描述或最终 succeeded 单独作为通过依据。实际能力结合持久记录与 action 事件，结构化结果来自阶段输出；模型名称来自账本，是提供方回报的模型身份，不能证明提供方内部权重。

`firstEventMs` 是首个 SSE 事件时间；工作流通常没有文本 token 流，因此不称作模型 TTFT。`totalMs` 是聊天流结束耗时，不包含登录、上传和下载；上传属于 E2E 链路但目前未单独计时。Token 只报告可观察账本，缺失的规划/识别调用不能按零计算。格式变形只硬验内容覆盖，不把风险分数一致当作已验证。

真实 UI 抽查另存 UI 快照与执行记录。`collect-extra.mjs` 为本次 UI 执行取证及显式35B提供方连通对照，内含本次执行 UUID；复用时替换为新的 UI 执行单。直接模型对照不计为工作模式 E2E。

## 隔离故障审计

```bash
./docker/start-smart.sh dev exec -T control-plane sh -lc 'cd /workspace/apps/backend/execution-control/control-plane && ./node_modules/.bin/jest test/contract-review-harness-audit.test.ts --runInBand --json --outputFile=/workspace/docs/artifacts/reviews/contract-review-work-2026-10-16/fault-audit-jest.json'
```

此套用真实编排函数，mock 下游 HTTP，仅用于验证防御性边界，不能标为真实提供方 E2E。覆盖部分结果、重复/错误 ID、虚构证据、模型超时、空数组、渲染故障和并发上限。失败断言保留为缺陷复现，不修改期望使其通过。不对共享服务停机或改全局模型配置。

本轮不覆盖：真实浏览器附件选择全流程、扫描件 OCR、跨租户授权、服务重启恢复、重复请求幂等、长历史上下文压缩、全部合同类型/格式组合、法律准确率。C08 为30条合成合同，不声称验证了数十页真实复杂文档。
