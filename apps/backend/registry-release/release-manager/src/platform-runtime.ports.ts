export interface ReleaseManagerPrismaPort {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  skillConfig: {
    updateMany(args: {
      where: { id: string };
      data: { isActive: boolean };
    }): Promise<unknown>;
  };
}

export interface ReleaseManagerSkillServicePort {
  createSkill(payload: Record<string, unknown>): Promise<{ id: string }>;
  updateSkill(
    skillId: string,
    payload: Record<string, unknown>
  ): Promise<{ id?: string | null } | null | undefined>;
  getSkillToolBindings(skillId: string): Promise<{
    validation: {
      effectiveTools: string[];
    };
  }>;
  validateSkillToolsPayload(payload: {
    tools: string[];
    executionFlow?: unknown;
    executionFlowTemplateIds?: unknown;
  }): Promise<{
    isValid: boolean;
    effectiveTools?: string[];
    messages?: string[];
    missingTools?: string[];
    disabledTools?: string[];
    forbiddenSkillTools?: string[];
    undeclaredFlowTools?: string[];
    declaredTools?: string[];
    inferredTools?: string[];
  }>;
}

export interface ReleaseManagerToolCatalogPort {
  getCatalogItemsByNames(toolNames: string[]): Promise<
    Map<
      string,
      {
        promptExposure?: string;
        defaultRequiresConfirmation?: boolean;
        defaultRequiresApproval?: boolean;
        status?: string;
      }
    >
  >;
}

export interface ReleaseManagerExecutionFlowValidationFacadePort {
  validateTemplate(
    templateId: string,
    version?: unknown,
    input?: unknown,
    executeTest?: boolean,
    testUserInput?: string
  ): Promise<{
    isValid: boolean;
    score?: number;
    warnings?: string[];
    details?: {
      executionTest?: {
        log?: string[];
      };
    };
  }>;
}

export interface ReleaseManagerTemporalWorkflowPort {
  getArtifact(workflowId: string): Promise<{
    workflowId: string;
    workflowName: string;
    artifactVersion?: number | null;
    artifactHash?: string | null;
    generatedCode?: string | null;
    validationStatus: string;
  }>;
  deploy(workflowId: string): Promise<{
    id: string;
    taskQueue?: string | null;
    deployedAt?: Date | null;
  }>;
  validate(
    workflowDsl: Record<string, unknown>,
    input?: unknown
  ): Promise<{
    isValid: boolean;
    score: number;
    errors: string[];
    warnings: string[];
  }>;
  validateWorkflowReal(
    code: string,
    fn: string,
    input?: unknown
  ): Promise<{
    success: boolean;
    score: number;
    logs: string[];
    result?: unknown;
    error?: string | null;
    traceback?: string | null;
  }>;
  validateWorkflowRealStreaming(
    code: string,
    fn: string,
    input?: unknown,
    taskQueue?: unknown,
    timeout?: unknown,
    onLog?: (log: string) => void
  ): Promise<{
    success: boolean;
    score: number;
    logs?: string[];
    result?: unknown;
    error?: string | null;
    traceback?: string | null;
  }>;
}

export interface ReleaseManagerActivityExecutionPort {
  executeCodeStreaming(
    code: string,
    fn: string,
    taskQueue: string,
    input?: unknown,
    onLog?: (log: string) => void,
    options?: {
      preferSandboxStreaming?: boolean;
    }
  ): Promise<{
    success: boolean;
    result?: unknown;
    error?: string | null;
    workflowId?: string | null;
  }>;
}
