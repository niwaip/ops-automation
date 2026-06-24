# planner/delegation migration cutover

本文件用于说明未来 `planner/delegation` 从当前过渡态：

```text
delegation/index.ts -> modules/agent
```

切换到本地真实委派适配器实现时，推荐遵循的最小迁移顺序。

当前只固定替换步骤与切换约束，不引入真实实现。

## 目标

未来切换时，需要同时保证三件事：

1. 上游 `planner` 的稳定入口不被打断
2. 共享执行协议边界保持不变
3. `modules/agent` 的历史过渡承接能力可以被渐进替换，而不是一次性硬切

## 当前过渡态

当前关系如下：

```text
planner/index.ts -> delegation/index.ts -> modules/agent
```

这意味着：

- `planner/index.ts` 已经提供稳定上游入口
- `delegation/index.ts` 已经是稳定逻辑出口
- `modules/agent` 当前只是出口背后的过渡承接实现

## 推荐切换原则

未来切换时，应始终遵循以下原则：

- 先保留稳定出口，再替换出口背后的承接实现
- 先完成协议与事件边界稳定，再切换运行时承接层
- 不把导出命名调整、运行时改线、旧层清理塞进同一批
- 不让上游直接改为深层引用本地适配器文件

## 推荐最小迁移顺序

未来真实切换时，推荐按以下顺序推进：

1. 保持 `planner/index.ts` 不变
2. 保持 `delegation/index.ts` 继续作为稳定逻辑出口
3. 在 `planner/delegation` 内补齐真实委派适配器实现
4. 让本地适配器先具备 request builder、event handoff 与共享协议收发能力
5. 通过 `delegation/index.ts` 将转发目标从 `modules/agent` 切到本地适配器
6. 完成一轮仅关注出口兼容性的验证
7. 再评估 `modules/agent` 内剩余能力是否应继续保留
8. 最后再决定是否清理历史过渡转发

## 分步说明

### 1. 保持上游入口不变

未来第一步不应修改：

- `planner/index.ts`

原因：

- 这样可以保证上游仍只通过 `planner` 使用委派能力
- 避免切换阶段扩散到更多 import 与调用方

### 2. 保持委派层稳定出口不变

未来第二步不应直接让上游改为引用：

- `planner/delegation/*` 深层实现文件

而应继续保持：

```ts
export { AgentService } from './delegation';
```

原因：

- 这样可以把切换范围控制在 `delegation` 子层内部
- 让外部调用方不感知承接实现已经变化

### 3. 先补本地实现，再切转发目标

未来第三步应先在 `planner/delegation` 内补齐：

- 本地委派适配器
- 共享请求组装能力
- 共享进度事件消费能力
- 共享终态结果消费能力

只有本地能力完整后，才切：

```text
delegation/index.ts -> local delegation adapter
```

而不是先切出口，再倒逼补实现。

### 4. 切换时只改一层

未来真正切换 `delegation/index.ts` 时，建议只做：

- 转发目标替换

不应同时做：

- 对外命名重构
- 控制面协议改名
- 专项 Agent ingress 结构调整
- 旧 `modules/agent` 的大规模清理

## 推荐验证顺序

未来切换本地适配器时，建议按以下顺序验证：

1. `planner/index.ts` 的对外使用方式未变化
2. `delegation/index.ts` 仍能提供同一稳定出口
3. 本地适配器能正确产出 `AgentExecutionStartRequest`
4. 本地适配器能正确消费 `AgentExecutionProgressEvent`
5. 本地适配器能正确消费 `AgentExecutionResult`
6. 上游编排层仍只接收最小标准 handoff 容器

## 旧层清理条件

未来只有在以下条件都满足后，才适合评估 `modules/agent` 清理：

- 本地委派适配器已稳定承接委派链路
- 上游没有深层依赖 `modules/agent` 的委派能力
- 共享协议请求、进度、终态结果链路都已通过本地适配器稳定运转
- 过渡转发层不再承载额外兼容职责

## 不建议的切换方式

未来不建议：

- 直接删除 `delegation/index.ts`
- 直接让上游改引用本地深层文件
- 在同一批里同时改导出名、改协议名、改运行时链路
- 在本地适配器尚未稳定前提前清理 `modules/agent`

原因：

- 会把“逻辑落点切换”扩大成“全链路重构”
- 会破坏此前通过 facade 建立的稳定边界
- 会让问题定位回到旧式大范围耦合改动

## 与现有文档关系

本文件承接以下说明：

- `README.md`
- `request-builder.md`
- `adapter-skeleton.md`
- `event-handoff.md`
- `integration-placement.md`

## 当前结论

本轮之后，未来从过渡 facade 切到本地 delegation adapter 的最小替换顺序已进一步固定：

- 先保 `planner` 与 `delegation` 的稳定出口
- 再补本地委派适配器实现
- 再切 `delegation/index.ts` 的转发目标
- 最后才评估 `modules/agent` 的清理
- 仍不在本批次引入真实实现或导出变更
