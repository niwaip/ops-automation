import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import type {
  CreateSkillCaptureDto,
  SkillCaptureStatusDto,
} from './personal-skill.dto';
import { normalizeSkillSlug } from './personal-skill-slug.util';
import { PersonalSkillSourceAdapter } from './personal-skill-source.adapter';
import { PersonalSkillGeneratorService } from './personal-skill-generator.service';
import { PersonalSkillValidatorService } from './personal-skill-validator.service';
import { PersonalSkillStoreService } from './personal-skill-store.service';
import type { SkillCaptureStatus } from './personal-skill.types';

@Injectable()
export class PersonalSkillCaptureService {
  private readonly logger = new Logger(PersonalSkillCaptureService.name);
  private readonly captureTasks = new Map<string, SkillCaptureStatusDto>();
  private readonly idempotencyIndex = new Map<string, string>(); // `${userId}:${key}` -> captureId

  constructor(
    private readonly sourceAdapter: PersonalSkillSourceAdapter,
    private readonly generator: PersonalSkillGeneratorService,
    private readonly validator: PersonalSkillValidatorService,
    private readonly store: PersonalSkillStoreService
  ) {}

  /**
   * 发起从已确认结果或会话提炼个人技能的异步捕获任务
   */
  async createCapture(userId: string, dto: CreateSkillCaptureDto): Promise<SkillCaptureStatusDto> {
    const cleanUserId = userId.trim();
    if (!cleanUserId) {
      throw new BadRequestException('userId 不能为空');
    }

    if (!dto.displayName || !dto.displayName.trim()) {
      throw new BadRequestException('技能展示名称 (displayName) 不能为空');
    }

    // 幂等性检查
    if (dto.idempotencyKey) {
      const ikey = `${cleanUserId}:${dto.idempotencyKey}`;
      const existingCaptureId = this.idempotencyIndex.get(ikey);
      if (existingCaptureId) {
        const existing = this.captureTasks.get(existingCaptureId);
        if (existing) {
          this.logger.log(`Returning idempotent capture [${existingCaptureId}] for user [${cleanUserId}]`);
          return existing;
        }
      }
    }

    const captureId = crypto.randomUUID();
    const now = new Date().toISOString();
    const statusDto: SkillCaptureStatusDto & { ownerUserId: string } = {
      captureId,
      status: 'queued',
      progress: 10,
      createdAt: now,
      updatedAt: now,
      ownerUserId: cleanUserId,
    };

    this.captureTasks.set(captureId, statusDto);
    if (dto.idempotencyKey) {
      this.idempotencyIndex.set(`${cleanUserId}:${dto.idempotencyKey}`, captureId);
    }

    // 触发异步提炼与安装流程
    this.executeCapturePipeline(cleanUserId, captureId, dto).catch((err) => {
      this.logger.error(`Capture pipeline failed for [${captureId}]: ${err.message}`, err.stack);
    });

    return statusDto;
  }

  getCaptureStatus(userId: string, captureId: string): SkillCaptureStatusDto {
    const cleanUserId = (userId || '').trim();
    const status = this.captureTasks.get(captureId);
    if (!status || (status as any).ownerUserId !== cleanUserId) {
      throw new NotFoundException(`Capture task [${captureId}] not found for user [${cleanUserId}]`);
    }
    return status;
  }

  private async executeCapturePipeline(
    userId: string,
    captureId: string,
    dto: CreateSkillCaptureDto
  ): Promise<void> {
    const updateStatus = (patch: Partial<SkillCaptureStatusDto>) => {
      const current = this.captureTasks.get(captureId);
      if (current) {
        Object.assign(current, patch, { updatedAt: new Date().toISOString() });
      }
    };

    try {
      // 1. 提炼来源
      updateStatus({ status: 'generating', progress: 30 });
      const source = await this.sourceAdapter.extractSource(userId, dto.sourceRef);
      const slug = normalizeSkillSlug(dto.displayName, dto.slug);

      // 2. 生成包文件到 staging
      updateStatus({ progress: 50 });
      const stagingDir = this.store.createStagingDir(userId, captureId);
      const { hasScript, deliverables } = await this.generator.generateSkillPackage(
        source,
        dto.displayName,
        slug,
        stagingDir,
        dto.description
      );

      // 3. 校验包完整性
      updateStatus({ status: 'validating', progress: 75 });
      const validation = await this.validator.validatePackage(stagingDir);
      if (!validation.valid) {
        throw new Error(`技能包校验失败: ${validation.errors.join('; ')}`);
      }

      // 4. 原子安装
      updateStatus({ status: 'installing', progress: 90 });
      const record = await this.store.installFromStaging(userId, captureId, {
        displayName: dto.displayName,
        slug,
        description: dto.description || source.objective,
        deliverables,
        hasScript,
        sourceRef: source.source,
      });

      // 5. 成功完成
      updateStatus({
        status: 'ready',
        progress: 100,
        skillId: record.skillId,
        slug: record.slug,
        version: record.version,
      });
      this.logger.log(`Capture pipeline successfully ready: skill [${record.displayName}] v${record.version}`);
    } catch (err: any) {
      this.logger.error(`Capture pipeline error for [${captureId}]: ${err.message}`);
      updateStatus({
        status: 'failed',
        error: err.message || '提炼技能包过程中出现异常',
      });
      this.store.cleanStagingDir(userId, captureId);
    }
  }
}
