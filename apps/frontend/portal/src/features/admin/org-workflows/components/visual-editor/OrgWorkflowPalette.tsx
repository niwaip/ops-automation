import React, { useState, useMemo } from 'react';
import {
  Input,
  Tag,
  Typography,
  Button,
  Tooltip,
  Badge,
  theme,
} from 'antd';
import {
  ApiOutlined,
  AppstoreOutlined,
  CheckSquareOutlined,
  EditOutlined,
  FileDoneOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type {
  StageType,
  AvailableBaseWorkflowItem,
} from '@/api/orgWorkflow';
import { STAGE_TYPE_CONFIG, StagePaletteItem } from './orgVisualEditor.types';

const { Text } = Typography;

interface OrgWorkflowPaletteProps {
  availableWorkflows: AvailableBaseWorkflowItem[];
  onAddStage: (type: StageType) => void;
}

const STAGE_TEMPLATES: StagePaletteItem[] = [
  {
    type: 'submission',
    name: '提单申请阶段',
    description: '员工填写商务参数或生成合同初稿',
    color: '#1677ff',
    defaultApproverRule: 'assignee',
  },
  {
    type: 'approval',
    name: '人工审批与批注',
    description: '法务、主管或指定专员审查与意见回传',
    color: '#fa8c16',
    defaultApproverRule: 'department',
  },
  {
    type: 'automation',
    name: '自动化执行流',
    description: '审批通过后自动联动下游工作流闭环',
    color: '#722ed1',
  },
  {
    type: 'archive',
    name: '电子归档与回执',
    description: '固化版本凭证并向发起人推送 GTD 回执',
    color: '#52c41a',
  },
];

export const OrgWorkflowPalette: React.FC<OrgWorkflowPaletteProps> = ({
  availableWorkflows,
  onAddStage,
}) => {
  const { token } = theme.useToken();
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'stages' | 'assets'>('stages');

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return availableWorkflows;
    return availableWorkflows.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q)
    );
  }, [availableWorkflows, searchQuery]);

  const handleAssetDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    item: AvailableBaseWorkflowItem
  ) => {
    e.dataTransfer.setData('text/base-workflow-id', item.id);
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const getStageIcon = (type: StageType) => {
    switch (type) {
      case 'submission':
        return <EditOutlined style={{ color: '#1677ff' }} />;
      case 'approval':
        return <CheckSquareOutlined style={{ color: '#fa8c16' }} />;
      case 'automation':
        return <ThunderboltOutlined style={{ color: '#722ed1' }} />;
      case 'archive':
        return <FileDoneOutlined style={{ color: '#52c41a' }} />;
    }
  };

  if (collapsed) {
    return (
      <div
        style={{
          width: 44,
          height: '100%',
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '10px 0',
          gap: 10,
          flexShrink: 0,
          transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <Tooltip title="展开阶段与物料面板" placement="right">
          <Button
            type="text"
            size="small"
            icon={<MenuUnfoldOutlined style={{ fontSize: 13 }} />}
            onClick={() => setCollapsed(false)}
            style={{ width: 32, height: 32 }}
          />
        </Tooltip>

        <div style={{ width: '60%', height: 1, background: token.colorBorderSecondary }} />

        <Tooltip title="阶段模版 (点击展开)" placement="right">
          <Button
            type={activeTab === 'stages' ? 'primary' : 'text'}
            size="small"
            icon={<AppstoreOutlined style={{ fontSize: 14 }} />}
            onClick={() => {
              setActiveTab('stages');
              setCollapsed(false);
            }}
            style={{ width: 32, height: 32 }}
          />
        </Tooltip>

        <Tooltip title={`底层资产 (${availableWorkflows.length}) (点击展开)`} placement="right">
          <Badge count={availableWorkflows.length} size="small" offset={[-2, 2]}>
            <Button
              type={activeTab === 'assets' ? 'primary' : 'text'}
              size="small"
              icon={<ApiOutlined style={{ fontSize: 14 }} />}
              onClick={() => {
                setActiveTab('assets');
                setCollapsed(false);
              }}
              style={{ width: 32, height: 32 }}
            />
          </Badge>
        </Tooltip>

        <div
          style={{
            writingMode: 'vertical-rl',
            letterSpacing: 4,
            fontSize: 11,
            color: token.colorTextTertiary,
            marginTop: 10,
            userSelect: 'none',
          }}
        >
          物料库
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 250,
        height: '100%',
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* 顶部标签切换与收起按钮 */}
      <div
        style={{
          padding: '10px 12px 8px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Button
          size="small"
          type={activeTab === 'stages' ? 'primary' : 'default'}
          onClick={() => setActiveTab('stages')}
          style={{ flex: 1, fontSize: 12, padding: '0 6px' }}
        >
          阶段模版
        </Button>
        <Button
          size="small"
          type={activeTab === 'assets' ? 'primary' : 'default'}
          onClick={() => setActiveTab('assets')}
          style={{ flex: 1, fontSize: 12, padding: '0 6px' }}
        >
          底层资产 ({availableWorkflows.length})
        </Button>
        <Tooltip title="收起侧边栏">
          <Button
            type="text"
            size="small"
            icon={<MenuFoldOutlined style={{ fontSize: 13 }} />}
            onClick={() => setCollapsed(true)}
            style={{ width: 28, height: 28, padding: 0 }}
          />
        </Tooltip>
      </div>

      {/* 面板内容 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {activeTab === 'stages' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              点击直接向尾部追加阶段节点：
            </Text>

            {STAGE_TEMPLATES.map((tpl) => (
              <div
                key={tpl.type}
                onClick={() => onAddStage(tpl.type)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  background: token.colorFillAlter,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = tpl.color;
                  e.currentTarget.style.background = token.colorBgContainer;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = token.colorBorderSecondary;
                  e.currentTarget.style.background = token.colorFillAlter;
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: STAGE_TYPE_CONFIG[tpl.type]?.bgColor || 'rgba(0,0,0,0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {getStageIcon(tpl.type)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>
                      {tpl.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: token.colorTextSecondary,
                        maxWidth: 140,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tpl.description}
                    </div>
                  </div>
                </div>
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined style={{ fontSize: 12, color: tpl.color }} />}
                />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Input
              size="small"
              placeholder="搜索技能/工作流..."
              prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
            />

            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
              按住卡片可<strong>拖拽投放</strong>到右侧阶段卡片内：
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredAssets.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleAssetDragStart(e, item)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorFillAlter,
                    cursor: 'grab',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = token.colorPrimary;
                    e.currentTarget.style.background = token.colorBgContainer;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = token.colorBorderSecondary;
                    e.currentTarget.style.background = token.colorFillAlter;
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 12,
                        color: token.colorText,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 150,
                      }}
                      title={item.name}
                    >
                      <ApiOutlined style={{ marginRight: 4, color: '#722ed1' }} />
                      {item.name}
                    </span>
                    <Tag
                      color={
                        item.type === 'skill'
                          ? 'blue'
                          : item.type === 'temporal_workflow'
                          ? 'purple'
                          : 'orange'
                      }
                      style={{ margin: 0, fontSize: 10, padding: '0 4px' }}
                    >
                      {item.type === 'skill' ? '技能' : '流'}
                    </Tag>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: token.colorTextSecondary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={item.description || item.id}
                  >
                    {item.description || item.id}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
