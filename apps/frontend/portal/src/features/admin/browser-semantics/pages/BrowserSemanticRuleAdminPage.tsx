import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Drawer, Empty, Space, Tooltip, Typography, message, theme } from 'antd';
import {
  EditOutlined,
  HistoryOutlined,
  ReloadOutlined,
  RobotOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  browserSemanticsApi,
  type GenerateSemanticRuleSetDraftResponse,
  type SemanticRuleErrorLog,
  type SemanticRuleCategory,
  type SemanticRuleValidationResult,
} from '@/api/browser-semantics';
import SemanticRuleCategoryReplaceModal from '../components/SemanticRuleCategoryReplaceModal';
import SemanticRuleGenerationPreviewModal from '../components/SemanticRuleGenerationPreviewModal';
import SemanticRuleReviewWorkspace from '../components/SemanticRuleReviewWorkspace';
import SemanticRuleSetSidebar from '../components/SemanticRuleSetSidebar';
import SemanticRuleSetDetailContent from '../components/SemanticRuleSetDetailContent';
import SemanticRuleSetFormModal from '../components/SemanticRuleSetFormModal';
import SemanticRuleSetRollbackModal from '../components/SemanticRuleSetRollbackModal';
import {
  buildCreateSemanticRulePayloads,
  buildRuleFormValuesItemsFromRules,
  buildRuleSetFormValuesFromRuleSet,
  buildUpdateRuleSetPayload,
  DEFAULT_DOMAIN_CODE,
  renderJsonText,
  type SemanticRuleFormValuesItem,
  type SemanticRuleSetFormValues,
} from '../lib/ruleSetForm';

const { Title } = Typography;

const FIXED_RULE_REVIEW_CATEGORIES: SemanticRuleCategory[] = [
  'LOGIN',
  'NAVIGATION',
  'FIELD_FILL',
  'MENU_SELECTION',
  'DETAIL_OPEN',
  'READ_VALUE',
  'ROW_ACTION',
  'SEARCH',
  'GENERIC_ALIAS',
];

const CATEGORY_LOG_PATTERNS: Record<SemanticRuleCategory, RegExp> = {
  LOGIN: /(登录|log\s*in|signin|sign\s*in)/i,
  NAVIGATION: /(打开|进入|访问|前往|navigate|go to|open|visit)/i,
  FIELD_FILL: /(填写|输入|录入|填入|input|type|fill)/i,
  MENU_SELECTION: /(菜单|选择|选中|勾选|select|choose|pick|list)/i,
  DETAIL_OPEN: /(详情|明细|detail)/i,
  READ_VALUE: /(读取|查看|获取|提取|read|extract|get value)/i,
  ROW_ACTION: /(行|记录|row|delete|edit|update|remove)/i,
  SEARCH: /(搜索|查询|search|filter)/i,
  GENERIC_ALIAS: /.+/i,
};

const matchErrorLogsByCategory = (
  logs: SemanticRuleErrorLog[],
  category: SemanticRuleCategory | null
) => {
  if (!category) {
    return logs;
  }

  const matcher = CATEGORY_LOG_PATTERNS[category];
  const matched = logs.filter((log) =>
    matcher.test(
      [log.inputText, log.normalizedInput, log.errorMessage, log.observationSummary]
        .filter(Boolean)
        .join(' ')
    )
  );

  return matched.length ? matched : logs;
};

const BrowserSemanticRuleAdminPage: React.FC = () => {
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const domainCode = DEFAULT_DOMAIN_CODE;
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [rollbackVisible, setRollbackVisible] = useState(false);
  const [categoryReplaceVisible, setCategoryReplaceVisible] = useState(false);
  const [categoryReplaceTarget, setCategoryReplaceTarget] = useState<SemanticRuleCategory | null>(null);
  const [categoryReplaceInitialRules, setCategoryReplaceInitialRules] = useState<SemanticRuleFormValuesItem[]>([]);
  const [generationPreviewVisible, setGenerationPreviewVisible] = useState(false);
  const [generationTargetCategory, setGenerationTargetCategory] = useState<SemanticRuleCategory | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SemanticRuleCategory | null>(null);
  const [hitLogTraceIdInput, setHitLogTraceIdInput] = useState('');
  const [appliedHitLogTraceId, setAppliedHitLogTraceId] = useState('');
  const [selectedReviewErrorLogIds, setSelectedReviewErrorLogIds] = useState<string[]>([]);
  const [generationPreview, setGenerationPreview] = useState<
    GenerateSemanticRuleSetDraftResponse | undefined
  >();
  const [editorInitialValues, setEditorInitialValues] = useState<SemanticRuleSetFormValues | null>(null);
  const [validationResult, setValidationResult] = useState<SemanticRuleValidationResult | null>(null);
  const [versionSidebarCollapsed, setVersionSidebarCollapsed] = useState(true);

  const listQuery = useQuery(
    ['browser-semantics-rule-sets', domainCode],
    () =>
      browserSemanticsApi.listRuleSets({
        domain_code: domainCode.trim() || undefined,
      })
  );
  const reviewErrorLogsQuery = useQuery(
    ['browser-semantics-review-error-logs', domainCode],
    () =>
      browserSemanticsApi.listErrorLogs({
        domain_code: domainCode.trim() || undefined,
      }),
    { enabled: !!domainCode.trim() }
  );
  const activeRuleSetQuery = useQuery(
    ['browser-semantics-active-rule-set-preview', domainCode],
    async () => {
      const result = await browserSemanticsApi.listRuleSets({
        domain_code: domainCode.trim() || undefined,
        status: 'ACTIVE',
      });
      return result[0];
    },
    { enabled: !!domainCode.trim() }
  );

  const detailQuery = useQuery(
    ['browser-semantics-rule-set-detail', selectedRuleSetId],
    () => browserSemanticsApi.getRuleSetById(selectedRuleSetId!),
    { enabled: !!selectedRuleSetId }
  );
  const hitLogsQuery = useQuery(
    ['browser-semantics-rule-hit-logs', selectedRuleSetId, appliedHitLogTraceId],
    () =>
      browserSemanticsApi.listHitLogs({
        rule_set_id: selectedRuleSetId!,
        trace_id: appliedHitLogTraceId.trim() || undefined,
      }),
    { enabled: !!selectedRuleSetId }
  );
  const errorLogsQuery = useQuery(
    ['browser-semantics-rule-error-logs', selectedRuleSetId],
    () =>
      browserSemanticsApi.listErrorLogs({
        rule_set_id: selectedRuleSetId!,
      }),
    { enabled: !!selectedRuleSetId }
  );
  const selectedRuleSet = detailQuery.data;
  const releasesQuery = useQuery(
    ['browser-semantics-rule-releases', selectedRuleSet?.domain?.code, selectedRuleSet?.key],
    () =>
      browserSemanticsApi.listReleases({
        domain_code: selectedRuleSet?.domain?.code,
        key: selectedRuleSet?.key,
      }),
    { enabled: !!selectedRuleSet?.domain?.code && !!selectedRuleSet?.key }
  );
  const rollbackCandidatesQuery = useQuery(
    ['browser-semantics-rollback-candidates', selectedRuleSet?.domain?.code, selectedRuleSet?.key],
    () =>
      browserSemanticsApi.listRuleSets({
        domain_code: selectedRuleSet?.domain?.code,
        key: selectedRuleSet?.key,
      }),
    { enabled: !!selectedRuleSet?.domain?.code && !!selectedRuleSet?.key }
  );

  const refreshQueries = async () => {
    await queryClient.invalidateQueries(['browser-semantics-rule-sets']);
    await queryClient.invalidateQueries(['browser-semantics-review-error-logs']);
    await queryClient.invalidateQueries(['browser-semantics-active-rule-set-preview']);
    await queryClient.invalidateQueries(['browser-semantics-rule-set-detail', selectedRuleSetId]);
    await queryClient.invalidateQueries(['browser-semantics-rule-hit-logs', selectedRuleSetId]);
    await queryClient.invalidateQueries(['browser-semantics-rule-error-logs', selectedRuleSetId]);
    await queryClient.invalidateQueries(['browser-semantics-rule-releases']);
    await queryClient.invalidateQueries(['browser-semantics-rollback-candidates']);
  };

  const promoteCanaryMutation = useMutation(
    (ruleSetId: string) =>
      browserSemanticsApi.promoteToCanary(ruleSetId, { release_note: 'Portal 手工发布为 CANARY' }),
    {
      onSuccess: async () => {
        message.success('已发布为 CANARY');
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
        message.success('已发布为 ACTIVE');
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '发布失败');
      },
    }
  );

  const updateMutation = useMutation(
    ({
      id,
      values,
    }: {
      id: string;
      values: SemanticRuleSetFormValues;
    }) => browserSemanticsApi.updateRuleSet(id, buildUpdateRuleSetPayload(values)),
    {
      onSuccess: async (updatedRuleSet) => {
        message.success(`规则集「${updatedRuleSet.name}」已更新`);
        setEditorVisible(false);
        setValidationResult(null);
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '更新失败');
      },
    }
  );
  const rollbackMutation = useMutation(
    ({
      id,
      target_rule_set_id,
      reason,
    }: {
      id: string;
      target_rule_set_id: string;
      reason: string;
    }) => browserSemanticsApi.rollbackRuleSet(id, { target_rule_set_id, reason }),
    {
      onSuccess: async () => {
        message.success('已完成回滚');
        setRollbackVisible(false);
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '回滚失败');
      },
    }
  );
  const replaceCategoryMutation = useMutation(
    ({
      id,
      category,
      rules,
    }: {
      id: string;
      category: SemanticRuleCategory;
      rules: SemanticRuleFormValuesItem[];
    }) =>
      browserSemanticsApi.replaceRuleCategory(id, category, {
        rules: buildCreateSemanticRulePayloads(rules, category),
      }),
    {
      onSuccess: async () => {
        message.success('已完成该类别规则替换');
        setCategoryReplaceVisible(false);
        setGenerationPreviewVisible(false);
        setGenerationTargetCategory(null);
        setValidationResult(null);
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '类别规则替换失败');
      },
    }
  );
  const generateDraftMutation = useMutation(
    async () => {
      if (!selectedRuleSet) {
        throw new Error('未找到当前规则集');
      }

      return browserSemanticsApi.generateRuleSetDraft({
        domain_code: selectedRuleSet.domain?.code || domainCode,
        rule_set_id: selectedRuleSet.id,
        max_logs: 20,
        created_by: 'portal_ai_review',
      });
    },
    {
      onSuccess: (draft) => {
        setGenerationTargetCategory(null);
        setGenerationPreview(draft);
        setGenerationPreviewVisible(true);
        if (draft.generated) {
          message.success('已生成候选规则草案');
          return;
        }
        message.warning(draft.reason || '未生成候选规则草案');
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '生成草案失败');
      },
    }
  );
  const generateCategoryDraftMutation = useMutation(
    async (category: SemanticRuleCategory) => {
      if (!selectedRuleSet) {
        throw new Error('未找到当前规则集');
      }

      return browserSemanticsApi.generateRuleSetDraft({
        domain_code: selectedRuleSet.domain?.code || domainCode,
        rule_set_id: selectedRuleSet.id,
        category,
        max_logs: 20,
        created_by: 'portal_ai_review',
      });
    },
    {
      onSuccess: (draft, category) => {
        setGenerationTargetCategory(category);
        setGenerationPreview(draft);
        setGenerationPreviewVisible(true);
        if (draft.generated) {
          message.success(`已生成 ${category} 类候选规则草案`);
          return;
        }
        message.warning(draft.reason || `未生成 ${category} 类候选规则草案`);
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '分类草案生成失败');
      },
    }
  );
  const generateCreateDraftMutation = useMutation(
    async () => {
      const effectiveDomainCode = domainCode.trim() || DEFAULT_DOMAIN_CODE;

      return browserSemanticsApi.generateRuleSetDraft({
        domain_code: effectiveDomainCode,
        error_log_ids: selectedReviewErrorLogIds.length ? selectedReviewErrorLogIds : undefined,
        max_logs: 20,
        created_by: 'portal_ai_review',
      });
    },
    {
      onSuccess: (draft) => {
        setGenerationTargetCategory(null);
        setGenerationPreview(draft);
        setGenerationPreviewVisible(true);
        if (draft.generated) {
          message.success(
            selectedReviewErrorLogIds.length
              ? `已基于选中的 ${selectedReviewErrorLogIds.length} 条错误样本生成候选草案`
              : '已基于最新错误样本生成候选草案'
          );
          return;
        }
        message.warning(draft.reason || '当前没有可用于生成的错误样本');
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || 'AI 审查新建失败');
      },
    }
  );
  const commitDraftMutation = useMutation(
    async () => {
      if (!generationPreview?.generated) {
        throw new Error('当前没有可提交的草案');
      }

      return browserSemanticsApi.commitRuleSetDraft({
        generation_trace_id: generationPreview.generation_trace_id,
        draft_rule_set: {
          ...generationPreview.draft_rule_set,
          based_on_rule_set_id: selectedRuleSet?.id,
        },
        based_on_rule_set_id: selectedRuleSet?.id,
        source_error_log_ids: generationPreview.summary.source_error_log_ids,
        review_notes: [
          `portal review from rule set ${selectedRuleSet?.id || 'unknown'}`,
          `sample_count=${generationPreview.summary.sample_count}`,
          `rule_count=${generationPreview.summary.rule_count}`,
          generationTargetCategory ? `category=${generationTargetCategory}` : undefined,
        ].filter((value): value is string => Boolean(value)),
      });
    },
    {
      onSuccess: async (result) => {
        message.success(`已创建 DRAFT 规则集「${result.rule_set.name}」`);
        setGenerationPreviewVisible(false);
        setGenerationTargetCategory(null);
        setSelectedRuleSetId(result.rule_set.id);
        setDetailVisible(true);
        await refreshQueries();
        await queryClient.invalidateQueries(['browser-semantics-rule-set-detail', result.rule_set.id]);
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '创建 DRAFT 失败');
      },
    }
  );
  const rollbackCandidates = useMemo(
    () =>
      (rollbackCandidatesQuery.data || []).filter((candidate) => candidate.id !== selectedRuleSet?.id),
    [rollbackCandidatesQuery.data, selectedRuleSet?.id]
  );
  const reviewErrorLogs = reviewErrorLogsQuery.data || [];
  const activeRuleSet = activeRuleSetQuery.data;
  const currentPreviewCategoryRules = useMemo(() => {
    if (!generationTargetCategory || !selectedRuleSet) {
      return [];
    }

    return selectedRuleSet.rules.filter(
      (rule) => (rule.category || 'GENERIC_ALIAS') === generationTargetCategory
    );
  }, [generationTargetCategory, selectedRuleSet]);
  const selectedRuleSetCategories = useMemo(
    () =>
      Array.from(
        new Set(
          (selectedRuleSet?.rules || [])
            .map((rule) => (rule.category || 'GENERIC_ALIAS') as SemanticRuleCategory)
            .filter(Boolean)
        )
      ),
    [selectedRuleSet]
  );
  const workspaceErrorLogs = errorLogsQuery.data?.length ? errorLogsQuery.data : reviewErrorLogs;
  const relatedCategoryErrorLogs = useMemo(
    () => matchErrorLogsByCategory(workspaceErrorLogs, selectedCategory).slice(0, 8),
    [selectedCategory, workspaceErrorLogs]
  );
  const relatedErrorLogsSourceLabel = errorLogsQuery.data?.length
    ? '当前选中规则集的错误日志'
    : '当前 domain 的全局错误样本';

  useEffect(() => {
    if (!selectedRuleSetId) {
      if (activeRuleSet?.id) {
        setSelectedRuleSetId(activeRuleSet.id);
        return;
      }

      if (listQuery.data?.[0]?.id) {
        setSelectedRuleSetId(listQuery.data[0].id);
      }
    }
  }, [activeRuleSet?.id, listQuery.data, selectedRuleSetId]);

  useEffect(() => {
    setValidationResult(null);
  }, [selectedRuleSetId]);

  useEffect(() => {
    if (!selectedRuleSet) {
      setSelectedCategory(null);
      return;
    }

    if (!selectedCategory || !FIXED_RULE_REVIEW_CATEGORIES.includes(selectedCategory)) {
      const preferredCategory =
        FIXED_RULE_REVIEW_CATEGORIES.find((category) => selectedRuleSetCategories.includes(category)) ||
        FIXED_RULE_REVIEW_CATEGORIES[0];
      setSelectedCategory(preferredCategory);
    }
  }, [selectedCategory, selectedRuleSet, selectedRuleSetCategories]);

  useEffect(() => {
    setSelectedReviewErrorLogIds((currentIds) =>
      currentIds.filter((id) => reviewErrorLogs.some((log) => log.id === id))
    );
  }, [reviewErrorLogs]);

  const safeEditorInitialValues = useMemo(() => {
    if (editorInitialValues) {
      return editorInitialValues;
    }

    if (selectedRuleSet) {
      return buildRuleSetFormValuesFromRuleSet(selectedRuleSet);
    }

    return null;
  }, [editorInitialValues, selectedRuleSet]);

  const openEditModal = () => {
    if (!selectedRuleSet) {
      return;
    }
    setEditorInitialValues(buildRuleSetFormValuesFromRuleSet(selectedRuleSet));
    setEditorVisible(true);
  };

  const openCategoryReplaceModal = (category: SemanticRuleCategory) => {
    if (!selectedRuleSet) {
      return;
    }

    const categoryRules = selectedRuleSet.rules.filter((rule) => (rule.category || 'GENERIC_ALIAS') === category);
    setCategoryReplaceTarget(category);
    setCategoryReplaceInitialRules(buildRuleFormValuesItemsFromRules(categoryRules, category));
    setCategoryReplaceVisible(true);
  };

  const handleGenerateCategoryDraft = (category: SemanticRuleCategory) => {
    setGenerationTargetCategory(category);
    generateCategoryDraftMutation.mutate(category);
  };

  const validateMutation = useMutation(
    async (ruleSetId: string) => browserSemanticsApi.validateRuleSet(ruleSetId),
    {
      onSuccess: (result) => {
        setValidationResult(result);
        if (result.valid) {
          message.success('规则验证通过，允许继续发布');
          return;
        }

        message.error(result.errors[0] || '规则验证失败');
      },
      onError: (error: any) => {
        message.error(error?.response?.data?.message || error?.message || '规则验证失败');
      },
    }
  );

  const handleValidateSelectedRuleSet = () => {
    if (!selectedRuleSet) {
      message.error('当前没有可验证的规则集');
      return;
    }

    validateMutation.mutate(selectedRuleSet.id);
  };

  const handlePublishCanary = () => {
    if (!selectedRuleSet) {
      message.error('当前没有可发布的规则集');
      return;
    }

    if (!validationResult?.valid || validationResult.rule_set_id !== selectedRuleSet.id) {
      message.warning('请先验证规则并确保验证通过');
      return;
    }

    promoteCanaryMutation.mutate(selectedRuleSet.id);
  };

  const handlePublishActive = () => {
    if (!selectedRuleSet) {
      message.error('当前没有可发布的规则集');
      return;
    }

    if (!validationResult?.valid || validationResult.rule_set_id !== selectedRuleSet.id) {
      message.warning('请先验证规则并确保验证通过');
      return;
    }

    promoteActiveMutation.mutate(selectedRuleSet.id);
  };

  const handleSubmitEditor = async (values: SemanticRuleSetFormValues) => {
    try {
      if (!selectedRuleSetId) {
        message.error('未找到待编辑的规则集');
        return;
      }

      updateMutation.mutate({ id: selectedRuleSetId, values });
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    }
  };

  const handleSubmitRollback = async (values: { target_rule_set_id: string; reason: string }) => {
    if (!selectedRuleSetId) {
      message.error('未找到待回滚的规则集');
      return;
    }

    rollbackMutation.mutate({
      id: selectedRuleSetId,
      target_rule_set_id: values.target_rule_set_id,
      reason: values.reason,
    });
  };

  const handleSubmitCategoryReplace = async (rules: SemanticRuleFormValuesItem[]) => {
    try {
      if (!selectedRuleSetId || !categoryReplaceTarget) {
        message.error('未找到待替换的规则类别');
        return;
      }

      replaceCategoryMutation.mutate({
        id: selectedRuleSetId,
        category: categoryReplaceTarget,
        rules,
      });
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    }
  };

  const handleApplyGeneratedCategoryDraft = async () => {
    try {
      if (!selectedRuleSetId || !generationTargetCategory || !generationPreview?.generated) {
        message.error('当前没有可直接应用的分类草案');
        return;
      }

      replaceCategoryMutation.mutate({
        id: selectedRuleSetId,
        category: generationTargetCategory,
        rules: generationPreview.draft_rule_set.rules.map((rule) => ({
          type: rule.type,
          category: rule.category || generationTargetCategory,
          name: rule.name,
          enabled: rule.enabled ?? true,
          priority: rule.priority,
          stop_on_match: rule.stop_on_match ?? false,
          flags: rule.flags || '',
          patterns: Array.isArray(rule.patterns) ? rule.patterns.join('\n') : '',
          outputs: renderJsonText(rule.outputs),
        })),
      });
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    }
  };

  return (
    <div
      style={{
        padding: 24,
        background: `linear-gradient(180deg, ${token.colorFillAlter} 0%, ${token.colorBgLayout} 240px, ${token.colorBgLayout} 100%)`,
        minHeight: '100%',
      }}
    >
      <Card
        style={{
          borderRadius: 24,
          border: `1px solid ${token.colorBorderSecondary}`,
          boxShadow: token.boxShadowSecondary,
          background: token.colorBgContainer,
        }}
        styles={{ body: { padding: 24 } }}
        title={<Title level={3} style={{ margin: 0 }}>规则管理 / AI 审查</Title>}
        extra={
          <Space>
            <Tooltip title="基于当前 domain 的最新错误日志生成新的候选规则集草案">
              <Button
                type="primary"
                icon={<RobotOutlined />}
                loading={generateCreateDraftMutation.isLoading}
                disabled={!reviewErrorLogs.length}
                onClick={() => generateCreateDraftMutation.mutate()}
              >
                AI 审查新建
              </Button>
            </Tooltip>
            <Button icon={<ReloadOutlined />} onClick={() => refreshQueries()}>
              刷新
            </Button>
          </Space>
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: versionSidebarCollapsed ? '72px minmax(0, 1fr)' : '320px minmax(0, 1fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <SemanticRuleSetSidebar
            ruleSets={listQuery.data || []}
            selectedRuleSetId={selectedRuleSetId}
            activeRuleSetId={activeRuleSet?.id}
            loading={listQuery.isLoading}
            collapsed={versionSidebarCollapsed}
            publishCanaryLoading={promoteCanaryMutation.isLoading}
            publishActiveLoading={promoteActiveMutation.isLoading}
            onToggleCollapse={() => setVersionSidebarCollapsed((current) => !current)}
            onSelectRuleSet={(ruleSetId) => {
              setSelectedRuleSetId(ruleSetId);
              setSelectedCategory(null);
            }}
            onOpenDetail={(ruleSetId) => {
              setSelectedRuleSetId(ruleSetId);
              setDetailVisible(true);
            }}
            onPromoteCanary={(ruleSetId) => promoteCanaryMutation.mutate(ruleSetId)}
            onPromoteActive={(ruleSetId) => promoteActiveMutation.mutate(ruleSetId)}
          />
          <SemanticRuleReviewWorkspace
            currentRuleSet={selectedRuleSet}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            relatedErrorLogs={relatedCategoryErrorLogs}
            relatedErrorLogsLoading={errorLogsQuery.isLoading || reviewErrorLogsQuery.isLoading}
            relatedErrorLogsSourceLabel={relatedErrorLogsSourceLabel}
            onRefreshErrorLogs={() => {
              void errorLogsQuery.refetch();
              void reviewErrorLogsQuery.refetch();
            }}
            onGenerateCategoryDraft={handleGenerateCategoryDraft}
            generateCategoryLoading={generateCategoryDraftMutation.isLoading}
            generatingCategory={generationTargetCategory}
            onReplaceRuleCategory={openCategoryReplaceModal}
            replaceCategoryLoading={replaceCategoryMutation.isLoading}
            replacingCategory={categoryReplaceTarget}
            onValidateRuleSet={handleValidateSelectedRuleSet}
            validateLoading={validateMutation.isLoading}
            validationResult={validationResult}
            onPublishCanary={handlePublishCanary}
            publishCanaryLoading={promoteCanaryMutation.isLoading}
            onPublishActive={handlePublishActive}
            publishActiveLoading={promoteActiveMutation.isLoading}
            onOpenRollback={() => setRollbackVisible(true)}
            rollbackDisabled={!rollbackCandidates.length}
          />
        </div>
      </Card>

      <Drawer
        title="规则集详情"
        width={920}
        open={detailVisible}
        onClose={() => {
          setDetailVisible(false);
          setSelectedRuleSetId(null);
          setHitLogTraceIdInput('');
          setAppliedHitLogTraceId('');
        }}
      >
        {detailQuery.isLoading ? (
          <Card loading />
        ) : !selectedRuleSet ? (
          <Empty description="未找到规则集详情" />
        ) : (
          <SemanticRuleSetDetailContent
            ruleSet={selectedRuleSet}
            hitLogs={hitLogsQuery.data || []}
            hitLogsLoading={hitLogsQuery.isLoading}
            onRefreshHitLogs={() => {
              void hitLogsQuery.refetch();
            }}
            hitLogTraceId={hitLogTraceIdInput}
            onHitLogTraceIdChange={setHitLogTraceIdInput}
            onApplyHitLogFilter={() => setAppliedHitLogTraceId(hitLogTraceIdInput.trim())}
            onResetHitLogFilter={() => {
              setHitLogTraceIdInput('');
              setAppliedHitLogTraceId('');
            }}
            errorLogs={errorLogsQuery.data || []}
            errorLogsLoading={errorLogsQuery.isLoading}
            onRefreshErrorLogs={() => {
              void errorLogsQuery.refetch();
            }}
            releases={releasesQuery.data || []}
            releasesLoading={releasesQuery.isLoading}
            onRefreshReleases={() => {
              void releasesQuery.refetch();
            }}
            onGenerateCategoryDraft={handleGenerateCategoryDraft}
            generatingCategory={generationTargetCategory}
            generateCategoryLoading={generateCategoryDraftMutation.isLoading}
            onReplaceRuleCategory={openCategoryReplaceModal}
            replacingCategory={categoryReplaceTarget}
            replaceCategoryLoading={replaceCategoryMutation.isLoading}
            headerActions={
              <Space wrap>
                <Button icon={<EditOutlined />} onClick={openEditModal}>
                  编辑规则集
                </Button>
                <Tooltip title={!rollbackCandidates.length ? '需要先有同 key 的其他版本规则集作为回滚目标' : ''}>
                  <Button
                    icon={<HistoryOutlined />}
                    disabled={!rollbackCandidates.length}
                    onClick={() => setRollbackVisible(true)}
                  >
                    回滚版本
                  </Button>
                </Tooltip>
                <Tooltip title="基于当前规则集关联的错误日志生成 AI 候选草案，仅用于审核预览">
                  <Button
                    icon={<RobotOutlined />}
                    loading={generateDraftMutation.isLoading}
                    onClick={() => generateDraftMutation.mutate()}
                  >
                    AI 生成草案
                  </Button>
                </Tooltip>
                <Button
                  icon={<RocketOutlined />}
                  disabled={selectedRuleSet.status === 'CANARY'}
                  loading={promoteCanaryMutation.isLoading}
                  onClick={() => promoteCanaryMutation.mutate(selectedRuleSet.id)}
                >
                  发布 Canary
                </Button>
                <Button
                  type="primary"
                  disabled={selectedRuleSet.status === 'ACTIVE' || selectedRuleSet.status === 'DRAFT'}
                  loading={promoteActiveMutation.isLoading}
                  onClick={() => promoteActiveMutation.mutate(selectedRuleSet.id)}
                >
                  发布 Active
                </Button>
              </Space>
            }
          />
        )}
      </Drawer>

      {safeEditorInitialValues ? (
        <SemanticRuleSetFormModal
          mode="edit"
          open={editorVisible}
          title="编辑规则集"
          confirmLoading={updateMutation.isLoading}
          initialValues={safeEditorInitialValues}
          onCancel={() => setEditorVisible(false)}
          onSubmit={handleSubmitEditor}
        />
      ) : null}
      <SemanticRuleCategoryReplaceModal
        open={categoryReplaceVisible}
        category={categoryReplaceTarget}
        initialRules={categoryReplaceInitialRules}
        confirmLoading={replaceCategoryMutation.isLoading}
        onCancel={() => setCategoryReplaceVisible(false)}
        onSubmit={handleSubmitCategoryReplace}
      />
      <SemanticRuleSetRollbackModal
        open={rollbackVisible}
        loading={rollbackMutation.isLoading}
        currentRuleSet={selectedRuleSet}
        candidates={rollbackCandidates}
        onCancel={() => setRollbackVisible(false)}
        onSubmit={handleSubmitRollback}
      />
      <SemanticRuleGenerationPreviewModal
        open={generationPreviewVisible}
        loading={
          generateDraftMutation.isLoading ||
          generateCreateDraftMutation.isLoading ||
          generateCategoryDraftMutation.isLoading
        }
        confirmLoading={commitDraftMutation.isLoading}
        applyLoading={replaceCategoryMutation.isLoading}
        draft={generationPreview}
        currentCategory={generationTargetCategory}
        currentCategoryRules={currentPreviewCategoryRules}
        applyActionLabel={
          generationTargetCategory ? `直接替换 ${generationTargetCategory}` : undefined
        }
        onCancel={() => {
          setGenerationPreviewVisible(false);
          setGenerationTargetCategory(null);
        }}
        onApply={generationTargetCategory ? handleApplyGeneratedCategoryDraft : undefined}
        onConfirm={() => commitDraftMutation.mutate()}
      />
    </div>
  );
};

export default BrowserSemanticRuleAdminPage;
