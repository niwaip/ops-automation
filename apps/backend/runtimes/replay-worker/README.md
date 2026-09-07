# replay-worker (@ops/replay-engine)

`replay-worker` 是浏览器控制平面的自动化动作回放与接管引擎。

## 职责与定位

- **执行主体**：基于 Chrome DevTools Protocol (CDP) 驱动真实浏览器；
- **核心角色**：
  - 步进回放用户在 `browser-worker` 中录制的浏览器自动化步骤；
  - 遇到页面异常、定位失效或人机验证码时，暂停并触发人工接管流程；
  - 采集并上报回放过程中的屏幕截图、网络请求与控制台错误日志；
- **与 browser-worker 的边界划分**：
  - `browser-worker`：偏向实时操控、用户交互与录制阶段；
  - `replay-worker`：偏向流程重放、测试回放与排障接管阶段。
