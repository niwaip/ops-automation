# Runbook: platform.search.web (内置全网搜索能力运维手册)

- **能力唯一标识**: `platform.search.web`
- **能力所有者**: `platform-search`
- **生命周期状态**: `certified` / `production`
- **安全风险等级**: `L0` (只读操作，无持久化外部副作用，天生幂等 `naturally_idempotent`)
- **路由标识**: `routeKey: builtin:workflow` (`handlerKey: search.web`)

---

## 1. 能力描述与服务指标 (SLO)

| 指标 | 目标要求 | 监控指标项 |
| :--- | :--- | :--- |
| **可用性 (Availability)** | $\ge 99.9\%$ (月度) | `rate(http_requests_total{handler="search.web",status=~"2.."}[5m])` |
| **延迟 (P95 Latency)** | $\le 2500\text{ ms}$ | `histogram_quantile(0.95, sum(rate(search_web_duration_ms_bucket[5m])) by (le))` |
| **并发承载力** | 50 QPS 并发调用 | `max(search_web_in_flight_requests)` |
| **内存预算** | 容器常驻内存增加 $\le 128\text{ MB}$ | `container_memory_usage_bytes{container="control-plane"}` |

---

## 2. 探针与就绪检查 (Probes)

- **探针端点**: `GET /health` (或通过微服务内部路由探测：`GET /internal/builtin-skills/platform.search.web/health`)
- **健康判定规则**:
  1. 基础网络连接畅通；
  2. 搜索提供商凭证（如 `TAVILY_API_KEY` 或下游网关）已配置或本地引擎在线；
  3. JSON Schema 契约校验引擎就绪。

---

## 3. 常见故障处理与排障步骤 (Troubleshooting)

### 3.1 搜索提供商 Rate Limit (HTTP 429)
- **现象**: 执行步骤报错 `Provider rate limit exceeded`，重试后仍然失败。
- **应急处置**:
  1. 检查环境变量 `TAVILY_API_KEY` 配额使用率；
  2. 临时切换备用搜索引擎凭证或开启并发限流截流器；
  3. 控制客户端批量搜索并发度，增加抖动退避重试（Jitter Backoff）。

### 3.2 搜索请求超时 (Timeout > 20s)
- **现象**: 步骤由于超过 20 秒时限被 `DeterministicPlanSchedulerService` 判定超时。
- **应急处置**:
  1. 检查外部公网 DNS 解析与代理出口状态；
  2. 检查 `searchDepth` 是否被误设置为 `advanced` 导致深层爬取耗时过长；
  3. 客户端可降级至 `searchDepth: 'basic'` 且限制 `maxResults: 3`。

### 3.3 结果为空或抓取格式异常
- **现象**: `output.results` 为空数组或缺少 `url`/`snippet`。
- **应急处置**:
  1. 确认搜索词是否包含极端生僻符号或违反搜索服务商内容审查规则；
  2. 检查输出规范化服务 [`OutputNormalizerService`](../../apps/backend/execution-control/control-plane/src/modules/execution/plan-runtime/output-normalizer.service.ts) 是否已正确解析返回字段。

---

## 4. 回滚方案 (Rollback Procedure)

如新版本能力包（例如 `1.0.4`）存在重大缺陷：
```bash
# 回滚至上一稳定版本 1.0.3
pnpm --filter @ops/platform exec ts-node src/commands/builtin-skill-rollback.command.ts platform.search.web 1.0.3 production
```
