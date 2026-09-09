import { apiClient } from '@/shared/api/http/client';
import { useAuthStore } from '@/shared/store/authStore';

export interface OrganizationSummary {
  id: string;
  name: string;
  code: string;
  description?: string | null;
}

export interface OrganizationDepartment {
  id: string;
  name: string;
  code?: string | null;
  parentId?: string | null;
  managerUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationTeam {
  id: string;
  name: string;
  code?: string | null;
  departmentId?: string | null;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  status: string;
  departmentId?: string | null;
  title?: string | null;
  user: {
    id: string;
    username: string;
    email?: string | null;
    isActive: boolean;
  };
}

export interface OrganizationStructure {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  departments: OrganizationDepartment[];
  teams: OrganizationTeam[];
  memberships: OrganizationMember[];
}

export interface CreateOrganizationParams {
  name: string;
  code: string;
  description?: string;
}

export interface CreateDepartmentParams {
  name: string;
  code?: string;
  parentId?: string;
}

export interface UpdateDepartmentParams {
  name?: string;
  code?: string;
  parentId?: string | null;
  managerUserId?: string | null;
}

export interface AddMemberParams {
  userId: string;
  departmentId?: string;
  title?: string;
}

export const organizationApi = {
  listOrganizations: async (): Promise<OrganizationSummary[]> => {
    // 1. 优先尝试主组织列表接口 (/organizations)
    try {
      const res = await apiClient.get<{ organizations: OrganizationSummary[] }>('/organizations');
      if (res?.organizations && res.organizations.length > 0) {
        return res.organizations;
      }
    } catch {
      // 若 /organizations 失败（如权限不足或网络降级），继续降级兜底
    }

    // 2. 降级尝试当前用户的组织关联接口 (/organizations/mine)
    try {
      const myRes = await apiClient.get<{ organizations: OrganizationSummary[] }>('/organizations/mine');
      if (myRes?.organizations && myRes.organizations.length > 0) {
        return myRes.organizations;
      }
    } catch {
      // 忽略次级报错
    }

    // 3. 降级读取本地已登录用户的 Session Organization
    const userOrg = useAuthStore.getState().user?.organization;
    if (userOrg?.id) {
      return [
        {
          id: userOrg.id,
          name: userOrg.name,
          code: userOrg.code,
          description: '当前账号所属企业组织',
        },
      ];
    }

    return [];
  },

  listMyOrganizations: async (): Promise<OrganizationSummary[]> => {
    try {
      const res = await apiClient.get<{ organizations: OrganizationSummary[] }>('/organizations/mine');
      return res.organizations || [];
    } catch {
      return [];
    }
  },

  ensureDefaultOrganization: async (): Promise<OrganizationSummary> => {
    const orgs = await organizationApi.listOrganizations();
    if (orgs.length > 0) {
      return orgs[0];
    }

    // 若系统完全无组织，则通过接口创建默认根组织
    const created = await organizationApi.createOrganization({
      name: '总公司 / 集团总经办',
      code: 'HEADQUARTERS',
      description: '系统默认根组织',
    });
    return created;
  },

  getOrganizationStructure: async (orgId: string): Promise<OrganizationStructure> => {
    const res = await apiClient.get<{ organization: OrganizationStructure }>(`/organizations/${orgId}`);
    return res.organization;
  },

  createOrganization: async (params: CreateOrganizationParams): Promise<OrganizationSummary> => {
    const res = await apiClient.post<{ organization: OrganizationSummary }>('/organizations', params);
    return res.organization;
  },

  createDepartment: async (orgId: string, params: CreateDepartmentParams): Promise<OrganizationDepartment> => {
    const res = await apiClient.post<{ department: OrganizationDepartment }>(`/organizations/${orgId}/departments`, params);
    return res.department;
  },

  updateDepartment: async (orgId: string, deptId: string, params: UpdateDepartmentParams): Promise<OrganizationDepartment> => {
    const res = await apiClient.put<{ department: OrganizationDepartment }>(`/organizations/${orgId}/departments/${deptId}`, params);
    return res.department;
  },

  deleteDepartment: async (orgId: string, deptId: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/organizations/${orgId}/departments/${deptId}`);
  },

  addOrUpdateMember: async (orgId: string, params: AddMemberParams): Promise<any> => {
    return apiClient.post(`/organizations/${orgId}/members`, params);
  },

  removeMember: async (orgId: string, userId: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/organizations/${orgId}/members/${userId}`);
  },
};
