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