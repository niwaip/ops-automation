import re
import sys

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

content = replace_block(content, r'interface RealValidationState \{', r'  inputParams: Record<string, string>; // 用户输入的参数值\n\}\n\n')
content = replace_block(content, r'type RealValidationAction =', r'  \| \{ type: \'CLOSE\' \};\n\n')
content = replace_block(content, r'const initialRealValidationState: RealValidationState = \{', r'  inputParams: \{\},\n\};\n\n')
content = replace_block(content, r'const realValidationReducer = \(state: RealValidationState, action: RealValidationAction\): RealValidationState => \{', r'    default:\n      return state;\n  \}\n\};\n\n')

content = re.sub(r'  const \[realValidationState, dispatchRealValidation\] = useReducer\(realValidationReducer, initialRealValidationState\);\n', r'  const [realValidationModalVisible, setRealValidationModalVisible] = useState(false);\n  const [realValidationInitialInputParams, setRealValidationInitialInputParams] = useState<Record<string, string>>({});\n', content)
content = re.sub(r'  const \[realValidationInputParams, setRealValidationInputParams\] = useState<Record<string, string>>\(\{\}\); // 真实验证时的输入参数\n', '', content)
content = re.sub(r'  const appendRealValidationLog = \(content: string\) => dispatchRealValidation\(\{ type: \'APPEND_LOG\', payload: content \}\);\n', '', content)

content = replace_block(content, r'  const handleOpenRealValidation = \(\) => \{', r'    \} catch \(error: any\) \{\n      dispatchRealValidation\(\{\n        type: \'SET_RESULT\',\n        payload: \{ success: false, logs: \[\], error: error\.message \|\| \'Stream error\', score: 0 \},\n      \}\);\n    \}\n  \};\n', r'''  const handleOpenRealValidation = () => {
    if (!generatedCode) { message.warning('请先生成代码'); return; }
    setRealValidationInitialInputParams(collectWorkflowInputParams());
    setRealValidationModalVisible(true);
  };
''')

content = replace_block(content, r'  const realValidationRawResult = useMemo\(', r'  const realValidationLeafPaths = useMemo\(\n    \(\) => collectLeafPaths\(realValidationRawResult\),\n    \[realValidationRawResult\],\n  \);\n\n')

content = replace_block(content, r'  const realValidationModalFooter = \[', r'    </Button>,\n  \];\n\n')

with open('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
