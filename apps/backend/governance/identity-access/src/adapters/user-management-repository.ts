export interface IdentityAccessUserSummaryRecord {
  id: string;
  username: string;
  email: string | null;
  role: string;
  isActive: boolean;
  department?: {
    id: string;
    name: string;
    code?: string | null;
  } | null;
  organization?: {
    id: string;
    name: string;
    code: string;
  } | null;
  title?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdentityAccessRoleSummaryRecord {
  id: string;
  name: string;
}

export interface IdentityAccessUserListResult {
  users: IdentityAccessUserSummaryRecord[];
  total: number;
}

export interface IdentityAccessUserManagementRepository {
  listUsers(input: {
    page: number;
    pageSize: number;
    role?: string;
  }): Promise<IdentityAccessUserListResult>;
  findUserById(userId: string): Promise<IdentityAccessUserSummaryRecord | null>;
  findRolesByNames(roleNames: string[]): Promise<IdentityAccessRoleSummaryRecord[]>;
  replaceUserRoles(input: {
    userId: string;
    roles: IdentityAccessRoleSummaryRecord[];
    adminId: string;
  }): Promise<void>;
  updateUserDepartment(input: {
    userId: string;
    orgId: string;
    departmentId?: string | null;
    title?: string | null;
  }): Promise<void>;
  setUserActive(userId: string, isActive: boolean): Promise<IdentityAccessUserSummaryRecord>;
}

