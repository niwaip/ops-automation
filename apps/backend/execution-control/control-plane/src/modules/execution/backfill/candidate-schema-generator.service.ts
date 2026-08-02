import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ERROR_CODES } from '@ops/backend-error-codes';

export interface CandidateSchemaFieldStats {
  /** present rate across samples: 0..1 */
  presence: number;
  /** inferred JSON Schema type, or undefined when samples are type-mixed */
  inferredType?: string;
  sampleCount: number;
}

export interface CandidateSchemaResult {
  candidateSchema: Record<string, unknown>;
  sampleCount: number;
  fieldStats: Record<string, CandidateSchemaFieldStats>;
}

const MAX_INFER_DEPTH = 3;
const REQUIRED_PRESENCE_THRESHOLD = 0.8;

/**
 * Candidate output-schema generator (design doc §17.2).
 *
 * Governance rule: a formal contract must NEVER be backfilled automatically
 * from a single execution. This service only produces a *candidate* schema
 * from (a) planner-declared output contracts and (b) multiple succeeded
 * execution samples, which an operator must explicitly accept before it is
 * written to `skill_configs.output_schema` — and only when that column is
 * still empty (no authoritative schema yet). Builtin skills are always
 * rejected: their manifest contracts are the authority.
 */
@Injectable()
export class CandidateSchemaGeneratorService {
  private readonly logger = new Logger(CandidateSchemaGeneratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregates succeeded runtime samples for a custom skill and infers a
   * candidate output schema. Never applies it — stored as candidate for
   * human review.
   */
  public async generateCandidateSchema(
    capabilityId: string,
    minSamples = 3
  ): Promise<CandidateSchemaResult> {
    const skill = await this.findCustomSkill(capabilityId);
    if (!skill) {
      throw new BadRequestException({
        code: ERROR_CODES.CANDIDATE_SCHEMA_NOT_APPLICABLE,
        message: `No custom skill found for '${capabilityId}' (builtin skills have authoritative manifest contracts)`,
        details: { capabilityId },
      });
    }
    await this.ensureNoAuthoritativeSchema(skill.id, capabilityId);

    const samples = await this.prisma.executionStep.findMany({
      where: {
        capabilityId,
        status: 'succeeded',
        outputJson: { not: null },
      },
      select: { outputJson: true },
      take: 200,
      orderBy: { updatedAt: 'desc' },
    });

    if (samples.length < minSamples) {
      throw new BadRequestException({
        code: ERROR_CODES.INSUFFICIENT_SAMPLES_FOR_CANDIDATE_SCHEMA,
        message: `Need at least ${minSamples} succeeded execution samples to infer a candidate schema, got ${samples.length} for '${capabilityId}'`,
        details: { capabilityId, sampleCount: samples.length, minSamples },
      });
    }

    const result = this.inferSchema(samples.map((s) => s.outputJson as Record<string, unknown>));

    await this.prisma.skillConfig.update({
      where: { id: skill.id },
      data: {
        candidateSchemaJson: result.candidateSchema as Prisma.InputJsonValue,
        candidateSchemaGeneratedAt: new Date(),
      },
    });

    this.logger.log(
      `Candidate output schema generated for skill '${capabilityId}' from ${result.sampleCount} samples (${Object.keys(result.candidateSchema.properties || {}).length} fields) — awaiting operator acceptance`
    );

    return result;
  }

  /**
   * Human-confirmed acceptance gate (§17.2): copies the candidate schema into
   * `output_schema` only for custom skills with no authoritative schema yet.
   */
  public async acceptCandidateSchema(skillName: string): Promise<Record<string, unknown>> {
    const skill = await this.findCustomSkill(skillName);
    if (!skill) {
      throw new BadRequestException({
        code: ERROR_CODES.CANDIDATE_SCHEMA_NOT_APPLICABLE,
        message: `No custom skill found for '${skillName}' (builtin skills have authoritative manifest contracts)`,
        details: { skillName },
      });
    }

    const candidate = skill.candidateSchemaJson;
    if (!candidate || typeof candidate !== 'object' || Object.keys(candidate).length === 0) {
      throw new BadRequestException({
        code: ERROR_CODES.NO_CANDIDATE_SCHEMA,
        message: `No candidate schema exists for '${skillName}' — run generate-candidate-schema first`,
        details: { skillName },
      });
    }
    await this.ensureNoAuthoritativeSchema(skill.id, skillName);

    const schema = candidate as Record<string, unknown>;
    await this.prisma.skillConfig.update({
      where: { id: skill.id },
      data: {
        outputSchema: schema as Prisma.InputJsonValue,
        candidateSchemaJson: null,
        candidateSchemaGeneratedAt: null,
      },
    });

    this.logger.log(
      `Candidate output schema ACCEPTED for skill '${skillName}' — now authoritative for future plan freezes`
    );
    return schema;
  }

  private async findCustomSkill(
    capabilityId: string
  ): Promise<
    { id: string; name: string; outputSchema: Record<string, unknown>; candidateSchemaJson: unknown } | null
  > {
    const builtin = await this.prisma.builtinSkill
      .findUnique({ where: { capabilityKey: capabilityId } })
      .catch(() => null);
    if (builtin) return null;

    return (
      (await this.prisma.skillConfig.findFirst({ where: { name: capabilityId } }).catch(() => null)) ??
      (await this.prisma.skillConfig.findFirst({ where: { id: capabilityId } }).catch(() => null))
    );
  }

  private async ensureNoAuthoritativeSchema(skillId: string, capabilityId: string): Promise<void> {
    const current = await this.prisma.skillConfig.findUnique({ where: { id: skillId } });
    const schema = (current?.outputSchema ?? {}) as Record<string, unknown>;
    if (schema && typeof schema === 'object' && Object.keys(schema).length > 0) {
      throw new BadRequestException({
        code: ERROR_CODES.CANDIDATE_SCHEMA_NOT_APPLICABLE,
        message: `Skill '${capabilityId}' already has an authoritative output schema — candidates must not overwrite it`,
        details: { capabilityId },
      });
    }
  }

  private inferSchema(samples: Array<Record<string, unknown>>): CandidateSchemaResult {
    const fieldStats: Record<string, CandidateSchemaFieldStats> = {};
    const props: Record<string, unknown> = {};
    const required: string[] = [];

    for (const sample of samples) {
      for (const [key, value] of Object.entries(sample)) {
        const stat = (fieldStats[key] ??= { presence: 0, sampleCount: samples.length });
        if (value !== undefined && value !== null) stat.presence += 1;
      }
    }

    for (const [key, stat] of Object.entries(fieldStats)) {
      stat.presence = stat.presence / samples.length;
      const values = samples
        .map((s) => s[key])
        .filter((v) => v !== undefined && v !== null);
      const inferred = this.inferValueType(values, 0);
      if (inferred.type) {
        props[key] = inferred;
        stat.inferredType = typeof inferred.type === 'string' ? inferred.type : undefined;
      } else {
        props[key] = {};
      }
      if (stat.presence >= REQUIRED_PRESENCE_THRESHOLD) required.push(key);
    }

    const candidateSchema: Record<string, unknown> = {
      type: 'object',
      additionalProperties: true,
      properties: props,
    };
    if (required.length > 0) candidateSchema.required = required;

    return { candidateSchema, sampleCount: samples.length, fieldStats };
  }

  private inferValueType(
    values: unknown[],
    depth: number
  ): Record<string, unknown> {
    if (values.length === 0) return {};
    const types = new Set(values.map((v) => (Array.isArray(v) ? 'array' : typeof v)));
    if (types.size > 1) return {};

    const type = [...types][0];
    if (type === 'array') {
      const items = values
        .map((v) => (Array.isArray(v) ? v : []))
        .flat()
        .filter((v) => v !== undefined && v !== null);
      const itemSchema = items.length > 0 ? this.inferValueType(items, depth + 1) : {};
      return { type: 'array', ...(Object.keys(itemSchema).length > 0 ? { items: itemSchema } : {}) };
    }
    if (type === 'object' && depth < MAX_INFER_DEPTH) {
      const nestedProps: Record<string, unknown> = {};
      const nestedKeys = new Set<string>();
      for (const v of values as Array<Record<string, unknown>>) {
        for (const k of Object.keys(v)) nestedKeys.add(k);
      }
      for (const k of nestedKeys) {
        const sub = (values as Array<Record<string, unknown>>)
          .map((v) => v[k])
          .filter((v) => v !== undefined && v !== null);
        const subSchema = this.inferValueType(sub, depth + 1);
        nestedProps[k] = Object.keys(subSchema).length > 0 ? subSchema : {};
      }
      return {
        type: 'object',
        ...(Object.keys(nestedProps).length > 0 ? { properties: nestedProps } : {}),
      };
    }
    if (type === 'string') {
      const format = this.inferStringFormat(values as string[]);
      return { type: 'string', ...(format ? { format } : {}) };
    }
    return { type };
  }

  private inferStringFormat(values: string[]): string | undefined {
    const nonEmpty = values.filter((v) => typeof v === 'string' && v.trim().length > 0);
    if (nonEmpty.length === 0) return undefined;
    const all = nonEmpty.every((v) => /^https?:\/\//.test(v));
    if (all) return 'uri';
    const allDates = nonEmpty.every(
      (v) => !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}/.test(v)
    );
    if (allDates) return 'date-time';
    return undefined;
  }
}
