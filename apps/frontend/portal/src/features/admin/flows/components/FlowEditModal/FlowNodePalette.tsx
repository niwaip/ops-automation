import { Space, Button, Dropdown, Segmented, Tooltip, theme } from 'antd';
import {
  ApiOutlined,
  CodeOutlined,
  ToolOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  ApartmentOutlined,
  UnorderedListOutlined,
  CodeFilled,
} from '@ant-design/icons';
import { StepType, ExecutionFlowStep } from '@/api/flows';
import { DEFAULT_STEP_TEMPLATES, renderStepTypeBadge } from '../flowHelpers';
import { EditorViewMode } from './flowEditorTypes';

interface FlowNodePaletteProps {
  onAddStep: (type: StepType, templateKey?: string) => void;
  viewMode: EditorViewMode;
  onViewModeChange: (mode: EditorViewMode) => void;
  stepsCount: number;
}

const STEP_PRESETS: { type: StepType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: 'api', label: 'API 接口', icon: <ApiOutlined />, color: '#1677ff' },
  { type: 'script', label: 'Python 脚本', icon: <CodeOutlined />, color: '#52c41a' },
  { type: 'tool', label: '系统工具', icon: <ToolOutlined />, color: '#722ed1' },
  { type: 'llm', label: 'AI/LLM 节点', icon: <ThunderboltOutlined />, color: '#13c2c2' },
  { type: 'validator', label: '数据校验器', icon: <CheckCircleOutlined />, color: '#fa8c16' },
  { type: 'text', label: '文本指导', icon: <FileTextOutlined />, color: '#8c8c8c' },
];

export const FlowNodePalette: React.FC<FlowNodePaletteProps> = ({
  onAddStep,
  viewMode,
  onViewModeChange,
  stepsCount,
}) => {
  const { token } = theme.useToken();
  const presetMenuItems = Object.entries(DEFAULT_STEP_TEMPLATES).map(([key, step]: [string, ExecutionFlowStep]) => ({
    key,
    icon: renderStepTypeBadge(step.type),
    label: (
      <div>
        <div style={{ fontWeight: 500 }}>{step.name}</div>
        <div style={{ fontSize: 12, color: token.colorTextTertiary }}>
          {step.content || (step.api ? `${step.api.method} ${step.api.endpoint}` : '预设流程环节')}
        </div>
      </div>
    ),
    onClick: () => onAddStep(step.type as StepType, key),
  }));

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        zIndex: 5,
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <Space wrap size={8}>
        <span style={{ fontSize: 13, fontWeight: 600, color: token.colorText, marginRight: 4 }}>
          快捷加节点:
        </span>
        {STEP_PRESETS.map((item) => (
          <Button
            key={item.type}
            size="small"
            icon={item.icon}
            onClick={() => onAddStep(item.type)}
            style={{
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {item.label}
          </Button>
        ))}

        <Dropdown menu={{ items: presetMenuItems }} placement="bottomLeft">
          <Button size="small" icon={<OrderedListOutlined />} style={{ borderRadius: 6, fontSize: 12 }}>
            常用预设模板
          </Button>
        </Dropdown>
      </Space>

      <Space size={12}>
        <Tooltip title="当前流包含的节点数量">
          <span style={{ fontSize: 12, color: 'var(--text-light, #8c8c8c)' }}>
            步骤节点：<b>{stepsCount}</b> 个
          </span>
        </Tooltip>

        <Segmented
          size="small"
          value={viewMode}
          onChange={(val) => onViewModeChange(val as EditorViewMode)}
          options={[
            {
              value: 'graph',
              label: '拓扑节点图',
              icon: <ApartmentOutlined />,
            },
            {
              value: 'list',
              label: '步骤列表',
              icon: <UnorderedListOutlined />,
            },
            {
              value: 'json',
              label: 'JSON 规范',
              icon: <CodeFilled />,
            },
          ]}
        />
      </Space>
    </div>
  );
};
