export interface ReleaseBindingRef {
    id: string;
    kind: 'skill' | 'workflow' | 'template' | 'agent-profile';
    name: string;
    version?: string;
}
export interface ReleaseStepDefinition {
    stepId: string;
    stepType: string;
    executor: string;
    input?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}
export interface ReleaseManifest {
    createdAt: string;
    updatedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    releaseId: string;
    releaseName: string;
    version: string;
    bindings: ReleaseBindingRef[];
    steps: ReleaseStepDefinition[];
    runtimeRequirements?: Record<string, unknown>;
    policy?: Record<string, unknown>;
}