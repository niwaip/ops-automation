import { Tag, Tooltip, Dropdown, Button, theme } from 'antd';
import {
  ApiOutlined,
  CodeOutlined,
  ToolOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  MoreOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CopyOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { ExecutionFlowStep } from '@/api/flows';

interface FlowNodeCardProps {
  step: ExecutionFlowStep;
  index: number;
  totalSteps: number;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (direction: 'prev' | 'next') => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const STEP_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  api: { label: 'API 接口', color: '#1677ff', bg: 'rgba(22, 119, 255, 0.15)', icon: <ApiOutlined /> },
  script: { label: '脚本', color: '#52c41a', bg: 'rgba(82, 196, 26, 0.15)', icon: <CodeOutlined /> },
  tool: { label: '工具', color: '#722ed1', bg: 'rgba(114, 46, 209, 0.15)', icon: <ToolOutlined /> },
  llm: { label: 'AI/LLM', color: '#13c2c2', bg: 'rgba(19, 194, 194, 0.15)', icon: <ThunderboltOutlined /> },
  validator: { label: '校验器', color: '#fa8c16', bg: 'rgba(250, 140, 22, 0.15)', icon: <CheckCircleOutlined /> },
  text: { label: '文本指导', color: '#8c8c8c', bg: 'rgba(140, 140, 140, 0.15)', icon: <FileTextOutlined /> },
};

export const FlowNodeCard: React.FC<FlowNodeCardProps> = ({
  step,
  index,
  totalSteps,
  isSelected,
  onSelect,
  onMove,
  onDuplicate,
  onDelete,
}) => {
  const { token } = theme.useToken();
  const typeConfig = STEP_TYPE_CONFIG[step.type] || {
    label: step.type,
    color: '#8c8c8c',
    bg: 'rgba(140, 140, 140, 0.15)',
    icon: <ToolOutlined />,
  };

  const menuItems = [
    {
      key: 'move-prev',
      icon: <ArrowLeftOutlined />,
      label: '前移一位',
      disabled: index === 0,
      onClick: (e: any) => {
        e.domEvent.stopPropagation();
        onMove('prev');
      },
    },
    {
      key: 'move-next',
      icon: <ArrowRightOutlined />,
      label: '后移一位',
      disabled: index === totalSteps - 1,
      onClick: (e: any) => {
        e.domEvent.stopPropagation();
        onMove('next');
      },
    },
    {
      key: 'duplicate',
      icon: <CopyOutlined />,
      label: '复制副本',
      onClick: (e: any) => {
        e.domEvent.stopPropagation();
        onDuplicate();
      },
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      danger: true,
      label: '删除此节点',
      onClick: (e: any) => {
        e.domEvent.stopPropagation();
        onDelete();
      },
    },
  ];

  // 计算节点摘要
  let summaryText = '';
  if (step.type === 'api' && step.api) {
    summaryText = `${step.api.method || 'GET'} ${step.api.endpoint || ''}`;
  } else if (step.type === 'script' && step.script) {
    summaryText = `${step.script.language || 'code'}: ${(step.script.code || '').slice(0, 32)}...`;
  } else if (step.type === 'tool' && step.tool) {
    summaryText = `工具: ${step.tool.name || '未命名'}`;
  } else if (step.content) {
    summaryText = step.content.slice(0, 35);
  } else if (step.expectedOutput) {
    summaryText = `输出: ${step.expectedOutput.slice(0, 30)}`;
  } else {
    summaryText = '待配置详细参数';
  }

  return (
    <div
      onClick={onSelect}
      style={{
        width: 230,
        borderRadius: 12,
        background: token.colorBgContainer,
        border: isSelected ? '2px solid #1677ff' : `1px solid ${token.colorBorder}`,
        boxShadow: isSelected
          ? '0 0 0 3px rgba(22, 119, 255, 0.22), 0 8px 20px rgba(0, 0, 0, 0.15)'
          : '0 2px 8px rgba(0, 0, 0, 0.06)',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        position: 'relative',
        userSelect: 'none',
        transform: isSelected ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* 顶部彩色装饰条与类型 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          background: typeConfig.bg,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 4,
              background: typeConfig.color,
              color: '#ffffff',
            }}
          >
            #{String(index + 1).padStart(2, '0')}
          </span>
          <span style={{ fontSize: 13, color: typeConfig.color, display: 'flex', alignItems: 'center', gap: 4 }}>
            {typeConfig.icon}
            <span style={{ fontWeight: 600, fontSize: 12 }}>{typeConfig.label}</span>
          </span>
        </div>

        <Dropdown menu={{ items: menuItems }} trigger={['click']}>
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            onClick={(e) => e.stopPropagation()}
            style={{ color: token.colorTextTertiary }}
          />
        </Dropdown>
      </div>

      {/* 节点主体 */}
      <div style={{ padding: '10px 12px' }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: token.colorText,
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={step.name}
        >
          {step.name || `未命名步骤 ${index + 1}`}
        </div>

        <div
          style={{
            fontSize: 11,
            color: token.colorTextSecondary,
            height: 32,
            lineHeight: '16px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            marginBottom: 8,
          }}
        >
          {summaryText}
        </div>

        {/* 底部属性胶囊 */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {step.optional ? (
            <Tag color="default" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
              可选
            </Tag>
          ) : (
            <Tag color="processing" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
              必选
            </Tag>
          )}

          {step.condition && (
            <Tooltip title={`执行条件: ${step.condition}`}>
              <Tag color="warning" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                条件
              </Tag>
            </Tooltip>
          )}

          {step.inputMapping && Object.keys(step.inputMapping).length > 0 && (
            <Tooltip title={`绑定 ${Object.keys(step.inputMapping).length} 个输入参数`}>
              <Tag color="cyan" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                映射
              </Tag>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};
