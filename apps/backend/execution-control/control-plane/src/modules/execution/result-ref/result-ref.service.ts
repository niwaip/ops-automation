import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { projectResultFields, type ResultRefV1 } from '@ops/backend-result-ref';
import { Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ensureExecutionPermission,
  type ExecutionPermissionRequester,
} from '../shared/execution-permission.util';

@Injectable()
export class ResultRefService {
  constructor(private readonly prisma: PrismaService) {}

  get enabled(): boolean {
    return process.env.RESULT_REF_ENABLED === 'true';
  }

  async create(input: {
    executionId: string;
    producerStepId?: string;
    payload: unknown;
    outputSchema?: unknown;
    schemaDigest?: string;
  }): Promise<ResultRefV1> {
    const serialized = JSON.stringify(input.payload ?? null);
    const schemaDigest =
      input.schemaDigest ||
      createHash('sha256')
        .update(JSON.stringify(input.outputSchema || inferShape(input.payload)))
        .digest('hex');
    const row = await this.prisma.executionResultRef.create({
      data: {
        executionId: input.executionId,
        producerStepId: input.producerStepId,
        schemaDigest,
        payloadJson: (input.payload ?? null) as Prisma.JsonValue,
        previewJson: buildPreview(input.payload) as Prisma.JsonValue,
        sizeBytes: Buffer.byteLength(serialized, 'utf8'),
      },
    });
    return {
      schemaVersion: 'result-ref/v1',
      id: row.id,
      executionId: row.executionId,
      producerStepId: row.producerStepId || undefined,
      schemaDigest: row.schemaDigest,
      sizeBytes: row.sizeBytes,
      preview: row.previewJson,
    };
  }

  async project(
    executionId: string,
    refId: string,
    paths: string[],
    requester?: ExecutionPermissionRequester
  ): Promise<{ ref: ResultRefV1; projection: Record<string, unknown> }> {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { createdBy: true },
    });
    if (!execution) throw new NotFoundException(`Execution ${executionId} not found`);
    ensureExecutionPermission(execution.createdBy, requester);
    const row = await this.prisma.executionResultRef.findFirst({
      where: { id: refId, executionId },
    });
    if (!row) throw new NotFoundException('Result reference not found');
    return {
      ref: {
        schemaVersion: 'result-ref/v1',
        id: row.id,
        executionId: row.executionId,
        producerStepId: row.producerStepId || undefined,
        schemaDigest: row.schemaDigest,
        sizeBytes: row.sizeBytes,
        preview: row.previewJson,
      },
      projection: projectResultFields(row.payloadJson, paths),
    };
  }
}

function buildPreview(value: unknown): unknown {
  const browserPreview = buildBrowserRunOutputPreview(value);
  if (browserPreview) return browserPreview;
  return sanitizePreview(value, 0);
}

function buildBrowserRunOutputPreview(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const browserRunOutput = (value as Record<string, unknown>).browserRunOutput;
  if (!browserRunOutput || typeof browserRunOutput !== 'object' || Array.isArray(browserRunOutput)) {
    return undefined;
  }
  const output = browserRunOutput as Record<string, unknown>;
  if (output.schemaVersion !== 'browser-run-output/v2') return undefined;
  const run = output.run && typeof output.run === 'object' && !Array.isArray(output.run)
    ? output.run as Record<string, unknown>
    : {};
  const summary = output.summary && typeof output.summary === 'object' && !Array.isArray(output.summary)
    ? output.summary as Record<string, unknown>
    : {};
  const warnings = Array.isArray(output.warnings)
    ? output.warnings.slice(0, 8).map((warning) => {
        const record = warning && typeof warning === 'object' && !Array.isArray(warning)
          ? warning as Record<string, unknown>
          : {};
        return { code: record.code, stepId: record.stepId };
      })
    : [];
  return {
    browserRunOutput: {
      schemaVersion: output.schemaVersion,
      run: {
        status: run.status,
        finalPageId: run.finalPageId,
        contractDigest: run.contractDigest,
      },
      summary,
      outputNames:
        output.outputs && typeof output.outputs === 'object' && !Array.isArray(output.outputs)
          ? Object.keys(output.outputs as Record<string, unknown>)
          : [],
      warningCodes: warnings,
    },
  };
}

const SENSITIVE_PREVIEW_KEY = /(?:authorization|cookie|credential|password|secret|token)/iu;
const MAX_PREVIEW_DEPTH = 3;
const MAX_PREVIEW_STRING_LENGTH = 160;

function sanitizePreview(value: unknown, depth: number): unknown {
  if (depth >= MAX_PREVIEW_DEPTH) return '[truncated]';
  if (typeof value === 'string') {
    return value.length <= MAX_PREVIEW_STRING_LENGTH
      ? value
      : `${value.slice(0, MAX_PREVIEW_STRING_LENGTH)}…`;
  }
  if (Array.isArray(value))
    return value.slice(0, 3).map((item) => sanitizePreview(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 8)
        .map(([key, item]) => [
          key,
          SENSITIVE_PREVIEW_KEY.test(key) ? '[redacted]' : sanitizePreview(item, depth + 1),
        ])
    );
  }
  return value;
}

function inferShape(value: unknown): unknown {
  if (Array.isArray(value))
    return { type: 'array', items: value[0] === undefined ? 'unknown' : inferShape(value[0]) };
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, inferShape(item)])
    );
  }
  return value === null ? 'null' : typeof value;
}
