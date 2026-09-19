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

  const departments = structureQuery.data?.departments || [];
  const memberships = structureQuery.data?.memberships || [];
  const activeMembers = memberships.filter((m) => m.user?.isActive !== false);

  const memberOptions: OrgMemberOption[] = useMemo(() => {
    return activeMembers.map((m) => {
      const dept = departments.find((d) => d.id === m.departmentId);
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
  }, [activeMembers, departments]);

  const departmentOptions = useMemo(() => {
    if (departments.length > 0) {
      return departments.map((d) => ({ value: d.name, label: d.name, id: d.id }));
    }
    return [
      { value: '法务部', label: '法务部' },
      { value: '财务部', label: '财务部' },
      { value: '总务部', label: '总务部' },
      { value: '人力资源部', label: '人力资源部' },
      { value: '信息技术与运维部', label: '信息技术与运维部' },
    ];
  }, [departments]);

  return {
    departments,
    departmentOptions,
    memberOptions,
    isLoading: orgsQuery.isLoading || structureQuery.isLoading,
  };
}
