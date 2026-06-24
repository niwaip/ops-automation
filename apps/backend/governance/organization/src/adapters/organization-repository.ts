import type {
  AddOrganizationMemberDto,
  CreateDepartmentDto,
  CreateOrganizationDto,
  CreateTeamDto,
} from '../contracts';

export interface OrganizationSummaryRecord {
  id: string;
  name: string;
  code: string;
  description?: string | null;
}

export interface OrganizationMembershipSummaryRecord {
  id: string;
  name: string;
  code: string;
  status: string;
  membershipId: string;
  departmentId?: string | null;
}

export interface OrganizationDepartmentRecord {
  id: string;
  name: string;
  code?: string | null;
  parentId?: string | null;
}

export interface OrganizationTeamRecord {
  id: string;
  name: string;
  code?: string | null;
  departmentId?: string | null;
}

export interface OrganizationMemberRecord {
  id: string;
  userId: string;
  orgId: string;
  status: string;
  departmentId?: string | null;
  title?: string | null;
}

export interface OrganizationStructureRecord {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  departments: Array<{
    id: string;
    name: string;
    code?: string | null;
    parentId?: string | null;
  }>;
  teams: Array<{
    id: string;
    name: string;
    code?: string | null;
    departmentId?: string | null;
  }>;
  memberships: Array<{
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
    roleBindings: Array<{
      id: string;
      scopeType: string;
      scopeRefId: string;
      role: {
        id: string;
        name: string;
        description?: string | null;
        permissions: Record<string, boolean>;
        isSystem: boolean;
      };
    }>;
  }>;
  identityProviders: Array<{
    id: string;
    name: string;
    providerType: string;
    isEnabled: boolean;
    createdAt: Date;
  }>;
}

export interface OrganizationRepository {
  createOrganization(dto: CreateOrganizationDto, actorUserId: string): Promise<OrganizationSummaryRecord>;
  listMyOrganizations(userId: string): Promise<OrganizationMembershipSummaryRecord[]>;
  getOrganizationStructure(orgId: string): Promise<OrganizationStructureRecord | null>;
  createDepartment(orgId: string, dto: CreateDepartmentDto): Promise<OrganizationDepartmentRecord>;
  createTeam(orgId: string, dto: CreateTeamDto): Promise<OrganizationTeamRecord>;
  addMember(
    orgId: string,
    dto: AddOrganizationMemberDto,
    actorUserId: string
  ): Promise<OrganizationMemberRecord>;
}
