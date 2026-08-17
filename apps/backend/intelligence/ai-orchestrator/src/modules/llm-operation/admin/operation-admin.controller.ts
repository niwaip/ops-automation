import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { OperationAdminService } from './operation-admin.service';
import type {
  LlmOperationRecord,
  LlmOperationVersionRecord,
  LlmOperationActivationRecord,
  LlmOperationActivationEventRecord,
} from '../registry/types';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../registry/errors';
import type {
  CreateOperationDto,
  CreateVersionDraftDto,
  UpdateDraftDto,
  ApproveVersionDto,
  ActivateVersionDto,
  RollbackDto,
  AdjustCanaryDto,
  ListOperationsQueryDto,
  DiffVersionsQueryDto,
  VersionDiffResult,
} from './dto/admin.dto';
import type { LlmOperationDetail } from '../registry/types';
import type { OperationValidationResult } from '../eval/operation-validation-orchestrator.service';

@Controller('ai/admin/operations')
export class OperationAdminController {
  constructor(private readonly admin: OperationAdminService) {}

  @Get()
  async list(@Query() query: ListOperationsQueryDto): Promise<LlmOperationRecord[]> {
    return this.admin.listOperations(query);
  }

  @Get('_health')
  async health(): Promise<{
    dbBacked: boolean;
    legacyFallbacksAvailable: number;
    seedStatus: 'applied' | 'partial' | 'not_applied';
  }> {
    return this.admin.getRegistryHealth();
  }

  @Get(':operationKey')
  async getDetail(@Param('operationKey') operationKey: string): Promise<LlmOperationDetail> {
    const detail = await this.admin.getOperationDetail(operationKey);
    if (!detail) {
      throw new HttpException(
        { code: LLM_OPERATION_ERROR_CODES.NOT_FOUND, message: `Operation not found: ${operationKey}` },
        HttpStatus.NOT_FOUND,
      );
    }
    return detail;
  }

  @Post()
  @HttpCode(201)
  async createOperation(@Body() dto: CreateOperationDto): Promise<LlmOperationRecord> {
    return this.admin.upsertOperationByKey(dto.operationKey, {
      operationKey: dto.operationKey,
      displayName: dto.displayName,
      description: dto.description,
      owner: dto.owner,
      status: 'active',
      source: 'admin_created',
    });
  }

  @Get(':operationKey/versions')
  async listVersions(@Param('operationKey') operationKey: string): Promise<LlmOperationVersionRecord[]> {
    const detail = await this.admin.getOperationDetail(operationKey);
    if (!detail) {
      throw new HttpException(
        { code: LLM_OPERATION_ERROR_CODES.NOT_FOUND, message: `Operation not found: ${operationKey}` },
        HttpStatus.NOT_FOUND,
      );
    }
    return detail.versions;
  }

  @Post(':operationKey/versions')
  @HttpCode(201)
  async createDraft(
    @Param('operationKey') opKey: string,
    @Body() dto: CreateVersionDraftDto,
    @Headers('x-actor') actor?: string,
  ): Promise<LlmOperationVersionRecord> {
    if (!actor) {
      throw new HttpException(
        { code: 'MISSING_ACTOR', message: 'x-actor header is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.admin.createVersionDraft(opKey, dto, actor);
  }

  @Put(':operationKey/versions/:version')
  async updateDraft(
    @Param('operationKey') opKey: string,
    @Param('version') version: string,
    @Body() dto: UpdateDraftDto,
  ): Promise<LlmOperationVersionRecord> {
    return this.handleVersionUpdate(() => this.admin.updateDraft(opKey, version, dto));
  }

  @Post(':operationKey/versions/:version/validate')
  @HttpCode(200)
  async validate(
    @Param('operationKey') opKey: string,
    @Param('version') version: string,
    @Headers('x-actor') actor: string,
  ): Promise<{ version: LlmOperationVersionRecord; validation: OperationValidationResult }> {
    this.requireActor(actor);
    return this.handleVersionUpdate(() => this.admin.transitionToValidating(opKey, version, actor));
  }

  @Post(':operationKey/versions/:version/approve')
  @HttpCode(200)
  async approve(
    @Param('operationKey') opKey: string,
    @Param('version') version: string,
    @Body() dto: ApproveVersionDto,
    @Headers('x-actor') actor?: string,
  ): Promise<LlmOperationVersionRecord> {
    this.requireActor(actor);
    return this.handleVersionUpdate(() =>
      this.admin.approveVersion(opKey, version, { ...dto, approvedBy: actor! }),
    );
  }

  @Post(':operationKey/activations')
  @HttpCode(201)
  async activate(
    @Param('operationKey') opKey: string,
    @Body() dto: ActivateVersionDto,
  ): Promise<LlmOperationActivationRecord> {
    return this.handleActivation(() => this.admin.activate(opKey, dto));
  }

  @Post(':operationKey/activations/rollback')
  @HttpCode(200)
  async rollback(
    @Param('operationKey') opKey: string,
    @Body() dto: RollbackDto,
  ): Promise<LlmOperationActivationRecord> {
    return this.handleActivation(() => this.admin.rollback(opKey, dto));
  }

  @Patch(':operationKey/activations/canary')
  @HttpCode(200)
  async adjustCanary(
    @Param('operationKey') opKey: string,
    @Body() dto: AdjustCanaryDto,
  ): Promise<LlmOperationActivationRecord> {
    return this.handleActivation(() => this.admin.adjustCanary(opKey, dto));
  }

  @Get(':operationKey/activations/history')
  async history(
    @Param('operationKey') opKey: string,
    @Query('limit') limit?: number,
  ): Promise<LlmOperationActivationEventRecord[]> {
    const parsedLimit = limit ? Number(limit) : 20;
    return this.admin.listActivationHistory(opKey, parsedLimit);
  }

  @Get(':operationKey/versions/:version/diff')
  async diff(
    @Param('operationKey') opKey: string,
    @Param('version') toVersion: string,
    @Query() query: DiffVersionsQueryDto,
  ): Promise<VersionDiffResult> {
    try {
      return await this.admin.diffVersions(opKey, query.fromVersion, toVersion);
    } catch (error) {
      if (error instanceof LlmOperationError) {
        throw new HttpException(
          { code: error.code, message: error.message, details: error.details },
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }
  }

  private requireActor(actor: string | undefined): void {
    if (!actor) {
      throw new HttpException(
        { code: 'MISSING_ACTOR', message: 'x-actor header is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async handleVersionUpdate<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof LlmOperationError) {
        if (error.code === LLM_OPERATION_ERROR_CODES.CONCURRENT_MODIFICATION) {
          throw new HttpException(
            { code: error.code, message: error.message, details: error.details },
            HttpStatus.CONFLICT,
          );
        }
        throw new HttpException(
          { code: error.code, message: error.message, details: error.details },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
  }

  private async handleActivation(
    operation: () => Promise<LlmOperationActivationRecord>,
  ): Promise<LlmOperationActivationRecord> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof LlmOperationError) {
        throw new HttpException(
          { code: error.code, message: error.message, details: error.details },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
  }
}
