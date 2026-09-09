import {
  createAuthApi,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
  type RefreshResponse,
  type RegisterRequest,
  type RoleDto,
  type UserDto,
} from '@ops/user-core';
import { apiClient } from '@/shared/api/http/client';
import { organizationApi } from './organization';

export interface UserListResponse {
  users: UserDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateUserRolesRequest {
  roles: string[];
}

export interface UserQueryParams {
  page?: number;
  role?: string;
}

export type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  RefreshResponse,
  RegisterRequest,
  RoleDto,
  UserDto,
};

export const authApi = createAuthApi(apiClient);

// User API
export const userApi = {
  list: async (params?: UserQueryParams): Promise<UserListResponse> => {
    return apiClient.get<UserListResponse>('/users', { params });
  },

  getById: async (id: string): Promise<UserDto> => {
    return apiClient.get<UserDto>(`/users/${id}`);
  },

  updateRoles: async (id: string, roles: string[]): Promise<UserDto> => {
    return apiClient.put<UserDto>(`/users/${id}/roles`, { roles });
  },

  updateDepartment: async (
    id: string,
    data: { orgId: string; departmentId?: string | null; title?: string | null }
  ): Promise<any> => {
    try {
      return await apiClient.put<UserDto>(`/users/${id}/department`, data);
    } catch (err: any) {
      // 容错降级：若后端运行中的旧版本容器尚未加载 /users/:id/department 路由（返回 404），
      // 则自动降级调用原生已注册的组织成员接口 /organizations/:orgId/members
      if (
        err?.statusCode === 404 ||
        err?.response?.status === 404 ||
        String(err?.message || '').includes('Cannot PUT')
      ) {
        return organizationApi.addOrUpdateMember(data.orgId, {
          userId: id,
          departmentId: data.departmentId || undefined,
          title: data.title || undefined,
        });
      }
      throw err;
    }
  },

  activate: async (id: string): Promise<UserDto> => {
    return apiClient.put<UserDto>(`/users/${id}/activate`);
  },

  deactivate: async (id: string): Promise<UserDto> => {
    return apiClient.put<UserDto>(`/users/${id}/deactivate`);
  },
};

