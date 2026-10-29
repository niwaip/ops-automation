# PPT运行环境、格式契约与工具状态修复验证

修复并部署完成，日期：2026-10-28（北京时间）。

- 镜像全局预装办公依赖；非root构建/启动检查忽略用户site-packages，执行PPTX写入和重读。
- 统一入口计算依赖清单SHA256，构建写入标签，Broker校验标签、指纹和实际镜像ID。
- 已停止旧沙箱自动迁移；运行或暂停的旧沙箱返回明确更新提示，不强制中断。
- 原始PPTX等目标格式独立于模型/技能准入保留；明确HTML和后续格式切换仍支持。HTML外发不能通过缺失PPTX的门禁。
- bash执行职责下沉至shell_tools.py，使用pipefail并返回结构化退出码；Markdown写入失败不再标为success。
- 预装办公依赖缺失时提示修复镜像，停止引导反复pip安装。

## 已完成验证

- Python相关回归：90项通过。
- Session Broker镜像/生命周期回归：5项通过，包括过期指纹拒绝、同镜像复用、停止旧镜像迁移、运行任务保护。
- 实际用户沙箱回归：71项通过，属于上述Python用例的子集，不重复计入独立用例总数。
- 实际UID=1001，python-pptx=1.0.2，路径为/usr/local/lib/python3.11/dist-packages/pptx/__init__.py。
- 实际沙箱使用临时目录生成并重读4页PPTX，ZIP检查通过；临时测试文件已清理。
- 新源码指纹与实际容器挂载源码一致。
- 原始竞选班干部.pptx、竞选班干部.html和工数实绩明细Excel哈希前后相同。
- Session Broker已通过统一入口重新创建并完成启动编译，正式launch接口完成旧沙箱迁移。
- git diff --check及两个shell入口bash -n通过。

镜像：`sha256:4c2d0fca817688317935986a3ff23a4cd888f40fe8b7f45ea8e63a65d78334a8`。

验证采用真实沙箱、模拟模型响应及已知任务契约，没有再次发送付费模型请求；未承诺后续模型生成耗时。
首次下载依赖文件不完整被哈希校验拦截，重新下载后构建成功，全程未跳过完整性校验。

## 证据

runtime-verification.json、runtime-regression.log、runtime-verification.py、image-verification.json、
launch-result.json、preserved-files-before.json、preserved-files-after.json、host-python-regression.log、image-build.log。
