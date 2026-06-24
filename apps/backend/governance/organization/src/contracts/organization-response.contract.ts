export interface OrganizationSummary {
  id: string;
  name: string;
  code: string;
  description?: string | null;
}

export interface OrganizationMembershipSummary {
  id: string;
  name: string;
  code: string;
  status: string;
  membershipId: string;
  departmentId?: string | null;
}

export interface OrganizationDepartment {
  id: string;
  name: string;
  code?: string | null;
  parentId?: string | null;
}

export interface OrganizationTeam {
  id: string;
  name: string;
  code?: string | null;
  departmentId?: string | null;
}

export interface OrganizationRoleBinding {
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
}

export interface OrganizationStructureMembership {
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
  roleBindings: OrganizationRoleBinding[];
}

export interface OrganizationIdentityProvider {
  id: string;
  name: string;
  providerType: string;
  isEnabled: boolean;
  createdAt: Date;
}

export interface OrganizationStructure {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  departments: OrganizationDepartment[];
  teams: OrganizationTeam[];
  memberships: OrganizationStructureMembership[];
  identityProviders: OrganizationIdentityProvider[];
}

export interface CreateOrganizationResponse {
  organization: OrganizationSummary;
}

export interface ListMyOrganizationsResponse {
  organizations: OrganizationMembershipSummary[];
}

export interface GetOrganizationStructureResponse {
  organization: OrganizationStructure;
}

export interface CreateDepartmentResponse {
  department: OrganizationDepartment;
}

export interface CreateTeamResponse {
  team: OrganizationTeam;
}

export interface AddOrganizationMemberResponse {
  membershipId: string;
  userId: string;
  orgId: string;
  status: string;
}
