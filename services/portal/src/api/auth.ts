import { apiClient } from './client';

// Types based on auth service DTOs (READ-ONLY reference)
export interface UserDto {
  id: string;
  username: string;
  email?: string | null;
  role: 'employee' | 'admin' | 'agent';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleDto {
  id: string;
  name: string;
  description?: string | null;
  permissions: Record<string, boolean>;
  isSystem: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface MeResponse {
  user: UserDto;
  roles: RoleDto[];
}

export interface UserListResponse {
  users: UserDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
  role: 'employee' | 'admin' | 'agent';
}

export interface UpdateUserRolesRequest {
  roles: string[];
}

export interface UserQueryParams {
  page?: number;
  role?: string;
}

// Auth API
export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    return apiClient.post<LoginResponse>('/auth/login', data);
  },

  register: async (data: RegisterRequest): Promise<LoginResponse> => {
    return apiClient.post<LoginResponse>('/auth/register', data);
  },

  refresh: async (refreshToken: string): Promise<LoginResponse> => {
    return apiClient.post<LoginResponse>('/auth/refresh', { refreshToken });
  },

  logout: async (): Promise<void> => {
    return apiClient.post('/auth/logout');
  },

  me: async (): Promise<MeResponse> => {
    return apiClient.get<MeResponse>('/auth/me');
  },
};

// User API
export const userApi = {
  list: async (params?: UserQueryParams): Promise<UserListResponse> => {
    return apiClient.get<UserListResponse>('/users', { params });
  },

  getById: async (id: string): Promise<UserDto> => {
    return apiClient.get<UserDto>(`/users/${id}`);
  },

  updateRoles: async (id: string, roles: string[]): Promise<UserDto> => {
    return apiClient.patch<UserDto>(`/users/${id}/roles`, { roles });
  },

  activate: async (id: string): Promise<UserDto> => {
    return apiClient.patch<UserDto>(`/users/${id}/activate`);
  },

  deactivate: async (id: string): Promise<UserDto> => {
    return apiClient.patch<UserDto>(`/users/${id}/deactivate`);
  },

  delete: async (id: string): Promise<void> => {
    return apiClient.delete(`/users/${id}`);
  },
};