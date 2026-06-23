import type { ApiClient } from './client.js';
import type { UserDto } from '../types/user.types.js';

export interface RoleDto {
  id: string;
  name: string;
  description?: string | null;
  permissions: Record<string, boolean>;
  isSystem: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
  activeOrgId?: string | null;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface MeResponse {
  user: UserDto;
  roles: RoleDto[];
  activeOrgId?: string | null;
  organizations?: Array<{
    id: string;
    name: string;
    code: string;
    membershipId: string;
    status: string;
  }>;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
  role: 'employee' | 'admin' | 'agent';
}

export const createAuthApi = (client: ApiClient) => ({
  login: async (data: LoginRequest): Promise<LoginResponse> =>
    client.post<LoginResponse>('/auth/login', data),
  register: async (data: RegisterRequest): Promise<LoginResponse> =>
    client.post<LoginResponse>('/auth/register', data),
  refresh: async (refreshToken: string): Promise<RefreshResponse> =>
    client.post<RefreshResponse>('/auth/refresh', { refreshToken }),
  logout: async (): Promise<void> => {
    await client.post('/auth/logout');
  },
  me: async (): Promise<MeResponse> => client.get<MeResponse>('/auth/me'),
});
