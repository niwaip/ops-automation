import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ExecutionFlowValidationFacadeService } from './execution-flow-validation-facade.service';
import type { ValidationResult } from './interfaces';

type ValidationErrorCode =
  | 'VALIDATION_TIMEOUT'
  | 'AI_JSON_PARSE_ERROR'
  | 'FLOW_EXECUTION_ERROR'
  | 'NETWORK_ERROR'
  | 'TEMPLATE_NOT_FOUND'
  | 'VALIDATION_UNKNOWN_ERROR';

@Injectable()
export class ExecutionFlowValidationHttpService {
  constructor(private readonly validationFacade: ExecutionFlowValidationFacadeService) {}

  async validateTemplateRequest(input: {
    id: string;
    aiServiceUrl?: string;
    enableExecutionTest?: string;
    body?: { testParams?: Record<string, unknown>; testUserInput?: string };
  }): Promise<{ validationResult: ValidationResult }> {
    try {
      const validationResult = await this.validationFacade.validateTemplate(
        input.id,
        input.aiServiceUrl,
        input.body?.testParams,
        input.enableExecutionTest === 'true',
        input.body?.testUserInput
      );

      return { validationResult };
    } catch (error) {
      const classified = this.classifyValidationError(error);
      throw new HttpException(
        {
          code: classified.code,
          message: classified.message,
        },
        classified.status
      );
    }
  }

  private classifyValidationError(error: unknown): {
    code: ValidationErrorCode;
    message: string;
    status: HttpStatus;
  } {
    const rawMessage =
      typeof (error as { message?: unknown })?.message === 'string' &&
      (error as { message: string }).message.trim()
        ? (error as { message: string }).message
        : '验证失败，请检查服务状态后重试';
    const normalizedMessage = rawMessage.toLowerCase();

    if (normalizedMessage.includes('template not found')) {
      return {
        code: 'TEMPLATE_NOT_FOUND',
        message: '模板不存在',
        status: HttpStatus.NOT_FOUND,
      };
    }

    if (
      (error as { code?: string })?.code === 'ECONNABORTED' ||
      normalizedMessage.includes('timeout') ||
      normalizedMessage.includes('超时')
    ) {
      return {
        code: 'VALIDATION_TIMEOUT',
        message: rawMessage,
        status: HttpStatus.GATEWAY_TIMEOUT,
      };
    }

    if (
      normalizedMessage.includes('json') ||
      normalizedMessage.includes('parse') ||
      normalizedMessage.includes('invalid') ||
      normalizedMessage.includes('不是有效 json')
    ) {
      return {
        code: 'AI_JSON_PARSE_ERROR',
        message: rawMessage,
        status: HttpStatus.BAD_GATEWAY,
      };
    }

    if (
      normalizedMessage.includes('flow_execute') ||
      normalizedMessage.includes('react') ||
      normalizedMessage.includes('执行测试') ||
      normalizedMessage.includes('执行引擎') ||
      normalizedMessage.includes('stream')
    ) {
      return {
        code: 'FLOW_EXECUTION_ERROR',
        message: rawMessage,
        status: HttpStatus.BAD_GATEWAY,
      };
    }

    if (
      normalizedMessage.includes('network') ||
      normalizedMessage.includes('fetch') ||
      normalizedMessage.includes('socket') ||
      normalizedMessage.includes('econnrefused')
    ) {
      return {
        code: 'NETWORK_ERROR',
        message: rawMessage,
        status: HttpStatus.BAD_GATEWAY,
      };
    }

    return {
      code: 'VALIDATION_UNKNOWN_ERROR',
      message: rawMessage,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }
}
