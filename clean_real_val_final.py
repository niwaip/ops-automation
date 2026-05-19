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
    return content[:start_idx] + replacement + content[end_idx:]

# Remove unused states and memos
content = replace_block(content, r'  const realValidationRawResult = useMemo\(', r'  const realValidationLeafPaths = useMemo\([\s\S]*?\[realValidationLeafSource\],\n  \);\n')
content = replace_block(content, r'  const realValidationModalFooter = realValidationState\.result', r'    <Button key="close" onClick=\{\(\) => dispatchRealValidation\(\{ type: \'CLOSE\' \}\)\}>关闭</Button>,\n  \] : null;\n')

# Remove the error context building in handleRegenerateCode, wait, handleRegenerateCode is still there, but we will accept errorContext as an argument
content = re.sub(
    r'  const handleRegenerateCode = \(\) => \{\n[\s\S]*?    if \(errorContext\) \{\n      setForceAiGeneration\(true\);\n      handleGenerateCode\(errorContext\);\n      return;\n    \}[\s\S]*?    handleGenerateCode\(\);\n  \};\n',
    r'  const handleRegenerateCode = (errorContext?: string) => {\n    if (errorContext) {\n      setForceAiGeneration(true);\n      handleGenerateCode(errorContext);\n      return;\n    }\n    Modal.confirm({\n      title: \'重新生成代码\',\n      content: \'重新生成将覆盖当前已生成的代码，并耗费一定的 API 额度，是否继续？\',\n      onOk: () => {\n        setForceAiGeneration(true);\n        handleGenerateCode();\n      },\n    });\n  };\n',
    content
)

# Update RealValidationModal in JSX
content = re.sub(
    r'<RealValidationModal[\s\S]*?/>',
    r'''<RealValidationModal
        visible={realValidationModalVisible}
        onClose={() => setRealValidationModalVisible(false)}
        generatedCode={generatedCode}
        workflowClassName={workflowDsl.workflowClassName?.trim() || (workflowDsl.name.replace(/\s+/g, '') + 'Workflow')}
        taskQueue={workflowDsl.taskQueue}
        initialInputParams={realValidationInitialInputParams}
        hasHttpRequest={workflowDsl.steps.some((step) => isHttpRequestActivity(resolveStepActivity(step), step))}
        onApplySuggestedResponsePath={applySuggestedResponsePath}
        onRegenerateCode={(errorContext) => {
          setRealValidationModalVisible(false);
          handleRegenerateCode(errorContext);
        }}
      />''',
    content
)

with open('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
