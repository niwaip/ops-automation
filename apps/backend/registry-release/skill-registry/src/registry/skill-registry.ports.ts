export const SKILL_REGISTRY_PRISMA = Symbol('SKILL_REGISTRY_PRISMA');
export const BUILTIN_SKILL_REGISTRY = Symbol('BUILTIN_SKILL_REGISTRY');
export const BUILTIN_SKILL_RUNTIME_CONFIG = Symbol('BUILTIN_SKILL_RUNTIME_CONFIG');

export interface SkillRegistryPrismaPort {
  role?: any;
  user?: any;
  userRole?: any;
  skillPermission?: any;
  skillConfig?: any;
  skillAccessRequest?: any;
  execution?: any;
  $queryRawUnsafe<T = any>(query: string, ...values: any[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: any[]): Promise<number>;
  [key: string]: any;
}

export interface BuiltinSkillRegistryPort {
  listSkillInventory(): Promise<any[]>;
  setSkillEnabled(capabilityKey: string, enabled: boolean, operatorId?: string): Promise<any>;
  [key: string]: any;
}

export interface BuiltinSkillRuntimeConfigPort {
  getStatus(capabilityKey: string): Promise<any>;
  update(capabilityKey: string, payload: any, operatorId?: string): Promise<any>;
  [key: string]: any;
}

export const getAiOrchestratorUrl = (): string => {
  const isContainerRuntime = process.env.DOCKER_ENV === 'true';
  const configured = process.env.AI_ORCHESTRATOR_URL || process.env.AI_SERVICE_URL;
  if (configured && configured.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }
  return isContainerRuntime ? 'http://ai-orchestrator:3007' : 'http://localhost:3007';
};

export const getCarboneServiceUrl = (): string => {
  const isContainerRuntime = process.env.DOCKER_ENV === 'true';
  const configured = process.env.CARBONE_SERVICE_URL;
  if (configured && configured.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }
  return isContainerRuntime ? 'http://carbone-engine:3009' : 'http://localhost:3009';
};
