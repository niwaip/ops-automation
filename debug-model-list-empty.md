# Debug Session: model-list-empty [OPEN]

## Problem

- Symptom: "模型一览" 页面内容为空。
- Expected: 已迁移恢复的模型配置应能被 ai-orchestrator 加载并在页面展示。

## Initial Hypotheses

1. ai-orchestrator 未重启，仍在使用旧进程。
2. `/app/data` 未挂载到 `apps/backend/var/cache/ai-orchestrator`。
3. 服务启动时未成功加载 `ai-models.json` / `ai-providers.json`。
4. 前端请求落到了错误实例或错误接口。

## Evidence Plan

- 检查容器/进程状态与启动时间。
- 检查 compose 挂载与容器内实际文件。
- 检查 ai-orchestrator 启动日志中的模型加载记录。
- 检查模型接口返回值。

## Status

- Waiting for runtime evidence collection.
