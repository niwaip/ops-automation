import React, { useEffect, useMemo, useState } from 'react';
import { Card, Drawer, Tabs, theme } from 'antd';
import {
  AppstoreOutlined,
  BugOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from 'react-query';
import {
  browserSemanticsApi,
  type GenerateSemanticRuleSetDraftResponse,
  type SemanticRuleCategory,
} from '@/api/browser-semantics';
import { BrowserSemanticHeader } from '../components/BrowserSemanticHeader';
import { BrowserSemanticOverviewCards } from '../components/BrowserSemanticOverviewCards';
import { BrowserSemanticPlayground } from '../components/BrowserSemanticPlayground';
import { BrowserSemanticRulesListTab } from '../components/BrowserSemanticRulesListTab';
import { BrowserSemanticErrorReviewTab } from '../components/BrowserSemanticErrorReviewTab';
import { BrowserSemanticReleasesTab } from '../components/BrowserSemanticReleasesTab';
import SemanticRuleCategoryReplaceModal from '../components/SemanticRuleCategoryReplaceModal';
import SemanticRuleGenerationPreviewModal from '../components/SemanticRuleGenerationPreviewModal';
import SemanticRuleSetDetailContent from '../components/SemanticRuleSetDetailContent';
import SemanticRuleSetFormModal from '../components/SemanticRuleSetFormModal';
import SemanticRuleSetRollbackModal from '../components/SemanticRuleSetRollbackModal';
import { useBrowserSemanticMutations } from '../hooks/useBrowserSemanticMutations';
import {
  buildRuleFormValuesItemsFromRules,
  buildRuleSetFormValuesFromRuleSet,
  DEFAULT_DOMAIN_CODE,
  renderJsonText,
  type SemanticRuleFormValuesItem,
  type SemanticRuleSetFormValues,
} from '../lib/ruleSetForm';

const BrowserSemanticRuleAdminPage: React.FC = () => {
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const domainCode = DEFAULT_DOMAIN_CODE;

  // Tabs & selections
  const [activeTab, setActiveTab] = useState<'rules' | 'errors' | 'releases'>('rules');
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SemanticRuleCategory | null>(null);

  // Modals & drawers
  const [detailVisible, setDetailVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [rollbackVisible, setRollbackVisible] = useState(false);
  const [categoryReplaceVisible, setCategoryReplaceVisible] = useState(false);
  const [categoryReplaceTarget, setCategoryReplaceTarget] = useState<SemanticRuleCategory | null>(null);
  const [categoryReplaceInitialRules, setCategoryReplaceInitialRules] = useState<SemanticRuleFormValuesItem[]>([]);
  const [generationPreviewVisible, setGenerationPreviewVisible] = useState(false);
  const [generationTargetCategory, setGenerationTargetCategory] = useState<SemanticRuleCategory | null>(null);
  const [generationPreview, setGenerationPreview] = useState<GenerateSemanticRuleSetDraftResponse | undefined>();
  const [editorInitialValues, setEditorInitialValues] = useState<SemanticRuleSetFormValues | null>(null);

  // Queries
  const listQuery = useQuery(
    ['browser-semantics-rule-sets', domainCode],
    () => browserSemanticsApi.listRuleSets({ domain_code: domainCode.trim() || undefined })
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

  const reviewErrorLogsQuery = useQuery(
    ['browser-semantics-review-error-logs', domainCode],
    () => browserSemanticsApi.listErrorLogs({ domain_code: domainCode.trim() || undefined }),
    { enabled: !!domainCode.trim() }
  );

  const hitLogsQuery = useQuery(
    ['browser-semantics-rule-hit-logs', selectedRuleSetId],
    () => browserSemanticsApi.listHitLogs({ rule_set_id: selectedRuleSetId! }),
    { enabled: !!selectedRuleSetId }
  );

  const selectedRuleSet = detailQuery.data;
  const activeRuleSet = activeRuleSetQuery.data;
  const reviewErrorLogs = reviewErrorLogsQuery.data || [];

  const rollbackCandidatesQuery = useQuery(
    ['browser-semantics-rollback-candidates', selectedRuleSet?.domain?.code, selectedRuleSet?.key],
    () =>
      browserSemanticsApi.listRuleSets({
        domain_code: selectedRuleSet?.domain?.code,
        key: selectedRuleSet?.key,
      }),
    { enabled: !!selectedRuleSet?.domain?.code && !!selectedRuleSet?.key }
  );

  const rollbackCandidates = useMemo(
    () => (rollbackCandidatesQuery.data || []).filter((c) => c.id !== selectedRuleSet?.id),
    [rollbackCandidatesQuery.data, selectedRuleSet?.id]
  );

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

  const refreshQueries = async () => {
    await queryClient.invalidateQueries(['browser-semantics-rule-sets']);
    await queryClient.invalidateQueries(['browser-semantics-review-error-logs']);
    await queryClient.invalidateQueries(['browser-semantics-active-rule-set-preview']);
    await queryClient.invalidateQueries(['browser-semantics-rule-set-detail', selectedRuleSetId]);
    await queryClient.invalidateQueries(['browser-semantics-rule-hit-logs', selectedRuleSetId]);
    await queryClient.invalidateQueries(['browser-semantics-rollback-candidates']);
  };

  // Mutations Hook
  const {
    promoteCanaryMutation,
    promoteActiveMutation,
    updateMutation,
    rollbackMutation,
    replaceCategoryMutation,
    generateCategoryDraftMutation,
    generateCreateDraftMutation,
    commitDraftMutation,
    validateMutation,
  } = useBrowserSemanticMutations({
    domainCode,
    selectedRuleSet,
    refreshQueries,
    onEditorClose: () => {
      setEditorVisible(false);
    },
    onRollbackClose: () => setRollbackVisible(false),
    onCategoryReplaceClose: () => {
      setCategoryReplaceVisible(false);
      setCategoryReplaceTarget(null);
    },
    onGenerationPreviewOpen: (draft, category) => {
      setGenerationTargetCategory(category || null);
      setGenerationPreview(draft);
      setGenerationPreviewVisible(true);
    },
    onGenerationPreviewClose: () => setGenerationPreviewVisible(false),
    onNewDraftCreated: (newId) => setSelectedRuleSetId(newId),
    onValidationSuccess: () => {},
  });

  const handleOpenEdit = () => {
    if (!selectedRuleSet) return;
    setEditorInitialValues(buildRuleSetFormValuesFromRuleSet(selectedRuleSet));
    setEditorVisible(true);
  };

  const handleOpenCategoryReplace = (category: SemanticRuleCategory) => {
    if (!selectedRuleSet) return;
    const catRules = selectedRuleSet.rules.filter((r) => (r.category || 'GENERIC_ALIAS') === category);
    setCategoryReplaceTarget(category);
    setCategoryReplaceInitialRules(buildRuleFormValuesItemsFromRules(catRules, category));
    setCategoryReplaceVisible(true);
  };

  const handleApplyGeneratedCategoryDraft = async () => {
    if (!selectedRuleSetId || !generationTargetCategory || !generationPreview?.generated) return;
    replaceCategoryMutation.mutate({
      id: selectedRuleSetId,
      category: generationTargetCategory,
      rules: generationPreview.draft_rule_set.rules.map((r) => ({
        type: r.type,
        category: r.category || generationTargetCategory,
        name: r.name,
        enabled: r.enabled ?? true,
        priority: r.priority,
        stop_on_match: r.stop_on_match ?? false,
        flags: r.flags || '',
        patterns: Array.isArray(r.patterns) ? r.patterns.join('\n') : '',
        outputs: renderJsonText(r.outputs),
      })),
    });
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
          borderRadius: 16,
          border: `1px solid ${token.colorBorderSecondary}`,
          boxShadow: token.boxShadowSecondary,
          background: token.colorBgContainer,
        }}
        styles={{ body: { padding: 24 } }}
      >
        <BrowserSemanticHeader
          domainCode={domainCode}
          selectedRuleSet={selectedRuleSet}
          activeRuleSet={activeRuleSet}
          onRefresh={refreshQueries}
          onValidate={() => selectedRuleSet && validateMutation.mutate(selectedRuleSet.id)}
          validateLoading={validateMutation.isLoading}
          onGenerateCreateDraft={() => generateCreateDraftMutation.mutate(undefined)}
          generateCreateDraftLoading={generateCreateDraftMutation.isLoading}
          errorLogsCount={reviewErrorLogs.length}
          onOpenReleases={() => setActiveTab('releases')}
        />

        <BrowserSemanticOverviewCards
          selectedRuleSet={selectedRuleSet}
          activeRuleSet={activeRuleSet}
          hitLogsCount={hitLogsQuery.data?.length || 0}
          errorLogsCount={reviewErrorLogs.length}
          loading={listQuery.isLoading || detailQuery.isLoading}
        />

        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as 'rules' | 'errors' | 'releases')}
          items={[
            {
              key: 'rules',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AppstoreOutlined />
                  规则集与操作别名库 ({selectedRuleSet?.rules?.length || 0})
                </span>
              ),
              children: (
                <div>
                  <BrowserSemanticPlayground currentRuleSet={selectedRuleSet} />
                  <BrowserSemanticRulesListTab
                    currentRuleSet={selectedRuleSet}
                    selectedCategory={selectedCategory}
                    onSelectCategory={setSelectedCategory}
                    onEditRuleSet={handleOpenEdit}
                    onReplaceCategory={handleOpenCategoryReplace}
                    onGenerateCategoryDraft={(cat) => generateCategoryDraftMutation.mutate({ category: cat })}
                    generateCategoryLoading={generateCategoryDraftMutation.isLoading}
                    generatingCategory={generationTargetCategory}
                  />
                </div>
              ),
            },
            {
              key: 'errors',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BugOutlined />
                  异常审计与 AI 自愈 ({reviewErrorLogs.length})
                </span>
              ),
              children: (
                <BrowserSemanticErrorReviewTab
                  errorLogs={reviewErrorLogs}
                  loading={reviewErrorLogsQuery.isLoading}
                  onRefresh={() => reviewErrorLogsQuery.refetch()}
                  onGenerateDraftFromErrors={(ids) => generateCreateDraftMutation.mutate(ids)}
                  generateDraftLoading={generateCreateDraftMutation.isLoading}
                />
              ),
            },
            {
              key: 'releases',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HistoryOutlined />
                  版本管理与发布历史 ({listQuery.data?.length || 0})
                </span>
              ),
              children: (
                <BrowserSemanticReleasesTab
                  ruleSets={listQuery.data || []}
                  activeRuleSetId={activeRuleSet?.id}
                  selectedRuleSetId={selectedRuleSetId}
                  loading={listQuery.isLoading}
                  onSelectRuleSet={(id) => {
                    setSelectedRuleSetId(id);
                    setActiveTab('rules');
                  }}
                  onOpenDetail={(id) => {
                    setSelectedRuleSetId(id);
                    setDetailVisible(true);
                  }}
                  onPromoteCanary={(id) => promoteCanaryMutation.mutate(id)}
                  onPromoteActive={(id) => promoteActiveMutation.mutate(id)}
                  onOpenRollback={(id) => {
                    setSelectedRuleSetId(id);
                    setRollbackVisible(true);
                  }}
                  onValidateRuleSet={(id) => validateMutation.mutate(id)}
                  publishCanaryLoading={promoteCanaryMutation.isLoading}
                  publishActiveLoading={promoteActiveMutation.isLoading}
                />
              ),
            },
          ]}
        />
      </Card>

      {editorInitialValues && (
        <SemanticRuleSetFormModal
          mode="edit"
          open={editorVisible}
          title={`编辑规则集 / ${selectedRuleSet?.name || '-'}`}
          confirmLoading={updateMutation.isLoading}
          initialValues={editorInitialValues}
          onCancel={() => {
            setEditorVisible(false);
          }}
          onSubmit={async (values) => {
            if (selectedRuleSetId) {
              await updateMutation.mutateAsync({ id: selectedRuleSetId, values });
            }
          }}
        />
      )}

      <SemanticRuleSetRollbackModal
        open={rollbackVisible}
        loading={rollbackMutation.isLoading}
        currentRuleSet={selectedRuleSet}
        candidates={rollbackCandidates}
        onCancel={() => setRollbackVisible(false)}
        onSubmit={async (values) => {
          if (selectedRuleSetId) {
            await rollbackMutation.mutateAsync({
              id: selectedRuleSetId,
              target_rule_set_id: values.target_rule_set_id,
              reason: values.reason,
            });
          }
        }}
      />

      <SemanticRuleCategoryReplaceModal
        open={categoryReplaceVisible}
        category={categoryReplaceTarget}
        initialRules={categoryReplaceInitialRules}
        confirmLoading={replaceCategoryMutation.isLoading}
        onCancel={() => {
          setCategoryReplaceVisible(false);
          setCategoryReplaceTarget(null);
        }}
        onSubmit={async (rules) => {
          if (selectedRuleSetId && categoryReplaceTarget) {
            await replaceCategoryMutation.mutateAsync({
              id: selectedRuleSetId,
              category: categoryReplaceTarget,
              rules,
            });
          }
        }}
      />

      <SemanticRuleGenerationPreviewModal
        open={generationPreviewVisible}
        loading={false}
        confirmLoading={commitDraftMutation.isLoading}
        applyLoading={replaceCategoryMutation.isLoading}
        draft={generationPreview}
        currentCategory={generationTargetCategory}
        onCancel={() => setGenerationPreviewVisible(false)}
        onConfirm={() => commitDraftMutation.mutate(generationPreview)}
        onApply={handleApplyGeneratedCategoryDraft}
      />

      <Drawer
        title={`规则集结构详情 / ${selectedRuleSet?.name || '-'}`}
        width={920}
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
      >
        {selectedRuleSet && (
          <SemanticRuleSetDetailContent
            ruleSet={selectedRuleSet}
            hitLogs={hitLogsQuery.data || []}
            hitLogsLoading={hitLogsQuery.isLoading}
            onRefreshHitLogs={() => hitLogsQuery.refetch()}
            hitLogTraceId=""
            onHitLogTraceIdChange={() => {}}
            onApplyHitLogFilter={() => {}}
            onResetHitLogFilter={() => {}}
            errorLogs={reviewErrorLogs}
            errorLogsLoading={reviewErrorLogsQuery.isLoading}
            onRefreshErrorLogs={() => reviewErrorLogsQuery.refetch()}
            releases={[]}
            releasesLoading={false}
            onRefreshReleases={() => {}}
            onGenerateCategoryDraft={(cat) => generateCategoryDraftMutation.mutate({ category: cat })}
            generatingCategory={generationTargetCategory}
            generateCategoryLoading={generateCategoryDraftMutation.isLoading}
            onReplaceRuleCategory={handleOpenCategoryReplace}
            replacingCategory={categoryReplaceTarget}
            replaceCategoryLoading={replaceCategoryMutation.isLoading}
          />
        )}
      </Drawer>
    </div>
  );
};

export default BrowserSemanticRuleAdminPage;
