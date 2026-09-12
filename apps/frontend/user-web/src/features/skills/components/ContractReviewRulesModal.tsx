import React, { useState, useEffect, useMemo } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  BankOutlined,
  BulbOutlined,
  DeleteOutlined,
  EditOutlined,
  FileProtectOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import type {
  ContractTypeKey,
  PartyPosition,
  RuleScope,
  UserCustomRule,
} from './contractReviewRules.types';
import {
  BUILTIN_RULES_DATA,
  DEFAULT_ORG_RULES,
} from './contractReviewBuiltinRules';
import {
  DEFAULT_PERSONAL_PRESETS,
  getOrgRules,
  getUserRules,
  saveOrgRules,
  saveUserRules,
} from './contractReviewRulesStorage';
import { ContractRuleEditModal } from './ContractRuleEditModal';

const { Text, Paragraph } = Typography;

interface ContractReviewRulesModalProps {
  skill: PublishedSkillCatalogItem | null;
  open: boolean;
  onClose: () => void;
}

const CONTRACT_TYPE_NAMES: Record<string, string> = {
  all: '🌐 全部类型',
  software_development: '💻 软件研发',
  procurement: '📦 采购买卖',
  employment: '👥 劳动用工',
  lease: '🏢 场地租赁',
  nda: '🔒 商业保密',
  general: '🤝 框架合作',
};

export const ContractReviewRulesModal: React.FC<ContractReviewRulesModalProps> = ({
  skill,
  open,
  onClose,
}) => {
  const { message } = App.useApp();

  // Tab 1: Builtin rules state
  const [selectedType, setSelectedType] = useState<ContractTypeKey>('software_development');
  const [selectedPosition, setSelectedPosition] = useState<'all' | PartyPosition>('all');

  // Tab 2 & Tab 3 state
  const [orgRules, setOrgRulesState] = useState<UserCustomRule[]>([]);
  const [userRules, setUserRulesState] = useState<UserCustomRule[]>([]);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editScope, setEditScope] = useState<RuleScope>('org');
  const [editingRule, setEditingRule] = useState<UserCustomRule | null>(null);

  // Filter for Tab 2 & 3
  const [orgFilterPosition, setOrgFilterPosition] = useState<'all' | PartyPosition>('all');
  const [userFilterPosition, setUserFilterPosition] = useState<'all' | PartyPosition>('all');

  // Initial load
  useEffect(() => {
    if (open) {
      setOrgRulesState(getOrgRules());
      setUserRulesState(getUserRules());
    }
  }, [open]);

  // Handle Org rules mutations
  const handleToggleOrgRule = (id: string, enabled: boolean) => {
    const updated = orgRules.map((r) => (r.id === id ? { ...r, enabled } : r));
    setOrgRulesState(updated);
    saveOrgRules(updated);
    message.success(enabled ? '企业组织红线已启用' : '企业组织红线已停用');
  };

  const handleDeleteOrgRule = (id: string) => {
    const updated = orgRules.filter((r) => r.id !== id);
    setOrgRulesState(updated);
    saveOrgRules(updated);
    message.success('已删除该企业组织红线');
  };

  const handleResetOrgRules = () => {
    setOrgRulesState(DEFAULT_ORG_RULES);
    saveOrgRules(DEFAULT_ORG_RULES);
    message.success('已重置恢复为企业标准推荐红线');
  };

  // Handle User rules mutations
  const handleToggleUserRule = (id: string, enabled: boolean) => {
    const updated = userRules.map((r) => (r.id === id ? { ...r, enabled } : r));
    setUserRulesState(updated);
    saveUserRules(updated);
    message.success(enabled ? '个人审查要点已启用' : '个人审查要点已停用');
  };

  const handleDeleteUserRule = (id: string) => {
    const updated = userRules.filter((r) => r.id !== id);
    setUserRulesState(updated);
    saveUserRules(updated);
    message.success('已删除该个人审查要点');
  };

  const handleResetUserRules = () => {
    setUserRulesState(DEFAULT_PERSONAL_PRESETS);
    saveUserRules(DEFAULT_PERSONAL_PRESETS);
    message.success('已恢复为个人推荐常用要点');
  };

  // Open edit modal
  const handleOpenAdd = (scope: RuleScope) => {
    setEditScope(scope);
    setEditingRule(null);
    setEditModalOpen(true);
  };

  const handleOpenEdit = (rule: UserCustomRule) => {
    setEditScope(rule.scope);
    setEditingRule(rule);
    setEditModalOpen(true);
  };

  // Save rule from modal
  const handleSaveRule = (rule: UserCustomRule) => {
    if (rule.scope === 'org') {
      const exists = orgRules.some((r) => r.id === rule.id);
      const next = exists
        ? orgRules.map((r) => (r.id === rule.id ? rule : r))
        : [rule, ...orgRules];
      setOrgRulesState(next);
      saveOrgRules(next);
      message.success(exists ? '企业组织红线已更新' : '已新增企业组织红线');
    } else {
      const exists = userRules.some((r) => r.id === rule.id);
      const next = exists
        ? userRules.map((r) => (r.id === rule.id ? rule : r))
        : [rule, ...userRules];
      setUserRulesState(next);
      saveUserRules(next);
      message.success(exists ? '个人专属要点已更新' : '已新增个人专属要点');
    }
    setEditModalOpen(false);
    setEditingRule(null);
  };

  // Filtered builtin checkpoints
  const currentContractData = BUILTIN_RULES_DATA[selectedType] || BUILTIN_RULES_DATA.software_development;
  const filteredBuiltinCheckpoints = useMemo(() => {
    if (selectedPosition === 'all') return currentContractData.checkpoints;
    return currentContractData.checkpoints.filter(
      (cp) => cp.position === selectedPosition || cp.position === 'both'
    );
  }, [currentContractData, selectedPosition]);

  // Filtered org & user rules
  const filteredOrgRules = useMemo(() => {
    if (orgFilterPosition === 'all') return orgRules;
    return orgRules.filter(
      (r) => r.applicablePosition === orgFilterPosition || r.applicablePosition === 'both'
    );
  }, [orgRules, orgFilterPosition]);

  const filteredUserRules = useMemo(() => {
    if (userFilterPosition === 'all') return userRules;
    return userRules.filter(
      (r) => r.applicablePosition === userFilterPosition || r.applicablePosition === 'both'
    );
  }, [userRules, userFilterPosition]);

  const renderPositionTag = (pos: PartyPosition) => {
    if (pos === 'party_a') {
      return (
        <Tag color="green" style={{ fontSize: 11, margin: 0 }}>
          🟢 甲方重点
        </Tag>
      );
    }
    if (pos === 'party_b') {
      return (
        <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
          🔵 乙方重点
        </Tag>
      );
    }
    return (
      <Tag style={{ fontSize: 11, margin: 0 }}>
        ⚪ 双方通用
      </Tag>
    );
  };

  const renderSeverityTag = (sev: 'HIGH' | 'MEDIUM' | 'LOW') => {
    if (sev === 'HIGH') {
      return (
        <Tag color="red" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
          🔴 高危必查
        </Tag>
      );
    }
    if (sev === 'MEDIUM') {
      return (
        <Tag color="orange" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
          🟡 中度注意
        </Tag>
      );
    }
    return (
      <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
        建议关注
      </Tag>
    );
  };

  return (
    <>
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileProtectOutlined style={{ color: '#1677ff', fontSize: 20 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>
                合同审查准则与风控要点配置中心
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                数字员工：{skill?.name || '合同文档智能审查与合规诊断'} · 支持按合同类型、甲乙方立场及企业/个人分级管控
              </div>
            </div>
          </div>
        }
        open={open}
        onCancel={onClose}
        footer={[
          <Button key="close" type="primary" onClick={onClose}>
            完成配置
          </Button>,
        ]}
        width={980}
        destroyOnClose
      >
        <Tabs
          defaultActiveKey="builtin"
          items={[
            // Tab 1: 行业标准法务准则
            {
              key: 'builtin',
              label: (
                <span>
                  <SafetyCertificateOutlined style={{ marginRight: 6 }} />
                  行业标准准则 (分合同类型与立场)
                </span>
              ),
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
                  <Alert
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    message="系统内置 6 类高频合同标准法务风控矩阵"
                    description="审查合同时，AI 引擎会自动识别合同类别，并根据您设定的我方立场（甲方/乙方）有侧重地进行条款穿透诊断与修改话术推荐。"
                  />

                  {/* 合同类别切换 */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(BUILTIN_RULES_DATA).map(([key, data]) => (
                      <Button
                        key={key}
                        size="middle"
                        type={selectedType === key ? 'primary' : 'default'}
                        onClick={() => setSelectedType(key as ContractTypeKey)}
                      >
                        {data.name.split('与')[0]}
                      </Button>
                    ))}
                  </div>

                  {/* 当前合同概述与立场选择器 */}
                  <Card
                    size="small"
                    style={{
                      background: 'var(--bg-card, rgba(255, 255, 255, 0.04))',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                      <div>
                        <Text strong style={{ fontSize: 14 }}>
                          {currentContractData.name}
                        </Text>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {currentContractData.description}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12 }}>
                          <span style={{ color: '#16a34a' }}>
                            <strong>甲方身份：</strong>{currentContractData.partyAName}
                          </span>
                          <span style={{ color: '#2563eb' }}>
                            <strong>乙方身份：</strong>{currentContractData.partyBName}
                          </span>
                        </div>
                      </div>

                      {/* 立场筛选 Segmented */}
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, textAlign: 'right' }}>
                          按签约立场侧重点筛选：
                        </div>
                        <Segmented
                          value={selectedPosition}
                          onChange={(val) => setSelectedPosition(val as any)}
                          options={[
                            { label: '全部要件', value: 'all' },
                            { label: '🟢 甲方重点', value: 'party_a' },
                            { label: '🔵 乙方重点', value: 'party_b' },
                            { label: '⚪ 双方通用', value: 'both' },
                          ]}
                        />
                      </div>
                    </div>

                    <Table
                      size="small"
                      pagination={false}
                      rowKey="title"
                      dataSource={filteredBuiltinCheckpoints}
                      columns={[
                        {
                          title: '审查要件与门类',
                          dataIndex: 'title',
                          key: 'title',
                          width: '30%',
                          render: (title, record) => (
                            <div>
                              <Text strong style={{ fontSize: 12 }}>
                                {title}
                              </Text>
                              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <Tag color="cyan" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                                  {record.category}
                                </Tag>
                                {renderSeverityTag(record.severity)}
                                {renderPositionTag(record.position)}
                              </div>
                            </div>
                          ),
                        },
                        {
                          title: '风控诊断逻辑与隐患',
                          dataIndex: 'rationale',
                          key: 'rationale',
                          render: (text) => (
                            <Paragraph style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-primary)' }}>
                              {text}
                            </Paragraph>
                          ),
                        },
                        {
                          title: '法务建议与修订示范',
                          dataIndex: 'recommendation',
                          key: 'recommendation',
                          width: '34%',
                          render: (text) => (
                            <div
                              style={{
                                fontSize: 12,
                                color: '#10b981',
                                background: 'rgba(16, 185, 129, 0.08)',
                                padding: '6px 8px',
                                borderRadius: 6,
                                border: '1px dashed rgba(16, 185, 129, 0.3)',
                              }}
                            >
                              {text}
                            </div>
                          ),
                        },
                      ]}
                    />
                  </Card>
                </Space>
              ),
            },

            // Tab 2: 🏛️ 企业组织级法务红线
            {
              key: 'org',
              label: (
                <span>
                  <BankOutlined style={{ marginRight: 6 }} />
                  企业组织级法务红线 ({orgRules.filter((r) => r.enabled).length}/{orgRules.length})
                </span>
              ),
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
                  <Alert
                    type="warning"
                    showIcon
                    icon={<SafetyCertificateOutlined />}
                    message="企业组织法务硬性底线（全员强制生效）"
                    description="组织级法务红线由法务合规部门或管理员统一定义，作为企业刚性合规底线。任何员工发起合同审查时，这些红线都会以最高优先级强力排查与预警。"
                  />

                  {/* 顶部操作条 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <Space size={12}>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        共配置 {orgRules.length} 项企业红线，已启用 {orgRules.filter((r) => r.enabled).length} 项
                      </Text>
                      <Segmented
                        size="small"
                        value={orgFilterPosition}
                        onChange={(v) => setOrgFilterPosition(v as any)}
                        options={[
                          { label: '全部立场', value: 'all' },
                          { label: '🟢 甲方', value: 'party_a' },
                          { label: '🔵 乙方', value: 'party_b' },
                        ]}
                      />
                    </Space>

                    <Space>
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={handleResetOrgRules}
                      >
                        恢复标准企业红线
                      </Button>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => handleOpenAdd('org')}
                      >
                        新增企业红线
                      </Button>
                    </Space>
                  </div>

                  {filteredOrgRules.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="当前筛选下无企业组织红线"
                    />
                  ) : (
                    <Table
                      size="small"
                      pagination={false}
                      rowKey="id"
                      dataSource={filteredOrgRules}
                      columns={[
                        {
                          title: '状态',
                          dataIndex: 'enabled',
                          key: 'enabled',
                          width: 65,
                          render: (enabled: boolean, record) => (
                            <Switch
                              size="small"
                              checked={enabled}
                              onChange={(checked) => handleToggleOrgRule(record.id, checked)}
                            />
                          ),
                        },
                        {
                          title: '红线条款名称 / 门类',
                          dataIndex: 'title',
                          key: 'title',
                          width: '28%',
                          render: (title, record) => (
                            <div>
                              <Text strong style={{ fontSize: 12 }}>
                                {title}
                              </Text>
                              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <Tag style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                                  {record.category}
                                </Tag>
                                {renderSeverityTag(record.severity)}
                                {renderPositionTag(record.applicablePosition)}
                                <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                                  {CONTRACT_TYPE_NAMES[record.contractType] || '通用类型'}
                                </Tag>
                              </div>
                            </div>
                          ),
                        },
                        {
                          title: '判定逻辑与示范修订话术',
                          dataIndex: 'rule',
                          key: 'rule',
                          render: (text, record) => (
                            <div>
                              <Paragraph style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)' }}>
                                {text}
                              </Paragraph>
                              {record.recommendedRevision && (
                                <div
                                  style={{
                                    marginTop: 4,
                                    fontSize: 11,
                                    color: '#10b981',
                                    background: 'rgba(16, 185, 129, 0.08)',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    border: '1px dashed rgba(16, 185, 129, 0.3)',
                                  }}
                                >
                                  <strong>示范修订：</strong>{record.recommendedRevision}
                                </div>
                              )}
                              {record.creator && (
                                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-secondary)' }}>
                                  制定：{record.creator}
                                </div>
                              )}
                            </div>
                          ),
                        },
                        {
                          title: '操作',
                          key: 'actions',
                          width: 80,
                          render: (_, record) => (
                            <Space size={2}>
                              <Button
                                type="link"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => handleOpenEdit(record)}
                              />
                              <Popconfirm
                                title="确定删除该企业法务红线吗？"
                                onConfirm={() => handleDeleteOrgRule(record.id)}
                              >
                                <Button danger type="link" size="small" icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  )}
                </Space>
              ),
            },

            // Tab 3: 👤 个人专属审查要点
            {
              key: 'personal',
              label: (
                <span>
                  <UserOutlined style={{ marginRight: 6 }} />
                  个人专属要点 ({userRules.filter((r) => r.enabled).length}/{userRules.length})
                </span>
              ),
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
                  <Alert
                    type="success"
                    showIcon
                    icon={<BulbOutlined />}
                    message="个人专属审查偏好与排查要点清单"
                    description="个人要点仅在您本人的审查执行中生效。您可以根据所处业务线、常用合作方特点或个人谈判习惯，随时定义特定要点的排查描述和建议话术。"
                  />

                  {/* 顶部操作条 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <Space size={12}>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        共配置 {userRules.length} 项个人要点，已启用 {userRules.filter((r) => r.enabled).length} 项
                      </Text>
                      <Segmented
                        size="small"
                        value={userFilterPosition}
                        onChange={(v) => setUserFilterPosition(v as any)}
                        options={[
                          { label: '全部立场', value: 'all' },
                          { label: '🟢 甲方', value: 'party_a' },
                          { label: '🔵 乙方', value: 'party_b' },
                        ]}
                      />
                    </Space>

                    <Space>
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={handleResetUserRules}
                      >
                        载入推荐个人模板
                      </Button>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => handleOpenAdd('personal')}
                      >
                        新增个人要点
                      </Button>
                    </Space>
                  </div>

                  {filteredUserRules.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="暂未配置个人专属审查要点，可点击上方按钮新增或载入推荐模板"
                    />
                  ) : (
                    <Table
                      size="small"
                      pagination={false}
                      rowKey="id"
                      dataSource={filteredUserRules}
                      columns={[
                        {
                          title: '状态',
                          dataIndex: 'enabled',
                          key: 'enabled',
                          width: 65,
                          render: (enabled: boolean, record) => (
                            <Switch
                              size="small"
                              checked={enabled}
                              onChange={(checked) => handleToggleUserRule(record.id, checked)}
                            />
                          ),
                        },
                        {
                          title: '审查要点名称 / 门类',
                          dataIndex: 'title',
                          key: 'title',
                          width: '28%',
                          render: (title, record) => (
                            <div>
                              <Text strong style={{ fontSize: 12 }}>
                                {title}
                              </Text>
                              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <Tag style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                                  {record.category}
                                </Tag>
                                {renderSeverityTag(record.severity)}
                                {renderPositionTag(record.applicablePosition)}
                                <Tag color="geekblue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                                  {CONTRACT_TYPE_NAMES[record.contractType] || '通用类型'}
                                </Tag>
                              </div>
                            </div>
                          ),
                        },
                        {
                          title: '排查判定规则与示范修改话术',
                          dataIndex: 'rule',
                          key: 'rule',
                          render: (text, record) => (
                            <div>
                              <Paragraph style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)' }}>
                                {text}
                              </Paragraph>
                              {record.recommendedRevision && (
                                <div
                                  style={{
                                    marginTop: 4,
                                    fontSize: 11,
                                    color: '#10b981',
                                    background: 'rgba(16, 185, 129, 0.08)',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    border: '1px dashed rgba(16, 185, 129, 0.3)',
                                  }}
                                >
                                  <strong>示范修订：</strong>{record.recommendedRevision}
                                </div>
                              )}
                            </div>
                          ),
                        },
                        {
                          title: '操作',
                          key: 'actions',
                          width: 80,
                          render: (_, record) => (
                            <Space size={2}>
                              <Button
                                type="link"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => handleOpenEdit(record)}
                              />
                              <Popconfirm
                                title="确定删除该个人审查要点吗？"
                                onConfirm={() => handleDeleteUserRule(record.id)}
                              >
                                <Button danger type="link" size="small" icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Modal>

      {/* 规则编辑弹窗 */}
      <ContractRuleEditModal
        open={editModalOpen}
        scope={editScope}
        editingRule={editingRule}
        onSave={handleSaveRule}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingRule(null);
        }}
      />
    </>
  );
};
