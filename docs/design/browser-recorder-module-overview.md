# 浏览器录制模块功能概要

状态：当前功能概要

本文档只描述当前仓库中“浏览器录制模块”已经形成的稳定职责边界、产品入口和主要调用链，避免继续把一次性实施计划或阶段性验收记录当成总入口。

## 1. 模块定位

浏览器录制模块负责把“用户用自然语言驱动浏览器完成一段操作”的探索过程，沉淀为可复用的录制会话、结构化执行结果和导出产物。

它覆盖的主路径是：

```text
录制调试
-> 页面观察
-> 自然语言转受限动作
-> 浏览器执行
-> 执行结果 / observation / outcome 沉淀
-> 导出 templateSteps / skillDraft / executionPlan
-> 进入发布桥接链路
```

当前模块的逻辑归属已经明确收敛到：

- `apps/backend/capabilities/browser-domain/recorder`
- `apps/backend/capabilities/browser-domain/runtime-facade`

但大部分真实实现仍物理位于：

- `apps/backend/intelligence/ai-orchestrator/src/modules/browser`

## 2. 当前产品入口

当前最直接的前端产品入口是：

- `apps/frontend/portal/src/features/recorder/pages/RecorderDebugDetailPage.tsx`

当前录制详情页已经直接承接以下核心对象：

- `observation`
- `executedCommands`
- `outcome`
- `verification`
- `loopDraft`
- `exportArtifacts`

这说明录制模块已经不是单纯的“聊天调试页”，而是浏览器能力从探索态走向结构化导出的主工作台。

## 3. 后端职责边界

当前录制模块负责：

- 录制调试会话管理
- 页面 observation、snapshot 与页面指纹采集
- 自然语言到受限浏览器命令的编排
- 风险动作确认、循环草稿和人工接管协同
- 执行后的 outcome、verification、diff 等结果沉淀
- 导出模板步骤、Skill 草稿和执行计划

当前录制模块不负责：

- 通用 Planner 的全局技能匹配与计划生成
- 浏览器模板目录资产管理
- 浏览器语义规则的独立发布中心
- `browser-worker` 内部的原子 Playwright 执行实现
- `release-manager` 的统一发布审批与门禁

## 4. 当前代码落点

当前推荐按下面的方式理解代码：

```text
apps/backend/intelligence/ai-orchestrator/src/modules/browser/
├── api/           # recorder-debug 等 HTTP 入口
├── execute/       # 录制执行、会话、导出、runtime-facade 过渡实现
├── observe/       # observation / snapshot / 页面探测
├── loop/          # 循环、条件、takeover 支撑逻辑
└── recovery/      # 阶段恢复与回退恢复
```

逻辑上它们分别对齐未来的：

- `browser-domain/recorder`
- `browser-domain/runtime-facade`

## 5. 主调用链

当前主链路可以概括为：

```text
用户在 Recorder Debug 输入自然语言
-> 前端调用 /ai/recorder-debug/chat
-> ai-orchestrator 读取当前 observation / session / history
-> 生成受限 BrowserCommand[]
-> browser-worker 执行
-> 刷新 observation / snapshot / outcome / verification
-> 前端展示执行细节
-> 用户继续调试或触发 export
```

导出链路继续衔接：

```text
/ai/recorder-debug/export
-> 组装 templateSteps
-> 推导参数与 skillDraft
-> 生成 publishPayload / executionPlan
-> 交给发布桥接链路
```

## 6. 当前功能重点

基于当前代码现态，录制模块已经稳定覆盖以下几类能力：

- 结构化 observation 与页面候选信息收集
- 受限动作空间下的浏览器执行
- 录制会话历史与 executedCommands 沉淀
- 风险分级、确认与阻断
- rollback / recovery 与状态快照恢复
- 统一 outcome、verification 与证据展示
- loop draft、人工接管与导出装配

其中近期重点已进一步收敛到：

- 统一 outcome 协议
- 页面快照复用
- 单步回退与状态恢复

## 7. 上下游关系

录制模块的上游主要是：

- Portal 录制调试页面
- AI 编排与浏览器意图理解

录制模块的下游主要是：

- `browser-worker`
- 导出装配服务
- `release-manager` 的录制导出桥接接口

## 8. 建议阅读顺序

如果要理解当前录制模块，建议按以下顺序阅读：

1. 本文档：先明确产品入口、职责边界和主链路。
2. `docs/design/v4/Enterprise-Skill-Platform_Project-Description_v4.1.md`
   作用：理解当前项目范围与浏览器能力域在整体项目中的位置。
3. `docs/design/v4/Enterprise-Skill-Platform_Master_v4.0.md`
   作用：理解系统级主链、正式对象与稳定契约。
4. `docs/project_architecture_redesign.md`
   作用：理解浏览器能力域与执行链路的整体重塑背景。
5. `apps/backend/intelligence/ai-orchestrator/src/modules/browser/README.md`
   作用：理解当前浏览器执行与录制模块的代码落点。
6. `apps/backend/capabilities/browser-domain/recorder/README.md`
   作用：理解录制能力在 browser-domain 中的职责边界。

## 9. 相关代码与设计锚点

- `apps/frontend/portal/src/features/recorder/pages/RecorderDebugDetailPage.tsx`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/README.md`
- `apps/backend/capabilities/browser-domain/README.md`
- `apps/backend/capabilities/browser-domain/recorder/README.md`
- `docs/design/v4/Enterprise-Skill-Platform_Project-Description_v4.1.md`
