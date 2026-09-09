import React from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Badge,
  Switch,
  Tooltip,
} from 'antd';
import {
  InfoCircleOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  EditOutlined,
  KeyOutlined,
  RocketOutlined,
  OrderedListOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  SkillConfigDTO,
  BuiltinSkillInventoryDTO,
} from '@/api/skill';
import { isRegistryBuiltinSkill } from '@/features/admin/skills/builtinSkillInventory';
import type { SkillTableRow } from '../builtinSkillGrouping';
import type { ColumnsType } from 'antd/es/table';

const { Text, Paragraph } = Typography;

interface SkillListTableProps {
  dataSource: SkillTableRow[];
  loading?: boolean;
  validatingSkillId?: string | null;
  builtinSkillByKey: Map<string, BuiltinSkillInventoryDTO>;
  pendingRequestCountBySkillId?: Map<string, number>;
  onViewDetail: (skill: SkillConfigDTO) => void;
  onValidate: (skill: SkillConfigDTO) => void;
  onEdit: (skill: SkillConfigDTO) => void;
  onManagePermissions: (skill: SkillConfigDTO) => void;
  onDelete: (id: string, name?: string) => void;
  onConfigureBuiltin: (skill: BuiltinSkillInventoryDTO) => void;
  onToggleBuiltinEnabled: (capabilityKey: string, enabled: boolean) => void;
  builtinEnabledLoading?: boolean;
  builtinEnabledTargetKey?: string;
}

export const SkillListTable: React.FC<SkillListTableProps> = ({
  dataSource,
  loading = false,
  validatingSkillId,
  builtinSkillByKey,
  pendingRequestCountBySkillId,
  onViewDetail,
  onValidate,
  onEdit,
  onManagePermissions,
  onDelete,
  onConfigureBuiltin,
  onToggleBuiltinEnabled,
  builtinEnabledLoading = false,
  builtinEnabledTargetKey,
}) => {
  const { t } = useTranslation(['common', 'admin']);
  const navigate = useNavigate();

  const columns: ColumnsType<SkillTableRow> = [
    {
      title: t('admin:skillName'),
      dataIndex: 'name',
      key: 'name',
      width: 260,
      render: (name: string, record) => {
        if (record.isGroup) {
          return (
            <Space direction="vertical" size={2}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 16 }}>{record.groupMeta?.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
                <Tag
                  color={record.groupMeta?.tagColor || 'blue'}
                  style={{
                    margin: 0,
                    fontSize: 11,
                    lineHeight: '18px',
                    padding: '0 6px',
                    borderRadius: 4,
                  }}
                >
                  服务套件 ({record.childCount})
                </Tag>
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {record.groupKey} · 聚合 {record.childCount} 个独立原子能力
              </Text>
            </Space>
          );
        }
        const pendingCount = !record.isGroup ? (pendingRequestCountBySkillId?.get(record.id) || 0) : 0;
        return (
          <Space direction="vertical" size={2}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
              {record.groupKey ? (
                <Tag
                  color="blue"
                  style={{
                    margin: 0,
                    fontSize: 10,
                    lineHeight: '16px',
                    padding: '0 4px',
                    borderRadius: 4,
                  }}
                >
                  子能力
                </Tag>
              ) : isRegistryBuiltinSkill(record) ? (
                <Tag
                  color="cyan"
                  style={{
                    margin: 0,
                    fontSize: 11,
                    lineHeight: '18px',
                    padding: '0 6px',
                    borderRadius: 4,
                  }}
                >
                  系统内置
                </Tag>
              ) : (
                <Tag
                  color="purple"
                  style={{
                    margin: 0,
                    fontSize: 11,
                    lineHeight: '18px',
                    padding: '0 6px',
                    borderRadius: 4,
                  }}
                >
                  自定义
                </Tag>
              )}
              {pendingCount > 0 && (
                <Tag
                  color="error"
                  style={{
                    margin: 0,
                    fontSize: 11,
                    lineHeight: '18px',
                    padding: '0 6px',
                    borderRadius: 4,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onClick={() => onManagePermissions(record as SkillConfigDTO)}
                >
                  待审批 ({pendingCount})
                </Tag>
              )}
            </div>
            <Text
              type="secondary"
              style={{ fontSize: 11, wordBreak: 'break-all' }}
            >
              {record.id}
            </Text>
          </Space>
        );
      },
    },
    {
      title: t('admin:skillDescription'),
      dataIndex: 'description',
      key: 'description',
      width: 260,
      render: (desc: string) => (
        <Paragraph
          ellipsis={{ rows: 2, tooltip: desc }}
          style={{ marginBottom: 0, color: 'inherit', fontSize: 13 }}
        >
          {desc || '-'}
        </Paragraph>
      ),
    },
    {
      title: '执行流程',
      key: 'executionFlow',
      width: 170,
      render: (_, record) => {
        if (record.isGroup) {
          return (
            <Space wrap size={4}>
              {record.children?.map((c) => (
                <Tag key={c.id} style={{ margin: 0, fontSize: 11 }}>
                  {c.name.replace(/^内置\s*/, '')}
                </Tag>
              ))}
            </Space>
          );
        }
        if (isRegistryBuiltinSkill(record)) {
          return (
            <Tag color="geekblue" style={{ margin: 0 }}>
              内置领域算子
            </Tag>
          );
        }
        const hasTemplates =
          record.executionFlowTemplateIds &&
          record.executionFlowTemplateIds.length > 0;
        const hasInline =
          record.executionFlow && record.executionFlow.length > 0;

        if (hasTemplates && hasInline) {
          return (
            <Tag color="orange" icon={<OrderedListOutlined />}>
              模板 + 扩展
            </Tag>
          );
        }
        if (hasTemplates) {
          return (
            <Tag color="processing" icon={<OrderedListOutlined />}>
              关联模板流程
            </Tag>
          );
        }
        if (!hasInline) {
          return <Text type="secondary">标准流程</Text>;
        }
        return (
          <Space wrap size={4}>
            {record.executionFlow.map((step, idx) => (
              <Tag key={idx} style={{ margin: 0 }}>
                {step.name}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: t('admin:triggerKeywords'),
      dataIndex: 'triggerKeywords',
      key: 'triggerKeywords',
      width: 200,
      render: (keywords: string[], record) => {
        if (record.isGroup) {
          const totalTriggers =
            record.children?.reduce(
              (acc, c) => acc + (c.triggerKeywords?.length || 0),
              0
            ) || 0;
          return (
            <Text type="secondary" style={{ fontSize: 12 }}>
              共包含 {totalTriggers} 个专属意图触发词
            </Text>
          );
        }
        if (!keywords || keywords.length === 0) {
          return (
            <Text type="secondary" style={{ fontSize: 12 }}>
              -
            </Text>
          );
        }
        return (
          <Tooltip
            title={`触发关键词（共 ${keywords.length} 个）：\n${keywords.join(
              '、'
            )}`}
          >
            <Space size={4} wrap>
              {keywords.slice(0, 3).map((kw) => (
                <Tag
                  key={kw}
                  bordered={false}
                  style={{
                    backgroundColor: 'rgba(250, 173, 20, 0.15)',
                    color: '#faad14',
                    margin: 0,
                    fontSize: 12,
                  }}
                >
                  {kw}
                </Tag>
              ))}
              {keywords.length > 3 && (
                <Tag
                  bordered={false}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: 'rgba(255, 255, 255, 0.65)',
                    margin: 0,
                    fontSize: 11,
                  }}
                >
                  +{keywords.length - 3}
                </Tag>
              )}
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: '公开状态',
      key: 'published',
      width: 130,
      align: 'center',
      render: (_, record) => {
        if (record.isGroup) {
          return (
            <Badge
              status={record.isPublished ? 'success' : 'default'}
              text={
                <span
                  style={{
                    fontSize: 13,
                    color: record.isPublished ? '#52c41a' : undefined,
                  }}
                >
                  {record.enabledCount}/{record.childCount} 已就绪
                </span>
              }
            />
          );
        }
        return (
          <Badge
            status={record.isPublished ? 'success' : 'default'}
            text={
              <span
                style={{
                  fontSize: 13,
                  color: record.isPublished ? '#52c41a' : undefined,
                }}
              >
                {record.isPublished ? '已公开可执行' : '仅系统定义'}
              </span>
            }
          />
        );
      },
    },
    {
      title: t('admin:skillStatus'),
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      align: 'center',
      render: (isActive: boolean, record) => {
        if (record.isGroup) {
          const isBatchLoading = (record.children || []).some(
            (c) =>
              builtinEnabledLoading && builtinEnabledTargetKey === c.id
          );
          return (
            <Space direction="vertical" size={2} align="center">
              <Switch
                checked={record.isActive}
                checkedChildren="全开"
                unCheckedChildren="全关"
                loading={isBatchLoading}
                onChange={async (enabled) => {
                  for (const c of record.children || []) {
                    if (c.isActive !== enabled) {
                      await onToggleBuiltinEnabled(c.id, enabled);
                    }
                  }
                }}
              />
              {record.someEnabled ? (
                <span style={{ fontSize: 10, color: '#faad14' }}>部分开启</span>
              ) : null}
            </Space>
          );
        }
        return isRegistryBuiltinSkill(record) ? (
          <Switch
            checked={isActive}
            checkedChildren="启用"
            unCheckedChildren="停用"
            loading={
              builtinEnabledLoading && builtinEnabledTargetKey === record.id
            }
            onChange={(enabled) => onToggleBuiltinEnabled(record.id, enabled)}
          />
        ) : (
          <Tag
            color={isActive ? 'success' : 'default'}
            style={{ margin: 0 }}
          >
            {isActive ? '启用' : '禁用'}
          </Tag>
        );
      },
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => {
        if (record.isGroup) {
          const configSkill = record.configurableSkill;
          const runtimeConfig = configSkill
            ? builtinSkillByKey.get(configSkill.id)?.runtimeConfig
            : undefined;
          return (
            <Space size="small">
              {(runtimeConfig?.fields.length || 0) > 0 && (
                <Button
                  type="link"
                  size="small"
                  icon={<SettingOutlined />}
                  onClick={() =>
                    configSkill &&
                    onConfigureBuiltin(
                      builtinSkillByKey.get(configSkill.id) || (configSkill as any)
                    )
                  }
                >
                  {record.groupKey === 'search' ? '检索通道配置' : '套件配置'}
                </Button>
              )}
            </Space>
          );
        }
        if (isRegistryBuiltinSkill(record)) {
          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                icon={<InfoCircleOutlined />}
                onClick={() => onViewDetail(record)}
              >
                查看详情
              </Button>
              {(builtinSkillByKey.get(record.id)?.runtimeConfig?.fields
                .length || 0) > 0 && (
                <Button
                  type="link"
                  size="small"
                  icon={<SettingOutlined />}
                  onClick={() =>
                    onConfigureBuiltin(
                      builtinSkillByKey.get(record.id) || (record as any)
                    )
                  }
                >
                  配置
                </Button>
              )}
            </Space>
          );
        }

        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<InfoCircleOutlined />}
              onClick={() => onViewDetail(record)}
            >
              详情
            </Button>
            <Button
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => onValidate(record)}
              loading={validatingSkillId === record.id}
            >
              验证
            </Button>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit(record)}
            >
              {t('common:edit')}
            </Button>
            <Tooltip
              title={
                record.isPublished
                  ? '为普通角色分配该公开 Skill 的使用权限'
                  : '只有已公开发布的 Skill 才能分配给普通用户'
              }
            >
              <Badge
                count={pendingRequestCountBySkillId?.get(record.id) || 0}
                size="small"
                offset={[-2, 4]}
              >
                <Button
                  type="link"
                  size="small"
                  icon={<KeyOutlined />}
                  disabled={!record.isPublished}
                  onClick={() => onManagePermissions(record)}
                >
                  权限
                </Button>
              </Badge>
            </Tooltip>
            {record.isPublished ? (
              <Button
                type="link"
                size="small"
                icon={<RocketOutlined />}
                onClick={() => navigate(`/published-skills/${record.id}`)}
              >
                公开详情
              </Button>
            ) : null}
            {record.publishedReleaseId ? (
              <Button
                type="link"
                size="small"
                icon={<OrderedListOutlined />}
                onClick={() =>
                  navigate(
                    `/admin/capabilities?releaseId=${record.publishedReleaseId}&mode=view`
                  )
                }
              >
                发布溯源
              </Button>
            ) : null}
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDelete(record.id, record.name)}
            >
              {t('common:delete')}
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      defaultExpandAllRows={true}
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 个技能`,
      }}
      scroll={{ x: 1200 }}
    />
  );
};
