import React, { useMemo } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CopyOutlined,
  DownloadOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { carboneAPI, type CarboneSkill, type CarboneTemplate } from '@/api/carbone';
import {
  extractSkillOverview,
  formatFileSize,
  formatJsonString,
  formatTemplateDate,
  getArrayParameterGroups,
  getScalarParameters,
  getTemplateSuggestionRows,
  type ParameterRow,
  type TemplateSuggestionRow,
} from '../lib/carboneTemplateList';

const { Text, Paragraph } = Typography;

export interface CarboneTemplateDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  template: CarboneTemplate | null;
  skill: CarboneSkill | null;
  isLatest?: boolean;
}

export const CarboneTemplateDetailDrawer: React.FC<CarboneTemplateDetailDrawerProps> = ({
  open,
  onClose,
  template,
  skill,
  isLatest = false,
}) => {
  const suggestionRows = useMemo(() => getTemplateSuggestionRows(template), [template]);
  const scalarParameters = useMemo(() => getScalarParameters(skill?.parameters), [skill]);
  const arrayParameterGroups = useMemo(() => getArrayParameterGroups(skill?.parameters), [skill]);
  const overview = useMemo(() => extractSkillOverview(skill), [skill]);

  const jsonPreview = useMemo(() => {
    if (skill?.dataExampleJson) {
      return formatJsonString(skill.dataExampleJson);
    }
    if (suggestionRows.length > 0) {
      const mock: Record<string, unknown> = {};
      for (const row of suggestionRows) {
        if (row.suggestedName.startsWith('d.')) {
          const key = row.suggestedName.replace(/^d\./, '');
          mock[key] = row.sampleValue !== '-' ? row.sampleValue : `[${row.description || key}]`;
        }
      }
      return formatJsonString(mock);
    }
    return '';
  }, [skill, suggestionRows]);

  const copyJson = async () => {
    if (!jsonPreview) return;
    try {
      await navigator.clipboard.writeText(jsonPreview);
      message.success('已复制数据示例 JSON 到剪贴板');
    } catch {
      message.error('复制失败，请手动选择复制');
    }
  };

  const getFormatIcon = (format?: string) => {
    switch (format) {
      case 'docx':
        return <FileWordOutlined style={{ color: '#2b579a' }} />;
      case 'xlsx':
        return <FileExcelOutlined style={{ color: '#217346' }} />;
      case 'pptx':
        return <FilePdfOutlined style={{ color: '#d24726' }} />;
      default:
        return null;
    }
  };

  const suggestionColumns = [
    {
      title: '变量标识 (suggestedName)',
      dataIndex: 'suggestedName',
      key: 'suggestedName',
      render: (value: string) => (
        <Text copyable code style={{ fontSize: 13, color: '#1677ff' }}>
          {value}
        </Text>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 90,
      render: (value: string) =>
        value === 'loop' ? (
          <Tag color="purple">循环</Tag>
        ) : (
          <Tag color="blue">变量</Tag>
        ),
    },
    {
      title: '章节 / 位置',
      dataIndex: 'chapter',
      key: 'chapter',
      width: 130,
      render: (value: string) => (value !== '-' ? <Tag>{value}</Tag> : <Text type="secondary">-</Text>),
    },
    {
      title: '原文本',
      dataIndex: 'originalText',
      key: 'originalText',
      ellipsis: true,
      width: 150,
      render: (value: string) => <Text type="secondary">{value}</Text>,
    },
    {
      title: '参考示例值',
      dataIndex: 'sampleValue',
      key: 'sampleValue',
      ellipsis: true,
      width: 160,
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (value: string) => (value !== '-' ? value : <Text type="secondary">-</Text>),
    },
  ];

  const parameterColumns = [
    {
      title: '字段名',
      dataIndex: 'fieldName',
      key: 'fieldName',
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: '类型',
      dataIndex: 'dataType',
      key: 'dataType',
      width: 90,
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: '示例值',
      dataIndex: 'exampleText',
      key: 'exampleText',
      ellipsis: true,
    },
    {
      title: '必填',
      dataIndex: 'required',
      key: 'required',
      width: 80,
      render: (value: boolean) => (value ? <Tag color="red">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '提取用途',
      dataIndex: 'usage',
      key: 'usage',
      ellipsis: true,
    },
  ];

  if (!template) return null;

  return (
    <Drawer
      title={
        <Space>
          {getFormatIcon(template.format)}
          <Text strong style={{ fontSize: 16 }}>{template.fileName}</Text>
          {isLatest && <Tag color="magenta">最新版本</Tag>}
        </Space>
      }
      placement="right"
      width={920}
      open={open}
      onClose={onClose}
      styles={{ body: { background: 'var(--bg-primary, #f8fafc)', padding: '16px 20px' } }}
      extra={
        <Space>
          {skill && (
            <Button
              icon={<DownloadOutlined />}
              onClick={() => window.open(carboneAPI.getDownloadSkillUrl(skill.id), '_blank')}
            >
              下载 Skill
            </Button>
          )}
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => window.open(carboneAPI.getDownloadTemplateUrl(template.id), '_blank')}
          >
            下载模板
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* 基础元数据卡片 */}
        <Card
          size="small"
          style={{
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="模板 ID">
              <Text copyable={{ text: template.id }} style={{ fontSize: 12 }}>
                {template.id}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="关联 Skill ID">
              {template.skillId ? (
                <Text copyable={{ text: template.skillId }} style={{ fontSize: 12 }}>
                  {template.skillId}
                </Text>
              ) : (
                <Text type="secondary">未关联</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="文件格式 / 大小">
              <Space>
                <Tag color="geekblue">{template.format.toUpperCase()}</Tag>
                <Text type="secondary">{formatFileSize(template.size)}</Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              <Space>
                <ClockCircleOutlined style={{ color: '#1677ff' }} />
                <Text strong={isLatest}>
                  {formatTemplateDate(template.updatedAt || template.createdAt)}
                </Text>
                {isLatest && <Tag color="magenta">最新</Tag>}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              <Text type="secondary">{formatTemplateDate(template.createdAt)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="业务 / 场景">
              {overview.businessType || overview.mainScene ? (
                <Space>
                  {overview.businessType && <Tag color="blue">{overview.businessType}</Tag>}
                  {overview.mainScene && <Text>{overview.mainScene}</Text>}
                </Space>
              ) : (
                <Text type="secondary">-</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="循环表格配置" span={2}>
              {(template.loops?.length ?? 0) > 0 ? (
                <Space wrap>
                  {template.loops?.map((loop, idx) => (
                    <Tag key={idx} color="purple">
                      {loop.arrayPath}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">无循环表格</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 详细内容分 Tab 展示 */}
        <Card
          size="small"
          style={{
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <Tabs
            defaultActiveKey="suggestions"
            items={[
              {
                key: 'suggestions',
                label: `模板标记变量 (${suggestionRows.length})`,
                children:
                  suggestionRows.length > 0 ? (
                    <Table<TemplateSuggestionRow>
                      size="small"
                      columns={suggestionColumns}
                      dataSource={suggestionRows}
                      pagination={suggestionRows.length > 10 ? { pageSize: 10 } : false}
                      scroll={{ x: 780 }}
                    />
                  ) : (
                    <Empty description="该模板暂未记录标记变量" style={{ margin: '24px 0' }} />
                  ),
              },
              {
                key: 'skill',
                label: `AI 提取指南 · 参数 (${scalarParameters.length + arrayParameterGroups.reduce((acc, g) => acc + g.fields.length, 0)})`,
                children: !skill ? (
                  <Empty description="此模板暂未绑定 Skill 提取指南" style={{ margin: '24px 0' }} />
                ) : (
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    {scalarParameters.length > 0 && (
                      <div>
                        <Text strong style={{ marginBottom: 8, display: 'block' }}>
                          标量参数 (常规字段)
                        </Text>
                        <Table<ParameterRow>
                          size="small"
                          pagination={false}
                          rowKey="key"
                          columns={parameterColumns}
                          dataSource={scalarParameters}
                          scroll={{ x: 740 }}
                        />
                      </div>
                    )}

                    {arrayParameterGroups.map((group) => (
                      <div key={group.arrayPath}>
                        <Text strong style={{ marginBottom: 8, display: 'block' }}>
                          数组循环参数 · <Tag color="purple">{group.arrayPath}</Tag>
                        </Text>
                        <Table<ParameterRow>
                          size="small"
                          pagination={false}
                          rowKey="key"
                          columns={parameterColumns}
                          dataSource={group.fields}
                          scroll={{ x: 740 }}
                        />
                      </div>
                    ))}

                    {skill.aiInstructions && (
                      <div>
                        <Text strong style={{ marginBottom: 8, display: 'block' }}>
                          AI 提取提示词要求
                        </Text>
                        <Paragraph
                          style={{
                            background: '#f1f5f9',
                            padding: 12,
                            borderRadius: 6,
                            whiteSpace: 'pre-wrap',
                            fontSize: 13,
                          }}
                        >
                          {skill.aiInstructions}
                        </Paragraph>
                      </div>
                    )}
                  </Space>
                ),
              },
              {
                key: 'example',
                label: '数据示例 (JSON)',
                children: jsonPreview ? (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <Text type="secondary">
                        {skill?.dataExampleJson
                          ? '当前模板 Skill 提供的渲染数据示例：'
                          : '根据模板变量推导的数据示例：'}
                      </Text>
                      <Button icon={<CopyOutlined />} size="small" onClick={() => void copyJson()}>
                        复制代码
                      </Button>
                    </div>
                    <pre
                      style={{
                        background: '#0f172a',
                        color: '#38bdf8',
                        padding: 16,
                        borderRadius: 8,
                        fontSize: 13,
                        maxHeight: 480,
                        overflow: 'auto',
                        fontFamily: 'Consolas, Monaco, monospace',
                      }}
                    >
                      {jsonPreview}
                    </pre>
                  </div>
                ) : (
                  <Empty description="暂无可用数据示例" style={{ margin: '24px 0' }} />
                ),
              },
            ]}
          />
        </Card>
      </Space>
    </Drawer>
  );
};
