import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { message } from 'antd';
import { skillApi, builtinSkillApi, SkillAccessRequestReviewDTO } from '@/api/skill';
import { userApi } from '@/api/auth';
import { capabilityReleaseApi } from '@/api/capabilities';
import { executionApi, ExecutionDto } from '@/api/execution';
import { isBuiltinSkill } from '@/features/admin/skills/utils/skillHelpers';

export function useAdminDashboardData() {
  const queryClient = useQueryClient();
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<'approve' | 'reject' | null>(null);

  // 1. Authorization Requests Queries
  const pendingRequestsQuery = useQuery(
    ['all-skill-access-requests', 'pending'],
    () => skillApi.getAccessRequests(undefined, 'pending'),
    { refetchInterval: 20000 }
  );

  const approvedRequestsQuery = useQuery(
    ['all-skill-access-requests', 'approved'],
    () => skillApi.getAccessRequests(undefined, 'approved'),
    { staleTime: 30000 }
  );

  const rejectedRequestsQuery = useQuery(
    ['all-skill-access-requests', 'rejected'],
    () => skillApi.getAccessRequests(undefined, 'rejected'),
    { staleTime: 30000 }
  );

  // 2. User Statistics
  const usersQuery = useQuery(['admin-dashboard-users'], () => userApi.list({ page: 1 }), {
    staleTime: 60000,
  });

  // 3. Skill & Capability Statistics
  const skillsQuery = useQuery(['admin-dashboard-skills'], () => skillApi.list(), {
    staleTime: 60000,
  });
  const builtinSkillsQuery = useQuery(
    ['admin-dashboard-builtin-skills'],
    () => builtinSkillApi.listInventory(),
    { staleTime: 60000 }
  );
  const releasesQuery = useQuery(
    ['admin-dashboard-releases'],
    () => capabilityReleaseApi.listReleaseCenter(),
    { staleTime: 60000 }
  );

  // 4. Execution Statistics
  const executionsTotalQuery = useQuery(['admin-dashboard-executions-total'], () =>
    executionApi.list({ page: 1, pageSize: 1 })
  );
  const runningExecutionsQuery = useQuery(['admin-dashboard-executions-running'], () =>
    executionApi.list({ page: 1, pageSize: 1, status: 'running' })
  );
  const pendingApprovalExecutionsQuery = useQuery(['admin-dashboard-executions-pending-approval'], () =>
    executionApi.list({ page: 1, pageSize: 1, status: 'pending_approval' })
  );
  const recentExecutionsQuery = useQuery(['admin-dashboard-executions-recent'], () =>
    executionApi.list({ page: 1, pageSize: 8 })
  );

  // 5. Mutations for Access Requests
  const approveMutation = useMutation(
    ({ requestId, responseNote }: { requestId: string; responseNote?: string }) =>
      skillApi.approveAccessRequest(requestId, { responseNote }),
    {
      onMutate: ({ requestId }) => {
        setProcessingRequestId(requestId);
        setProcessingAction('approve');
      },
      onSuccess: () => {
        message.success('授权申请已批准，已为该角色开通技能权限');
        queryClient.invalidateQueries(['all-skill-access-requests']);
        queryClient.invalidateQueries(['skill-access-requests']);
        queryClient.invalidateQueries(['skill-permissions']);
      },
      onError: (error: any) => {
        const errorMsg = error?.response?.data?.message || error?.message || '批准授权申请失败';
        message.error(typeof errorMsg === 'string' ? errorMsg : '批准授权申请失败');
      },
      onSettled: () => {
        setProcessingRequestId(null);
        setProcessingAction(null);
      },
    }
  );

  const rejectMutation = useMutation(
    ({ requestId, responseNote }: { requestId: string; responseNote?: string }) =>
      skillApi.rejectAccessRequest(requestId, { responseNote }),
    {
      onMutate: ({ requestId }) => {
        setProcessingRequestId(requestId);
        setProcessingAction('reject');
      },
      onSuccess: () => {
        message.success('授权申请已驳回');
        queryClient.invalidateQueries(['all-skill-access-requests']);
        queryClient.invalidateQueries(['skill-access-requests']);
      },
      onError: (error: any) => {
        const errorMsg = error?.response?.data?.message || error?.message || '驳回授权申请失败';
        message.error(typeof errorMsg === 'string' ? errorMsg : '驳回授权申请失败');
      },
      onSettled: () => {
        setProcessingRequestId(null);
        setProcessingAction(null);
      },
    }
  );

  const handleApprove = (request: SkillAccessRequestReviewDTO, responseNote?: string) => {
    approveMutation.mutate({ requestId: request.id, responseNote });
  };

  const handleReject = (request: SkillAccessRequestReviewDTO, responseNote?: string) => {
    rejectMutation.mutate({ requestId: request.id, responseNote });
  };

  const refetchAll = () => {
    void pendingRequestsQuery.refetch();
    void approvedRequestsQuery.refetch();
    void rejectedRequestsQuery.refetch();
    void usersQuery.refetch();
    void skillsQuery.refetch();
    void builtinSkillsQuery.refetch();
    void releasesQuery.refetch();
    void executionsTotalQuery.refetch();
    void runningExecutionsQuery.refetch();
    void pendingApprovalExecutionsQuery.refetch();
    void recentExecutionsQuery.refetch();
  };

  // Computed data
  const pendingRequests = pendingRequestsQuery.data?.requests || [];
  const approvedRequests = approvedRequestsQuery.data?.requests || [];
  const rejectedRequests = rejectedRequestsQuery.data?.requests || [];
  const allRequests = useMemo(() => {
    return [...pendingRequests, ...approvedRequests, ...rejectedRequests].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [pendingRequests, approvedRequests, rejectedRequests]);

  const totalUsersCount = usersQuery.data?.total || usersQuery.data?.users?.length || 0;
  const activeUsersCount = useMemo(() => {
    return (usersQuery.data?.users || []).filter((u) => u.isActive !== false).length;
  }, [usersQuery.data?.users]);

  const customSkillsList = useMemo(() => {
    return (skillsQuery.data?.skills || []).filter((s) => !isBuiltinSkill(s));
  }, [skillsQuery.data?.skills]);

  const builtinSkillsList = builtinSkillsQuery.data?.skills || [];
  const totalSkillsCount = customSkillsList.length + builtinSkillsList.length;
  const publishedSkillsCount = useMemo(() => {
    return releasesQuery.data?.releases?.length || (skillsQuery.data?.skills || []).filter((s) => s.isPublished).length;
  }, [releasesQuery.data?.releases, skillsQuery.data?.skills]);

  const skillNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (releasesQuery.data?.releases || []).forEach((release) => {
      if (release.publishedSkillId) {
        map.set(
          release.publishedSkillId,
          release.sourceName || release.sourceId || release.publishedSkillId
        );
      }
    });
    (skillsQuery.data?.skills || []).forEach((skill) => {
      if (!map.has(skill.id)) {
        map.set(skill.id, skill.name);
      }
    });
    return map;
  }, [releasesQuery.data?.releases, skillsQuery.data?.skills]);

  return {
    // Queries data
    pendingRequests,
    approvedRequests,
    rejectedRequests,
    allRequests,
    pendingRequestsCount: pendingRequests.length,
    isLoadingRequests: pendingRequestsQuery.isLoading,

    // User counts
    totalUsersCount,
    activeUsersCount,
    usersLoading: usersQuery.isLoading,

    // Skill counts
    totalSkillsCount,
    customSkillsCount: customSkillsList.length,
    builtinSkillsCount: builtinSkillsList.length,
    publishedSkillsCount,
    skillNameMap,

    // Execution counts
    totalExecutionsCount: executionsTotalQuery.data?.total || 0,
    runningExecutionsCount: runningExecutionsQuery.data?.total || 0,
    pendingApprovalExecutionsCount: pendingApprovalExecutionsQuery.data?.total || 0,
    recentExecutions: (recentExecutionsQuery.data?.data || []) as ExecutionDto[],
    recentExecutionsLoading: recentExecutionsQuery.isLoading,

    // Actions
    processingRequestId,
    processingAction,
    handleApprove,
    handleReject,
    refetchAll,
  };
}
