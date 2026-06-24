export interface IdentityAccessAuthUserRecord {
  id: string;
  username: string;
  passwordHash?: string | null;
  email: string | null;
  role: string;
  activeOrgId?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdentityAccessRoleRecord {
  id: string;
  name: string;
  description?: string | null;
  permissions: Record<string, boolean>;
  isSystem: boolean;
}

export interface IdentityAccessOrganizationRecord {
  id: string;
  name: string;
  code: string;
  membershipId: string;
  status: string;
}

export interface IdentityAccessUserProfileRecord extends IdentityAccessAuthUserRecord {
  roles: IdentityAccessRoleRecord[];
  organizations: IdentityAccessOrganizationRecord[];
}

export interface IdentityAccessSsoProviderRecord {
  id: string;
  name: string;
  providerType: string;
  orgId: string;
}

export interface IdentityAccessSsoProviderConfigRecord {
  id: string;
  orgId: string;
  providerType: string;
  tenantId?: string | null;
  clientId: string;
  authUrl?: string | null;
  scopes: string[];
}

export interface IdentityAccessAuthRepository {
  findUserByUsername(username: string): Promise<IdentityAccessAuthUserRecord | null>;
  findUserByEmail(email: string): Promise<IdentityAccessAuthUserRecord | null>;
  findUserById(userId: string): Promise<IdentityAccessAuthUserRecord | null>;
  updateLastLoginAt(userId: string): Promise<void>;
  createUser(input: {
    username: string;
    passwordHash: string;
    email?: string;
    role: 'employee' | 'admin' | 'agent';
  }): Promise<IdentityAccessAuthUserRecord>;
  findUserProfile(userId: string): Promise<IdentityAccessUserProfileRecord | null>;
  hasActiveOrganizationMembership(userId: string, orgId: string): Promise<boolean>;
  switchActiveOrganization(userId: string, orgId: string): Promise<void>;
  listEnabledSsoProviders(orgId: string): Promise<IdentityAccessSsoProviderRecord[]>;
  findSsoProviderConfig(input: {
    provider: string;
    orgId: string;
  }): Promise<IdentityAccessSsoProviderConfigRecord | null>;
}
