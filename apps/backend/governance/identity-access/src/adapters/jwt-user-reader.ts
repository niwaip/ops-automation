export interface IdentityAccessUserRecord {
  id: string;
  username: string;
  email: string | null;
  role: string;
  activeOrgId?: string | null;
  isActive: boolean;
}

export interface IdentityAccessUserReader {
  findById(userId: string): Promise<IdentityAccessUserRecord | null>;
}
