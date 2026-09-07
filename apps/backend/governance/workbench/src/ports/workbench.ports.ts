export const WORKBENCH_PRISMA = Symbol('WORKBENCH_PRISMA');

export interface WorkbenchPrismaPort {
  user?: any;
  role?: any;
  userRole?: any;
  todoItem?: any;
  inboxItem?: any;
  orgWorkflow?: any;
  coordinationTask?: any;
  workspace?: any;
  workspaceFile?: any;
  userEmailConnection?: any;
  $queryRaw<T = any>(query: any, ...values: any[]): Promise<T>;
  $queryRawUnsafe<T = any>(query: string, ...values: any[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: any[]): Promise<number>;
  $transaction?<T = any>(fn: any): Promise<T>;
  [key: string]: any;
}

const isContainerRuntime = (): boolean => process.env.DOCKER_ENV === 'true';

export const getAiOrchestratorUrl = (): string => {
  const configured = process.env.AI_ORCHESTRATOR_URL || process.env.AI_SERVICE_URL;
  if (configured && configured.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }
  return isContainerRuntime() ? 'http://ai-orchestrator:3007' : 'http://localhost:3007';
};

export const getControlPlaneApiUrl = (): string => {
  const configured = process.env.CONTROL_PLANE_URL;
  if (configured && configured.trim()) {
    const trimmed = configured.trim().replace(/\/+$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
  const baseUrl = isContainerRuntime() ? 'http://ops-control-plane:3003' : 'http://localhost:3003';
  return `${baseUrl}/api`;
};
