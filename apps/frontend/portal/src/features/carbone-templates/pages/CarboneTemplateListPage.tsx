import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
  Space,
  Table,
  Tabs,
  Typography,
  message,
} from 'antd';
import {
  ClearOutlined,
  DownloadOutlined,
  PlusOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { carboneAPI, type CarboneSkill, type CarboneTemplate } from '@/api/carbone';
import {
  getLatestTemplateId,
  isDraftDocumentTemplate,
  OFFICE_ADDIN_DOWNLOAD_URL,
  OFFICE_ADDIN_TASKPANE_URL,
} from '@/features/carbone-templates/lib/carboneTemplateList';
import { CarboneTemplateDetailDrawer } from '../components/CarboneTemplateDetailDrawer';
import { CarboneTemplateRenameModal } from '../components/CarboneTemplateRenameModal';
import { useCarboneTemplateColumns } from '../components/useCarboneTemplateColumns';

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
  const [activeTab, setActiveTab] = useState<'formal' | 'draft' | 'all'>('formal');
  const [clearingDrafts, setClearingDrafts] = useState(false);

  useEffect(() => {
    void loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await carboneAPI.getTemplates({ includeDrafts: true });
      const templatesData = Array.isArray(response) ? response : [];
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

  const formalTemplates = useMemo(
    () => templates.filter((template) => !isDraftDocumentTemplate(template)),
    [templates]
  );

  const draftTemplates = useMemo(
    () => templates.filter((template) => isDraftDocumentTemplate(template)),
    [templates]
  );

  const displayedTemplates = useMemo(() => {
    if (activeTab === 'formal') return formalTemplates;
    if (activeTab === 'draft') return draftTemplates;
    return templates;
  }, [activeTab, formalTemplates, draftTemplates, templates]);

  const handleDelete = async (id: string, isDraft = false) => {
    Modal.confirm({
      title: isDraft ? '删除暂存草稿' : '删除模板',
      content: isDraft
        ? '确定要删除此暂存草稿吗？此操作不可恢复。'
        : '确定要删除此模板及其关联的Skill吗？此操作不可恢复。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await carboneAPI.deleteTemplate(id);
          message.success(isDraft ? '暂存草稿已删除' : '模板已删除');
          await loadTemplates();
        } catch (error: any) {
          message.error(`删除失败: ${error.message || '未知错误'}`);
        }
      },
    });
  };

  const handleClearAllDrafts = () => {
    if (draftTemplates.length === 0) return;
    Modal.confirm({
      title: '清空所有暂存草稿',
      content: `确定要清空全部 ${draftTemplates.length} 份暂存草稿吗？此操作将永久删除所有 draft-* 临时草稿文件及关联配置，不可恢复。`,
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setClearingDrafts(true);
        try {
          const results = await Promise.allSettled(
            draftTemplates.map((t) => carboneAPI.deleteTemplate(t.id))
          );
          const succeeded = results.filter((r) => r.status === 'fulfilled').length;
          message.success(`已清空 ${succeeded} 份暂存草稿`);
          if (activeTab === 'draft' && succeeded === draftTemplates.length) {
            setActiveTab('formal');
          }
          await loadTemplates();
        } catch (error: any) {
          message.error(`清空草稿失败: ${error.message || '未知错误'}`);
        } finally {
          setClearingDrafts(false);
        }
      },
    });
  };

  const handleRename = async () => {
    if (!selectedTemplate || !newName.trim()) {
      message.warning('请输入名称');
      return;
    }

    const isDraft = isDraftDocumentTemplate(selectedTemplate);
    try {
      await carboneAPI.renameTemplate(selectedTemplate.id, newName.trim());
      message.success(isDraft ? '已转为正式模板并保存' : '重命名成功');
      setRenameModalVisible(false);
      setNewName('');
      await loadTemplates();
    } catch (error: any) {
      message.error(`操作失败: ${error.message || '未知错误'}`);
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
    const isDraft = isDraftDocumentTemplate(template);
    const baseName = template.fileName.replace(/\.[^.]+$/, '');
    setNewName(isDraft ? '' : baseName);
    setRenameModalVisible(true);
  };

  const latestTemplateId = useMemo(
    () => getLatestTemplateId(formalTemplates),
    [formalTemplates]
  );

  const columns = useCarboneTemplateColumns({
    skillMap,
    latestTemplateId,
    onOpenRenameModal: handleOpenRenameModal,
    onDelete: (id, isDraft) => void handleDelete(id, isDraft),
  });

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
                共 {formalTemplates.length} 份正式模板{draftTemplates.length > 0 ? `，${draftTemplates.length} 份暂存草稿` : ''}。
              </Text>
            </div>
            <Space wrap>
              {activeTab === 'draft' && draftTemplates.length > 0 && (
                <Button
                  danger
                  icon={<ClearOutlined />}
                  loading={clearingDrafts}
                  onClick={handleClearAllDrafts}
                >
                  一键清空草稿
                </Button>
              )}
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

          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'formal' | 'draft' | 'all')}
            style={{ marginBottom: 16 }}
            items={[
              {
                key: 'formal',
                label: `正式模板 (${formalTemplates.length})`,
              },
              {
                key: 'draft',
                label: (
                  <Space size={6}>
                    <span>暂存草稿</span>
                    {draftTemplates.length > 0 && (
                      <Badge
                        count={draftTemplates.length}
                        style={{ backgroundColor: '#fa8c16' }}
                      />
                    )}
                  </Space>
                ),
              },
              {
                key: 'all',
                label: `全部 (${templates.length})`,
              },
            ]}
          />

          {activeTab === 'draft' && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="暂存草稿说明"
              description="以下为在 Office 插件（Word/Excel/PPT）中设计模板时自动保存的临时草稿。草稿不会计入系统备份资产。点击「转为正式」去除 draft-* 前缀并赋予正式名称后可发布为正式模板；若无需保留可随时删除或一键清空。"
            />
          )}

          <Table
            dataSource={displayedTemplates}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 项` }}
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

      <CarboneTemplateRenameModal
        open={renameModalVisible}
        selectedTemplate={selectedTemplate}
        newName={newName}
        onNewNameChange={setNewName}
        onOk={() => void handleRename()}
        onCancel={() => {
          setRenameModalVisible(false);
          setNewName('');
        }}
      />
    </div>
  );
};

export default CarboneTemplateListPage;
