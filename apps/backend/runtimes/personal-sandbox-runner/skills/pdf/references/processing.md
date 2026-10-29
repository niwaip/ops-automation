# 现有 PDF 的阅读与处理

阅读或提取优先使用已有 `read_file` / `inspect_image`；已提取文本足够时直接回答。需要更准确的结构时可执行只读工具，不因阅读任务生成额外 Markdown 报告。

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader('/workspace/input.pdf')
print('pages:', len(reader.pages))
for page in reader.pages:
    print(page.extract_text() or '')

# 明确要求拆分时：只写新文件，保留输入。
writer = PdfWriter()
writer.add_page(reader.pages[0])
with open('/workspace/first-page.pdf', 'wb') as output:
    writer.write(output)
```

表格可用 `pdfplumber`；纯扫描件需要 OCR，不把空的文本提取结果解释为原文件无内容。
旋转、合并或拆分不需要重新套用文档设计模板。表单填写走 `forms.md`，不要将原表单重排为普通报告。
