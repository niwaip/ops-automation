export const SYSTEM_BACKUP_PRISMA = Symbol('SYSTEM_BACKUP_PRISMA');

export interface SystemBackupPrismaPort {
  user?: any;
  organization?: any;
  department?: any;
  team?: any;
  orgMembership?: any;
  teamMembership?: any;
  role?: any;
  userRole?: any;
  orgRoleBinding?: any;
  capabilityRelease?: any;
  capabilitySourceSnapshot?: any;
  capabilityBuild?: any;
  skillDraft?: any;
  skillConfig?: any;
  toolCatalog?: any;
  skillToolBinding?: any;
  skillPermission?: any;
  temporalWorkflow?: any;
  activity?: any;
  executionFlowTemplate?: any;
  taskPolicySet?: any;
  taskRecipe?: any;
  taskCommandAlias?: any;
  taskCapabilityBinding?: any;
  workspace?: any;
  workspaceDocument?: any;
  userCredential?: any;
  userSkillCredentialBinding?: any;
  $queryRawUnsafe<T = any>(query: string, ...values: any[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: any[]): Promise<number>;
  $transaction<T = any>(fn: any): Promise<T>;
  [key: string]: any;
}
