import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Param,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { IsString, IsOptional, IsArray, IsIn } from 'class-validator';
import { Public } from '@ops/identity-access';
import { BuiltinSkillCatalogProjectionService } from './catalog-projection/builtin-skill-catalog-projection.service';
import { BuiltinSkillRegistryService } from './registry/builtin-skill-registry.service';
import { BuiltinSkillRuntimeConfigService } from './runtime-config/builtin-skill-runtime-config.service';
import { BuiltinSkillProvisioningService } from './provisioning/builtin-skill-provisioning.service';

export class ResolveRequestDto {
  @IsString()
  capabilityKey!: string;

  @IsOptional()
  @IsString()
  definitionVersion?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];

  @IsOptional()
  @IsIn(['discover', 'execute', 'manage'])
  action?: 'discover' | 'execute' | 'manage';
}

@Public()
@Controller('internal/builtin-skills')
export class BuiltinSkillController {
  constructor(
    private readonly catalogProjectionService: BuiltinSkillCatalogProjectionService,
    private readonly registryService: BuiltinSkillRegistryService,
    private readonly runtimeConfigService: BuiltinSkillRuntimeConfigService,
    private readonly provisioningService: BuiltinSkillProvisioningService
  ) {}

  private isTrustedInternalCaller(req: Request): boolean {
    const internalSecret =
      process.env.INTERNAL_API_SECRET || process.env.INTERNAL_API_SHARED_SECRET;
    const hasUser = Boolean((req as any).user);
    if (!internalSecret) {
      // No secret configured — only authenticated JWT callers are trusted
      return hasUser;
    }
    const reqSecret =
      req.headers['x-internal-secret'] ||
      req.headers['x-internal-token'] ||
      req.headers['x-internal-auth'];
    return hasUser || reqSecret === internalSecret;
  }

  @Post('verify-and-activate')
  @HttpCode(HttpStatus.OK)
  async verifyAndActivateAll(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body?: { target?: string }
  ) {
    if (!this.isTrustedInternalCaller(req)) {
      throw new ForbiddenException('Trusted internal caller required');
    }
    const result = await this.provisioningService.verifyAndActivateAll(body?.target);
    if (result.failed.length > 0) {
      res.status(207);
    }
    return {
      success: result.failed.length === 0,
      succeeded: result.succeeded,
      failed: result.failed,
      total: result.succeeded.length + result.failed.length,
    };
  }

  @Get(':capabilityKey/runtime-config')
  async getRuntimeConfig(@Param('capabilityKey') capabilityKey: string, @Req() req: Request) {
    if (!this.isTrustedInternalCaller(req))
      throw new ForbiddenException('Trusted internal caller required');
    return { values: await this.runtimeConfigService.resolve(capabilityKey) };
  }

  @Get('catalog')
  async getUnifiedCatalog(@Req() req: Request) {
    const user = (req as any).user;
    const isTrusted = this.isTrustedInternalCaller(req);

    // Identity resolution: Only trust headers if authenticated via JWT or valid internal service secret
    const userId = user?.id || (isTrusted ? (req.headers['x-user-id'] as string) : undefined);
    const orgId =
      user?.activeOrgId ||
      user?.orgId ||
      (isTrusted ? (req.headers['x-org-id'] as string) : undefined);

    let roleIds: string[] | undefined;
    if (Array.isArray(user?.roles)) {
      roleIds = user.roles;
    } else if (typeof user?.role === 'string') {
      roleIds = [user.role];
    } else if (isTrusted && req.headers['x-role-ids']) {
      roleIds = String(req.headers['x-role-ids']).split(',');
    }

    const catalog = await this.catalogProjectionService.getUnifiedCatalog({
      userId,
      orgId,
      roleIds,
    });
    return { success: true, count: catalog.length, capabilities: catalog };
  }

  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  async resolveCapability(@Body() dto: ResolveRequestDto, @Req() req: Request) {
    const user = (req as any).user;
    const isTrusted = this.isTrustedInternalCaller(req);

    // Unauthenticated public callers cannot specify arbitrary identity in request body
    const userId =
      isTrusted && dto.userId
        ? dto.userId
        : user?.id || (isTrusted ? (req.headers['x-user-id'] as string) : undefined);
    const orgId =
      isTrusted && dto.orgId
        ? dto.orgId
        : user?.activeOrgId ||
          user?.orgId ||
          (isTrusted ? (req.headers['x-org-id'] as string) : undefined);
    const roleIds =
      isTrusted && dto.roleIds
        ? dto.roleIds
        : Array.isArray(user?.roles)
          ? user.roles
          : typeof user?.role === 'string'
            ? [user.role]
            : isTrusted && req.headers['x-role-ids']
              ? String(req.headers['x-role-ids']).split(',')
              : undefined;

    const result = await this.catalogProjectionService.resolveCapability({
      capabilityKey: dto.capabilityKey,
      definitionVersion: dto.definitionVersion,
      userId,
      orgId,
      roleIds,
      action: dto.action || 'execute',
    });

    return { success: true, ...result };
  }
}
