import re
import sys

with open('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix unused Drawer
content = content.replace(', Segmented, Drawer, Tabs, Checkbox', ', Segmented, Tabs, Checkbox')

# Fix unused SendOutlined
content = content.replace(', InfoCircleOutlined, SendOutlined', ', InfoCircleOutlined')

# Fix unused ReactMarkdown and remarkGfm
content = content.replace("import ReactMarkdown from 'react-markdown';\n", "")
content = content.replace("import remarkGfm from 'remark-gfm';\n", "")

# Fix unused types in temporalWorkflowApi import
content = content.replace(" HttpRequestPreviewResult, AiWorkflowDraft, AiWorkflowDraftSession, AiWorkflowDraftSessionListItem, AiWorkflowDraftSessionMessage, BrowserDraftCommandInput, WorkflowInputParamDefinition", " HttpRequestPreviewResult, BrowserDraftCommandInput, WorkflowInputParamDefinition")

# Fix unused beautifyText
content = content.replace("beautifyText, truncateText,", "truncateText,")

# Add AiDraftDrawer import
content = content.replace("import type { ColumnsType } from 'antd/es/table';", "import type { ColumnsType } from 'antd/es/table';\nimport { AiDraftDrawer } from '../components/AiDraftDrawer';")

# Fix setAiDraft... in openAiDraftModal
content = re.sub(
    r'  const openAiDraftModal = \(\) => \{\n[\s\S]*?    setAiDraftDrawerVisible\(true\);\n  \};',
    r'  const openAiDraftModal = () => {\n    setAiDraftDrawerVisible(true);\n  };',
    content
)

with open('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
