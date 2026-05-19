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

# 1. Remove states
content = re.sub(r'  const \[applyDraftConfirmVisible, setApplyDraftConfirmVisible\] = useState\(false\);\n', '', content)
content = re.sub(r'  const \[aiDraftSessionId, setAiDraftSessionId\] = useState<string \| null>\(null\);\n', '', content)
content = re.sub(r'  const \[aiDraftMessages, setAiDraftMessages\] = useState<AiWorkflowDraftSessionMessage\[\]>\(\[\]\);\n', '', content)
content = re.sub(r'  const \[aiDraftInput, setAiDraftInput\] = useState\(\'\'\);\n', '', content)
content = re.sub(r'  const \[currentAiDraft, setCurrentAiDraft\] = useState<AiWorkflowDraft \| null>\(null\);\n', '', content)
content = re.sub(r'  const \[aiDraftDescription, setAiDraftDescription\] = useState\(\'\'\);\n', '', content)
content = re.sub(r'  const \[aiDraftReferenceUrl, setAiDraftReferenceUrl\] = useState\(\'\'\);\n', '', content)

# 2. Remove queries
content = replace_block(content, r'  const aiDraftSessionsQuery = useQuery\(', r'    \{ enabled: aiDraftDrawerVisible \},\n  \);\n')

# 3. Remove methods
content = replace_block(content, r'  const syncAiDraftSessionState = \(session: AiWorkflowDraftSession\) => \{', r'  const handleDeleteAiDraftSession = \(sessionId: string\) => \{\n    deleteAiDraftSessionMutation\.mutate\(sessionId\);\n  \};\n')

content = replace_block(content, r'  const generateAiDraftMutation = useMutation\(', r'  const refineAiDraftMutation = useMutation\([\s\S]*?    \},\n  \);\n')

content = replace_block(content, r'  const handleGenerateAiDraft = \(\) => \{', r'  const handleConfirmApplyCurrentDraft = async \(\) => \{[\s\S]*?    setAiDraftDrawerVisible\(false\);\n  \};\n')

# 4. Remove render methods
content = replace_block(content, r'  const renderDraftInputParamSummary = \(draft: AiWorkflowDraft\) => \{', r'  const currentDraftApplyDiff = useMemo\(\n    \(\) => \(currentAiDraft \? buildDraftDiffSummary\(currentAiDraft, previousDraftForCurrent\) : null\),\n    \[currentAiDraft, previousDraftForCurrent\],\n  \);\n')

# 5. Remove JSX and Modals
content = replace_block(content, r'      <Drawer\n        title=\{<Space><RobotOutlined /><span>AI 辅助工作流编排</span></Space>\}', r'      </Drawer>\n', '      <AiDraftDrawer\n        visible={aiDraftDrawerVisible}\n        onClose={() => setAiDraftDrawerVisible(false)}\n        onApplyDraft={(draft) => {\n          applyDraftToEditor(draft, \'已应用 AI 生成的工作流草稿\');\n          setAiDraftDrawerVisible(false);\n        }}\n      />\n')

content = replace_block(content, r'      <Modal\n        title="应用草稿前确认"\n        open=\{applyDraftConfirmVisible\}', r'      </Modal>\n')

# 6. Add Import
if 'AiDraftDrawer' not in content:
    content = content.replace("import { TemporalPageProps } from './TemporalPage.types';", "import { TemporalPageProps } from './TemporalPage.types';\nimport { AiDraftDrawer } from '../components/AiDraftDrawer';")

with open('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
