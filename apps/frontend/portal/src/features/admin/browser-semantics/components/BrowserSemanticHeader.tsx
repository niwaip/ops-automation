import React from 'react';
import { Space, Typography, Tag, Button, Tooltip } from 'antd';
import {
  GlobalOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  RobotOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { SemanticRuleSet } from '@/api/browser-semantics';

const { Title, Text } = Typography;

export interface BrowserSemanticHeaderProps {
  domainCode: string;
  selectedRuleSet?: SemanticRuleSet;
  activeRuleSet?: SemanticRuleSet;
  onRefresh: () => void;
  onValidate: () => void;
  validateLoading?: boolean;
  onGenerateCreateDraft: () => void;
  generateCreateDraftLoading?: boolean;
  errorLogsCount?: number;
  onOpenReleases: () => void;
}

export const BrowserSemanticHeader: React.FC<BrowserSemanticHeaderProps> = ({
  domainCode,
  selectedRuleSet,
  activeRuleSet,
  onRefresh,
  onValidate,
  validateLoading,
  onGenerateCreateDraft,
  generateCreateDraftLoading,
  errorLogsCount = 0,
  onOpenReleases,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 20,
      }}
    >
      <div>
        <Space size={10} align="center" wrap>
          <GlobalOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
            语义规则管理
          </Title>
          <Tag color="blue" style={{ borderRadius: 6, marginInlineStart: 4 }}>
            域: {domainCode}
          </Tag>
          {activeRuleSet && (
            <Tag color="green" style={{ borderRadius: 6 }}>
              当前线上版本: {activeRuleSet.version} ({activeRuleSet.name})
            </Tag>
          )}
        </Space>
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
            网页录制器（Browser Recorder）与自动化执行 Agent 的核心自然语言词表基底：
            统一规范登录动作、导航意图、表单字段别名与列表行操作，支持报错自动聚类与 AI 自愈。
          </Text>
        </div>
      </div>

      <Space size={10} wrap>
        <Tooltip title="基于线上浏览器操作报错日志，让大模型自动聚类分析并生成候选规则草案">
          <Button
            type="primary"
            icon={<RobotOutlined />}
            loading={generateCreateDraftLoading}
            disabled={!errorLogsCount}
            onClick={onGenerateCreateDraft}
            style={{ borderRadius: 8 }}
          >
            AI 审查自愈草案 {errorLogsCount > 0 ? `(${errorLogsCount}条待审查)` : ''}
          </Button>
        </Tooltip>

        <Button
          icon={<SafetyCertificateOutlined />}
          loading={validateLoading}
          onClick={onValidate}
          disabled={!selectedRuleSet}
          style={{ borderRadius: 8 }}
        >
          规则语法验证
        </Button>

        <Button
          icon={<HistoryOutlined />}
          onClick={onOpenReleases}
          style={{ borderRadius: 8 }}
        >
          版本与发布历史
        </Button>

        <Button
          icon={<ReloadOutlined />}
          onClick={onRefresh}
          style={{ borderRadius: 8 }}
        >
          刷新
        </Button>
      </Space>
    </div>
  );
};
