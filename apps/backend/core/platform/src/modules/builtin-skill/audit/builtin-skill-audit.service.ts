import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class BuiltinSkillAuditService {
  private readonly logger = new Logger(BuiltinSkillAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logEvent(params: {
    builtinSkillId: string;
    action: string;
    versionId?: string;
    operator?: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.builtinSkillAuditEvent.create({
        data: {
          builtinSkillId: params.builtinSkillId,
          action: params.action,
          versionId: params.versionId || null,
          operator: params.operator || 'system',
          payload: params.payload ? (params.payload as any) : undefined,
        },
      });
      this.logger.log(`Audit event [${params.action}] logged for skill ${params.builtinSkillId}`);
    } catch (err: any) {
      this.logger.error(`Failed to log audit event [${params.action}] for skill ${params.builtinSkillId}: ${err.message}`);
    }
  }
}
