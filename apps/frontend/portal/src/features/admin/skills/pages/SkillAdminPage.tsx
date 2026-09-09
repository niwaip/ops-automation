import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Empty, Alert, Button, Radio, Space, Tag } from 'antd';
import {
  ThunderboltOutlined,
  ApiOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  SkillConfigDTO,
  BuiltinSkillInventoryDTO,
  CreateSkillDTO,
} from '@/api/skill';
import { buildGroupedBuiltinSkills, type SkillTableRow } from '../builtinSkillGrouping';
import { OverviewStatGrid } from '@/components/page/PageScaffold';
import {
  SkillAdminTabs,
  SkillAdminTabKey,
} from '@/features/admin/skills/components/SkillAdminTabs';
import { BuiltinSkillRuntimeConfigDrawer } from '@/features/admin/skills/components/BuiltinSkillRuntimeConfigDrawer';
import { isBuiltinSkill } from '../utils/skillHelpers';
import { useSkillAdminQueries } from '../hooks/useSkillAdminQueries';
import { useSkillMutations } from '../hooks/useSkillMutations';
import { useSkillValidation } from '../hooks/useSkillValidation';
import { SkillDetailContent } from '../components/SkillDetailContent';
import { SkillDetailModal } from '../components/SkillDetailModal';
import { SkillEditModal } from '../components/SkillEditModal';
import { SkillPermissionModal } from '../components/SkillPermissionModal';
import { SkillValidationModal } from '../components/SkillValidationModal';
import { SkillAccessRequestReviewTab } from '../components/SkillAccessRequestReviewTab';
import { SkillListTable } from '../components/SkillListTable';
import { SkillPageHeader } from '../components/SkillPageHeader';
import type { SkillAdminPageProps } from '../types';

export const SkillAdminPage: React.FC<SkillAdminPageProps> = ({
  embedded,
  initialSkillId,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchText, setSearchText] = useState(searchParams.get('q') || '');
  const [activeTabKey, setActiveTabKey] = useState<SkillAdminTabKey>(
    (searchParams.get('tab') as SkillAdminTabKey) || 'builtin'
  );
  const [builtinViewMode, setBuiltinViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [requestSubTab, setRequestSubTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  // Modal visibility & targets
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillConfigDTO | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillConfigDTO | null>(null);
  const [configuringBuiltinSkill, setConfiguringBuiltinSkill] =
    useState<BuiltinSkillInventoryDTO | null>(null);

  // Queries
  const {
    skillsQuery,
    builtinSkillsQuery,
    rolesQuery,
    permissionUsersQuery,
    templatesQuery,
    executionFlowTemplatesQuery,
    permissionsQuery,
    accessRequestsQuery,
    approvedAccessRequestsQuery,
    rejectedAccessRequestsQuery,
    globalPendingAccessRequestsQuery,
    globalApprovedAccessRequestsQuery,
    globalRejectedAccessRequestsQuery,
    pendingRequestsCount,
    pendingRequestCountBySkillId,
    allSkills,
    builtinSkillByKey,
    builtinSkillsCount,
    customSkillsCount,
    templateOptions,
  } = useSkillAdminQueries({
    permissionModalVisible,
    selectedSkill,
  });

  // Mutations
  const {
    builtinEnabledMutation,
    createMutation,
    updateMutation,
    deleteMutation,
    grantMutation,
    revokeMutation,
    applyAdjustmentMutation,
    processingAccessRequestId,
    processingAccessRequestAction,
    confirmDeleteSkill,
    handleApproveAccessRequest,
    handleRejectAccessRequest,
  } = useSkillMutations({
    selectedSkillId: selectedSkill?.id,
    onCreateSuccess: () => {
      setEditModalVisible(false);
    },
    onUpdateSuccess: () => {
      setEditModalVisible(false);
      setEditingSkill(null);
    },
    onDeleteSuccess: (deletedSkillId) => {
      if (selectedSkill?.id === deletedSkillId) {
        setSelectedSkill(null);
        setDetailModalVisible(false);
        setPermissionModalVisible(false);
      }
      if (editingSkill?.id === deletedSkillId) {
        setEditingSkill(null);
        setEditModalVisible(false);
      }
    },
    onApplyAdjustmentSuccess: (updatedSkill) => {
      setSelectedSkill(updatedSkill);
      setDetailModalVisible(false);
      setEditingSkill(updatedSkill);
      setEditModalVisible(true);
    },
  });

  // Validation Hook
  const {
    validationModalVisible,
    validatingSkillId,
    validationResult,
    validationLogs,
    validationStage,
    validationProgressMeta,
    validationAnimatedDots,
    handleValidate,
    handleCloseValidationModal,
    handleApplySuggestion,
  } = useSkillValidation({
    onApplyAdjustment: (id, generatedSkill) => {
      applyAdjustmentMutation.mutate({ id, generatedSkill });
    },
  });

  // Synchronize route query parameters
  useEffect(() => {
    if (embedded && initialSkillId && allSkills.length > 0) {
      const skill = allSkills.find((s) => s.id === initialSkillId);
      if (skill) {
        setSelectedSkill(skill);
      }
      return;
    }

    const keyword = searchParams.get('q') || '';
    setSearchText(keyword);

    const tabParam = searchParams.get('tab') as SkillAdminTabKey;
    if (['builtin', 'custom', 'llm', 'all', 'requests'].includes(tabParam)) {
      setActiveTabKey(tabParam);
    }

    const skillId = searchParams.get('id');
    if (skillId && allSkills.length > 0) {
      const skill = allSkills.find((s) => s.id === skillId);
      if (skill) {
        setSelectedSkill(skill);
        setDetailModalVisible(true);
      }
    }
  }, [searchParams, allSkills, embedded, initialSkillId]);

  // Skill filtering
  const filteredSkills = useMemo(() => {
    const keyword = searchText.toLowerCase().trim();
    return allSkills.filter((skill) => {
      if (!keyword) return true;
      return (
        skill.name.toLowerCase().includes(keyword) ||
        (skill.description || '').toLowerCase().includes(keyword) ||
        skill.triggerKeywords?.some((triggerKeyword) =>
          triggerKeyword.toLowerCase().includes(keyword)
        ) ||
        skill.tools?.some((toolName) => toolName.toLowerCase().includes(keyword)) ||
        skill.effectiveTools?.some((toolName) => toolName.toLowerCase().includes(keyword))
      );
    });
  }, [allSkills, searchText]);

  const displayedSkills = useMemo(() => {
    if (activeTabKey === 'builtin') {
      return filteredSkills.filter(isBuiltinSkill);
    }
    if (activeTabKey === 'custom') {
      return filteredSkills.filter((s) => !isBuiltinSkill(s));
    }
    return filteredSkills;
  }, [filteredSkills, activeTabKey]);

  const tableDataSource = useMemo(() => {
    if (activeTabKey === 'builtin' && builtinViewMode === 'grouped') {
      return buildGroupedBuiltinSkills(displayedSkills, builtinSkillByKey);
    }
    return displayedSkills as SkillTableRow[];
  }, [activeTabKey, builtinViewMode, displayedSkills, builtinSkillByKey]);

  // Statistics Grid
  const statItems = useMemo(() => {
    const total = allSkills.length;
    const builtin = builtinSkillsCount;
    const custom = customSkillsCount;
    const published = allSkills.filter((s) => s.isPublished).length;

    return [
      {
        key: 'total',
        label: '技能总数',
        value: total,
        icon: <ThunderboltOutlined style={{ color: 'var(--text-secondary)' }} />,
        color: 'var(--primary-color)',
      },
      {
        key: 'builtin',
        label: '内置 Skill',
        value: builtin,
        icon: <ThunderboltOutlined style={{ color: '#10b981' }} />,
        color: '#10b981',
      },
      {
        key: 'custom',
        label: '自定义 Skill',
        value: custom,
        icon: <ApiOutlined style={{ color: '#8b5cf6' }} />,
        color: '#8b5cf6',
      },
      {
        key: 'published',
        label: '已发布',
        value: published,
        icon: <RocketOutlined style={{ color: 'var(--success-color)' }} />,
        color: 'var(--success-color)',
      },
      {
        key: 'requests',
        label: '待审批申请',
        value: pendingRequestsCount,
        icon: (
          <SafetyCertificateOutlined
            style={{ color: pendingRequestsCount > 0 ? '#ff4d4f' : '#10b981' }}
          />
        ),
        color: pendingRequestsCount > 0 ? '#ff4d4f' : '#10b981',
      },
    ];
  }, [allSkills, builtinSkillsCount, customSkillsCount, pendingRequestsCount]);

  // Handlers
  const handleCreate = () => {
    setEditingSkill(null);
    setEditModalVisible(true);
  };

  const handleEdit = (skill: SkillConfigDTO) => {
    setEditingSkill(skill);
    setEditModalVisible(true);
  };

  const handleViewDetail = (skill: SkillConfigDTO) => {
    setSelectedSkill(skill);
    setDetailModalVisible(true);
  };

  const handleManagePermissions = (skill: SkillConfigDTO) => {
    setSelectedSkill(skill);
    setPermissionModalVisible(true);
  };

  const handleSaveSkill = (data: CreateSkillDTO, editingSkillId?: string) => {
    if (editingSkillId) {
      updateMutation.mutate({ id: editingSkillId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleSearchChange = (nextValue: string) => {
    setSearchText(nextValue);
    if (nextValue) {
      setSearchParams({ q: nextValue }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  if (embedded) {
    return (
      <div style={{ padding: 24 }}>
        {selectedSkill ? (
          <SkillDetailContent skill={selectedSkill} embedded />
        ) : (
          <Empty description="未找到技能详情" />
        )}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', padding: '0 24px' }}>
      <OverviewStatGrid items={statItems} />

      {pendingRequestsCount > 0 && activeTabKey !== 'requests' && (
        <Alert
          type="warning"
          showIcon
          icon={<SafetyCertificateOutlined style={{ fontSize: 16 }} />}
          style={{
            marginBottom: 16,
            borderRadius: 12,
          }}
          message={
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 500 }}>
                当前有 <b>{pendingRequestsCount}</b> 个待处理的用户技能授权申请等待审批。
              </span>
              <Button
                type="primary"
                size="small"
                style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
                onClick={() => {
                  setActiveTabKey('requests');
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      next.set('tab', 'requests');
                      return next;
                    },
                    { replace: true }
                  );
                }}
              >
                立即处理申请
              </Button>
            </div>
          }
        />
      )}

      <Card
        styles={{ body: { padding: '20px 24px' } }}
        style={{
          borderRadius: 16,
          border: '1px solid var(--bg-secondary)',
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {activeTabKey !== 'requests' && (
          <SkillPageHeader
            searchText={searchText}
            onSearchChange={handleSearchChange}
            displayedCount={displayedSkills.length}
            activeTabKey={activeTabKey}
            builtinViewMode={builtinViewMode}
            onBuiltinViewModeChange={setBuiltinViewMode}
            onRefresh={() => {
              skillsQuery.refetch();
              builtinSkillsQuery.refetch();
            }}
            onCreate={handleCreate}
          />
        )}

        <SkillAdminTabs
          activeKey={activeTabKey}
          onTabChange={(key) => {
            setActiveTabKey(key);
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', key);
                return next;
              },
              { replace: true }
            );
          }}
          builtinSkillsCount={builtinSkillsCount}
          customSkillsCount={customSkillsCount}
          allSkillsCount={allSkills.length}
          pendingRequestsCount={pendingRequestsCount}
          requestsContent={
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <Space size={8} align="center">
                    <SafetyCertificateOutlined
                      style={{ fontSize: 18, color: 'var(--primary-color)' }}
                    />
                    <span style={{ fontSize: 16, fontWeight: 600 }}>用户技能授权申请审批</span>
                    <Tag color={pendingRequestsCount > 0 ? 'error' : 'success'}>
                      {pendingRequestsCount > 0
                        ? `${pendingRequestsCount} 条待处理`
                        : '所有申请均已处理'}
                    </Tag>
                  </Space>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    集中审核用户对受限技能的使用申请，批准后将自动为申请人所在角色授予该技能权限。
                  </div>
                </div>
                <Space>
                  <Radio.Group
                    value={requestSubTab}
                    onChange={(e) => setRequestSubTab(e.target.value)}
                    buttonStyle="solid"
                    size="middle"
                  >
                    <Radio.Button value="pending">
                      待审批 ({pendingRequestsCount})
                    </Radio.Button>
                    <Radio.Button value="approved">
                      已批准 ({globalApprovedAccessRequestsQuery.data?.requests?.length || 0})
                    </Radio.Button>
                    <Radio.Button value="rejected">
                      已驳回 ({globalRejectedAccessRequestsQuery.data?.requests?.length || 0})
                    </Radio.Button>
                  </Radio.Group>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => {
                      globalPendingAccessRequestsQuery.refetch();
                      globalApprovedAccessRequestsQuery.refetch();
                      globalRejectedAccessRequestsQuery.refetch();
                    }}
                  >
                    刷新
                  </Button>
                </Space>
              </div>

              <SkillAccessRequestReviewTab
                requests={
                  requestSubTab === 'pending'
                    ? globalPendingAccessRequestsQuery.data?.requests || []
                    : requestSubTab === 'approved'
                      ? globalApprovedAccessRequestsQuery.data?.requests || []
                      : globalRejectedAccessRequestsQuery.data?.requests || []
                }
                loading={
                  requestSubTab === 'pending'
                    ? globalPendingAccessRequestsQuery.isLoading
                    : requestSubTab === 'approved'
                      ? globalApprovedAccessRequestsQuery.isLoading
                      : globalRejectedAccessRequestsQuery.isLoading
                }
                processingRequestId={processingAccessRequestId}
                processingAction={processingAccessRequestAction}
                onApprove={handleApproveAccessRequest}
                onReject={handleRejectAccessRequest}
                enableReviewActions={requestSubTab === 'pending'}
                showSkillColumn={true}
                searchable={true}
                pagination={{ pageSize: 10 }}
                emptyText={
                  requestSubTab === 'pending'
                    ? '当前没有待处理的授权申请'
                    : '暂无相关记录'
                }
              />
            </div>
          }
        >
          <SkillListTable
            dataSource={tableDataSource}
            loading={skillsQuery.isLoading || builtinSkillsQuery.isLoading}
            validatingSkillId={validatingSkillId}
            builtinSkillByKey={builtinSkillByKey}
            pendingRequestCountBySkillId={pendingRequestCountBySkillId}
            onViewDetail={handleViewDetail}
            onValidate={handleValidate}
            onEdit={handleEdit}
            onManagePermissions={handleManagePermissions}
            onDelete={(id, name) => confirmDeleteSkill(id, name)}
            onConfigureBuiltin={(skill) => setConfiguringBuiltinSkill(skill)}
            onToggleBuiltinEnabled={(capabilityKey, enabled) =>
              builtinEnabledMutation.mutate({ capabilityKey, enabled })
            }
            builtinEnabledLoading={builtinEnabledMutation.isLoading}
            builtinEnabledTargetKey={builtinEnabledMutation.variables?.capabilityKey}
          />
        </SkillAdminTabs>
      </Card>

      <BuiltinSkillRuntimeConfigDrawer
        skill={configuringBuiltinSkill}
        open={Boolean(configuringBuiltinSkill)}
        onClose={() => setConfiguringBuiltinSkill(null)}
      />

      <SkillDetailModal
        open={detailModalVisible}
        skill={selectedSkill}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedSkill(null);
        }}
        onDelete={(id, name) => confirmDeleteSkill(id, name)}
        deleteLoading={deleteMutation.isLoading}
      />

      <SkillEditModal
        open={editModalVisible}
        editingSkill={editingSkill}
        onClose={() => {
          setEditModalVisible(false);
          setEditingSkill(null);
        }}
        onSave={handleSaveSkill}
        onDelete={(id, name) => confirmDeleteSkill(id, name)}
        onValidate={(skill) => handleValidate(skill)}
        validatingSkillId={validatingSkillId}
        saveLoading={createMutation.isLoading || updateMutation.isLoading}
        deleteLoading={deleteMutation.isLoading}
        templateOptions={templateOptions}
        templatesLoading={templatesQuery.isLoading}
        executionFlowTemplates={executionFlowTemplatesQuery.data?.templates || []}
        executionFlowTemplatesLoading={executionFlowTemplatesQuery.isLoading}
      />

      <SkillPermissionModal
        open={permissionModalVisible}
        selectedSkill={selectedSkill}
        onClose={() => {
          setPermissionModalVisible(false);
          setSelectedSkill(null);
        }}
        permissions={permissionsQuery.data?.permissions || []}
        permissionsLoading={permissionsQuery.isLoading}
        roles={rolesQuery.data?.roles || []}
        rolesLoading={rolesQuery.isLoading}
        permissionUsers={permissionUsersQuery.data?.users || []}
        permissionUsersLoading={permissionUsersQuery.isLoading}
        accessRequests={accessRequestsQuery.data?.requests || []}
        accessRequestsLoading={accessRequestsQuery.isLoading}
        approvedAccessRequests={approvedAccessRequestsQuery.data?.requests || []}
        approvedAccessRequestsLoading={approvedAccessRequestsQuery.isLoading}
        rejectedAccessRequests={rejectedAccessRequestsQuery.data?.requests || []}
        rejectedAccessRequestsLoading={rejectedAccessRequestsQuery.isLoading}
        processingAccessRequestId={processingAccessRequestId}
        processingAccessRequestAction={processingAccessRequestAction}
        grantLoading={grantMutation.isLoading}
        onGrantRole={(roleId) => {
          if (selectedSkill) grantMutation.mutate({ skillId: selectedSkill.id, roleId });
        }}
        onRevokeRole={(roleId) => {
          if (selectedSkill) revokeMutation.mutate({ skillId: selectedSkill.id, roleId });
        }}
        onApproveAccessRequest={handleApproveAccessRequest}
        onRejectAccessRequest={handleRejectAccessRequest}
      />

      <SkillValidationModal
        open={validationModalVisible}
        selectedSkill={selectedSkill}
        validatingSkillId={validatingSkillId}
        validationResult={validationResult}
        validationLogs={validationLogs}
        validationStage={validationStage}
        validationProgressMeta={validationProgressMeta}
        validationAnimatedDots={validationAnimatedDots}
        onClose={handleCloseValidationModal}
        onApplySuggestion={() => handleApplySuggestion(selectedSkill)}
        applyLoading={applyAdjustmentMutation.isLoading}
      />
    </div>
  );
};

export default SkillAdminPage;
