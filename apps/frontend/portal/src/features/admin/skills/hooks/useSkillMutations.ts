import { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { message, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  skillApi,
  builtinSkillApi,
  CreateSkillDTO,
  SkillConfigDTO,
  SkillAccessRequestReviewDTO,
} from '@/api/skill';

interface UseSkillMutationsOptions {
  selectedSkillId?: string;
  onCreateSuccess?: () => void;
  onUpdateSuccess?: () => void;
  onDeleteSuccess?: (deletedSkillId: string) => void;
  onApplyAdjustmentSuccess?: (updatedSkill: SkillConfigDTO) => void;
}

export function useSkillMutations(options: UseSkillMutationsOptions = {}) {
  const {
    selectedSkillId,
    onCreateSuccess,
    onUpdateSuccess,
    onDeleteSuccess,
    onApplyAdjustmentSuccess,
  } = options;

  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [processingAccessRequestId, setProcessingAccessRequestId] = useState<string | null>(null);
  const [processingAccessRequestAction, setProcessingAccessRequestAction] = useState<
    'approve' | 'reject' | null
  >(null);

  const builtinEnabledMutation = useMutation(
    ({ capabilityKey, enabled }: { capabilityKey: string; enabled: boolean }) =>
      builtinSkillApi.setEnabled(capabilityKey, enabled),
    {
      onSuccess: (_, variables) => {
        message.success(variables.enabled ? '内置 Skill 已启用' : '内置 Skill 已停用');
        queryClient.invalidateQueries(['builtin-skill-inventory']);
      },
      onError: () => {
        message.error('内置 Skill 状态更新失败');
      },
    }
  );

  const createMutation = useMutation(skillApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['skills']);
      onCreateSuccess?.();
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateSkillDTO> }) => skillApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['skills']);
        onUpdateSuccess?.();
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const deleteMutation = useMutation(skillApi.delete, {
    onSuccess: (_, deletedSkillId) => {
      message.success('Skill 已删除');
      queryClient.invalidateQueries(['skills']);
      onDeleteSuccess?.(deletedSkillId);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const grantMutation = useMutation(
    ({ skillId, roleId }: { skillId: string; roleId: string }) => skillApi.grant(skillId, roleId),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['skill-permissions', selectedSkillId]);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const revokeMutation = useMutation(
    ({ skillId, roleId }: { skillId: string; roleId: string }) => skillApi.revoke(skillId, roleId),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['skill-permissions', selectedSkillId]);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const approveAccessRequestMutation = useMutation(
    ({ requestId, responseNote }: { requestId: string; responseNote?: string }) =>
      skillApi.approveAccessRequest(requestId, { responseNote }),
    {
      onMutate: ({ requestId }) => {
        setProcessingAccessRequestId(requestId);
        setProcessingAccessRequestAction('approve');
      },
      onSuccess: () => {
        message.success('授权申请已批准');
        queryClient.invalidateQueries(['skill-access-requests']);
        queryClient.invalidateQueries(['all-skill-access-requests']);
        queryClient.invalidateQueries(['skill-permissions']);
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.message || error?.message || '批准授权申请失败';
        message.error(typeof errorMessage === 'string' ? errorMessage : '批准授权申请失败');
      },
      onSettled: () => {
        setProcessingAccessRequestId(null);
        setProcessingAccessRequestAction(null);
      },
    }
  );

  const rejectAccessRequestMutation = useMutation(
    ({ requestId, responseNote }: { requestId: string; responseNote?: string }) =>
      skillApi.rejectAccessRequest(requestId, { responseNote }),
    {
      onMutate: ({ requestId }) => {
        setProcessingAccessRequestId(requestId);
        setProcessingAccessRequestAction('reject');
      },
      onSuccess: () => {
        message.success('授权申请已拒绝');
        queryClient.invalidateQueries(['skill-access-requests']);
        queryClient.invalidateQueries(['all-skill-access-requests']);
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.message || error?.message || '拒绝授权申请失败';
        message.error(typeof errorMessage === 'string' ? errorMessage : '拒绝授权申请失败');
      },
      onSettled: () => {
        setProcessingAccessRequestId(null);
        setProcessingAccessRequestAction(null);
      },
    }
  );

  const applyAdjustmentMutation = useMutation(
    ({ id, generatedSkill }: { id: string; generatedSkill?: Partial<CreateSkillDTO> }) =>
      skillApi.applyAdjustment(id, generatedSkill),
    {
      onSuccess: (updatedSkill) => {
        queryClient.invalidateQueries(['skills']);
        message.success('已应用 AI 建议，并打开技能编辑器供你确认结果');
        onApplyAdjustmentSuccess?.(updatedSkill);
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.message || error?.message || '应用建议失败';
        message.error(typeof errorMessage === 'string' ? errorMessage : '应用建议失败');
      },
    }
  );

  const confirmDeleteSkill = (id: string, name?: string) => {
    Modal.confirm({
      title: `确认删除 Skill${name ? `「${name}」` : ''}？`,
      content: '删除后无法恢复，相关角色授权也会一并失效。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const handleApproveAccessRequest = (
    request: SkillAccessRequestReviewDTO,
    responseNote?: string
  ) => {
    approveAccessRequestMutation.mutate({ requestId: request.id, responseNote });
  };

  const handleRejectAccessRequest = (
    request: SkillAccessRequestReviewDTO,
    responseNote?: string
  ) => {
    rejectAccessRequestMutation.mutate({ requestId: request.id, responseNote });
  };

  return {
    builtinEnabledMutation,
    createMutation,
    updateMutation,
    deleteMutation,
    grantMutation,
    revokeMutation,
    approveAccessRequestMutation,
    rejectAccessRequestMutation,
    applyAdjustmentMutation,
    processingAccessRequestId,
    processingAccessRequestAction,
    confirmDeleteSkill,
    handleApproveAccessRequest,
    handleRejectAccessRequest,
  };
}
