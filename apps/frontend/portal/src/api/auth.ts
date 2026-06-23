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
import { apiClient } from './client';

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

  activate: async (id: string): Promise<UserDto> => {
    return apiClient.put<UserDto>(`/users/${id}/activate`);
  },

  deactivate: async (id: string): Promise<UserDto> => {
    return apiClient.put<UserDto>(`/users/${id}/deactivate`);
  },
};
