import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  WorkflowDocumentIR,
  WorkflowSaveMeta,
  WorkflowTemplateFieldSpec,
  TemplateWorkflowService,
} from '../../workflow-authoring/template-workflow.service';
import { buildStudioWorkflowMetaDocument } from './studio-workflow-config.helper';

type SaveTemplateFullDeps = {
  templatesDir: string;
  logger: {
    debug: (message: string) => void;
  };
  templateWorkflowService: Pick<TemplateWorkflowService, 'compileAndPersistTemplate'>;
  syncSkillToDb: (skill: Record<string, unknown>, templateId?: string) => Promise<void>;
  syncTemplateMetaToDb: (id: string, meta: Record<string, any> & { format: string }) => Promise<void>;
  isPlainObject: (value: unknown) => value is Record<string, any>;
};

type SaveTemplateFullInput = {
  templateId?: string;
  documentContent?: string;
  suggestions?: any[];
  templateConfig?: any;
  templateMeta?: WorkflowSaveMeta;
  templateDocumentIr?: WorkflowDocumentIR;
  templateFieldSpecs?: WorkflowTemplateFieldSpec[];
  skill?: any;
  skillId?: string;
  format?: string;
  templateName?: string;
};

export async function saveStoredTemplateFull(
  deps: SaveTemplateFullDeps,
  body: SaveTemplateFullInput
): Promise<{
  success: boolean;
  templateId?: string;
  skillId?: string;
  downloadUrl?: string;
  skillDownloadUrl?: string;
  error?: string;
}> {
  try {
    let templateId = body.templateId;
    const format = body.format || 'docx';
    let isNewTemplate = false;

    if (templateId) {
      const existingMetaPath = path.join(deps.templatesDir, `${templateId}.json`);
      if (fs.existsSync(existingMetaPath)) {
        deps.logger.debug(`复用已有模版: ${templateId}`);
      } else {
        templateId = uuidv4();
        isNewTemplate = true;
      }
    } else {
      templateId = uuidv4();
      isNewTemplate = true;
    }

    const templateName = body.templateName || `template_${templateId}`;
    const normalizedTemplateFileName = templateName
      .toLowerCase()
      .endsWith(`.${format.toLowerCase()}`)
      ? templateName
      : `${templateName}.${format}`;

    if (isNewTemplate && body.documentContent) {
      const templatePath = path.join(deps.templatesDir, `${templateId}.${format}`);
      let templateBuffer: Buffer;
      if (body.documentContent.startsWith('base64:')) {
        templateBuffer = Buffer.from(body.documentContent.substring(7), 'base64');
      } else {
        try {
          templateBuffer = Buffer.from(body.documentContent, 'base64');
        } catch {
          templateBuffer = Buffer.from(body.documentContent, 'utf-8');
        }
      }
      fs.writeFileSync(templatePath, templateBuffer);
    }

    let skillId = body.skillId;
    if (body.skill && !skillId) {
      skillId = uuidv4();
      const skill = {
        ...body.skill,
        id: skillId,
        templateId,
        updatedAt: new Date().toISOString(),
      };
      const skillPath = path.join(deps.templatesDir, `skill_${skillId}.json`);
      fs.writeFileSync(skillPath, JSON.stringify(skill, null, 2));
      await deps.syncSkillToDb(skill as Record<string, unknown>, templateId);
    }

    const templateConfig = body.templateConfig || {};
    const metaPath = path.join(deps.templatesDir, `${templateId}.json`);

    let existingMeta: Record<string, any> = {};
    if (!isNewTemplate && fs.existsSync(metaPath)) {
      existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    }

    const normalizedTemplateMeta = deps.isPlainObject(body.templateMeta)
      ? ({
          ...body.templateMeta,
          templateName: normalizedTemplateFileName,
        } as WorkflowSaveMeta)
      : undefined;
    const normalizedTemplateFieldSpecs = Array.isArray(body.templateFieldSpecs)
      ? body.templateFieldSpecs.filter((field): field is WorkflowTemplateFieldSpec =>
          deps.isPlainObject(field)
        )
      : [];
    const hasTemplateAssetPayload = normalizedTemplateFieldSpecs.length > 0;
    const hasValidFile =
      existingMeta?.hasValidFile ?? fs.existsSync(path.join(deps.templatesDir, `${templateId}.${format}`));

    let nextMeta: Record<string, any>;
    if (hasTemplateAssetPayload) {
      const workflowResult = deps.templateWorkflowService.compileAndPersistTemplate(
        templateId,
        normalizedTemplateMeta,
        normalizedTemplateFieldSpecs,
        'publish',
        format
      );

      nextMeta = {
        ...buildStudioWorkflowMetaDocument(
          templateId,
          {
            templateMeta: normalizedTemplateMeta,
            templateDocumentIr: body.templateDocumentIr,
            templateFieldSpecs: normalizedTemplateFieldSpecs,
          },
          workflowResult,
          {
            ...(existingMeta || {}),
            format,
            fileName: normalizedTemplateFileName,
            hasValidFile,
          }
        ),
        config: templateConfig,
        suggestions: body.suggestions || [],
        skillId,
        updatedAt: workflowResult.updatedAt,
        createdAt: existingMeta.createdAt || workflowResult.updatedAt,
      };
    } else {
      nextMeta = {
        ...existingMeta,
        id: templateId,
        format,
        fileName: normalizedTemplateFileName,
        config: templateConfig,
        suggestions: body.suggestions || [],
        skillId,
        hasValidFile,
        updatedAt: new Date().toISOString(),
        createdAt: existingMeta.createdAt || new Date().toISOString(),
      };
    }

    fs.writeFileSync(metaPath, JSON.stringify(nextMeta));
    const latestMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    await deps.syncTemplateMetaToDb(templateId, latestMeta);

    return {
      success: true,
      templateId,
      skillId,
      downloadUrl: `/studio/download-template/${templateId}`,
      skillDownloadUrl: skillId ? `/studio/download-skill/${skillId}` : undefined,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}
