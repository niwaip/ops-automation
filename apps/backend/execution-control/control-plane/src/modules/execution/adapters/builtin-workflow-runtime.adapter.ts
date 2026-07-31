import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  RuntimeAdapter,
  RuntimeStepInvokeRequest,
  RuntimeStepInvokeResult,
  RuntimeType,
  RuntimeAdapterRouteKey,
} from './runtime-adapter.interface';
import { BuiltinHandlerRegistryService, BuiltinHandlerFn } from './builtin-handler-registry.service';

@Injectable()
export class BuiltinWorkflowRuntimeAdapter implements RuntimeAdapter {
  readonly runtimeType: RuntimeType = 'workflow';
  readonly routeKeys: readonly RuntimeAdapterRouteKey[] = ['workflow:builtin', 'custom:builtin'];
  private readonly logger = new Logger(BuiltinWorkflowRuntimeAdapter.name);

  constructor(
    @Optional() private readonly handlerRegistry?: BuiltinHandlerRegistryService,
  ) {}

  supports(request: RuntimeStepInvokeRequest): boolean {
    const isBuiltinKey = (request.skillId && request.skillId.startsWith('platform.')) ||
                         (request.publishedSkillId && request.publishedSkillId.startsWith('platform.')) ||
                         request.capabilityType === 'builtin' ||
                         request.capabilityType === 'domain-handler' ||
                         request.metadata?.builtinSkill === true;

    return Boolean(isBuiltinKey);
  }

  async invokeStep(request: RuntimeStepInvokeRequest): Promise<RuntimeStepInvokeResult> {
    const capabilityKey = request.publishedSkillId || request.skillId;
    if (!capabilityKey) {
      return {
        success: false,
        status: 'failed',
        errorCode: 'BUILTIN_SKILL_KEY_MISSING',
        errorMessage: 'Builtin step invoke request missing skillId / capabilityKey',
      };
    }

    const definitionVersion = request.metadata?.definitionVersion || (request as any).skillVersion;
    if (!definitionVersion) {
      return {
        success: false,
        status: 'failed',
        errorCode: 'BUILTIN_SKILL_VERSION_MISSING',
        errorMessage: `Builtin step invoke request for '${capabilityKey}' missing exact definitionVersion`,
      };
    }

    const idempotencyKey = `${request.executionId}:${request.stepId}:v${definitionVersion}`;

    // Resolve handlerKey: from metadata or capabilityKey
    let handlerKey = request.metadata?.handlerKey as string | undefined;
    if (!handlerKey) {
      if (capabilityKey === 'platform.document.markdown-artifact-writer' || capabilityKey === 'markdown_artifact_writer') {
        handlerKey = 'document.markdown-artifact-writer';
      } else {
        handlerKey = capabilityKey;
      }
    }

    this.logger.log(`Invoking builtin handler: handlerKey=${handlerKey}, capabilityKey=${capabilityKey}, version=${definitionVersion}`);

    const handlerFn = this.handlerRegistry?.getHandler(handlerKey);
    if (!handlerFn) {
      return {
        success: false,
        status: 'failed',
        errorCode: 'BUILTIN_SKILL_HANDLER_NOT_FOUND',
        errorMessage: `No registered builtin handler found for handlerKey '${handlerKey}'`,
      };
    }

    try {
      const result = await handlerFn(request, idempotencyKey);
      return {
        success: result.success,
        status: result.success ? 'completed' : 'failed',
        output: result.output,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        artifacts: result.artifacts as any,
      };
    } catch (err: any) {
      this.logger.error(`Error executing builtin handler [${handlerKey}]: ${err.message}`, err.stack);
      return {
        success: false,
        status: 'failed',
        errorCode: 'BUILTIN_SKILL_EXECUTION_ERROR',
        errorMessage: err.message,
      };
    }
  }
}
