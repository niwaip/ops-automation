# runtime-facade

文档能力域中的 `runtime-facade` 子层承接面向执行链路的稳定运行时入口语义。

## 当前归属

- 对齐当前 `document-engine` 暴露给执行链路的正式渲染入口。
- 作为未来 `document-domain -> execution-control / runtimes` 的稳定域桥接层。

## 当前约束

- 面向执行链路的私有入口统一放在 `/internal/document/*`，并由 Built-in Skill
  `handlerKey` 映射调用，不作为任意文件系统访问接口。
- 新的文档域运行时桥接约定应优先收敛到该子层语义下。

## PDF 原子能力

`pdf-operations/` 提供三个默认内置能力，均通过受控 Base64 输入和统一
`ArtifactRef` 输出，不接受任意本地路径：

- `platform.document.pdf-merge`：按顺序合并 2-10 个 PDF，单文件最大 10MB、
  合计最大 30MB、输出最多 200 页。
- `platform.document.pdf-split`：全量拆页或按 `1,3,5-7` 抽页，单次最多生成
  50 个单页 PDF Artifact。
- `platform.document.pdf-create`：从标题、段落、标题层级、列表、表格和代码块
  生成基础 PDF；默认带页码，CJK 内容使用运行时 Noto/PingFang/Hiragino/微软雅黑字体。

三个能力都要求幂等键；产物以原子写入方式保存，并在 metadata 中记录 SHA-256、
操作类型和页数。相同幂等键只能复用相同请求，不同请求会返回冲突错误。
开发栈的 `carbone-engine` 使用 `docker/carbone-engine/Dockerfile` 构建，镜像内置
`fonts-noto-cjk`，以保证中文生成结果在容器环境中可复现。

能力包位于仓库根目录 `builtin-skills/platform.document.pdf-{merge,split,create}`。
和其他 Built-in Skill 一样，新环境需通过标准 provision 命令完成真实处理器冒烟，
再通过 activate 命令激活 `1.0.0`；不会在应用启动时隐式写注册表。
