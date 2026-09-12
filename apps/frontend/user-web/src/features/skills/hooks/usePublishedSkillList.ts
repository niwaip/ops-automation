import { App } from 'antd';
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { scheduleApi, skillApi } from '@/api/index';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import type { ScheduleDto } from '@/api/schedules';
import {
  buildSchedulesBySkillId,
  buildUnauthorizedPublishedSkillCollections,
  filterSkillsForDigitalEmployees,
  type PublishedSkillSectionKey,
  sortPublishedSkillsByName,
} from '@/features/skills/lib/publishedSkillList';

const PUBLISHED_SKILL_CATALOG_QUERY_KEY = ['user-web-published-skills-catalog'] as const;
const PUBLISHED_SKILL_SCHEDULES_QUERY_KEY = ['user-web-published-skill-schedules'] as const;

const BUILTIN_CONTRACT_REVIEWER: PublishedSkillCatalogItem = {
  id: 'platform.document.contract-reviewer',
  name: '合同文档智能审查与合规诊断',
  description:
    '对单份合同协议（Word、PDF或文本）进行条款树解析、合同类型自动识别（或指定类型）、合规风险审查、缺失必备条款识别、修改红线建议，并生成交互式单页HTML审查报告',
  triggerKeywords: [
    '审查合同',
    '合同审查',
    '审核合同',
    '合同审核',
    '排查合同',
    '合同风控',
    '合同合规',
    '协议审查',
    '检查合同',
  ],
  paramsSchema: {
    properties: {
      fileBase64: {
        type: 'string',
        description: '上传的合同文档 Base64 数据（Word .docx 或 PDF）',
        required: false,
      },
      fileName: {
        type: 'string',
        description: '上传的合同文件名',
        required: false,
      },
      text: {
        type: 'string',
        description: '合同文档纯文本正文内容（若已上传附件文件，此字段可留空）',
        required: false,
      },
      contractType: {
        type: 'string',
        description: '合同类型（留空则基于条款智能自动识别分类）',
        required: false,
        enum: ['software_development', 'procurement', 'employment', 'lease', 'nda', 'general'],
      },
      myPosition: {
        type: 'string',
        description: '我方合同立场与角色（如：甲方、乙方、采购方、受托方、雇主、雇员、出租方、承租方），影响审查倾斜度与红线建议',
        required: false,
      },
      customChecklistRules: {
        type: 'json',
        description: '数字员工自定义配置的审查要点与规则清单',
        required: false,
      },
    },
    required: [],
  },
  executionFlowTemplateIds: [],
  tools: ['document_contract_review'],
  effectiveTools: ['document_contract_review'],
  isActive: true,
  isPublished: true,
  publishedReleaseVersion: 1,
  publishedSourceType: 'builtin',
  accessStatus: 'authorized',
  accessRequest: null,
};

export const usePublishedSkillList = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [requestTarget, setRequestTarget] = useState<PublishedSkillCatalogItem | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [recentlyRequestedSkillId, setRecentlyRequestedSkillId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<PublishedSkillSectionKey, boolean>>({
    authorized: false,
    unauthorized: false,
  });

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const catalogQuery = useQuery<{ skills: PublishedSkillCatalogItem[] }>(
    PUBLISHED_SKILL_CATALOG_QUERY_KEY,
    () => skillApi.listCatalog(),
    {
      staleTime: 15000,
    }
  );
  const schedulesQuery = useQuery<ScheduleDto[]>(
    PUBLISHED_SKILL_SCHEDULES_QUERY_KEY,
    () => scheduleApi.list(),
    {
      staleTime: 60000,
      refetchOnWindowFocus: false,
    }
  );

  const requestAccessMutation = useMutation(
    async (payload: { skillId: string; reason?: string }) =>
      skillApi.requestAccess(payload.skillId, { reason: payload.reason }),
    {
      onSuccess: async (data, variables) => {
        queryClient.setQueryData<{ skills: PublishedSkillCatalogItem[] } | undefined>(
          PUBLISHED_SKILL_CATALOG_QUERY_KEY,
          (current) => {
            if (!current) {
              return current;
            }

            return {
              skills: current.skills.map((skill) =>
                skill.id === variables.skillId
                  ? {
                      ...skill,
                      accessStatus: 'requested',
                      accessRequest: data.request,
                    }
                  : skill
              ),
            };
          }
        );
        setRecentlyRequestedSkillId(variables.skillId);
        void message.success('授权申请已提交');
        setRequestTarget(null);
        setRequestReason('');
        await queryClient.invalidateQueries(PUBLISHED_SKILL_CATALOG_QUERY_KEY);
      },
      onError: (error) => {
        void message.error(error instanceof Error ? error.message : '提交授权申请失败');
      },
    }
  );

  const skills = useMemo(() => {
    const raw = catalogQuery.data?.skills || [];
    const hasContractReviewer = raw.some(
      (s) =>
        s.id === 'platform.document.contract-reviewer' ||
        s.id.includes('contract-reviewer') ||
        s.name.includes('合同文档智能审查') ||
        s.name.includes('合同审查')
    );
    const combined = hasContractReviewer ? raw : [BUILTIN_CONTRACT_REVIEWER, ...raw];
    const visible = filterSkillsForDigitalEmployees(combined);
    return sortPublishedSkillsByName(visible);
  }, [catalogQuery.data?.skills]);
  const authorizedSkills = useMemo(
    () => skills.filter((skill) => skill.accessStatus === 'authorized'),
    [skills]
  );
  const unauthorizedSkills = useMemo(
    () => skills.filter((skill) => skill.accessStatus !== 'authorized'),
    [skills]
  );
  const {
    neverRequestedSkills,
    orderedUnauthorizedSkills,
    rejectedSkills,
    requestedSkills,
  } = useMemo(
    () => buildUnauthorizedPublishedSkillCollections(unauthorizedSkills),
    [unauthorizedSkills]
  );
  const schedulesBySkillId = useMemo(
    () => buildSchedulesBySkillId(schedulesQuery.data),
    [schedulesQuery.data]
  );

  const scheduledSkillsCount = useMemo(() => {
    return skills.filter((skill) => {
      const sList = schedulesBySkillId.get(skill.id) || [];
      return sList.some((s) => s.isActive);
    }).length;
  }, [skills, schedulesBySkillId]);

  const filterSkill = useCallback(
    (skill: PublishedSkillCatalogItem) => {
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const nameMatch = skill.name?.toLowerCase().includes(q);
        const descMatch = skill.description?.toLowerCase().includes(q);
        const keywordMatch = skill.triggerKeywords?.some((k) => k.toLowerCase().includes(q));
        const toolMatch = skill.tools?.some((t) => t.toLowerCase().includes(q));
        if (!nameMatch && !descMatch && !keywordMatch && !toolMatch) {
          return false;
        }
      }

      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'authorized' && skill.accessStatus !== 'authorized') return false;
        if (statusFilter === 'requested' && skill.accessStatus !== 'requested') return false;
        if (statusFilter === 'rejected' && skill.accessRequest?.status !== 'rejected') return false;
        if (statusFilter === 'available') {
          if (
            skill.accessStatus === 'authorized' ||
            skill.accessStatus === 'requested' ||
            skill.accessRequest?.status === 'rejected'
          ) {
            return false;
          }
        }
        if (statusFilter === 'scheduled') {
          const skillSchedules = schedulesBySkillId.get(skill.id) || [];
          if (!skillSchedules.some((s) => s.isActive)) return false;
        }
      }

      return true;
    },
    [schedulesBySkillId, searchText, statusFilter]
  );

  const filteredAuthorizedSkills = useMemo(
    () => authorizedSkills.filter(filterSkill),
    [authorizedSkills, filterSkill]
  );

  const filteredUnauthorizedSkills = useMemo(
    () => orderedUnauthorizedSkills.filter(filterSkill),
    [orderedUnauthorizedSkills, filterSkill]
  );

  const hasActiveFilters = Boolean(searchText.trim() || (statusFilter && statusFilter !== 'all'));

  const clearAllFilters = useCallback(() => {
    setSearchText('');
    setStatusFilter(undefined);
  }, []);

  const openRequestModal = useCallback((skill: PublishedSkillCatalogItem) => {
    setRequestTarget(skill);
    setRequestReason(skill.accessRequest?.reason || '');
  }, []);

  const closeRequestModal = useCallback(() => {
    if (requestAccessMutation.isLoading) {
      return;
    }

    setRequestTarget(null);
    setRequestReason('');
  }, [requestAccessMutation.isLoading]);

  const submitRequest = useCallback(() => {
    if (!requestTarget) {
      return;
    }

    requestAccessMutation.mutate({
      skillId: requestTarget.id,
      reason: requestReason.trim() || undefined,
    });
  }, [requestAccessMutation, requestReason, requestTarget]);

  const toggleSection = useCallback((sectionKey: PublishedSkillSectionKey) => {
    setCollapsedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  }, []);

  const handleSkillPrimaryAction = useCallback(
    (skill: PublishedSkillCatalogItem, authorized: boolean) => {
      if (authorized) {
        navigate(`/executions/new?skillId=${skill.id}`);
        return;
      }

      openRequestModal(skill);
    },
    [navigate, openRequestModal]
  );

  const handleChatCollaborate = useCallback(
    (skill: PublishedSkillCatalogItem) => {
      navigate('/chat', {
        state: {
          initialPrompt: `你好，我想请你作为【${skill.name}】协助我完成相关任务。`,
        },
      });
    },
    [navigate]
  );

  return {
    authorizedSkills: filteredAuthorizedSkills,
    allAuthorizedSkillsCount: authorizedSkills.length,
    collapsedSections,
    closeRequestModal,
    counts: {
      authorized: authorizedSkills.length,
      available: neverRequestedSkills.length,
      rejected: rejectedSkills.length,
      requested: requestedSkills.length,
      total: skills.length,
      unauthorized: unauthorizedSkills.length,
      scheduled: scheduledSkillsCount,
    },
    handleSkillPrimaryAction,
    handleChatCollaborate,
    hasActiveFilters,
    clearAllFilters,
    isInitialLoading: catalogQuery.isLoading && skills.length === 0,
    orderedUnauthorizedSkills: filteredUnauthorizedSkills,
    allUnauthorizedSkillsCount: orderedUnauthorizedSkills.length,
    recentlyRequestedSkillId,
    requestAccessMutation,
    requestReason,
    requestTarget,
    schedulesBySkillId,
    searchText,
    setSearchText,
    setRequestReason,
    statusFilter,
    setStatusFilter,
    submitRequest,
    toggleSection,
    totalVisibleCount: filteredAuthorizedSkills.length + filteredUnauthorizedSkills.length,
  };
};
