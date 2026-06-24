export interface IdentityAccessOrgContext {
  orgId: string;
  membershipId: string;
}

export interface RbacPermissionResolution {
  permissions: string[];
  orgContext?: IdentityAccessOrgContext | null;
}

export interface RbacPermissionReader {
  resolvePermissions(input: {
    userId: string;
    requestedOrgId?: string | null;
  }): Promise<RbacPermissionResolution>;
}
