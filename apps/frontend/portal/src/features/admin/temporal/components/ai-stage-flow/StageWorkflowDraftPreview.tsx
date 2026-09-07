import React from 'react';
import {
  Card,
  Tag,
  Typography,
  Space,
  Alert,
  Empty,
  theme,
  Button,
} from 'antd';
import {
  ApiOutlined,
  GlobalOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import type { StageWorkflowDraft, StageType } from '@/api/orgWorkflow';
import { StageWorkflowPipelineTabs } from './StageWorkflowPipelineTabs';

const { Text, Paragraph } = Typography;

const STAGE_CONFIG: Record<StageType, { label: string; color: string }> = {
  submission: { label: '提单申请流', color: 'blue' },
  approval: { label: '协同审批流', color: 'orange' },
  automation: { label: '自动化执行流', color: 'purple' },
  archive: { label: '通知回执流', color: 'green' },
};

interface StageWorkflowDraftPreviewProps {
  draft: StageWorkflowDraft | null;
  onOpenInFullEditor?: (draft: StageWorkflowDraft) => void;
  onDraftCodeUpdated?: (code: string) => void;
}

export const StageWorkflowDraftPreview: React.FC<StageWorkflowDraftPreviewProps> = ({
  draft,
  onOpenInFullEditor,
  onDraftCodeUpdated,
}) => {
  const { token } = theme.useToken();

  if (!draft) {
    return (
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: token.colorBgLayout,
          padding: 24,
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="请在左侧输入业务需求或选择预置场景，AI 将实时生成原子流与执行链路"
        />
      </div>
    );
  }

  const stageMeta = STAGE_CONFIG[draft.stageType] || { label: '原子工作流', color: 'default' };

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        overflowY: 'auto',
        padding: '16px 20px',
        backgroundColor: token.colorBgLayout,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* 顶部概览卡片 */}
      <Card
        size="small"
        style={{
          borderRadius: 12,
          backgroundColor: token.colorBgContainer,
          borderColor: token.colorBorderSecondary,
          boxShadow: token.boxShadowTertiary,
        }}
        styles={{ body: { padding: 14 } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Space size={8} wrap style={{ marginBottom: 4 }}>
              <Tag color={stageMeta.color} style={{ fontSize: 12, padding: '2px 8px' }}>
                {stageMeta.label}
              </Tag>
              <Tag
                color={draft.executionMode === 'api' ? 'geekblue' : 'cyan'}
                icon={draft.executionMode === 'api' ? <ApiOutlined /> : <GlobalOutlined />}
              >
                {draft.executionMode === 'api' ? '方式一：API 直接更新' : '方式二：浏览器模版执行'}
              </Tag>
              <Text strong style={{ fontSize: 16 }}>
                {draft.name}
              </Text>
            </Space>
            <div>
              <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                ID: {draft.id}
              </Text>
            </div>
          </div>

          {onOpenInFullEditor && (
            <Button
              type="dashed"
              size="small"
              icon={<ApartmentOutlined />}
              onClick={() => onOpenInFullEditor(draft)}
            >
              在完整工作流编辑器中打开
            </Button>
          )}
        </div>

        <Paragraph style={{ margin: '8px 0 6px', fontSize: 13, color: token.colorTextSecondary }}>
          {draft.description}
        </Paragraph>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, marginTop: 8 }}>
          <div>
            <Text type="secondary">经办/担当规则：</Text>
            <Tag color="volcano" style={{ margin: 0, fontSize: 11 }}>
              {draft.handlerRule}
            </Tag>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text type="secondary">必需上下文元数据：</Text>
            <Space size={4} wrap>
              {draft.requiredMetadata.map((m) => (
                <Tag key={m} style={{ margin: 0, fontSize: 11 }}>
                  {m}
                </Tag>
              ))}
            </Space>
          </div>
        </div>
      </Card>

      {/* 警告与配置提示 */}
      {draft.warnings && draft.warnings.length > 0 && (
        <Alert
          type="info"
          showIcon
          message="AI 架构师配置提示"
          description={
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {draft.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          }
          style={{ borderRadius: 8 }}
        />
      )}

      {/* 全生命周期工程流水线 Tabs (包含 DSL 验证、生成代码、端对端验证、执行拓扑、业务参数、固定契约) */}
      <StageWorkflowPipelineTabs
        draft={draft}
        onDraftCodeUpdated={onDraftCodeUpdated}
      />
    </div>
  );
};
