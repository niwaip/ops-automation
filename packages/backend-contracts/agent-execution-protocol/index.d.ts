export interface AgentExecutionStartRequest {
    executionId: string;
    stepId: string;
    agentKind: string;
    input: Record<string, unknown>;
    context?: Record<string, unknown>;
}
export interface AgentExecutionProgressEvent {
    executionId: string;
    stepId: string;
    status: 'running' | 'waiting' | 'takeover_required' | 'succeeded' | 'failed';
    timestamp: string;
    payload?: Record<string, unknown>;
}
export interface AgentExecutionResult {
    executionId: string;
    stepId: string;
    status: 'succeeded' | 'failed' | 'waiting' | 'takeover_required';
    output?: Record<string, unknown>;
    error?: Record<string, unknown>;
}
//# sourceMappingURL=index.d.ts.map