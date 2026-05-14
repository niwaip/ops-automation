import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Card, Typography, Modal, message, Input, Tabs, Descriptions, Alert } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, DownloadOutlined, FileWordOutlined, FileExcelOutlined, FilePdfOutlined, SyncOutlined, PlusOutlined } from '@ant-design/icons';
import { carboneAPI, CarboneTemplate, CarboneSkill } from '../api/carbone';
import { buildOfficeAddinUrl } from '../config/runtime';

const { Title, Text } = Typography;
const OFFICE_ADDIN_TASKPANE_URL = buildOfficeAddinUrl('/taskpane.html');
const OFFICE_ADDIN_DOWNLOAD_URL = buildOfficeAddinUrl('/download');
const isDraftDocumentTemplate = (template: CarboneTemplate): boolean => {
  const fileName = String(template.fileName || '').trim().toLowerCase();
  return fileName.startsWith('draft-');
};

const CarboneTemplateListPage: React.FC = () => {
  const [templates, setTemplates] = useState<CarboneTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<CarboneTemplate | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<CarboneSkill | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await carboneAPI.getTemplates();
      // Hide temporary draft copies created during document templating.
      const templatesData = (Array.isArray(response) ? response : []).filter(
        (template) => !isDraftDocumentTemplate(template),
      );
      setTemplates(templatesData);
    } catch (error: any) {
      message.error('加载模板列表失败: ' + (error.message || '未知错误'));
      setTemplates([]); // Ensure templates is always an array on error
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
          loadTemplates();
        } catch (error: any) {
          message.error('删除失败: ' + (error.message || '未知错误'));
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
      loadTemplates();
    } catch (error: any) {
      message.error('重命名失败: ' + (error.message || '未知错误'));
    }
  };

  const handleViewDetail = async (template: CarboneTemplate) => {
    setSelectedTemplate(template);

    // 如果有skillId，获取skill详情
    if (template.skillId) {
      try {
        const skill = await carboneAPI.getSkill(template.skillId);
        setSelectedSkill(skill);
      } catch (error: any) {
        message.warning('获取Skill详情失败');
        setSelectedSkill(null);
      }
    } else {
      setSelectedSkill(null);
    }

    setDetailModalVisible(true);
  };

  const handleOpenRenameModal = (template: CarboneTemplate) => {
    setSelectedTemplate(template);
    // 从fileName提取名称（去掉扩展名）
    const nameWithoutExt = template.fileName.replace(/\.[^.]+$/, '');
    setNewName(nameWithoutExt);
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

  const getFormatTag = (format: string) => {
    const colors: Record<string, string> = {
      docx: 'blue',
      xlsx: 'green',
      pptx: 'orange',
      html: 'purple',
    };
    return <Tag color={colors[format] || 'default'} icon={getFormatIcon(format)}>{format.toUpperCase()}</Tag>;
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (id: string) => <Text copyable={{ text: id }}>{id.substring(0, 8)}...</Text>,
    },
    {
      title: '名称',
      dataIndex: 'fileName',
      key: 'fileName',
      render: (name: string, record: CarboneTemplate) => (
        <Space>
          {getFormatIcon(record.format)}
          <span>{name}</span>
        </Space>
      ),
    },
    {
      title: '格式',
      dataIndex: 'format',
      key: 'format',
      render: (format: string) => getFormatTag(format),
    },
    {
      title: '变量数',
      dataIndex: 'variables',
      key: 'variables',
      render: (variables: string[]) => <Tag>{variables?.length || 0} 个变量</Tag>,
    },
    {
      title: 'Skill',
      dataIndex: 'skillId',
      key: 'skillId',
      render: (skillId: string) => skillId ? <Tag color="success">已关联</Tag> : <Tag color="default">无</Tag>,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (date: string) => date ? new Date(date).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: CarboneTemplate) => (
        <Space>
          <Button
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            查看
          </Button>
          <Button
            icon={<EditOutlined />}
            onClick={() => handleOpenRenameModal(record)}
          >
            重命名
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => {
              const url = carboneAPI.getDownloadTemplateUrl(record.id);
              window.open(url, '_blank');
            }}
          >
            下载
          </Button>
          <Button
            icon={<DeleteOutlined />}
            danger
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <Title level={4} style={{ marginBottom: 8 }}>Carbone 模板</Title>
                <Text type="secondary">
                  统一管理通过 Office Add-in 生成并保存的 Word、Excel、PPT 模板。旧的 `report-templates`
                  创建入口已合并到这里。
                </Text>
              </div>
              <Space wrap>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => window.open(OFFICE_ADDIN_TASKPANE_URL, '_blank', 'noopener,noreferrer')}
                >
                  打开 Office Add-in
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={() => window.open(OFFICE_ADDIN_DOWNLOAD_URL, '_blank', 'noopener,noreferrer')}
                >
                  下载 Add-in
                </Button>
              </Space>
            </div>

            <Alert
              type="info"
              showIcon
              message="从 0 到 1 的模板创建流程"
              description={(
                <Space direction="vertical" size={4}>
                  <Text>1. 在本机启动并安装 Carbone Office Add-in。</Text>
                  <Text>2. 在 Word 或 Excel 中打开原始文档，通过 Add-in 标注变量、预览并保存模板。</Text>
                  <Text>3. 保存成功后，模板会自动出现在当前列表中，后续可继续查看、下载、重命名和删除。</Text>
                </Space>
              )}
            />
          </Space>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <Title level={4} style={{ marginBottom: 4 }}>模板列表</Title>
              <Text type="secondary">仅展示 Carbone Studio 已保存的模板与关联 Skill。</Text>
            </div>
            <Space wrap>
              <Button
                icon={<PlusOutlined />}
                onClick={() => window.open(OFFICE_ADDIN_TASKPANE_URL, '_blank', 'noopener,noreferrer')}
              >
                新建模板
              </Button>
              <Button icon={<SyncOutlined />} onClick={loadTemplates}>
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
          />
        </Card>
      </Space>

      {/* 详情弹窗 */}
      <Modal
        title="模板详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
          selectedTemplate && (
            <Button key="download" type="primary" onClick={() => {
              const url = carboneAPI.getDownloadTemplateUrl(selectedTemplate.id);
              window.open(url, '_blank');
            }}>
              下载模板
            </Button>
          ),
          selectedSkill && (
            <Button key="downloadSkill" onClick={() => {
              const url = carboneAPI.getDownloadSkillUrl(selectedSkill.id);
              window.open(url, '_blank');
            }}>
              下载Skill
            </Button>
          ),
        ]}
        width={800}
      >
        {selectedTemplate && (
          <Tabs
            items={[
              {
                key: 'template',
                label: '模板信息',
                children: (
                  <Descriptions bordered column={2}>
                    <Descriptions.Item label="ID">{selectedTemplate.id}</Descriptions.Item>
                    <Descriptions.Item label="名称">{selectedTemplate.fileName}</Descriptions.Item>
                    <Descriptions.Item label="格式">{getFormatTag(selectedTemplate.format)}</Descriptions.Item>
                    <Descriptions.Item label="创建时间">{selectedTemplate.createdAt ? new Date(selectedTemplate.createdAt).toLocaleString() : '-'}</Descriptions.Item>
                    <Descriptions.Item label="更新时间">{selectedTemplate.updatedAt ? new Date(selectedTemplate.updatedAt).toLocaleString() : '-'}</Descriptions.Item>
                    <Descriptions.Item label="Skill ID">{selectedTemplate.skillId || '无'}</Descriptions.Item>
                    <Descriptions.Item label="变量列表" span={2}>
                      {(selectedTemplate.variables?.length ?? 0) > 0 ? (
                        <Space wrap>
                          {selectedTemplate.variables?.map((v, i) => <Tag key={i}>{v}</Tag>)}
                        </Space>
                      ) : '无'}
                    </Descriptions.Item>
                    <Descriptions.Item label="循环配置" span={2}>
                      {(selectedTemplate.loops?.length ?? 0) > 0 ? (
                        <Space wrap>
                          {selectedTemplate.loops?.map((l, i) => <Tag key={i} color="purple">{l.arrayPath}</Tag>)}
                        </Space>
                      ) : '无'}
                    </Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: 'skill',
                label: 'Skill Guide',
                children: selectedSkill ? (
                  <div>
                    <Descriptions bordered column={2}>
                      <Descriptions.Item label="Skill ID">{selectedSkill.id}</Descriptions.Item>
                      <Descriptions.Item label="关联模板">{selectedSkill.templateId}</Descriptions.Item>
                      <Descriptions.Item label="参数数量">{selectedSkill.parameters?.length || 0}</Descriptions.Item>
                      <Descriptions.Item label="更新时间">{selectedSkill.updatedAt ? new Date(selectedSkill.updatedAt).toLocaleString() : '-'}</Descriptions.Item>
                    </Descriptions>
                    {selectedSkill.skillGuideMarkdown && (
                      <div style={{ marginTop: 16 }}>
                        <Title level={5}>Skill Guide Markdown</Title>
                        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>
                          {selectedSkill.skillGuideMarkdown}
                        </pre>
                      </div>
                    )}
                    {selectedSkill.dataExampleJson && (
                      <div style={{ marginTop: 16 }}>
                        <Title level={5}>数据示例</Title>
                        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>
                          {JSON.stringify(selectedSkill.dataExampleJson, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <Text type="secondary">此模板没有关联的Skill Guide</Text>
                ),
              },
              {
                key: 'config',
                label: '配置信息',
                children: selectedTemplate.config ? (
                  <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>
                    {JSON.stringify(selectedTemplate.config, null, 2)}
                  </pre>
                ) : (
                  <Text type="secondary">无配置信息</Text>
                ),
              },
            ]}
          />
        )}
      </Modal>

      {/* 重命名弹窗 */}
      <Modal
        title="重命名模板"
        open={renameModalVisible}
        onCancel={() => {
          setRenameModalVisible(false);
          setNewName('');
        }}
        onOk={handleRename}
        okText="确认"
        cancelText="取消"
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="请输入新名称"
          autoFocus
        />
      </Modal>
    </div>
  );
};

export default CarboneTemplateListPage;
