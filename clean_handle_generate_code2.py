import re

with open('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

def replace_block(content, start_pattern, end_pattern, replacement=''):
    start_match = re.search(start_pattern, content)
    if not start_match:
        print(f"Start pattern not found: {start_pattern}")
        return content
    start_idx = start_match.start()
    end_match = re.search(end_pattern, content[start_idx:])
    if not end_match:
        print(f"End pattern not found: {end_pattern}")
        return content
    end_idx = start_idx + end_match.end()
    print(f"Replacing block from {start_idx} to {end_idx}")
    return content[:start_idx] + replacement + content[end_idx:]

content = replace_block(content, r'  const handleGenerateCode = async \(errorContext\?: string\) => \{', r'    \} catch \(error: any\) \{\n      appendCodeGenerationLog\(`错误: \$\{error\.message \|\| \'Unknown error\'\}`\);\n      dispatchCodeGeneration\(\{\n        type: \'SET_RESULT\',\n        payload: \{\n          success: false,\n          error: error\.message \|\| \'Unknown error\',\n        \},\n      \}\);\n      message\.error\(\'代码生成失败: \' \+ \(error\.message \|\| \'Unknown error\'\)\);\n    \}\n  \};\n', r'''  const handleGenerateCode = (errorContext?: string) => {
    const formValues = form.getFieldsValue();
    const workflowName = formValues.name || workflowDsl.name;
    if (!workflowName) { message.warning('请先填写工作流名称'); return; }
    if (workflowDsl.steps.length === 0) { message.warning('请先添加至少一个步骤'); return; }
    
    setCodeGenerationErrorContext(errorContext);
    setCodeGenerationModalVisible(true);
  };
''')

with open('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
