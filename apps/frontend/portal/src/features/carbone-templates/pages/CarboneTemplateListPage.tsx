import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  PlusOutlined,
  SyncOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { carboneAPI, type CarboneSkill, type CarboneTemplate } from '@/api/carbone';
import {
  extractSkillOverview,
  formatFileSize,
  formatTemplateDate,
  getLatestTemplateId,
  isDraftDocumentTemplate,
  OFFICE_ADDIN_DOWNLOAD_URL,
  OFFICE_ADDIN_TASKPANE_URL,
  truncateText,
} from '@/features/carbone-templates/lib/carboneTemplateList';
import { CarboneTemplateDetailDrawer } from '../components/CarboneTemplateDetailDrawer';

const { Title, Text } = Typography;

const CarboneTemplateListPage: React.FC = () => {
  const [templates, setTemplates] = useState<CarboneTemplate[]>([]);
  const [skillMap, setSkillMap] = useState<Record<string, CarboneSkill>>({});
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<CarboneTemplate | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<CarboneSkill | null>(null);
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    void loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await carboneAPI.getTemplates();
      const templatesData = (Array.isArray(response) ? response : []).filter(
        (template) => !isDraftDocumentTemplate(template)
      );
      setTemplates(templatesData);

      const skillResults = await Promise.allSettled(
        templatesData
          .filter((template) => Boolean(template.skillId))
          .map(async (template) => {
            const skill = await carboneAPI.getSkill(String(template.skillId));
            return [String(template.skillId), skill] as const;
          })
      );

      const nextSkillMap: Record<string, CarboneSkill> = {};
      skillResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const [skillId, skill] = result.value;
          nextSkillMap[skillId] = skill;
        }
      });
      setSkillMap(nextSkillMap);
    } catch (error: any) {
      message.error(`加载模板列表失败: ${error.message || '未知错误'}`);
      setTemplates([]);
      setSkillMap({});
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '删除模板',
      content: '确定要删除此模板及其关联的Skill吗？此操作不可恢复。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await carboneAPI.deleteTemplate(id);
          message.success('模板已删除');
          await loadTemplates();
        } catch (error: any) {
          message.error(`删除失败: ${error.message || '未知错误'}`);
        }
      },
    });
  };

  const handleRename = async () => {
    if (!selectedTemplate || !newName.trim()) {
      message.warning('请输入新名称');
      return;
    }

    try {
      await carboneAPI.renameTemplate(selectedTemplate.id, newName.trim());
      message.success('重命名成功');
      setRenameModalVisible(false);
      setNewName('');
      await loadTemplates();
    } catch (error: any) {
      message.error(`重命名失败: ${error.message || '未知错误'}`);
    }
  };

  const handleViewDetail = async (template: CarboneTemplate) => {
    setSelectedTemplate(template);

    if (template.skillId) {
      try {
        const skill = skillMap[template.skillId] || (await carboneAPI.getSkill(template.skillId));
        setSelectedSkill(skill);
        setSkillMap((prev) => ({ ...prev, [template.skillId as string]: skill }));
      } catch {
        message.warning('获取Skill详情失败');
        setSelectedSkill(null);
      }
    } else {
      setSelectedSkill(null);
    }

    setDetailDrawerVisible(true);
  };

  const handleOpenRenameModal = (template: CarboneTemplate) => {
    setSelectedTemplate(template);
    setNewName(template.fileName.replace(/\.[^.]+$/, ''));
    setRenameModalVisible(true);
  };

  const getFormatIcon = (format: string) => {
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

  const latestTemplateId = useMemo(() => getLatestTemplateId(templates), [templates]);

  const columns = useMemo(
    () => [
      {
        title: '模板文件 / 标识',
        dataIndex: 'fileName',
        key: 'fileName',
        render: (name: string, record: CarboneTemplate) => {
          const isLatest = record.id === latestTemplateId;
          return (
            <Space direction="vertical" size={4}>
              <Space wrap>
                {getFormatIcon(record.format)}
                <Text strong style={{ fontSize: 14 }}>{name}</Text>
                {isLatest && (
                  <Tag color="magenta" style={{ fontWeight: 600 }}>
                    最新
                  </Tag>
                )}
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
                <Text type="secondary" style={{ fontSize: 12 }}>未定义类型</Text>
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
          const isLatest = record.id === latestTemplateId;
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
        render: (_: unknown, record: CarboneTemplate) => (
          <Space>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                handleOpenRenameModal(record);
              }}
            >
              重命名
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
                void handleDelete(record.id);
              }}
            >
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [skillMap, latestTemplateId]
  );

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <Title level={4} style={{ marginBottom: 8 }}>
                文档模版
              </Title>
              <Text type="secondary">
                统一管理通过 Office Add-in 生成并保存的 Word、Excel、PPT 模板。点击行可查看模板提取变量、AI指南参数与JSON数据示例。
              </Text>
            </div>
            <Space wrap>
              <Button
                icon={<DownloadOutlined />}
                onClick={() =>
                  window.open(OFFICE_ADDIN_DOWNLOAD_URL, '_blank', 'noopener,noreferrer')
                }
              >
                下载 Add-in
              </Button>
            </Space>
          </div>
        </Card>

        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '16px',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <Title level={4} style={{ marginBottom: 4 }}>
                模板列表
              </Title>
              <Text type="secondary">
                共 {templates.length} 份模板，默认按最新更新时间倒序排列。
              </Text>
            </div>
            <Space wrap>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() =>
                  window.open(OFFICE_ADDIN_TASKPANE_URL, '_blank', 'noopener,noreferrer')
                }
              >
                新建模板
              </Button>
              <Button icon={<SyncOutlined />} onClick={() => void loadTemplates()}>
                刷新
              </Button>
            </Space>
          </div>
          <Table
            dataSource={templates}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 份模板` }}
            onRow={(record) => ({
              onClick: () => {
                void handleViewDetail(record);
              },
              style: { cursor: 'pointer' },
            })}
          />
        </Card>
      </Space>

      <CarboneTemplateDetailDrawer
        open={detailDrawerVisible}
        onClose={() => setDetailDrawerVisible(false)}
        template={selectedTemplate}
        skill={selectedSkill}
        isLatest={selectedTemplate?.id === latestTemplateId}
      />

      <Modal
        title="重命名模板"
        open={renameModalVisible}
        onCancel={() => {
          setRenameModalVisible(false);
          setNewName('');
        }}
        onOk={() => void handleRename()}
        okText="确认"
        cancelText="取消"
      >
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="请输入新名称"
          autoFocus
        />
      </Modal>
    </div>
  );
};

export default CarboneTemplateListPage;
