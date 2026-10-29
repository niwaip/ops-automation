# Word 转 PDF：保留原版面

已有 Word 文档转换默认使用镜像中的 LibreOffice Writer，保留标题、表格、分页和页眉页脚。不要只提取段落后用 FPDF 重排，也不要截断表格内容。

```bash
mkdir -p /workspace/.pdf-convert
libreoffice -env:UserInstallation=file:///tmp/pdf-writer-profile \
  --headless --convert-to pdf --outdir /workspace/.pdf-convert /workspace/input.docx
```

为并发转换选择独立临时 profile 目录，避免占用其它任务的 LibreOffice profile。输出按用户所需名称放到 `/workspace/`，保留原始 `.docx`。

转换后检查最终 PDF 并查看每页预览：

```bash
python3 /opt/dsh/skills/pdf/scripts/check_pdf.py /workspace/.pdf-convert/input.pdf \
  --preview-dir /workspace/.pdf-preview/input
```

原字体缺失时会发生字体替换；确认关键分页、表格、中文和页眉页脚后再交付。
用户明确要求重新设计时，才将内容转换为 Markdown/JSON 并使用报告模板；说明这是重排，不保证原 Word 版面一致。
