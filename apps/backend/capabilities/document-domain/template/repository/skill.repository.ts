import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SkillRepository {
  private readonly logger = new Logger(SkillRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Record<string, unknown> | null> {
    try {
      const skill = await this.prisma.skill.findUnique({
        where: { id },
      });
      if (!skill) {
        return null;
      }

      if (this.isRecord(skill.rawSkill)) {
        return skill.rawSkill;
      }

      return {
        id: skill.id,
        templateId: skill.templateId,
        parameters: skill.parameters,
        dataExample: skill.dataExample,
      };
    } catch (error) {
      this.logger.warn(`Failed to read skill ${id} from database`);
      this.logger.debug(String(error));
      return null;
    }
  }

  async upsertFromDocument(
    skillDocument: Record<string, unknown>,
    explicitTemplateId?: string
  ): Promise<void> {
    const skillId = typeof skillDocument.id === 'string' ? skillDocument.id : null;
    const templateId =
      explicitTemplateId ??
      (typeof skillDocument.templateId === 'string' ? skillDocument.templateId : null);

    if (!skillId || !templateId) {
      return;
    }

    const parameters = Array.isArray(skillDocument.parameters)
      ? skillDocument.parameters
      : this.extractNestedParameters(skillDocument);
    const dataExample = this.extractDataExample(skillDocument);
    const createdAt = this.parseDate(skillDocument.createdAt);

    await this.prisma.skill.upsert({
      where: { id: skillId },
      create: {
        id: skillId,
        templateId,
        parameters: parameters as Prisma.InputJsonValue,
        dataExample: (dataExample ?? Prisma.DbNull) as
          | Prisma.InputJsonValue
          | Prisma.NullTypes.DbNull,
        rawSkill: skillDocument as Prisma.InputJsonValue,
        ...(createdAt ? { createdAt } : {}),
      },
      update: {
        templateId,
        parameters: parameters as Prisma.InputJsonValue,
        dataExample: (dataExample ?? Prisma.DbNull) as
          | Prisma.InputJsonValue
          | Prisma.NullTypes.DbNull,
        rawSkill: skillDocument as Prisma.InputJsonValue,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.skill.delete({
      where: { id },
    });
  }

  private extractNestedParameters(skillDocument: Record<string, unknown>): unknown[] {
    const parameterization = skillDocument.parameterization;
    if (this.isRecord(parameterization) && Array.isArray(parameterization.variables)) {
      return parameterization.variables;
    }
    return [];
  }

  private extractDataExample(skillDocument: Record<string, unknown>): unknown {
    if (skillDocument.dataExampleJson !== undefined) {
      return skillDocument.dataExampleJson;
    }
    if (skillDocument.dataExample !== undefined) {
      return skillDocument.dataExample;
    }
    return null;
  }

  private parseDate(value: unknown): Date | undefined {
    return typeof value === 'string' ? new Date(value) : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
