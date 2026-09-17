# 小智语音渠道

设置页 `/settings?tab=im` 的“小智语音 / AI Passport”卡片为每个用户保存一个小智 MCP 接入点。平台只保存 AES-GCM 密文和 HMAC 指纹；GET 接口不返回 URL。用户先保存，再启用。替换接入点时先停用。

`xiaozhi-connector` 是独立的出站 WebSocket/MCP 进程。它通过数据库租约保证同一连接只由一个进程持有，向小智只公开 `ops_submit_task` 和 `ops_get_task_status`。提交任务立即持久化并返回请求号，worker 再从数据库领取受理请求，通过 `ChannelTaskGatewayService` 以绑定用户的身份调用 AI 编排器；微信的 AI 调用也走这一共享服务。只有编排器返回明确终态才显示成功。连接断开不删除任务，领取前重启可继续执行；执行中重启且结果未确认的任务标为 `unknown`。语音审批和补充信息需要在网页完成。

开发环境从仓库根目录执行 `./docker/start-smart.sh dev up -d workspace-deps-init platform xiaozhi-connector control-plane`。`workspace-deps-init` 会部署平台迁移，且要求平台和控制面的共享 Prisma schema 完全一致。`PROJECT_ROOT` 和 Compose 挂载由统一入口设置。前端开发服务使用 `./docker/start-smart.sh dev:fe up -d user-web`。

配置和任务接口使用平台登录态，均在 `/im-channels/xiaozhi` 下。连接诊断检查已保存的接入点、MCP 工具发现记录和 AI 编排器健康接口，不提交真实任务。最近任务仅按当前用户查询；真实执行号存在时显示 `/executions/:id`，执行详情和 SSE 仍由控制面校验请求者。

旧 `PassportMqttGatewayService` 已停止自动连接，不再回报模拟成功。正式接入前应在小智平台轮换曾暴露的测试 token，并停掉旧项目中使用同一接入点的 `mcp_pipe.py`，避免双连接。实机完成真实 ops 任务的验收仍需使用已绑定的设备和专用测试账号。
