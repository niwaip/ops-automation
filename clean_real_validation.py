import re
import sys

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

with open('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove interfaces and initial state and reducer
content = replace_block(content, r'export interface RealValidationState \{', r'    default:\n      return state;\n  \}\n\};\n\n')

# 2. Remove normalizeValidationInputValue, unwrapValidationResultPayload, extractObjectLeafPaths
content = replace_block(content, r'const normalizeValidationInputValue = \(val: any\): string => \{', r'  return paths;\n\};\n\n')

# 3. Remove RealValidationState related states
content = re.sub(r'  const \[realValidationState, dispatchRealValidation\] = useReducer\(realValidationReducer, initialRealValidationState\);\n', r'  const [realValidationModalVisible, setRealValidationModalVisible] = useState(false);\n  const [realValidationInitialInputParams, setRealValidationInitialInputParams] = useState<Record<string, string>>({});\n', content)
content = re.sub(r'  const \[realValidationInputParams, setRealValidationInputParams\] = useState<Record<string, string>>\(\{\}\); // 真实验证时的输入参数\n', '', content)

# 4. Remove appendRealValidationLog
content = re.sub(r'  const appendRealValidationLog = \(content: string\) => dispatchRealValidation\(\{ type: \'APPEND_LOG\', payload: content \}\);\n', '', content)

# 5. Remove handleOpenRealValidation and handleRealValidation
content = replace_block(content, r'  const handleOpenRealValidation = \(\) => \{', r'              \}, \n            \}\);\n          \}\n        \}\n      \);\n    \} catch \(error: any\) \{\n      dispatchRealValidation\(\{\n        type: \'SET_RESULT\',\n        payload: \{ success: false, logs: \[\], error: error\.message \|\| \'Stream error\', score: 0 \},\n      \}\);\n    \}\n  \};\n', r'''  const handleOpenRealValidation = () => {
    if (!generatedCode) { message.warning('请先生成代码'); return; }
    setRealValidationInitialInputParams(collectWorkflowInputParams());
    setRealValidationModalVisible(true);
  };
''')

# 6. Remove realValidationRawResult and realValidationLeafPaths
content = replace_block(content, r'  const realValidationRawResult = useMemo\(', r'  const realValidationLeafPaths = useMemo\(\n    \(\) => extractObjectLeafPaths\(realValidationRawResult\),\n    \[realValidationRawResult\],\n  \);\n')

# 7. Remove realValidationModalFooter
content = replace_block(content, r'  const realValidationModalFooter = \[', r'    </Button>,\n  \];\n')

# 8. Replace Modal
replacement_jsx = r'''      <RealValidationModal
        visible={realValidationModalVisible}
        onClose={() => setRealValidationModalVisible(false)}
        generatedCode={generatedCode}
        workflowClassName={workflowDsl.workflowClassName?.trim() || (workflowDsl.name.replace(/\s+/g, '') + 'Workflow')}
        taskQueue={workflowDsl.taskQueue}
        initialInputParams={realValidationInitialInputParams}
        hasHttpRequest={workflowDsl.steps.some((step) => isHttpRequestActivity(resolveStepActivity(step), step))}
        onApplySuggestedResponsePath={applySuggestedResponsePath}
      />
'''
content = replace_block(content, r'      <Modal title="真实验证结果" open=\{realValidationState.visible\}', r'        </Space>\n      </Modal>\n', replacement_jsx)

# 9. Add Import
if 'RealValidationModal' not in content:
    content = content.replace("import { AiDraftDrawer } from '../components/AiDraftDrawer';", "import { AiDraftDrawer } from '../components/AiDraftDrawer';\nimport { RealValidationModal } from '../components/RealValidationModal';")

with open('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
