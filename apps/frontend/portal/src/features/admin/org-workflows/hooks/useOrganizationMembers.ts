import { useMemo } from 'react';
import { useQuery } from 'react-query';
import { organizationApi } from '@/api/organization';
import { useAuthStore } from '@/shared/store/authStore';

export interface OrgMemberOption {
  value: string;
  userId: string;
  username: string;
  label: string;
  departmentId?: string | null;
  departmentName?: string | null;
}

export function useOrganizationMembers() {
  const authUser = useAuthStore((state) => state.user);
  const orgsQuery = useQuery('admin-organizations', () => organizationApi.listOrganizations(), {
    staleTime: 60000,
  });
  const activeOrgId = orgsQuery.data?.[0]?.id || authUser?.organization?.id;
  const structureQuery = useQuery(
    ['admin-org-structure', activeOrgId],
    () => organizationApi.getOrganizationStructure(activeOrgId!),
    { enabled: !!activeOrgId, staleTime: 60000 }
  );

  const rawDepartments = structureQuery.data?.departments;
  const rawMemberships = structureQuery.data?.memberships;
  const departments = rawDepartments || [];

  const memberOptions: OrgMemberOption[] = useMemo(() => {
    const activeMembers = (rawMemberships || []).filter((m) => m.user?.isActive !== false);
    const depts = rawDepartments || [];
    return activeMembers.map((m) => {
      const dept = depts.find((d) => d.id === m.departmentId);
      const deptLabel = dept ? ` [${dept.name}]` : '';
      const titleLabel = m.title ? ` (${m.title})` : '';
      return {
        value: m.user.username,
        userId: m.user.id,
        username: m.user.username,
        label: `${m.user.username}${titleLabel}${deptLabel}`,
        departmentId: m.departmentId,
        departmentName: dept?.name,
      };
    });
  }, [rawMemberships, rawDepartments]);

  const departmentOptions = useMemo(() => {
    if (rawDepartments && rawDepartments.length > 0) {
      return rawDepartments.map((d) => ({ value: d.name, label: d.name, id: d.id }));
    }
    return [
      { value: '法务部', label: '法务部' },
      { value: '财务部', label: '财务部' },
      { value: '总务部', label: '总务部' },
      { value: '人力资源部', label: '人力资源部' },
      { value: '信息技术与运维部', label: '信息技术与运维部' },
    ];
  }, [rawDepartments]);

  return {
    departments,
    departmentOptions,
    memberOptions,
    isLoading: orgsQuery.isLoading || structureQuery.isLoading,
  };
}
