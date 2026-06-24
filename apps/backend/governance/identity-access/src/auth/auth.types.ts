export interface IdentityAccessUser {
  id: string;
  username: string;
  email?: string | null;
  role: 'employee' | 'admin' | 'agent';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdentityAccessRole {
  id: string;
  name: string;
  description?: string | null;
  permissions: Record<string, boolean>;
  isSystem: boolean;
}

export interface IdentityAccessOrganization {
  id: string;
  name: string;
  code: string;
  membershipId: string;
  status: string;
}

export interface IdentityAccessLoginResult {
  accessToken: string;
  refreshToken: string;
  user: IdentityAccessUser;
  activeOrgId?: string | null;
}

export interface IdentityAccessMeResult {
  user: IdentityAccessUser;
  roles: IdentityAccessRole[];
  activeOrgId?: string | null;
  organizations: IdentityAccessOrganization[];
}

export interface IdentityAccessRefreshResult {
  accessToken: string;
  refreshToken: string;
}

export interface IdentityAccessSsoStartInput {
  orgId: string;
  redirectUri?: string;
}

export interface IdentityAccessSsoCallbackInput {
  orgId: string;
  code?: string;
  idToken?: string;
  state?: string;
}
