import React, { useState, useMemo } from 'react';
import {
  Card,
  Space,
  Tag,
  Typography,
  Button,
  List,
  Checkbox,
  Empty,
  theme,
} from 'antd';
import {
  RobotOutlined,
  ReloadOutlined,
  BugOutlined,
} from '@ant-design/icons';
import type { SemanticRuleErrorLog } from '@/api/browser-semantics';

const { Text } = Typography;

export interface BrowserSemanticErrorReviewTabProps {
  errorLogs: SemanticRuleErrorLog[];
  loading?: boolean;
  onRefresh: () => void;
  onGenerateDraftFromErrors: (selectedErrorLogIds?: string[]) => void;
  generateDraftLoading?: boolean;
}

export const BrowserSemanticErrorReviewTab: React.FC<BrowserSemanticErrorReviewTabProps> = ({
  errorLogs,
  loading = false,
  onRefresh,
  onGenerateDraftFromErrors,
  generateDraftLoading = false,
}) => {
  const { token } = theme.useToken();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Distribution summary
  const reasonDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of errorLogs) {
      const reason = log.errorMessage?.split('\n')[0]?.slice(0, 40) || '未知异常';
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [errorLogs]);

  const toggleSelectAll = () => {
    if (selectedIds.length === errorLogs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(errorLogs.map((l) => l.id));
    }
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Overview & Action Banner */}
      <Card
        size="small"
        style={{
          borderRadius: 12,
          border: '1px solid rgba(255, 77, 79, 0.25)',
          background: 'rgba(255, 77, 79, 0.02)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Space size={8}>
            <BugOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
            <div>
              <Text strong style={{ fontSize: 14 }}>
                浏览器自动化执行异常与定位失败审计
              </Text>
              <div style={{ marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  当浏览器在操作页面（如找输入框、等待弹窗、识别按钮）失败时，错误会被记录在此。AI 可直接基于这些失败案例聚类生成语义规则补丁。
                </Text>
              </div>
            </div>
          </Space>

          <Space size={8}>
            <Button
              type="primary"
              danger
              icon={<RobotOutlined />}
              loading={generateDraftLoading}
              disabled={errorLogs.length === 0}
              onClick={() => onGenerateDraftFromErrors(selectedIds.length ? selectedIds : undefined)}
              style={{ borderRadius: 6 }}
            >
              {selectedIds.length > 0
                ? `基于选中的 ${selectedIds.length} 条错误生成规则补丁`
                : '基于全量错误一键 AI 审查草案'}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={onRefresh} style={{ borderRadius: 6 }}>
              刷新日志
            </Button>
          </Space>
        </div>

        {/* Reason Distribution Chips */}
        {reasonDistribution.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
            <Text type="secondary" style={{ fontSize: 11, marginRight: 8 }}>常见报错归因:</Text>
            <Space wrap size={6}>
              {reasonDistribution.map(({ reason, count }) => (
                <Tag key={reason} color="red" style={{ fontSize: 11, borderRadius: 4 }}>
                  {reason} ({count})
                </Tag>
              ))}
            </Space>
          </div>
        )}
      </Card>

      {/* Error Logs List Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Space size={12} align="center">
          <Checkbox
            checked={errorLogs.length > 0 && selectedIds.length === errorLogs.length}
            indeterminate={selectedIds.length > 0 && selectedIds.length < errorLogs.length}
            onChange={toggleSelectAll}
          >
            全选 (已选 {selectedIds.length} / {errorLogs.length})
          </Checkbox>
        </Space>
      </div>

      {/* Error Logs List */}
      {errorLogs.length > 0 ? (
        <List
          loading={loading}
          dataSource={errorLogs}
          renderItem={(log) => {
            const isSelected = selectedIds.includes(log.id);
            return (
              <Card
                key={log.id}
                size="small"
                style={{
                  borderRadius: 10,
                  marginBottom: 10,
                  border: isSelected ? '1px solid #ff4d4f' : `1px solid ${token.colorBorderSecondary}`,
                  background: isSelected ? 'rgba(255, 77, 79, 0.03)' : token.colorBgContainer,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleSelectId(log.id)}
                    style={{ marginTop: 2 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Space size={6} wrap>
                        <Tag color="volcano" style={{ borderRadius: 4, marginInlineEnd: 0 }}>
                          {log.errorType || log.source || '操作异常'}
                        </Tag>
                        {log.inputText && (
                          <Text strong style={{ fontSize: 13 }}>
                            指令输入: 「{log.inputText}」
                          </Text>
                        )}
                      </Space>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </Text>
                    </div>

                    {/* Normalized & Observation */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 6, fontSize: 12 }}>
                      {log.normalizedInput && (
                        <div>
                          <Text type="secondary">归一化状态: </Text>
                          <code>{log.normalizedInput}</code>
                        </div>
                      )}
                      {log.observationSummary && (
                        <div>
                          <Text type="secondary">页面观测反馈: </Text>
                          <span>{log.observationSummary}</span>
                        </div>
                      )}
                    </div>

                    {/* Error Message */}
                    {log.errorMessage && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: '6px 10px',
                          background: token.colorFillAlter,
                          borderRadius: 6,
                          fontSize: 11,
                          color: '#cf1322',
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}
                      >
                        {log.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          }}
        />
      ) : (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: '40px 0' }}>
          <Empty description="暂无待审查的浏览器自动化执行错误日志" />
        </Card>
      )}
    </div>
  );
};
