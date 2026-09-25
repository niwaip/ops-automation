# ADR-002: W3C 分布式全链路追踪与异步上下文传播规范 (Distributed Trace Context Propagation & Async Correlation)

- **状态**: Accepted / Approved
- **日期**: 2026-09-23
- **决策者**: 核心架构团队 (Platform, Observability & Control Plane Architecture Group)
- **关联需求**: [`docs/architecture-hardening-and-governance-guide.md`](../architecture-hardening-and-governance-guide.md) §7, §11

---

## 1. 背景与问题描述 (Context)

Ops Automation 包含同步 HTTP API 网关、反向代理（ProxyController）、微服务间 RPC、PostgreSQL Outbox 异步事件投递以及定时调度（Schedule Fire）等异构链路。历史实现中存在以下问题：
1. **非标准 Traceparent 污染**：部分调用直接将带有连字符的 UUID 作为 `traceparent` 传递，不符合 W3C Trace Context 规范（要求 32 位十六进制 `trace-id` 与 16 位十六进制 `parent-id`），导致下游标准 APM（如 OpenTelemetry Collector / Jaeger / Datadog）静默丢弃上下文；
2. **反向代理复用上游 Span ID**：`ProxyController` 在转发调用时未生成新的子 Span ID，造成调用拓扑出现回环或父子层级混乱；
3. **异步 Outbox 链路断裂**：Outbox 仅持久化了业务载荷，未强制落盘发布者 Trace Context；消费端拉取事件执行时退化为全新孤立 Trace，无法串联“调度 -> 产生事件 -> 消费执行 -> 外部外发”完整链路；
4. **指标端点击穿主库**：Prometheus 定期 Scrape `/metrics` 端点时，直接对全库表执行大表计数，且无并发锁与快照缓存，在监控采集密集时争抢连接池。

---

## 2. 决策内容 (Decision)

### 2.1 W3C Trace Context 格式与强校验
严格遵守 [W3C Trace Context 规范](https://www.w3.org/TR/trace-context/)：
- **格式**: `traceparent: {version}-{trace-id}-{parent-id}-{trace-flags}`
  - `version`: 必须为 `00`；
  - `trace-id`: 32 位小写十六进制字符串（16 字节），全 0 视为非法；
  - `parent-id`: 16 位小写十六进制字符串（8 字节），全 0 视为非法；
  - `trace-flags`: 2 位十六进制（目前 `01` 代表 sampled，`00` 代表 not sampled）。
- **校验逻辑**:
  ```typescript
  const W3C_TRACEPARENT_REGEX = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
  ```
- **降级与双轨兼容**:
  - `x-trace-id` 保留为人读的关联标识（可为 UUID）；
  - 若请求未携带有效 W3C `traceparent`，系统在入口拦截器（`TraceInterceptor`）自动生成符合 W3C 的合法 `traceparent`，并派生 `x-trace-id`；
  - **严禁**直接将包含连字符的 UUID 字符串拼入 `traceparent`。

### 2.2 同步 HTTP 代理与子 Span 派生
- `ProxyController` 转发请求时：
  1. 必须透传 `x-request-id`、`x-trace-id` 与 `tracestate`；
  2. 对于合法的 `traceparent`，必须生成崭新的 16 位小写十六进制子 Span ID，作为下游调用的 `parent-id`：
     ```typescript
     function createChildTraceparent(parentHeader: string): string {
       const match = parentHeader.match(W3C_TRACEPARENT_REGEX);
       if (!match) return parentHeader;
       const traceId = match[1];
       const childSpanId = randomBytes(8).toString('hex');
       const flags = match[3];
       return `00-${traceId}-${childSpanId}-${flags}`;
     }
     ```

### 2.3 异步 Outbox 与 Schedule Fire 的 Trace Context 传播
- **落盘结构**:
  在 `execution_outbox` 表中，事件载荷或元数据必须显式包含：
  ```json
  {
    "traceContext": {
      "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      "tracestate": "rojo=1",
      "correlationId": "req-123456",
      "originService": "control-plane-api"
    }
  }
  ```
- **消费端 Span 语义**:
  - Outbox Consumer（`execution-dispatcher`）拉取事件后，启动新的 **Consumer Span**；
  - **因果关系（Causality）**: 针对单次 Plan Step 的执行事件，Producer Span 作为 Parent Span 链接；
  - **批量投递（Batch Fan-out）**: 针对调度器批量产生的 Schedule Fire 事件，使用 OpenTelemetry **Span Link** 关联批量调度根 Span，避免形成极深的单链拓扑。

### 2.4 结构化日志上下文模型
所有服务组件在输出结构化日志时，必须绑定统一的上下文键：
```json
{
  "timestamp": "2026-09-23T18:30:00.000Z",
  "level": "INFO",
  "message": "Step execution dispatched",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "tenantId": "tenant-corp-01",
  "executionId": "exec-abc",
  "stepId": "step-1",
  "outboxId": "outbox-xyz",
  "scheduleFireId": "fire-789"
}
```

### 2.5 Metrics 防击穿快照缓存
- 在 `MetricsService` 中，昂贵的数据库聚合查询（如活跃执行数、Outbox 积压量、Schedule Fire 统计）采用 **30 秒 TTL 快照缓存**；
- 增加并发请求合并（Single-Flight / Promise In-Flight Cache），防止缓存过期瞬间数十个并发 Scrape 穿透到数据库；
- 进程级实时指标（Node.js EventLoop 延迟、内存 RSS、实时 HTTP 连接数）保持零缓存、实时收集。

---

## 3. 影响评估 (Consequences)

### 正向影响 (Positive)
- 实现了全平台与业界主流 APM（OpenTelemetry, Jaeger, Prometheus, Grafana Tempo）的零缝隙对接；
- 异步消息队列与调度事件可追溯至最原始的 HTTP 请求或自动化计划，极大加速生产环境故障根因分析（RCA）；
- 保护了核心 PostgreSQL 数据库，避免了被监控探针高频查询拖垮事件循环的风险。

### 负向影响与对策 (Negative & Mitigation)
- 异步消息存储略微增加了十几字节元数据：通过只在 payload 中保留最简 W3C 字段控制开销；
- 开发团队需要习惯结构化日志上下文：已在 NestJS `TraceInterceptor` 与日志 Logger 中统一自动挂载，无需业务代码手动传递。
