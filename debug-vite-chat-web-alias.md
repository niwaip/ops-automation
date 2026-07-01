# [OPEN] Debug Session: vite-chat-web-alias

## Context
- Symptom: Docker 中 `user-web` Vite 报错，无法解析 `@chat-web/components/ChatMessageActions`
- Expected: `user-web` 在容器内可正常解析共享聊天组件别名并启动

## Hypotheses
- H1: `user-web` 容器内不存在 `/shared/chat-web/components/ChatMessageActions.tsx`，导致 alias 指向空路径
- H2: `user-web` 的 Vite alias `@chat-web` 在容器运行时未生效或路径解析到了错误目录
- H3: Docker Compose 虽已声明 volume，但实际运行中的 `ops-user-web` 容器未重建，仍使用旧挂载
- H4: `user-web` 容器内工作目录或 `server.fs.allow` 配置阻止了 Vite 访问 `/shared`
- H5: `portal` / `user-web` 其中一端源码已改，但容器内 `node_modules` 或构建缓存仍引用旧配置

## Evidence Plan
- 检查容器内 `/shared` 与目标文件是否存在
- 检查容器内 `vite.config.ts`、`tsconfig.json` 是否包含 `@chat-web`
- 检查运行中容器的 mounts 与 compose config
- 查看 `ops-user-web` 启动日志与实时报错

## Status
- Created debug session
- Awaiting runtime evidence collection
