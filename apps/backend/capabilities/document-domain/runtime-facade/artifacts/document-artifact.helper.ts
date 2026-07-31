import type { ArtifactRef } from '@ops/backend-runtime-capability-contract';

function resolveMimeType(format: string): string | undefined {
  switch (format.toLowerCase()) {
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'pdf':
      return 'application/pdf';
    case 'html':
      return 'text/html';
    case 'md':
    case 'markdown':
      return 'text/markdown';
    default:
      return undefined;
  }
}

export function buildDocumentRenderArtifacts(input: {
  outputId: string;
  downloadUrl: string;
  fileName: string;
  format: string;
  sizeBytes?: number;
  templateId: string;
  skillId?: string;
  publishedSkillId?: string;
}): ArtifactRef[] {
  return [
    {
      type: 'document',
      id: input.outputId,
      name: input.fileName,
      url: input.downloadUrl,
      mimeType: resolveMimeType(input.format),
      sizeBytes: input.sizeBytes,
      metadata: {
        format: input.format,
        templateId: input.templateId,
        ...(input.skillId ? { skillId: input.skillId } : {}),
        ...(input.publishedSkillId ? { publishedSkillId: input.publishedSkillId } : {}),
      },
    },
  ];
}
