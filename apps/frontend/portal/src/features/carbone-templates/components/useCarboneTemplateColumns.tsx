import { useMemo } from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ClockCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileWordOutlined,
} from '@ant-design/icons';
import { carboneAPI, type CarboneSkill, type CarboneTemplate } from '@/api/carbone';
import {
  extractSkillOverview,
  formatFileSize,
  formatTemplateDate,
  isDraftDocumentTemplate,
  truncateText,
} from '../lib/carboneTemplateList';

const { Text } = Typography;

export const getFormatIcon = (format: string) => {
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

interface UseCarboneTemplateColumnsOptions {
  skillMap: Record<string, CarboneSkill>;
  latestTemplateId: string | null;
  onOpenRenameModal: (template: CarboneTemplate) => void;
  onDelete: (id: string, isDraft?: boolean) => void;
}

export const useCarboneTemplateColumns = ({
  skillMap,
  latestTemplateId,
  onOpenRenameModal,
  onDelete,
}: UseCarboneTemplateColumnsOptions): ColumnsType<CarboneTemplate> => {
  return useMemo(
    () => [
      {
        title: '模板文件 / 标识',
        dataIndex: 'fileName',
        key: 'fileName',
        render: (name: string, record: CarboneTemplate) => {
          const isDraft = isDraftDocumentTemplate(record);
          const isLatest = !isDraft && record.id === latestTemplateId;
          return (
            <Space direction="vertical" size={4}>
              <Space wrap>
                {getFormatIcon(record.format)}
                <Text strong style={{ fontSize: 14 }}>
                  {name}
                </Text>
                {isDraft ? (
                  <Tag color="orange" style={{ fontWeight: 500 }}>
                    暂存草稿
                  </Tag>
                ) : isLatest ? (
                  <Tag color="magenta" style={{ fontWeight: 600 }}>
                    最新
                  </Tag>
                ) : null}
                <Tag color="geekblue">{record.format.toUpperCase()}</Tag>
                {record.size ? <Tag>{formatFileSize(record.size)}</Tag> : null}
              </Space>
              <Space size={12} wrap>
                <Text
                  type="secondary"
                  copyable={{ text: record.id }}
                  style={{ fontSize: 12 }}
                >
                  模板ID: {record.id.slice(0, 8)}...
                </Text>
                {record.skillId ? (
                  <Text
                    type="secondary"
                    copyable={{ text: record.skillId }}
                    style={{ fontSize: 12 }}
                  >
                    Skill: {record.skillId.slice(0, 8)}...
                  </Text>
                ) : (
                  <Tag style={{ fontSize: 11 }}>无关联Skill</Tag>
                )}
              </Space>
            </Space>
          );
        },
      },
      {
        title: 'Skill 类型与场景',
        key: 'skillType',
        width: 240,
        render: (_: unknown, record: CarboneTemplate) => {
          const skill = record.skillId ? skillMap[record.skillId] : undefined;
          const overview = extractSkillOverview(skill);
          return (
            <Space direction="vertical" size={2}>
              {overview.templateType ? (
                <Tag color="blue">{overview.templateType}</Tag>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  未定义类型
                </Text>
              )}
              <Text style={{ fontSize: 12 }}>
                {truncateText(overview.mainScene || overview.businessType || '-', 50)}
              </Text>
            </Space>
          );
        },
      },
      {
        title: '参数与变量',
        key: 'variableStats',
        width: 180,
        render: (_: unknown, record: CarboneTemplate) => {
          const varCount = record.variables?.length ?? record.suggestions?.length ?? 0;
          const loopCount = record.loops?.length ?? 0;
          const paramCount = record.parameterCount;

          return (
            <Space direction="vertical" size={4} wrap>
              <Tag color="cyan">{varCount} 个变量</Tag>
              {loopCount > 0 && <Tag color="purple">{loopCount} 个循环表</Tag>}
              {paramCount != null && paramCount > 0 && (
                <Tag color="geekblue">{paramCount} 个提取项</Tag>
              )}
            </Space>
          );
        },
      },
      {
        title: '更新 / 创建时间',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 210,
        sorter: (a: CarboneTemplate, b: CarboneTemplate) => {
          const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return timeA - timeB;
        },
        defaultSortOrder: 'descend' as const,
        render: (_: unknown, record: CarboneTemplate) => {
          const isDraft = isDraftDocumentTemplate(record);
          const isLatest = !isDraft && record.id === latestTemplateId;
          const displayUpdated = formatTemplateDate(record.updatedAt || record.createdAt);
          const displayCreated = record.createdAt ? formatTemplateDate(record.createdAt) : null;

          return (
            <Space direction="vertical" size={2}>
              <Space size={4}>
                <ClockCircleOutlined style={{ color: isLatest ? '#eb2f96' : '#8c8c8c' }} />
                <Text strong={isLatest} style={{ color: isLatest ? '#c41d7f' : undefined }}>
                  {displayUpdated}
                </Text>
              </Space>
              {displayCreated && displayCreated !== displayUpdated && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  创建于: {displayCreated}
                </Text>
              )}
            </Space>
          );
        },
      },
      {
        title: '操作',
        key: 'actions',
        width: 220,
        render: (_: unknown, record: CarboneTemplate) => {
          const isDraft = isDraftDocumentTemplate(record);
          return (
            <Space>
              <Button
                size="small"
                icon={<EditOutlined />}
                type={isDraft ? 'primary' : 'default'}
                ghost={isDraft}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenRenameModal(record);
                }}
              >
                {isDraft ? '转为正式' : '重命名'}
              </Button>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  window.open(carboneAPI.getDownloadTemplateUrl(record.id), '_blank');
                }}
              >
                下载
              </Button>
              <Button
                size="small"
                icon={<DeleteOutlined />}
                danger
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(record.id, isDraft);
                }}
              >
                删除
              </Button>
            </Space>
          );
        },
      },
    ],
    [skillMap, latestTemplateId, onOpenRenameModal, onDelete]
  );
};
