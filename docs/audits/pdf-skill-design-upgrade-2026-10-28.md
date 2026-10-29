# PDF skill 设计与渲染升级验证

## 实现范围

本次更新通用 PDF 生成能力，未修改此前生成的竞选 PDF，未安装或接入 MCP。

- 保留原 `generate_report_pdf.py` 命令入口及旧参数；内部改为 Markdown/JSON → 本地 HTML/CSS → WeasyPrint 68.1。
- 新模块按内容解析、设计参数、模板渲染和质量检查分离，替换原 681 行 FPDF 绘制脚本，未向 agent loop 大文件增加编排逻辑。
- 新版式：`report`、`handout`、`editorial`、`mobile`；配色保留 blue/emerald/slate/burgundy，增加 warm、自定义强调色和显式封面选项。
- 镜像提供 Noto Sans/Serif CJK SC 的真实 Regular/Bold 与 DejaVu Sans Mono；由渲染器嵌入字体。无在线字体依赖。
- 本地资源加载仅允许输入目录、skill 资产目录及 data URI；错误和缺失资源会阻止发布。
- 自动检查解析、页数范围、两种提取器的内容覆盖、字体嵌入和页面边界，然后生成逐页 PNG。失败不覆盖已有 PDF。
- 中间文件和质量报告写入 `.pdf-preview/<文件名>/`；输入源文件保留。
- skill 要求模型查看最终 PNG；程序报告的 `valid` 不等于视觉审核或语义正确性证明。
- 阅读、表单、合并和拆分保持独立处理路径；Word 保留版面转换改为指引使用镜像中已有的 LibreOffice Writer。

主要文件：

- [skill 入口](../../apps/backend/runtimes/personal-sandbox-runner/skills/pdf/SKILL.md)
- [使用参数](../../apps/backend/runtimes/personal-sandbox-runner/skills/pdf/references/report_pdf.md)
- [设计参数与参考来源](../../apps/backend/runtimes/personal-sandbox-runner/skills/pdf/references/design.md)
- [渲染模块](../../apps/backend/runtimes/personal-sandbox-runner/skills/pdf/scripts/pdf_design/renderer.py)
- [集成测试](../../apps/backend/runtimes/personal-sandbox-runner/tests/test_pdf_design.py)

## 验证

共 35 项测试通过：

| 测试集 | 数量 | 重点 |
| --- | ---: | --- |
| 新 PDF 集成测试 | 9 | 真正生成 PDF；中文和粗体、可点击链接、跨页重复表头、最后一行、本地图片、手机尺寸、越界、损坏文件、失败保留原件、离线资源边界 |
| 原交付回归 | 7 | 旧编译入口、PDF 附件发现、临时 Markdown 过滤等 |
| 技能与路由回归 | 19 | 技能发现、分层加载、Word/表单路径及其它既有路由 |

集成测试使用容器默认 `sandbox` 用户运行。还运行了镜像内已打包代码版本的测试，最终镜像构建阶段执行中文 PDF 往返自检。
通用 skill 校验器不认识项目既有的 `deliverables/triggers/zh_name/default_rounds` 等扩展字段，故在临时副本校验通用部分，保留实际路由字段；项目原生发现/加载回归全部通过。

四种样例使用同一通用自然观察材料，不涉及具体个人材料。最终镜像内代码、模板和样例可以独立运行，不依赖仓库源码挂载。
逐页打开了全部 11 页 PNG，未见明显缺字、遮挡或裁切。最终重新生成后四份 PDF 的 SHA-256 与已检查版本完全一致。

| 版式 | 页数 | 字节 | 渲染＋检查＋PNG，最后一次 |
| --- | ---: | ---: | ---: |
| report | 2 | 279,645 | 409.14 ms |
| handout | 2 | 279,708 | 355.01 ms |
| editorial，含显式封面 | 3 | 451,102 | 503.46 ms |
| mobile | 4 | 280,770 | 324.67 ms |

时间为渲染函数内部累计时间，Python 模块已加载，不包括 Python 启动、Docker 调度、模型生成和端到端用户等待；没有据此承诺实际任务必定在一秒内完成。

[样例与证据目录](../artifacts/reviews/pdf-design-runtime-20261028/)包含四份 PDF、逐页预览、质量报告、结构化耗时、视觉检查记录和测试日志。

## 运行环境

使用仓库统一入口构建镜像：

```bash
./docker/start-smart.sh dev --profile sandbox-build build user-sandbox-image
./docker/start-smart.sh dev up -d --no-deps session-broker
```

构建时官方包索引先后返回截断的 JSON 和 wheel，包哈希校验阻止了不完整依赖安装。
Dockerfile 增加可覆盖的 `PIP_INDEX_URL` 构建参数，默认仍为 PyPI；本地验证构建使用公开镜像索引参数，继续固定版本并保留哈希校验。
任务运行时不安装依赖。

broker 已重启且启动日志正常。仓库、镜像标签与 broker 的 `USER_SANDBOX_REQUIREMENTS_SHA256` 均为：

`30fc044c63f28f175af9ff7791fb738a2ee60a76b2fe758a6447f6f33bfe04ad`

`PROJECT_ROOT` 与当前仓库根目录一致；Compose 挂载继续使用 `${PROJECT_ROOT}`。
更新前确认没有运行中的用户沙箱，未强制停止用户任务。后续沙箱创建/旧沙箱替换继续走原有镜像校验流程。

样例目录保持当前用户所有、0755 权限。自动审批曾拒绝 `chmod 777`，已改用当前宿主用户的非 root 身份写入样例，没有放宽目录权限；运行时与测试仍验证了实际 sandbox 用户。

## 边界

- 本次自动检查在标准生成器与 `check_pdf.py` 中执行，没有新增对所有第三方 PDF 的全局强制交付门禁。
- 自动内容覆盖检查是字符覆盖与解析检查，不能证明语义正确，也不能捕获所有页面内遮挡；因此保留逐页视觉复核。
- Typst 为后续独立评估路线，本次没有增加第二套排版引擎。
