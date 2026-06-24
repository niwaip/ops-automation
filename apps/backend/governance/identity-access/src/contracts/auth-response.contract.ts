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
  activeOrgId?: string | null;
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
