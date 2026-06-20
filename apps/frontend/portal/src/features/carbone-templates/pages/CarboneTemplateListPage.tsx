import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
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
} from '@ant-design/icons';
import { carboneAPI, type CarboneSkill, type CarboneTemplate } from '@/api/carbone';
import {
  extractSkillOverview,
  getArrayParameterGroups,
  getScalarParameters,
  OFFICE_ADDIN_DOWNLOAD_URL,
  OFFICE_ADDIN_TASKPANE_URL,
  type ParameterRow,
  isDraftDocumentTemplate,
  truncateText,
} from '@/features/carbone-templates/lib/carboneTemplateList';

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

  const parameterColumns = [
    {
      title: '字段',
      dataIndex: 'fieldName',
      key: 'fieldName',
      render: (value: string) => <code>{value}</code>,
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
      width: 90,
      render: (value: boolean) => (value ? <Tag color="red">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '用途',
      dataIndex: 'usage',
      key: 'usage',
      ellipsis: true,
    },
  ];

  const columns = useMemo(
    () => [
      {
        title: '模板',
        dataIndex: 'fileName',
        key: 'fileName',
        render: (name: string, record: CarboneTemplate) => {
          const skill = record.skillId ? skillMap[record.skillId] : undefined;
          const overview = extractSkillOverview(skill);
          return (
            <Space direction="vertical" size={4}>
              <Space>
                {getFormatIcon(record.format)}
                <Text strong>{name}</Text>
                {record.skillId ? <Tag color="success">已关联 Skill</Tag> : <Tag>无 Skill</Tag>}
              </Space>
              {overview.businessType && <Text type="secondary">{overview.businessType}</Text>}
            </Space>
          );
        },
      },
      {
        title: 'Skill 类型',
        key: 'skillType',
        render: (_: unknown, record: CarboneTemplate) => {
          const skill = record.skillId ? skillMap[record.skillId] : undefined;
          const overview = extractSkillOverview(skill);
          return overview.templateType ? (
            <Tag color="blue">{overview.templateType}</Tag>
          ) : (
            <Text type="secondary">未定义</Text>
          );
        },
      },
      {
        title: '用途摘要',
        key: 'purpose',
        render: (_: unknown, record: CarboneTemplate) => {
          const skill = record.skillId ? skillMap[record.skillId] : undefined;
          const overview = extractSkillOverview(skill);
          return (
            <Space direction="vertical" size={2}>
              <Text>{truncateText(overview.mainScene || overview.businessType || '', 84)}</Text>
              {overview.businessType && overview.mainScene ? (
                <Text type="secondary">{overview.businessType}</Text>
              ) : null}
            </Space>
          );
        },
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        render: (date: string) => (date ? new Date(date).toLocaleString() : '-'),
      },
      {
        title: '操作',
        key: 'actions',
        render: (_: unknown, record: CarboneTemplate) => (
          <Space>
            <Button
              icon={<EditOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                handleOpenRenameModal(record);
              }}
            >
              重命名
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                window.open(carboneAPI.getDownloadTemplateUrl(record.id), '_blank');
              }}
            >
              下载
            </Button>
            <Button
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
    [skillMap]
  );

  const scalarParameters = getScalarParameters(selectedSkill?.parameters);
  const arrayParameterGroups = getArrayParameterGroups(selectedSkill?.parameters);
  const selectedOverview = extractSkillOverview(selectedSkill);

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
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
                  统一管理通过 Office Add-in 生成并保存的 Word、Excel、PPT 模板。旧的
                  `report-templates` 创建入口已合并到这里。
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
          </Space>
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
              <Text type="secondary">仅展示 Carbone Studio 已保存的模板与关联 Skill。</Text>
            </div>
            <Space wrap>
              <Button
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
            pagination={{ pageSize: 10 }}
            onRow={(record) => ({
              onClick: () => {
                void handleViewDetail(record);
              },
              style: { cursor: 'pointer' },
            })}
          />
        </Card>
      </Space>

      <Drawer
        title={selectedTemplate?.fileName || '模板详情'}
        placement="right"
        width={860}
        open={detailDrawerVisible}
        onClose={() => setDetailDrawerVisible(false)}
        styles={{ body: { background: 'var(--bg-primary, #f5f7fb)' } }}
        extra={
          selectedTemplate ? (
            <Space>
              {selectedSkill ? (
                <Button
                  onClick={() =>
                    window.open(carboneAPI.getDownloadSkillUrl(selectedSkill.id), '_blank')
                  }
                >
                  下载 Skill
                </Button>
              ) : null}
              <Button
                type="primary"
                onClick={() =>
                  window.open(carboneAPI.getDownloadTemplateUrl(selectedTemplate.id), '_blank')
                }
              >
                下载模板
              </Button>
            </Space>
          ) : undefined
        }
      >
        {selectedTemplate && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              size="small"
              style={{
                borderRadius: 20,
                border: '1px solid var(--bg-secondary, #e5e7eb)',
                boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(15,23,42,0.08))',
              }}
            >
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Skill 类型">
                  {selectedOverview.templateType ? (
                    <Tag color="blue">{selectedOverview.templateType}</Tag>
                  ) : (
                    '未定义'
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="业务类型">
                  {selectedOverview.businessType || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="主要场景">
                  {selectedOverview.mainScene || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="更新时间">
                  {selectedTemplate.updatedAt
                    ? new Date(selectedTemplate.updatedAt).toLocaleString()
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="循环配置">
                  {(selectedTemplate.loops?.length ?? 0) > 0 ? (
                    <Space wrap>
                      {selectedTemplate.loops?.map((loop, index) => (
                        <Tag key={index} color="purple">
                          {loop.arrayPath}
                        </Tag>
                      ))}
                    </Space>
                  ) : (
                    '无'
                  )}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {!selectedSkill ? (
              <Card size="small">
                <Empty description="此模板暂无可用的 Skill 信息" />
              </Card>
            ) : (
              <>
                {scalarParameters.length > 0 && (
                  <Card size="small" title="基础参数">
                    <Table<ParameterRow>
                      size="small"
                      pagination={false}
                      rowKey="key"
                      columns={parameterColumns}
                      dataSource={scalarParameters}
                      scroll={{ x: 760 }}
                    />
                  </Card>
                )}

                {arrayParameterGroups.map((group) => (
                  <Card key={group.arrayPath} size="small" title={`数组参数 · ${group.arrayPath}`}>
                    <Table<ParameterRow>
                      size="small"
                      pagination={false}
                      rowKey="key"
                      columns={parameterColumns}
                      dataSource={group.fields}
                      scroll={{ x: 760 }}
                    />
                  </Card>
                ))}
              </>
            )}
          </Space>
        )}
      </Drawer>

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
