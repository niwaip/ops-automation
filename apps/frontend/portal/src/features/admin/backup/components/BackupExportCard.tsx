import React, { useState } from 'react';
import {
  Card,
  Button,
  Checkbox,
  Space,
  Typography,
  Badge,
  Row,
  Col,
  message,
  Divider,
} from 'antd';
import {
  DownloadOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  ApartmentOutlined,
  BranchesOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  BackupModuleKey,
  SystemAssetSummary,
  systemBackupApi,
} from '@/api/system-backup';

const { Title, Text, Paragraph } = Typography;

interface ModuleOption {
  key: BackupModuleKey;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

const MODULE_OPTIONS: ModuleOption[] = [
  {
    key: 'aiModels',
    label: 'AI 模型与智脑配置',
    desc: '包含已配置的大模型、Provider 接入点及路由策略',
    icon: <RobotOutlined style={{ color: '#1677ff' }} />,
  },
  {
    key: 'skills',
    label: '技能与工具注册表',
    desc: '包含已注册 Skill、参数 Schema 及系统工具绑定',
    icon: <ThunderboltOutlined style={{ color: '#faad14' }} />,
  },
  {
    key: 'temporalWorkflows',
    label: '工作流与活动工件',
    desc: '包含 Temporal Workflow 编排 DSL、Python 代码及工件 Hash',
    icon: <ApartmentOutlined style={{ color: '#52c41a' }} />,
  },
  {
    key: 'capabilityReleases',
    label: '能力发布中心版本',
    desc: '包含已发布版本、源码快照、LLM 生成代码构建产物',
    icon: <BranchesOutlined style={{ color: '#722ed1' }} />,
  },
  {
    key: 'browserTemplates',
    label: '浏览器录制模板',
    desc: '包含录制动作序列、选择器、守卫规则及模板版本',
    icon: <FileTextOutlined style={{ color: '#13c2c2' }} />,
  },
  {
    key: 'executionFlowTemplates',
    label: '执行流模板与算子',
    desc: '包含分步流程模板指南与系统 LLM 算子定义',
    icon: <OrderedListOutlined style={{ color: '#eb2f96' }} />,
  },
  {
    key: 'userOrganizations',
    label: '用户与组织架构',
    desc: '包含企业组织结构、部门体系、用户账号与角色权限',
    icon: <TeamOutlined style={{ color: '#fa8c16' }} />,
  },
];

interface BackupExportCardProps {
  summary?: SystemAssetSummary;
  loadingSummary: boolean;
}

export const BackupExportCard: React.FC<BackupExportCardProps> = ({
  summary,
  loadingSummary,
}) => {
  const [selectedModules, setSelectedModules] = useState<BackupModuleKey[]>(
    MODULE_OPTIONS.map((m) => m.key)
  );
  const [exporting, setExporting] = useState(false);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedModules(MODULE_OPTIONS.map((m) => m.key));
    } else {
      setSelectedModules([]);
    }
  };

  const handleToggleModule = (key: BackupModuleKey) => {
    setSelectedModules((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleExport = async () => {
    if (selectedModules.length === 0) {
      message.warning('请至少勾选一个需要备份的模块');
      return;
    }

    try {
      setExporting(true);
      const archive = await systemBackupApi.exportBackup(selectedModules);
      systemBackupApi.downloadBackupFile(archive);
      message.success('系统数据备份归档导出成功！');
    } catch (err: any) {
      message.error(`导出备份失败: ${err.message || '网络错误'}`);
    } finally {
      setExporting(false);
    }
  };

  const isAllSelected = selectedModules.length === MODULE_OPTIONS.length;
  const isIndeterminate =
    selectedModules.length > 0 && selectedModules.length < MODULE_OPTIONS.length;

  return (
    <Card
      title={
        <Space>
          <DownloadOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <Title level={5} style={{ margin: 0 }}>
            数据备份与导出 (Export)
          </Title>
        </Space>
      }
      extra={
        <Checkbox
          indeterminate={isIndeterminate}
          checked={isAllSelected}
          onChange={(e) => handleSelectAll(e.target.checked)}
        >
          全选所有资产
        </Checkbox>
      }
      style={{ height: '100%', borderRadius: 12 }}
    >
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        勾选需要导出的核心模块，系统将资产打包为带有 SHA-256 签名与版本元数据的标准 JSON 归档文件，可直接用于环境迁移或灾备保存。
      </Paragraph>

      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {MODULE_OPTIONS.map((module) => {
          const isChecked = selectedModules.includes(module.key);
          const count = summary?.counts?.[module.key] ?? 0;

          return (
            <Col xs={24} sm={12} key={module.key}>
              <div
                onClick={() => handleToggleModule(module.key)}
                style={{
                  border: isChecked
                    ? '1.5px solid #1677ff'
                    : '1px solid var(--border-color, #f0f0f0)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  background: isChecked ? 'rgba(22, 119, 255, 0.04)' : 'transparent',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  height: '100%',
                }}
              >
                <Space align="start" style={{ width: '85%' }}>
                  <Checkbox
                    checked={isChecked}
                    onChange={() => handleToggleModule(module.key)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <Space size={6}>
                      {module.icon}
                      <Text strong style={{ fontSize: 13 }}>
                        {module.label}
                      </Text>
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {module.desc}
                      </Text>
                    </div>
                  </div>
                </Space>
                <Badge
                  count={loadingSummary ? '...' : count}
                  overflowCount={9999}
                  style={{
                    backgroundColor: isChecked ? '#1677ff' : '#8c8c8c',
                    fontSize: 11,
                  }}
                />
              </div>
            </Col>
          );
        })}
      </Row>

      <Divider style={{ margin: '16px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          已选择 <Text strong style={{ color: '#1677ff' }}>{selectedModules.length}</Text> / {MODULE_OPTIONS.length} 个数据模块
        </Text>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          loading={exporting}
          onClick={handleExport}
          size="middle"
          style={{ minWidth: 150, borderRadius: 8 }}
        >
          一键生成并导出备份
        </Button>
      </div>
    </Card>
  );
};
