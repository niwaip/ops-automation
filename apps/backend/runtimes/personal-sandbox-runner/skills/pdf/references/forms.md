# Scenario: Interactive AcroForm PDF Form Filling

适用于：用户提供需填写的政府/企业/银行等具有交互式输入字段的 PDF 表单。

## 完整执行命令流程 (调用 bash 静默执行)：

```bash
# 步骤 1: 检查 PDF 是否包含交互式表单字段
python /opt/dsh/skills/pdf/scripts/check_fillable_fields.py /workspace/input_form.pdf

# 步骤 2: 提取表单字段元数据 (生成 field_info.json)
python /opt/dsh/skills/pdf/scripts/extract_form_field_info.py /workspace/input_form.pdf /workspace/field_info.json

# 步骤 3: 根据用户提供的信息构造待填充值映射文件 /workspace/field_values.json，格式示例:
# [
#   {"field_id": "company_name", "value": "智能科技有限公司"},
#   {"field_id": "is_general_taxpayer", "value": "/Yes"}
# ]

# 步骤 4: 执行表单填报并校验生成终态文件
python /opt/dsh/skills/pdf/scripts/fill_fillable_fields.py /workspace/input_form.pdf /workspace/field_values.json /workspace/filled_form.pdf
```
