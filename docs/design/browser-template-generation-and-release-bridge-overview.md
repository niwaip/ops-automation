# 浏览器模板生成与发布桥接功能概要

状态：当前功能概要

本文档用于说明浏览器模板从录制导出、模板设计时资产，到进入发布桥接链路的当前真实结构。它不是新的实施计划，而是当前仓库里这条链路的稳定入口说明。

## 1. 模块定位

浏览器模板链路的核心目标是把录制阶段沉淀出的结构化结果，转成可管理、可校验、可发布的模板与 Skill 资产。

当前主路径是：

```text
浏览器录制导出
-> templateSteps / skillDraft / executionPlan
-> 浏览器模板设计时资产
-> 发布桥接
-> capability release / skill draft
-> 已发布 Skill runtime
```

## 2. 当前职责拆分

这条链路当前已经可以分成三层理解：

### 2.1 录制导出层

负责把录制会话中的动作、参数和循环草稿整理成导出产物：

- `templateSteps`
- `skillDraft`
- `publishPayload`
- `runtimeMetadata.executionPlan`

这部分逻辑当前主要位于：

- `apps/backend/intelligence/ai-orchestrator/src/modules/browser`

### 2.2 浏览器模板设计时资产层

负责浏览器模板本身的设计时定义、编译、校验和本地过渡发布接口。

当前逻辑归属位于：

- `apps/backend/capabilities/browser-domain/templates`

它负责：

- 模板 CRUD
- 模板编译
- 模板校验
- 过渡期内的本地 `review / publish / deprecate / revoke`

它不负责：

- 统一的全局发布门禁
- 运行时浏览器执行
- 录制会话本身

### 2.3 注册与发布桥接层

负责把模板目录资产与最终发布链路接起来。

相关逻辑当前主要落在：

- `apps/backend/registry-release/template-registry`
- `apps/backend/registry-release/release-manager`

其中：

- `template-registry` 承接模板目录、命名、标签、发布绑定元数据
- `release-manager` 承接统一 release、build、deploy、publish、rollback 能力

## 3. 当前代码归属

当前推荐按下面的方式理解浏览器模板链路：

```text
apps/backend/capabilities/browser-domain/
├── templates/      # 浏览器模板设计时定义、编译、校验
├── semantics/      # 浏览器语义规则与运行时解析
└── recorder/       # 录制、导出、会话、恢复

apps/backend/registry-release/
├── template-registry/  # 模板目录资产与绑定元数据
└── release-manager/    # 统一发布门禁与 bridge
```

这意味着：

- 浏览器模板不是单独漂浮的一套系统。
- 浏览器录制、模板资产、注册目录和发布门禁已经有了清晰边界。
- 过渡期内个别本地发布接口仍存在，但长期要继续向 `release-manager` 收敛。

## 4. 当前桥接入口

录制导出进入发布链路的关键后端入口是：

- `POST /capabilities/bridge/recorder-export`

当前控制器位于：

- `apps/backend/registry-release/release-manager/src/release/capability-release.controller.ts`

这个桥接接口的作用是：

- 接收 `exportArtifacts`
- 选择或创建目标 `release`
- 生成或补全 `skillDraft`
- 以浏览器录制为来源进入统一的 release / skill draft 链路

这说明当前系统已经不要求用户手工把录制结果再拼接成另一套发布输入，而是支持从录制导出产物直接进入发布桥接。

## 5. 设计时与发布态边界

基于当前代码与文档现态，可以按下面的方式理解边界：

### 5.1 `browser-domain/templates` 负责

- 浏览器模板设计时资产管理
- 模板编译与校验
- 模板结构约束
- 与录制导出结构兼容的模板装配

### 5.2 `template-registry` 负责

- 模板目录记录
- 模板标签、命名、归档状态
- 模板与发布链之间的目录级绑定信息

### 5.3 `release-manager` 负责

- release 建模
- build / deploy / publish / rollback
- bridge recorder export
- skill draft 与已发布 Skill 的统一门禁

### 5.4 不应继续混淆的边界

- 浏览器模板服务不应演化成独立的全局发布中心
- 录制模块不应直接承担最终发布审批职责
- `release-manager` 不应接管浏览器模板的设计时编辑

## 6. 当前功能重点

当前这条链路的稳定重点主要有：

- 录制导出结构化产物
- 浏览器模板设计时定义、编译与校验
- 模板目录与发布绑定信息
- 录制导出到 release / skill draft 的桥接
- 已发布 Skill 的 runtime 消费

这也意味着当前最值得优先阅读和维护的内容，已经从“历史上哪里生成过代码”转向：

- 当前模板资产放在哪里
- 导出产物如何进入桥接
- 发布门禁由谁统一负责

## 7. 建议阅读顺序

如果要理解浏览器模板生成与发布桥接，建议按以下顺序阅读：

1. 本文档：先确认职责边界和主链路。
2. `docs/design/browser-recorder-module-overview.md`
   作用：理解导出产物的来源。
3. `docs/design/v4/Enterprise-Skill-Platform_Project-Description_v4.1.md`
   作用：理解模板、发布和运行时在当前项目结构中的位置。
4. `docs/design/v4/Enterprise-Skill-Platform_Master_v4.0.md`
   作用：理解系统级主链和 `Skill / Release / Execution / Runtime` 的关系。
5. `docs/project_architecture_redesign.md`
   作用：理解目录重塑背景与能力域边界来源。

## 8. 相关代码与设计锚点

- `apps/backend/capabilities/browser-domain/README.md`
- `apps/backend/capabilities/browser-domain/templates/README.md`
- `apps/backend/registry-release/template-registry/README.md`
- `apps/backend/registry-release/release-manager/src/release/capability-release.controller.ts`
- `docs/design/v4/Enterprise-Skill-Platform_Project-Description_v4.1.md`
- `docs/project_architecture_redesign.md`
