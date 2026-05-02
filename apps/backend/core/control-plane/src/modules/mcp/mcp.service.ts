import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionService } from '../execution/execution.service';
import {
  ApprovalDecisionDto,
  CreateExecutionDto,
  ResumeExecutionDto,
  SubmitInputDto,
  TakeoverExecutionDto,
} from '../execution/execution.dto';
import { IncomingHttpHeaders } from 'http';

// Auth服务地址
const getAuthServiceUrl = () => {
  if (process.env.AUTH_SERVICE_URL) {
    return process.env.AUTH_SERVICE_URL;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-auth:3001';
  }
  return 'http://localhost:3001';
};

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private static readonly LATEST_EXECUTIONS_URI = 'execution://latest';
  private static readonly CONTROL_TOOLS = [
    {
      name: 'execution_approve',
      description: 'Approve an execution that is currently waiting in pending_approval status.',
      inputSchema: {
        type: 'object',
        properties: {
          executionId: {
            type: 'string',
            description: 'Execution ID to approve',
          },
          comment: {
            type: 'string',
            description: 'Optional approval comment',
          },
          _meta: {
            type: 'object',
            description: 'Optional execution metadata such as userId or authorization',
          },
        },
        required: ['executionId'],
      },
    },
    {
      name: 'execution_reject',
      description: 'Reject an execution that is currently waiting in pending_approval status.',
      inputSchema: {
        type: 'object',
        properties: {
          executionId: {
            type: 'string',
            description: 'Execution ID to reject',
          },
          comment: {
            type: 'string',
            description: 'Optional rejection comment',
          },
          _meta: {
            type: 'object',
            description: 'Optional execution metadata such as userId or authorization',
          },
        },
        required: ['executionId'],
      },
    },
    {
      name: 'execution_submit_input',
      description: 'Submit missing input for an execution that is currently waiting_input.',
      inputSchema: {
        type: 'object',
        properties: {
          executionId: {
            type: 'string',
            description: 'Execution ID to resume',
          },
          stepId: {
            type: 'string',
            description: 'Current input collection step ID',
          },
          input: {
            type: 'object',
            description: 'Input values to submit for the missing fields',
          },
          _meta: {
            type: 'object',
            description: 'Optional execution metadata such as userId or authorization',
          },
        },
        required: ['executionId', 'stepId', 'input'],
      },
    },
    {
      name: 'execution_cancel',
      description: 'Cancel an execution from any cancellable state.',
      inputSchema: {
        type: 'object',
        properties: {
          executionId: {
            type: 'string',
            description: 'Execution ID to cancel',
          },
          _meta: {
            type: 'object',
            description: 'Optional execution metadata such as userId or authorization',
          },
        },
        required: ['executionId'],
      },
    },
    {
      name: 'execution_resume',
      description: 'Resume an execution from human_control.',
      inputSchema: {
        type: 'object',
        properties: {
          executionId: {
            type: 'string',
            description: 'Execution ID to resume',
          },
          stepId: {
            type: 'string',
            description: 'Optional step ID to resume from',
          },
          comment: {
            type: 'string',
            description: 'Optional resume comment',
          },
          _meta: {
            type: 'object',
            description: 'Optional execution metadata such as userId or authorization',
          },
        },
        required: ['executionId'],
      },
    },
    {
      name: 'execution_takeover',
      description: 'Move an execution into human_control with a takeover reason.',
      inputSchema: {
        type: 'object',
        properties: {
          executionId: {
            type: 'string',
            description: 'Execution ID to takeover',
          },
          reason: {
            type: 'string',
            description: 'Reason for human takeover',
          },
          _meta: {
            type: 'object',
            description: 'Optional execution metadata such as userId or authorization',
          },
        },
        required: ['executionId', 'reason'],
      },
    },
  ] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionService: ExecutionService,
    private readonly jwtService: JwtService,
  ) {}

  async initialize() {
    return {
      protocolVersion: '2024-11-05',
      serverInfo: {
        name: 'ops-automation-mcp',
        version: '0.1.0',
      },
      capabilities: {
        tools: {},
        resources: {},
      },
    };
  }

  /**
   * 获取所有可用的 MCP 工具 (即已发布的 Skills)
   */
  async listTools(headers?: IncomingHttpHeaders) {
    try {
      const authHeaders = await this.buildForwardAuthHeaders(headers);
      const authUrl = getAuthServiceUrl();
      const response = await axios.get<{ skills?: any[] }>(`${authUrl}/skills`, {
        headers: authHeaders,
      });
      const skills = response.data?.skills || [];

      return [
        ...McpService.CONTROL_TOOLS,
        ...skills.map((skill: any) => ({
        name: `skill_${skill.id.replace(/-/g, '_')}`,
        description: skill.description || skill.name,
        inputSchema: {
          type: 'object',
          properties: skill.config?.paramsSchema?.properties || {},
          required: skill.config?.paramsSchema?.required || [],
        },
      })),
      ];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Failed to list tools for MCP: ${message}`);
      return [...McpService.CONTROL_TOOLS];
    }
  }

  async listResources() {
    return [
      {
        uri: McpService.LATEST_EXECUTIONS_URI,
        name: 'Latest Executions',
        description: 'Read the latest execution records created by MCP or API clients.',
        mimeType: 'application/json',
      },
      {
        uri: 'execution://{id}',
        name: 'Execution Detail',
        description: 'Read a single execution by ID.',
        mimeType: 'application/json',
      },
      {
        uri: 'execution-steps://{id}',
        name: 'Execution Steps',
        description: 'Read ordered execution steps for a given execution.',
        mimeType: 'application/json',
      },
      {
        uri: 'execution-events://{id}',
        name: 'Execution Events',
        description: 'Read recent execution events for a given execution.',
        mimeType: 'application/json',
      },
    ];
  }

  async readResource(uri: string, headers?: IncomingHttpHeaders) {
    const requester = await this.resolveInvoker(headers);
    if (uri === McpService.LATEST_EXECUTIONS_URI) {
      return this.readLatestExecutions(uri, requester);
    }

    if (uri.startsWith('execution://')) {
      return this.readExecutionDetail(uri, uri.slice('execution://'.length), requester);
    }

    if (uri.startsWith('execution-steps://')) {
      return this.readExecutionSteps(uri, uri.slice('execution-steps://'.length), requester);
    }

    if (uri.startsWith('execution-events://')) {
      return this.readExecutionEvents(uri, uri.slice('execution-events://'.length), requester);
    }

    throw new NotFoundException(`Unsupported MCP resource: ${uri}`);
  }

  private async readLatestExecutions(
    uri: string,
    requester: { id: string; role: string; username: string },
  ) {
    const executions = await this.prisma.execution.findMany({
      where: requester.role === 'admin' ? undefined : { createdBy: requester.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        skillId: true,
        status: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        currentStepId: true,
        requiresApproval: true,
      },
    });

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            executions: executions.map((execution) => ({
              ...execution,
              resourceUri: this.buildExecutionUri(execution.id),
              stepsUri: this.buildExecutionStepsUri(execution.id),
              eventsUri: this.buildExecutionEventsUri(execution.id),
            })),
          }, null, 2),
        },
      ],
    };
  }

  private async readExecutionDetail(
    uri: string,
    executionId: string,
    requester: { id: string; role: string; username: string },
  ) {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: {
        id: true,
        orgId: true,
        createdBy: true,
        skillId: true,
        skillVersion: true,
        status: true,
        runtimeType: true,
        riskLevel: true,
        inputJson: true,
        normalizedInputJson: true,
        resultJson: true,
        failureReason: true,
        failureCode: true,
        currentStepId: true,
        requiresApproval: true,
        approvalStatus: true,
        takeoverRequired: true,
        takeoverReason: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!execution) {
      throw new NotFoundException(`Execution not found: ${executionId}`);
    }

    this.ensureExecutionReadable(execution.createdBy, requester);

    const currentStep = execution.currentStepId
      ? await this.prisma.executionStep.findUnique({
          where: { id: execution.currentStepId },
          select: {
            id: true,
            type: true,
            status: true,
            action: true,
            inputJson: true,
          },
        })
      : null;

    const missingRequiredInputs = this.extractMissingRequiredInputs(currentStep?.inputJson);
    const availableActions = this.buildAvailableActions(execution.status, execution.id, currentStep?.id);

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            execution: {
              ...execution,
              stepsUri: this.buildExecutionStepsUri(execution.id),
              eventsUri: this.buildExecutionEventsUri(execution.id),
              availableActions,
              currentInputRequest: missingRequiredInputs.length > 0
                ? {
                    stepId: currentStep?.id,
                    requiredInputs: missingRequiredInputs,
                    submitTool: 'execution_submit_input',
                  }
                : undefined,
            },
          }, null, 2),
        },
      ],
    };
  }

  private async readExecutionSteps(
    uri: string,
    executionId: string,
    requester: { id: string; role: string; username: string },
  ) {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { id: true, createdBy: true },
    });

    if (!execution) {
      throw new NotFoundException(`Execution not found: ${executionId}`);
    }

    this.ensureExecutionReadable(execution.createdBy, requester);

    const steps = await this.prisma.executionStep.findMany({
      where: { executionId },
      orderBy: { stepIndex: 'asc' },
      select: {
        id: true,
        stepIndex: true,
        name: true,
        type: true,
        status: true,
        action: true,
        targetJson: true,
        inputJson: true,
        outputJson: true,
        errorCode: true,
        errorMessage: true,
        snapshotId: true,
        takeoverTriggered: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ executionId, steps }, null, 2),
        },
      ],
    };
  }

  private async readExecutionEvents(
    uri: string,
    executionId: string,
    requester: { id: string; role: string; username: string },
  ) {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { id: true, createdBy: true },
    });

    if (!execution) {
      throw new NotFoundException(`Execution not found: ${executionId}`);
    }

    this.ensureExecutionReadable(execution.createdBy, requester);

    const events = await this.prisma.executionEvent.findMany({
      where: { executionId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        stepId: true,
        runtimeSessionId: true,
        eventType: true,
        eventSource: true,
        payloadJson: true,
        createdAt: true,
      },
    });

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ executionId, events }, null, 2),
        },
      ],
    };
  }

  private buildExecutionUri(executionId: string): string {
    return `execution://${executionId}`;
  }

  private buildExecutionStepsUri(executionId: string): string {
    return `execution-steps://${executionId}`;
  }

  private buildExecutionEventsUri(executionId: string): string {
    return `execution-events://${executionId}`;
  }

  private buildAvailableActions(status: string, executionId: string, currentStepId?: string | null) {
    const actions: Array<Record<string, unknown>> = [];

    const cancellableStatuses = new Set([
      'draft',
      'queued',
      'running',
      'waiting_input',
      'pending_approval',
      'human_control',
      'paused',
    ]);

    if (status === 'pending_approval') {
      actions.push({
        tool: 'execution_approve',
        arguments: { executionId },
      });
      actions.push({
        tool: 'execution_reject',
        arguments: { executionId },
      });
    }

    if (status === 'waiting_input' && currentStepId) {
      actions.push({
        tool: 'execution_submit_input',
        arguments: { executionId, stepId: currentStepId },
      });
    }

    if (status === 'human_control') {
      actions.push({
        tool: 'execution_resume',
        arguments: { executionId, stepId: currentStepId || undefined },
      });
    }

    if (status === 'running') {
      actions.push({
        tool: 'execution_takeover',
        arguments: { executionId },
      });
    }

    if (cancellableStatuses.has(status)) {
      actions.push({
        tool: 'execution_cancel',
        arguments: { executionId },
      });
    }

    return actions;
  }

  private extractMissingRequiredInputs(inputJson: unknown): Array<Record<string, unknown>> {
    if (!inputJson || typeof inputJson !== 'object' || Array.isArray(inputJson)) {
      return [];
    }

    const requiredInputs = (inputJson as Record<string, unknown>).requiredInputs;
    if (!Array.isArray(requiredInputs)) {
      return [];
    }

    return requiredInputs.filter((item): item is Record<string, unknown> => {
      return !!item && typeof item === 'object' && !Array.isArray(item);
    });
  }

  private async resolveInvoker(headers?: IncomingHttpHeaders): Promise<{ id: string; role: string; username: string }> {
    const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
    const internalAuth = headers?.['x-internal-auth'];
    const internalUserId = headers?.['x-user-id'];
    const internalUserRole = headers?.['x-user-role'];
    const internalUsername = headers?.['x-user-name'];

    if (
      internalSecret &&
      typeof internalAuth === 'string' &&
      internalAuth === internalSecret &&
      typeof internalUserId === 'string' &&
      internalUserId.trim()
    ) {
      return {
        id: internalUserId,
        username: typeof internalUsername === 'string' && internalUsername.trim()
          ? internalUsername
          : internalUserId,
        role: typeof internalUserRole === 'string' && internalUserRole.trim()
          ? internalUserRole
          : 'employee',
      };
    }

    const authorization = typeof headers?.authorization === 'string'
      ? headers.authorization
      : undefined;
    if (!authorization) {
      throw new UnauthorizedException('MCP authorization header is required');
    }

    const token = authorization.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('MCP token is required');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      });
      return {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired MCP token');
    }
  }

  private async buildForwardAuthHeaders(headers?: IncomingHttpHeaders): Promise<Record<string, string>> {
    const resolved = await this.resolveInvoker(headers);
    const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
    if (internalSecret) {
      return {
        'x-internal-auth': internalSecret,
        'x-user-id': resolved.id,
        'x-user-role': resolved.role,
        'x-user-name': resolved.username,
      };
    }

    if (typeof headers?.authorization === 'string') {
      return {
        Authorization: headers.authorization,
      };
    }

    throw new UnauthorizedException('Unable to forward MCP auth context');
  }

  private ensureExecutionReadable(
    createdBy: string,
    requester: { id: string; role: string },
  ): void {
    if (requester.role === 'admin') {
      return;
    }
    if (requester.id !== createdBy) {
      throw new NotFoundException('Execution not found');
    }
  }

  /**
   * 执行 MCP 工具调用
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    headers?: IncomingHttpHeaders,
  ) {
    try {
      const invoker = await this.resolveInvoker(headers);
      const requester = { id: invoker.id, role: invoker.role };

      if (name === 'execution_approve') {
        return this.approveExecution(args, invoker, requester);
      }

      if (name === 'execution_reject') {
        return this.rejectExecution(args, invoker, requester);
      }

      if (name === 'execution_submit_input') {
        return this.submitExecutionInput(args, invoker, requester);
      }

      if (name === 'execution_cancel') {
        return this.cancelExecution(args, invoker, requester);
      }

      if (name === 'execution_resume') {
        return this.resumeExecution(args, invoker, requester);
      }

      if (name === 'execution_takeover') {
        return this.takeoverExecution(args, invoker, requester);
      }

      const skillId = name.startsWith('skill_') ? name.replace('skill_', '').replace(/_/g, '-') : name;
      this.logger.log(`MCP Call: ${name} (skillId: ${skillId})`);
      const { _meta, ...input } = args;

      const dto: CreateExecutionDto = {
        skillId,
        capabilityId: skillId,
        runtimeType: 'browser',
        input,
      };

      const execution = await this.executionService.create(
        invoker.id,
        dto,
        {
          authToken: typeof headers?.authorization === 'string' ? headers.authorization : undefined,
        },
      );

      return {
        content: [
          {
            type: 'text',
            text: `Execution created for skill ${skillId}. status=${execution.status}, executionId=${execution.id}`,
          },
          {
            type: 'text',
            text: JSON.stringify({
              executionId: execution.id,
              status: execution.status,
              createdBy: invoker.username,
              resourceUri: this.buildExecutionUri(execution.id),
              stepsUri: this.buildExecutionStepsUri(execution.id),
              eventsUri: this.buildExecutionEventsUri(execution.id),
              latestUri: McpService.LATEST_EXECUTIONS_URI,
            }),
          },
        ],
        structuredContent: {
          executionId: execution.id,
          status: execution.status,
          skillId,
          createdBy: invoker.username,
          currentStepId: execution.currentStepId,
          requiresApproval: execution.requiresApproval,
          resourceUri: this.buildExecutionUri(execution.id),
          stepsUri: this.buildExecutionStepsUri(execution.id),
          eventsUri: this.buildExecutionEventsUri(execution.id),
          latestUri: McpService.LATEST_EXECUTIONS_URI,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error calling tool ${name}: ${message}`,
          },
        ],
      };
    }
  }

  private async approveExecution(
    args: Record<string, unknown>,
    invoker: { id: string; role: string },
    requester: { id: string; role: string },
  ) {
    const executionId = typeof args.executionId === 'string' ? args.executionId : '';
    const dto: ApprovalDecisionDto = {
      comment: typeof args.comment === 'string' ? args.comment : undefined,
      decidedBy: invoker.id,
    };
    const execution = await this.executionService.approve(executionId, invoker.id, dto, requester);

    return {
      content: [
        {
          type: 'text',
          text: `Execution ${executionId} approved. status=${execution.status}`,
        },
      ],
      structuredContent: {
        executionId: execution.id,
        status: execution.status,
        resourceUri: this.buildExecutionUri(execution.id),
      },
    };
  }

  private async rejectExecution(
    args: Record<string, unknown>,
    invoker: { id: string; role: string },
    requester: { id: string; role: string },
  ) {
    const executionId = typeof args.executionId === 'string' ? args.executionId : '';
    const dto: ApprovalDecisionDto = {
      comment: typeof args.comment === 'string' ? args.comment : undefined,
      decidedBy: invoker.id,
    };
    const execution = await this.executionService.reject(executionId, invoker.id, dto, requester);

    return {
      content: [
        {
          type: 'text',
          text: `Execution ${executionId} rejected. status=${execution.status}`,
        },
      ],
      structuredContent: {
        executionId: execution.id,
        status: execution.status,
        resourceUri: this.buildExecutionUri(execution.id),
      },
    };
  }

  private async submitExecutionInput(
    args: Record<string, unknown>,
    invoker: { id: string; role: string },
    requester: { id: string; role: string },
  ) {
    const executionId = typeof args.executionId === 'string' ? args.executionId : '';
    const stepId = typeof args.stepId === 'string' ? args.stepId : '';
    const input = args.input && typeof args.input === 'object' && !Array.isArray(args.input)
      ? (args.input as Record<string, unknown>)
      : {};
    const dto: SubmitInputDto = {
      stepId,
      input,
      submittedBy: invoker.id,
    };
    const execution = await this.executionService.submitInputAndResume(executionId, invoker.id, dto, requester);

    return {
      content: [
        {
          type: 'text',
          text: `Input submitted for execution ${executionId}. status=${execution.status}`,
        },
      ],
      structuredContent: {
        executionId: execution.id,
        status: execution.status,
        resourceUri: this.buildExecutionUri(execution.id),
      },
    };
  }

  private async cancelExecution(
    args: Record<string, unknown>,
    invoker: { id: string; role: string },
    requester: { id: string; role: string },
  ) {
    const executionId = typeof args.executionId === 'string' ? args.executionId : '';
    const execution = await this.executionService.cancel(executionId, invoker.id, requester);

    return {
      content: [
        {
          type: 'text',
          text: `Execution ${executionId} cancelled. status=${execution.status}`,
        },
      ],
      structuredContent: {
        executionId: execution.id,
        status: execution.status,
        resourceUri: this.buildExecutionUri(execution.id),
      },
    };
  }

  private async resumeExecution(
    args: Record<string, unknown>,
    invoker: { id: string; role: string },
    requester: { id: string; role: string },
  ) {
    const executionId = typeof args.executionId === 'string' ? args.executionId : '';
    const dto: ResumeExecutionDto = {
      stepId: typeof args.stepId === 'string' ? args.stepId : undefined,
      comment: typeof args.comment === 'string' ? args.comment : undefined,
      resumedBy: invoker.id,
    };
    const execution = await this.executionService.resume(executionId, invoker.id, dto, requester);

    return {
      content: [
        {
          type: 'text',
          text: `Execution ${executionId} resumed. status=${execution.status}`,
        },
      ],
      structuredContent: {
        executionId: execution.id,
        status: execution.status,
        resourceUri: this.buildExecutionUri(execution.id),
      },
    };
  }

  private async takeoverExecution(
    args: Record<string, unknown>,
    invoker: { id: string; role: string },
    requester: { id: string; role: string },
  ) {
    const executionId = typeof args.executionId === 'string' ? args.executionId : '';
    const dto: TakeoverExecutionDto = {
      reason: typeof args.reason === 'string' ? args.reason : '',
      requestedBy: invoker.id,
    };
    const execution = await this.executionService.takeover(executionId, invoker.id, dto, requester);

    return {
      content: [
        {
          type: 'text',
          text: `Execution ${executionId} entered human_control. status=${execution.status}`,
        },
      ],
      structuredContent: {
        executionId: execution.id,
        status: execution.status,
        resourceUri: this.buildExecutionUri(execution.id),
      },
    };
  }
}
