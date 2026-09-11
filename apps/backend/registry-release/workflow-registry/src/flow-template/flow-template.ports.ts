export const WORKFLOW_REGISTRY_PRISMA = Symbol('WORKFLOW_REGISTRY_PRISMA');

export interface WorkflowRegistryPrismaPort {
  $queryRawUnsafe<T = any>(query: string, ...values: any[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: any[]): Promise<number>;
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
