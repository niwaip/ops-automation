export interface UserDepartmentDto {
  id: string;
  name: string;
  code?: string | null;
}

export interface UserOrganizationDto {
  id: string;
  name: string;
  code: string;
}

export interface UserDto {
  id: string;
  username: string;
  email?: string | null;
  role: 'employee' | 'admin' | 'agent';
  isActive: boolean;
  department?: UserDepartmentDto | null;
  organization?: UserOrganizationDto | null;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
}

