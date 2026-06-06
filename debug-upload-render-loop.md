# Debug Session: upload-render-loop [OPEN]

## Bug Summary
- Symptom: 上传文件后，Word workflow 页面短暂显示后变空白，错误边界提示 `Maximum update depth exceeded`。
- Expected: 上传文件后页面保持挂载，不出现无限更新或空白。

## Reproduction
1. 打开 Word workflow 面板。
2. 上传参考示例文件。
3. 观察页面短暂显示后变空白，并出现渲染失败提示。

## Falsifiable Hypotheses
1. `WordTemplateWorkflowPanel` 中某个 `useEffect` 在依赖变化后反复写入等价 state，造成无限更新。
2. 上传后 compare/recognition 缓存命中逻辑反复写入 `setSuggestions` / `setSectionGenerationResults`，与派生状态形成闭环。
3. 上传后语言同步逻辑反复调用 `setWorkflowTargetLanguages`，而上游 hook 每次返回新数组，导致 effect 永不稳定。
4. 上传区子组件重挂载后再次触发父级 `onUploadStateChange` 或相关副作用，造成上传状态和 workflow 状态互相驱动循环。
5. 某个渲染期派生函数返回新对象并触发下游 effect 回写状态，形成 render -> effect -> setState -> render 的闭环。

## Instrumentation Plan
- 为 `WordTemplateWorkflowPanel` 的关键 `useEffect` 和缓存恢复链路添加最小化运行时日志。
- 记录每次 effect 触发时的依赖快照与是否实际调用了 `setState`。
- 对比上传前、上传后、白屏前最后一批日志，确认具体闭环路径。

## Status
- Current phase: hypotheses-defined
- Business logic changed: no
