# Debug Session: ai-orchestrator-prisma-engine
- **Status**: [OPEN]
- **Issue**: `ai-orchestrator` 容器重启后启动失败，Prisma Client 在 Linux 容器内找不到匹配的 Query Engine，导致服务无法正常启动。
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-ai-orchestrator-prisma-engine.ndjson

## Reproduction Steps
1. 在仓库根目录执行 `./docker/start-smart.sh docker-compose.base.yml up -d platform control-plane ai-orchestrator`
2. 查看 `ops-ai-orchestrator` 容器日志
3. 观察 Prisma Client 初始化阶段是否报 `binaryTargets` / Query Engine 不匹配错误

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | `ai-orchestrator` 的 Prisma Client 仅按本机 `darwin-arm64` 生成，未包含容器所需 `linux-arm64-openssl-1.1.x` | High | Low | Confirmed |
| B | 容器启动流程没有在正确目录重新 `prisma generate`，导致继续使用宿主机遗留产物 | High | Low | Confirmed |
| C | `schema.prisma` 的 `generator client.binaryTargets` 配置缺失或被其他配置覆盖 | High | Low | Confirmed |
| D | 容器中复制到 `dist/generated/prisma` 的产物来自错误源目录，运行时搜索路径优先命中错误二进制 | Medium | Medium | Inconclusive |
| E | `@prisma/client` / generated client 版本或生成方式在该服务中与其他容器不一致，导致仅此服务启动失败 | Medium | Medium | Rejected |

## Log Evidence
- `docker/compose/docker-compose.base.yml` 的 `x-common-node-service` 默认命令是 `npm install --legacy-peer-deps && npm run dev`，不会执行 `prisma generate`
- `apps/backend/intelligence/ai-orchestrator/prisma/schema.prisma` 的 generator 仅声明 `provider` 和 `output`，没有 `binaryTargets`
- `ops-ai-orchestrator` 容器日志显示：`Prisma Client could not locate the Query Engine for runtime "linux-arm64-openssl-1.1.x"`，并明确指出当前 client 产物来自 `darwin-arm64`

## Verification Conclusion
- 根因不是业务逻辑，而是 `ai-orchestrator` 容器启动链没有在 Linux 容器内重新生成 Prisma Client，同时 schema 也未声明跨平台 `binaryTargets`，最终命中了宿主机 `darwin-arm64` 生成产物。

## Fix Summary
- 在 `docker/compose/docker-compose.base.yml` 为 `ai-orchestrator` 增加显式启动命令：
  - `npm install --legacy-peer-deps`
  - `npx prisma generate`
  - `npm run dev`
- 保持业务代码不变，仅修正容器启动链。

## Post-fix Evidence
- `ops-ai-orchestrator` 日志出现：
  - `Prisma schema loaded from prisma/schema.prisma`
  - `Generated Prisma Client (v5.22.0) to ./src/generated/prisma`
  - `Nest application successfully started`
  - `AI Orchestrator Service running on: http://192.168.100.143:3007`
- `curl http://127.0.0.1:3007/ai/models` 返回 `HTTP/1.1 200 OK`
