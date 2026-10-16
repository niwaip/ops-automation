# 第二批工程问题修复确认

时间：2026-10-13 21:22–21:23，Asia/Shanghai。账号admin，个人助理模式。

**上一批两项工程问题已确认修复生效。** 验证包括真实个人沙箱中的原失败输入、浏览器请求与下载，以及6项交付物回归测试。未修改业务代码。

| 验证 | 实际结果 | 判定 |
|---|---|---|
| 原B2-02完整请求的文件名提取 | 实际沙箱resolve_markdown_filename返回B2_交接清单_v2.md，不再吞入“生成可下载” | PASS |
| 浏览器实际Markdown交付 | 新会话请求使用相同的无空格指令前缀，页面仅1个正确下载链接；成功下载FIX_B2_交接清单_v2.md，2829字节、UTF-8可读 | PASS |
| PDF脚本--help | 实际/opt/dsh/skills/pdf/scripts/convert_pdf_to_images.py退出码0，stderr为空 | PASS |
| PDF转换至不存在目录 | 执行前目录不存在；自动创建目录，转换原B2_办公资料说明.pdf；退出码0、stderr为空 | PASS |
| 实际PNG产物 | page_1.png，112977字节，转换日志尺寸707×1000 | PASS |
| 交付物回归 | test_composite_deliverables.py：6/6通过 | PASS |

运行版本核对：实际沙箱文件哈希与仓库源码相同：

- deliverable_contract.py：a6288faec62cd64d980059d8559d6aea2f7482d8f9856eee8efe9ce001555dbd
- convert_pdf_to_images.py：6304d597e60737bb323c8edd4459c8c99a8ed2c44fb2a93f3c190ef0b1a04826

Docker操作通过仓库根目录start-smart.sh执行。验证脚本第一次因缺少Python模块搜索路径失败，修正sys.path后重新执行成功；这是验证脚本问题，不计为产品故障。

PDF预览产物位于实际用户沙箱/workspace/.dsh/validation/batch2-fix-20261013-preview/。Markdown下载文件位于personal-office-batch2-files/FIX_B2_交接清单_v2.md，浏览器SSE保存在personal-office-batch2-fix-stream.txt。

归因边界：两项均为工程层确定性修复，已用原失败输入与实际运行版本确认。没有用模型是否选择预览工具作为验证前提，也没有评价生成内容质量。本轮结论只覆盖上述修复范围。
