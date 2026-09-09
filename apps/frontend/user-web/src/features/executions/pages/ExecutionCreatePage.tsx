import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Form,
  Space,
} from 'antd';
import {
  ArrowLeftOutlined,
  LoadingOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { credentialApi } from '@/api/credentials';
import { SkillCredentialModal } from '@/features/skills/components/SkillCredentialModal';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import ExecutionCreateAiModal from '@/features/executions/create/components/ExecutionCreateAiModal';
import ExecutionCreateFormPanel from '@/features/executions/create/components/ExecutionCreateFormPanel';
import ExecutionCreateScheduleListCard from '@/features/executions/create/components/ExecutionCreateScheduleListCard';
import ExecutionCreateSkillInfoCard from '@/features/executions/create/components/ExecutionCreateSkillInfoCard';
import {
  executionCreateContainerStyle,
  executionCreateContentGridStyle,
  executionCreateSidebarStyle,
} from '@/features/executions/create/components/executionCreateStyles';
import { useExecutionCreateActions } from '@/features/executions/create/hooks/useExecutionCreateActions';
import { useExecutionCreateForm } from '@/features/executions/create/hooks/useExecutionCreateForm';
import { useExecutionCreatePageView } from '@/features/executions/create/hooks/useExecutionCreatePageView';
import { useExecutionCreateSchedules } from '@/features/executions/create/hooks/useExecutionCreateSchedules';
import { useExecutionCreateSkillState } from '@/features/executions/create/hooks/useExecutionCreateSkillState';
import type { ExecutionCreateFormValues } from '@/features/executions/create/lib/executionCreate';
import styles from './ExecutionCreatePage.module.css';

const ExecutionCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [credentialModalOpen, setCredentialModalOpen] = useState(false);
  const [form] = Form.useForm<ExecutionCreateFormValues>();
  const {
    initialSkillId,
    isSkillOptionsLoading,
    optionalFieldCount,
    requiredFieldCount,
    schemaFields,
    selectedSkill,
    selectedSkillDisplayName,
    selectedSkillLoading,
    selectedSkillVersion,
    skillOptions,
  } = useExecutionCreateSkillState({
    form,
  });
  const credentialStatusQuery = useQuery(
    ['skill-credential-status', selectedSkill?.id],
    () => credentialApi.getSkillStatus(selectedSkill!.id),
    { enabled: Boolean(selectedSkill?.id), staleTime: 10_000 }
  );
  const credentialModalSkill = useMemo<PublishedSkillCatalogItem | null>(
    () => selectedSkill ? { ...selectedSkill, accessStatus: 'authorized' } : null,
    [selectedSkill]
  );
  const {
    aiGenerating,
    aiModalOpen,
    aiTextInput,
    executionMode,
    schedulePattern,
    selectedSkillId,
    uploadedFileName,
    handleAiGenerate,
    handleAiTextInputChange,
    handleCloseAiModal,
    handleOpenAiModal,
    handleResetForm,
    handleResetInputDefaults,
    handleSwitchToScheduleMode,
    handleUploadedFileRead,
  } = useExecutionCreateForm({
    form,
    schemaFields,
    selectedSkill,
    selectedSkillDisplayName,
  });
  const { activeScheduleCount, schedulesLoading, skillSchedules } = useExecutionCreateSchedules({
    selectedSkillId,
  });
  const {
    createMutation,
    deleteScheduleMutation,
    handleSubmit,
    scheduleMutation,
    toggleScheduleMutation,
    triggerScheduleMutation,
  } = useExecutionCreateActions({
    form,
    schemaFields,
    selectedSkillDisplayName,
    selectedSkillVersion,
    onCredentialsRequired: () => setCredentialModalOpen(true),
  });
  const formLoadingIndicator = <LoadingOutlined style={{ fontSize: 24 }} spin />;
  const {
    aiModalProps,
    scheduleListCardProps,
    scheduleRuleSummary,
    skillInfoCardProps,
    statusNotices,
    submitAction,
  } = useExecutionCreatePageView({
    form,
    selectedSkill,
    selectedSkillDisplayName,
    selectedSkillId,
    selectedSkillLoading,
    schemaFields,
    executionMode,
    schedulePattern,
    createLoading: createMutation.isLoading,
    scheduleLoading: scheduleMutation.isLoading,
    schedulesLoading,
    skillSchedules,
    activeScheduleCount,
    togglingScheduleId:
      toggleScheduleMutation.isLoading ? toggleScheduleMutation.variables?.id : undefined,
    deletingScheduleId:
      deleteScheduleMutation.isLoading
        ? deleteScheduleMutation.variables
        : undefined,
    triggeringScheduleId:
      triggerScheduleMutation.isLoading
        ? triggerScheduleMutation.variables
        : undefined,
    loadingIndicator: formLoadingIndicator,
    aiGenerating,
    aiModalOpen,
    aiTextInput,
    uploadedFileName,
    onAiTextInputChange: handleAiTextInputChange,
    onUploadedFileRead: handleUploadedFileRead,
    onCloseAiModal: handleCloseAiModal,
    onGenerateAiParams: () => void handleAiGenerate(),
    onSwitchToScheduleMode: handleSwitchToScheduleMode,
    onToggleSchedule: (payload) => toggleScheduleMutation.mutate(payload),
    onDeleteSchedule: (id) => deleteScheduleMutation.mutate(id),
    onTriggerSchedule: (id) => triggerScheduleMutation.mutate(id),
  });

  return (
    <div className={styles['execution-create-page']} style={executionCreateContainerStyle}>
      <div style={{ marginBottom: 16 }}>
        <Space align="center">
          <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>
            返回任务中心
          </Button>
        </Space>
      </div>

      {statusNotices.map((notice) => (
        <Alert
          key={notice.key}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={notice.message}
          description={notice.description}
        />
      ))}

      {credentialStatusQuery.data?.hasCredentialRequirements &&
        !credentialStatusQuery.data.isFullyConfigured && (
          <Alert
            type="warning"
            showIcon
            icon={<KeyOutlined />}
            style={{ marginBottom: 16 }}
            message="执行前需要配置个人凭证"
            description="该数字员工所需的 Key 或账号尚未绑定。系统不会使用部署验证凭证，也不会在缺少凭证时继续执行。"
            action={
              <Button type="primary" size="small" onClick={() => setCredentialModalOpen(true)}>
                立即配置
              </Button>
            }
          />
        )}

      <div style={executionCreateContentGridStyle}>
        <ExecutionCreateFormPanel
          form={form}
          initialSkillId={initialSkillId}
          isSkillOptionsLoading={isSkillOptionsLoading}
          isEmptySkillOptions={skillOptions.length === 0}
          skillOptions={skillOptions}
          selectedSkillId={selectedSkillId}
          schemaFields={schemaFields}
          requiredFieldCount={requiredFieldCount}
          optionalFieldCount={optionalFieldCount}
          selectedSkillLoading={selectedSkillLoading}
          loadingIndicator={formLoadingIndicator}
          onOpenAiModal={handleOpenAiModal}
          onResetDefaults={handleResetInputDefaults}
          executionMode={executionMode}
          schedulePattern={schedulePattern}
          scheduleRuleSummary={scheduleRuleSummary}
          submitAction={submitAction}
          onSubmit={handleSubmit}
          onResetForm={handleResetForm}
          onSwitchToScheduleMode={handleSwitchToScheduleMode}
          onCancel={() => navigate('/executions')}
        />

        <Space
          className="execution-create-scroll-region"
          direction="vertical"
          size="middle"
          style={executionCreateSidebarStyle}
        >
          <ExecutionCreateSkillInfoCard {...skillInfoCardProps} />
          <ExecutionCreateScheduleListCard {...scheduleListCardProps} />
        </Space>
      </div>
      <ExecutionCreateAiModal {...aiModalProps} />
      <SkillCredentialModal
        skill={credentialModalSkill}
        open={credentialModalOpen}
        onClose={() => {
          setCredentialModalOpen(false);
          void credentialStatusQuery.refetch();
        }}
      />
    </div>
  );
};

export default ExecutionCreatePage;
