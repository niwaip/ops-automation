import * as fs from 'fs';
import * as path from 'path';
import type { ArtifactRef } from '@ops/backend-runtime-capability-contract';

function resolveMimeType(filePath: string): string | undefined {
  switch (path.extname(filePath).toLowerCase()) {
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.pdf':
      return 'application/pdf';
    default:
      return undefined;
  }
}

export function buildReportArtifacts(input: {
  reportId: string;
  templateId: string;
  sessionId: string;
  resultFile?: string | null;
}): ArtifactRef[] | undefined {
  if (!input.resultFile) {
    return undefined;
  }

  const normalizedPath = input.resultFile.trim();
  if (!normalizedPath) {
    return undefined;
  }

  let sizeBytes: number | undefined;
  try {
    const stat = fs.statSync(normalizedPath);
    if (stat.isFile()) {
      sizeBytes = stat.size;
    }
  } catch {
    sizeBytes = undefined;
  }

  return [
    {
      type: 'document',
      id: input.reportId,
      name: path.basename(normalizedPath),
      url: `/reports/${input.reportId}/download`,
      mimeType: resolveMimeType(normalizedPath),
      sizeBytes,
      metadata: {
        reportId: input.reportId,
        templateId: input.templateId,
        sessionId: input.sessionId,
        filePath: normalizedPath,
      },
    },
  ];
}
