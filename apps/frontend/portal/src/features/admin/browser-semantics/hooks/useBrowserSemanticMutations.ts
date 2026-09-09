import { message } from 'antd';
import { useMutation } from 'react-query';
import {
  browserSemanticsApi,
  type SemanticRuleCategory,
  type SemanticRuleSet,
  type SemanticRuleValidationResult,
  type GenerateSemanticRuleSetDraftResponse,
} from '@/api/browser-semantics';
import {
  buildUpdateRuleSetPayload,
  DEFAULT_DOMAIN_CODE,
  type SemanticRuleFormValuesItem,
  type SemanticRuleSetFormValues,
} from '../lib/ruleSetForm';

interface UseBrowserSemanticMutationsProps {
  domainCode: string;
  selectedRuleSet?: SemanticRuleSet;
  refreshQueries: () => Promise<void>;
  onEditorClose: () => void;
  onRollbackClose: () => void;
  onCategoryReplaceClose: () => void;
  onGenerationPreviewOpen: (draft: GenerateSemanticRuleSetDraftResponse, category?: SemanticRuleCategory | null) => void;
  onGenerationPreviewClose: () => void;
  onNewDraftCreated: (newRuleSetId: string) => void;
  onValidationSuccess: (result: SemanticRuleValidationResult) => void;
}

export const useBrowserSemanticMutations = ({
  domainCode,
  selectedRuleSet,
  refreshQueries,
  onEditorClose,
  onRollbackClose,
  onCategoryReplaceClose,
  onGenerationPreviewOpen,
  onGenerationPreviewClose,
  onNewDraftCreated,
  onValidationSuccess,
}: UseBrowserSemanticMutationsProps) => {
  const promoteCanaryMutation = useMutation(
    (ruleSetId: string) =>
      browserSemanticsApi.promoteToCanary(ruleSetId, { release_note: 'Portal 手工发布为 CANARY' }),
    {
      onSuccess: async () => {
        message.success('已发布为 CANARY 灰度');
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '发布失败');
      },
    }
  );

  const promoteActiveMutation = useMutation(
    (ruleSetId: string) =>
      browserSemanticsApi.promoteToActive(ruleSetId, { release_note: 'Portal 手工发布为 ACTIVE' }),
    {
      onSuccess: async () => {
        message.success('已发布为 ACTIVE 正式版本');
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '发布失败');
      },
    }
  );

  const updateMutation = useMutation(
    ({ id, values }: { id: string; values: SemanticRuleSetFormValues }) =>
      browserSemanticsApi.updateRuleSet(id, buildUpdateRuleSetPayload(values)),
    {
      onSuccess: async (updated) => {
        message.success(`规则集「${updated.name}」已更新`);
        onEditorClose();
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '更新失败');
      },
    }
  );

  const rollbackMutation = useMutation(
    ({ id, target_rule_set_id, reason }: { id: string; target_rule_set_id: string; reason: string }) =>
      browserSemanticsApi.rollbackRuleSet(id, { target_rule_set_id, reason }),
    {
      onSuccess: async () => {
        message.success('已完成回滚');
        onRollbackClose();
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '回滚失败');
      },
    }
  );

  const replaceCategoryMutation = useMutation(
    ({ id, category, rules }: { id: string; category: SemanticRuleCategory; rules: SemanticRuleFormValuesItem[] }) =>
      browserSemanticsApi.replaceRuleCategory(id, category, {
        rules: rules.map((r) => ({
          type: r.type,
          category: r.category || category,
          name: r.name,
          enabled: r.enabled ?? true,
          priority: r.priority,
          stop_on_match: r.stop_on_match ?? false,
          flags: r.flags || '',
          patterns: r.patterns.split('\n').filter(Boolean),
          outputs: JSON.parse(r.outputs || '{}'),
        })),
      }),
    {
      onSuccess: async () => {
        message.success('分类规则替换成功');
        onCategoryReplaceClose();
        onGenerationPreviewClose();
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '替换分类规则失败');
      },
    }
  );

  const generateCategoryDraftMutation = useMutation(
    async ({ category, errorLogIds }: { category: SemanticRuleCategory; errorLogIds?: string[] }) => {
      if (!selectedRuleSet) throw new Error('未找到当前规则集');
      return browserSemanticsApi.generateRuleSetDraft({
        domain_code: selectedRuleSet.domain?.code || domainCode,
        rule_set_id: selectedRuleSet.id,
        category,
        error_log_ids: errorLogIds,
        max_logs: 20,
        created_by: 'portal_ai_review',
      });
    },
    {
      onSuccess: (draft, variables) => {
        onGenerationPreviewOpen(draft, variables.category);
        if (draft.generated) {
          message.success(`已生成 ${variables.category} 类候选规则草案`);
        } else {
          message.warning(draft.reason || `未生成 ${variables.category} 类草案`);
        }
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '分类草案生成失败');
      },
    }
  );

  const generateCreateDraftMutation = useMutation(
    async (errorLogIds?: string[]) => {
      return browserSemanticsApi.generateRuleSetDraft({
        domain_code: domainCode.trim() || DEFAULT_DOMAIN_CODE,
        error_log_ids: errorLogIds,
        max_logs: 20,
        created_by: 'portal_ai_review',
      });
    },
    {
      onSuccess: (draft) => {
        onGenerationPreviewOpen(draft, null);
        if (draft.generated) {
          message.success('已基于错误样本生成候选草案');
        } else {
          message.warning(draft.reason || '当前没有可用的错误样本');
        }
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || 'AI 审查新建失败');
      },
    }
  );

  const commitDraftMutation = useMutation(
    async (generationPreview?: GenerateSemanticRuleSetDraftResponse) => {
      if (!generationPreview?.generated) throw new Error('无可用草案');
      return browserSemanticsApi.commitRuleSetDraft({
        generation_trace_id: generationPreview.generation_trace_id,
        draft_rule_set: {
          ...generationPreview.draft_rule_set,
          based_on_rule_set_id: selectedRuleSet?.id,
        },
        based_on_rule_set_id: selectedRuleSet?.id,
      });
    },
    {
      onSuccess: async (res) => {
        message.success('新草案已创建并载入工作区');
        onGenerationPreviewClose();
        onNewDraftCreated(res.rule_set.id);
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '创建草案失败');
      },
    }
  );

  const validateMutation = useMutation(
    async (ruleSetId: string) => browserSemanticsApi.validateRuleSet(ruleSetId),
    {
      onSuccess: (result) => {
        onValidationSuccess(result);
        if (result.valid) {
          message.success('规则语法验证通过，允许发布');
        } else {
          message.error(result.errors[0] || '规则验证失败');
        }
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '验证失败');
      },
    }
  );

  return {
    promoteCanaryMutation,
    promoteActiveMutation,
    updateMutation,
    rollbackMutation,
    replaceCategoryMutation,
    generateCategoryDraftMutation,
    generateCreateDraftMutation,
    commitDraftMutation,
    validateMutation,
  };
};
