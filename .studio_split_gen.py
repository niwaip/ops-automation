from pathlib import Path
import re


ROOT = Path("/Users/chain/Documents/MyProject/ops-automation/apps/backend/domain/carbone-engine/src/modules/studio")
SOURCE = ROOT / "studio.controller.ts"


def block(lines: list[str], start: int, end: int) -> str:
    return "\n".join(lines[start - 1:end])


def transform_visibility(content: str) -> str:
    return re.sub(r"(?m)^(\s*)private\s+", r"\1protected ", content)


def write_file(path: Path, content: str) -> None:
    path.write_text(content)
    print(f"written {path}")


def main() -> None:
    lines = SOURCE.read_text().splitlines()

    dto_block = block(lines, 63, 215)
    helper_pre = transform_visibility(block(lines, 261, 847))
    helper_post_1 = transform_visibility(block(lines, 2866, 3049))
    helper_post_2 = transform_visibility(block(lines, 3558, len(lines)))

    workflow_routes = block(lines, 845, 1127)
    render_routes_main = block(lines, 1129, 1768)
    template_routes_a = block(lines, 1769, 1930)
    render_html_preview = block(lines, 1931, 1958)
    ai_routes_a = block(lines, 1959, 2240)
    template_routes_b = block(lines, 2241, 2375)
    ai_routes_b = block(lines, 2376, 2865)
    render_preview_file = block(lines, 2762, 2792)
    ai_routes_c = block(lines, 3050, 3334)
    template_routes_c = block(lines, 3335, 3526)
    ai_routes_d = block(lines, 3528, 3556)

    studio_dto = """import {
  TemplateAssetExportPayload,
  TemplateAssetImportPayload,
} from './studio.types';
import {
  WorkflowDocumentIR,
  WorkflowFieldCandidate,
  WorkflowSaveMeta,
  WorkflowTemplateFieldSpec,
  WorkflowTermAssets,
  WorkflowUnderstandResult,
} from './template-workflow.service';

""" + dto_block + """

export interface ValidateResponse {
  valid: boolean;
  missing: string[];
}
"""
    write_file(ROOT / "studio.dto.ts", studio_dto)

    studio_base = """/**
 * Carbone Engine - Studio Controller Base
 */

import {
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CarboneEngine } from '../../lib/engine';
import { PreviewService } from './preview.service';
import { AIIdentifierService, AIIdentifyResponse } from './ai-identifier.service';
import { DocumentStructureService } from './document-structure.service';
import {
  DEFAULT_RENDER_PLAN_VERSION,
  TEMPLATE_ASSET_MANIFEST_VERSION,
  TEMPLATE_ASSET_SOURCE_LEGACY,
  TEMPLATE_DOCUMENT_MODE_BILINGUAL,
  TEMPLATE_DOCUMENT_MODE_SINGLE_LANGUAGE,
  TEMPLATE_WORKFLOW_SCHEMA_VERSION,
  TemplateResponse,
  RenderPlan,
  TemplateAssetManifest,
} from './studio.types';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import {
  WorkflowBindingPlan,
  WorkflowSaveResult,
  WorkflowTermAssets,
  WorkflowTemplateFieldSpec,
  TemplateWorkflowService,
} from './template-workflow.service';
import { TemplateSaveDto } from './studio.dto';

interface TemplateInfoForValidation {
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  fileName: string;
  size: number;
  variables: string[];
  loops: Array<{ arrayPath: string }>;
}

export abstract class StudioControllerBase {
  protected readonly logger = new Logger(StudioControllerBase.name);
  protected engine: CarboneEngine;
  protected templatesDir: string;
  protected outputsDir: string;

  constructor(
    protected readonly previewService: PreviewService,
    protected readonly aiIdentifierService: AIIdentifierService,
    protected readonly documentStructureService: DocumentStructureService,
    protected readonly templateRepository: TemplateRepository,
    protected readonly skillRepository: SkillRepository,
    protected readonly renderOutputRepository: RenderOutputRepository,
    protected readonly templateWorkflowService: TemplateWorkflowService,
  ) {
    this.engine = new CarboneEngine();
    this.templatesDir = process.env.TEMPLATES_DIR || path.join(process.cwd(), 'templates');
    this.outputsDir = process.env.OUTPUTS_DIR || path.join(process.cwd(), 'outputs');

    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
    if (!fs.existsSync(this.outputsDir)) {
      fs.mkdirSync(this.outputsDir, { recursive: true });
    }
  }

""" + helper_pre + "\n\n" + helper_post_1 + "\n\n" + helper_post_2 + "\n}\n"
    write_file(ROOT / "studio.controller.base.ts", studio_base)

    workflow_controller = """/**
 * Carbone Engine - Studio Workflow Controller
 */

import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PreviewService } from './preview.service';
import { AIIdentifierService } from './ai-identifier.service';
import { DocumentStructureService } from './document-structure.service';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import {
  TemplateAssetImportPayload,
  TemplateAssetManifest,
  TemplateResponse,
} from './studio.types';
import {
  WorkflowAnalyzeResult,
  WorkflowCompareResult,
  WorkflowRecognizeResult,
  WorkflowSaveResult,
  WorkflowUnderstandResult,
  TemplateWorkflowService,
} from './template-workflow.service';
import {
  TemplateAnalyzeDto,
  TemplateAssetExportDto,
  TemplateAssetImportDto,
  TemplateCompareDto,
  TemplateRenderDataDto,
  TemplateSaveDto,
  TemplateUnderstandDto,
} from './studio.dto';
import { StudioControllerBase } from './studio.controller.base';

export * from './studio.dto';

@ApiTags('studio')
@Controller('studio')
export class StudioController extends StudioControllerBase {
  constructor(
    previewService: PreviewService,
    aiIdentifierService: AIIdentifierService,
    documentStructureService: DocumentStructureService,
    templateRepository: TemplateRepository,
    skillRepository: SkillRepository,
    renderOutputRepository: RenderOutputRepository,
    templateWorkflowService: TemplateWorkflowService,
  ) {
    super(
      previewService,
      aiIdentifierService,
      documentStructureService,
      templateRepository,
      skillRepository,
      renderOutputRepository,
      templateWorkflowService,
    );
  }

""" + workflow_routes + "\n}\n"
    write_file(ROOT / "studio.controller.ts", workflow_controller)

    render_controller = """/**
 * Carbone Engine - Studio Render Controller
 */

import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PreviewService } from './preview.service';
import { AIIdentifierService } from './ai-identifier.service';
import { DocumentStructureService } from './document-structure.service';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import { RenderResponse } from './studio.types';
import { TemplateWorkflowService } from './template-workflow.service';
import {
  PreviewDto,
  RenderDto,
  RenderWithSkillDto,
  ValidateDto,
} from './studio.dto';
import { StudioControllerBase } from './studio.controller.base';

@ApiTags('studio')
@Controller('studio')
export class StudioRenderController extends StudioControllerBase {
  constructor(
    previewService: PreviewService,
    aiIdentifierService: AIIdentifierService,
    documentStructureService: DocumentStructureService,
    templateRepository: TemplateRepository,
    skillRepository: SkillRepository,
    renderOutputRepository: RenderOutputRepository,
    templateWorkflowService: TemplateWorkflowService,
  ) {
    super(
      previewService,
      aiIdentifierService,
      documentStructureService,
      templateRepository,
      skillRepository,
      renderOutputRepository,
      templateWorkflowService,
    );
  }

""" + render_routes_main + "\n\n" + render_html_preview + "\n\n" + render_preview_file + "\n}\n"
    write_file(ROOT / "studio-render.controller.ts", render_controller)

    template_controller = """/**
 * Carbone Engine - Studio Template Controller
 */

import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PreviewService } from './preview.service';
import { AIIdentifierService } from './ai-identifier.service';
import { DocumentStructure, DocumentStructureService } from './document-structure.service';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import {
  WorkflowDocumentIR,
  WorkflowSaveMeta,
  WorkflowTemplateFieldSpec,
  TemplateWorkflowService,
} from './template-workflow.service';
import {
  SaveMarkingsDto,
  SaveTemplateConfigDto,
} from './studio.dto';
import { StudioControllerBase } from './studio.controller.base';

@ApiTags('studio')
@Controller('studio')
export class StudioTemplateController extends StudioControllerBase {
  constructor(
    previewService: PreviewService,
    aiIdentifierService: AIIdentifierService,
    documentStructureService: DocumentStructureService,
    templateRepository: TemplateRepository,
    skillRepository: SkillRepository,
    renderOutputRepository: RenderOutputRepository,
    templateWorkflowService: TemplateWorkflowService,
  ) {
    super(
      previewService,
      aiIdentifierService,
      documentStructureService,
      templateRepository,
      skillRepository,
      renderOutputRepository,
      templateWorkflowService,
    );
  }

""" + template_routes_a + "\n\n" + template_routes_b + "\n\n" + template_routes_c + "\n}\n"
    write_file(ROOT / "studio-template.controller.ts", template_controller)

    ai_controller = """/**
 * Carbone Engine - Studio AI Controller
 */

import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PreviewService } from './preview.service';
import { AIIdentifierService, AIIdentifyResponse } from './ai-identifier.service';
import { DocumentStructure, DocumentStructureService } from './document-structure.service';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import { TemplateWorkflowService } from './template-workflow.service';
import {
  AIIdentifyDto,
  AIVerifyDto,
  DirectAIIdentifyDto,
} from './studio.dto';
import { StudioControllerBase } from './studio.controller.base';

@ApiTags('studio')
@Controller('studio')
export class StudioAiController extends StudioControllerBase {
  constructor(
    previewService: PreviewService,
    aiIdentifierService: AIIdentifierService,
    documentStructureService: DocumentStructureService,
    templateRepository: TemplateRepository,
    skillRepository: SkillRepository,
    renderOutputRepository: RenderOutputRepository,
    templateWorkflowService: TemplateWorkflowService,
  ) {
    super(
      previewService,
      aiIdentifierService,
      documentStructureService,
      templateRepository,
      skillRepository,
      renderOutputRepository,
      templateWorkflowService,
    );
  }

""" + ai_routes_a + "\n\n" + ai_routes_b + "\n\n" + ai_routes_c + "\n\n" + ai_routes_d + "\n}\n"
    write_file(ROOT / "studio-ai.controller.ts", ai_controller)


if __name__ == "__main__":
    main()
