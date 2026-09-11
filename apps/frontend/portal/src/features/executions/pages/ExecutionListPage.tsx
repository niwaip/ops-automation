import React, { useMemo, useState } from 'react';

import { Button, Space, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { executionApi, ExecutionDto, ExecutionStatus } from '@/api/execution';
import { skillApi } from '@/api/skill';
import { capabilityReleaseApi } from '@/api/capabilities';
import { useChatStore } from '@/features/chat';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import { usePreferencesStore } from '@/shared/store/preferencesStore';
import { ExecutionDetailDrawer } from '../list/components/ExecutionDetailDrawer';
import { ExecutionOverviewCards, ExecutionQuickTab } from '../list/components/ExecutionOverviewCards';
import { ExecutionFilterToolbar } from '../list/components/ExecutionFilterToolbar';
import { ExecutionTable } from '../list/components/ExecutionTable';
import { ExecutionCleanupModal } from '../list/components/ExecutionCleanupModal';

const ExecutionListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const {
    currentSession,
    createSession,
    setOpen,
    setChatMode,
    setDraftMessage,
    setDraftExecutionId,
  } = useChatStore();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | undefined>();
  const [activeQuickTab, setActiveQuickTab] = useState<ExecutionQuickTab>('all');
  const [searchText, setSearchText] = useState('');
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);

  const selectedExecutionId = searchParams.get('executionId') || undefined;
  const theme = usePreferencesStore((state) => state.theme);
  const isDarkTheme = theme === 'dark';

  const cleanSearchText = searchText.trim().replace(/^#/, '');
  const searchId =
    cleanSearchText && /^[0-9a-fA-F-]{4,36}$/.test(cleanSearchText) ? cleanSearchText : undefined;

  // 1. 根据当前快速分类 Tab 计算发送给后端的 status 参数
  const computedStatus = useMemo(() => {
    if (statusFilter) return statusFilter;
    if (activeQuickTab === 'failed') return 'failed' as ExecutionStatus;
    if (activeQuickTab === 'succeeded') return 'succeeded' as ExecutionStatus;
    return undefined;
  }, [statusFilter, activeQuickTab]);

  // 2. 主列表查询（支持按 ID 服务端筛选）
  const executionsQuery = useQuery(
    ['executions', page, pageSize, computedStatus, searchId],
    () => executionApi.list({ page, pageSize, status: computedStatus, id: searchId }),
    { keepPreviousData: true }
  );

  // 2.1 精确 ID 查询容底（若输入为 8 位以上 UUID 片段且列表未直出时调用）
  const executionByIdQuery = useQuery(
    ['execution-by-id', cleanSearchText],
    () => executionApi.getById(cleanSearchText),
    {
      enabled: Boolean(
        cleanSearchText &&
          cleanSearchText.length >= 8 &&
          /^[0-9a-fA-F-]{8,36}$/.test(cleanSearchText) &&
          executionsQuery.data?.data?.length === 0 &&
          !executionsQuery.isLoading
      ),
      retry: false,
    }
  );

  // 3. 各状态计数查询（用于顶部指标看板与 Tab 角标）
  const totalStatsQuery = useQuery(
    ['execution-stats-total'],
    () => executionApi.list({ page: 1, pageSize: 1 }),
    { refetchInterval: 15000 }
  );

  const failedStatsQuery = useQuery(
    ['execution-stats-failed'],
    () => executionApi.list({ page: 1, pageSize: 1, status: 'failed' }),
    { refetchInterval: 20000 }
  );

  const succeededStatsQuery = useQuery(
    ['execution-stats-succeeded'],
    () => executionApi.list({ page: 1, pageSize: 1, status: 'succeeded' }),
    { refetchInterval: 30000 }
  );

  // 4. 技能与流程名称映射
  const { data: skillsData } = useQuery(['skills-name-map'], () => skillApi.list(), { staleTime: 60000 });
  const { data: releasesData } = useQuery(['published-skills-name-map'], () => capabilityReleaseApi.listReleaseCenter(), { staleTime: 60000 });

  const skillNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (releasesData?.releases || []).forEach((release) => {
      if (release.publishedSkillId) {
        map.set(release.publishedSkillId, release.sourceName || release.sourceId || release.publishedSkillId);
      }
    });
    (skillsData?.skills || []).forEach((skill) => {
      if (!map.has(skill.id)) {
        map.set(skill.id, skill.name);
      }
    });
    return map;
  }, [releasesData?.releases, skillsData?.skills]);

  // 5. 统计数值汇总
  const totalCount = totalStatsQuery.data?.total ?? (executionsQuery.data?.total || 0);
  const failedCount = failedStatsQuery.data?.total || 0;
  const succeededCount = succeededStatsQuery.data?.total || 0;

  // 6. 前端针对关键字过滤与精确 ID 回填
  const filteredExecutions = useMemo(() => {
    let rows = [...(executionsQuery.data?.data || [])];

    if (rows.length === 0 && executionByIdQuery.data) {
      rows = [executionByIdQuery.data];
    }

    if (activeQuickTab === 'failed' && !statusFilter) {
      rows = rows.filter((r) => r.status === 'failed');
    } else if (activeQuickTab === 'succeeded' && !statusFilter) {
      rows = rows.filter((r) => r.status === 'succeeded');
    }

    if (searchText.trim()) {
      const keyword = searchText.trim().toLowerCase();
      rows = rows.filter((record) => {
        const skillName = skillNameMap.get(record.skillId) || record.skillId || '';
        return [
          record.id,
          skillName,
          record.riskLevel,
          record.status,
          JSON.stringify(record.input || {}),
          JSON.stringify(record.result || {}),
        ]
          .filter(Boolean)
          .some((item) => String(item).toLowerCase().includes(keyword));
      });
    }

    return rows;
  }, [executionsQuery.data?.data, executionByIdQuery.data, activeQuickTab, statusFilter, searchText, skillNameMap]);

  // Mutations
  const cleanupExecutionsMutation = useMutation(
    (beforeDate: string) => executionApi.cleanupBeforeDate({ beforeDate }),
    {
      onSuccess: async (response, beforeDate) => {
        setCleanupModalOpen(false);
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['execution-stats-total']),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
        ]);
        message.success(
          response.deletedCount > 0
            ? `已成功清理 ${beforeDate} 之前的 ${response.deletedCount} 条历史记录`
            : `未找到 ${beforeDate} 之前需要清理的工单记录`
        );
      },
      onError: (err: any) => {
        message.error(`清理失败：${err.message || '未知异常'}`);
      },
    }
  );

  const updateExecutionSelection = (executionId?: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (executionId) {
      nextSearchParams.set('executionId', executionId);
    } else {
      nextSearchParams.delete('executionId');
    }
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleRowClick = (record: ExecutionDto) => {
    if (record.status === 'human_control') {
      navigate(`/executions/${record.id}`);
      return;
    }
    updateExecutionSelection(record.id);
  };

  const handleOpenTakeover = (record: ExecutionDto) => {
    if (!currentSession) {
      createSession();
    }
    setChatMode('task');
    setDraftMessage(`请接管工单 #${record.id.slice(0, 8)}：当前已转入人工处理。`);
    setDraftExecutionId(record.id);
    setOpen(true);
  };

  const handleQuickTabChange = (tab: ExecutionQuickTab) => {
    setActiveQuickTab(tab);
    setStatusFilter(undefined);
    setPage(1);
  };

  return (
    <div style={{ padding: '16px 20px 24px', maxWidth: 1440, margin: '0 auto' }}>
      <ListSectionHeader
        title="执行历史"
        subtitle="提供全量任务调用的多维度审计记录，支持按执行 ID 精准溯源与故障排查"
        extra={
          <Space wrap size={12}>
            <Button
              icon={<ReloadOutlined spin={executionsQuery.isFetching} />}
              onClick={() => {
                executionsQuery.refetch();
                queryClient.invalidateQueries(['execution-stats-total']);
                queryClient.invalidateQueries(['execution-stats-failed']);
                queryClient.invalidateQueries(['execution-stats-succeeded']);
              }}
            >
              刷新数据
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/executions/new')}
            >
              发起新执行
            </Button>
          </Space>
        }
      />

      {/* 1. 顶部 3 联审计与排障指标看板 */}
      <ExecutionOverviewCards
        total={totalCount}
        failedCount={failedCount}
        succeededCount={succeededCount}
        activeTab={activeQuickTab}
        onSelectTab={handleQuickTabChange}
      />

      {/* 2. 场景化快捷状态分流与过滤栏 */}
      <ExecutionFilterToolbar
        searchText={searchText}
        onSearchChange={(val) => {
          setSearchText(val);
          setPage(1);
        }}
        statusFilter={statusFilter}
        onStatusFilterChange={(st) => {
          setStatusFilter(st);
          setPage(1);
        }}
        activeQuickTab={activeQuickTab}
        onQuickTabChange={handleQuickTabChange}
        runningCount={0}
        attentionCount={0}
        failedCount={failedCount}
        succeededCount={succeededCount}
        onOpenCleanupModal={() => setCleanupModalOpen(true)}
      />

      {/* 3. 审计与排障重点执行表格 */}
      <ExecutionTable
        executions={filteredExecutions}
        total={executionByIdQuery.data ? 1 : (executionsQuery.data?.total || 0)}
        loading={executionsQuery.isLoading || executionByIdQuery.isLoading}
        page={page}
        pageSize={pageSize}
        isDarkTheme={isDarkTheme}
        skillNameMap={skillNameMap}
        onPageChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
        }}
        onRowClick={handleRowClick}
        onOpenTakeover={handleOpenTakeover}
      />

      {/* 4. 历史记录安全清理弹窗 */}
      <ExecutionCleanupModal
        open={cleanupModalOpen}
        loading={cleanupExecutionsMutation.isLoading}
        onCancel={() => setCleanupModalOpen(false)}
        onConfirm={(beforeDate) => cleanupExecutionsMutation.mutate(beforeDate)}
      />

      {/* 5. 全息详情抽屉 */}
      <ExecutionDetailDrawer
        open={!!selectedExecutionId}
        executionId={selectedExecutionId}
        onClose={() => updateExecutionSelection(undefined)}
        skillNameMap={skillNameMap}
        onOpenAiTask={(draft, executionId) => {
          if (!currentSession) {
            createSession();
          }
          setChatMode('task');
          setDraftMessage(draft);
          setDraftExecutionId(executionId);
          setOpen(true);
          updateExecutionSelection(undefined);
        }}
      />
    </div>
  );
};

export default ExecutionListPage;
