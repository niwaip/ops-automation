import { Module } from '@nestjs/common';
import { PrismaModule } from '../template/prisma.module';
import { PreviewService } from '../render/preview/preview.service';
import { StudioSkillRenderDataService } from '../render/resolved-render/studio-skill-render-data.service';
import { RenderOutputRepository } from '../template/repository/render-output.repository';
import { SkillRepository } from '../template/repository/skill.repository';
import { TemplateRepository } from '../template/repository/template.repository';
import { AIIdentifierService } from '../template/workflow-authoring/ai-identifier.service';
import { DocumentStructureService } from '../template/workflow-authoring/document-structure.service';
import { TemplateWorkflowService } from '../template/workflow-authoring/template-workflow.service';
import { DocumentRenderEntryController } from './render-entry/document-render-entry.controller';
import { DocumentSkillRenderEntryController } from './render-entry/document-skill-render-entry.controller';
import { MarkdownArtifactController } from './markdown-artifact/markdown-artifact.controller';
import { MarkdownArtifactService } from './markdown-artifact/markdown-artifact.service';
import { DocumentContentExtractionController } from './content-extraction/document-content-extraction.controller';
import { DocumentVisionOcrService } from './content-extraction/document-vision-ocr.service';
import { PdfContentExtractorService } from './content-extraction/pdf-content-extractor.service';
import { PdfPageRasterizerService } from './content-extraction/pdf-page-rasterizer.service';
import { PdfArtifactStorageService } from './pdf-operations/pdf-artifact-storage.service';
import { PdfCreateService } from './pdf-operations/pdf-create.service';
import { PdfInputDecoderService } from './pdf-operations/pdf-input-decoder.service';
import { PdfMergeService } from './pdf-operations/pdf-merge.service';
import { PdfOperationsController } from './pdf-operations/pdf-operations.controller';
import { PdfSplitService } from './pdf-operations/pdf-split.service';
import { ContractCompareController } from './contract-compare/contract-compare.controller';
import { ContractCompareService } from './contract-compare/contract-compare.service';
import { ContractAstParserService } from './contract-compare/contract-ast-parser.service';
import { SectionAlignerService } from './contract-compare/section-aligner.service';
import { CharDiffEngineService } from './contract-compare/char-diff-engine.service';
import { ContractHtmlRendererService } from './contract-compare/contract-html-renderer.service';
import { ContractReviewController } from './contract-review/contract-review.controller';
import { ContractReviewService } from './contract-review/contract-review.service';
import { ContractTypeClassifierService } from './contract-review/contract-type-classifier.service';
import { ContractChecklistMatrixService } from './contract-review/contract-checklist-matrix.service';
import { ContractReviewEngineService } from './contract-review/contract-review-engine.service';
import { ContractReviewHtmlRendererService } from './contract-review/contract-review-html-renderer.service';
import { ContractFormIntegrityScannerService } from './contract-review/contract-form-integrity-scanner.service';
import { ContractLlmReviewService } from './contract-review/contract-llm-review.service';
import {
  ReviewFactExtractorService,
  ReviewElementEvaluatorService,
  ReviewElementsRegistryService,
} from './contract-elements';

@Module({
  imports: [PrismaModule],
  controllers: [
    DocumentRenderEntryController,
    DocumentSkillRenderEntryController,
    MarkdownArtifactController,
    DocumentContentExtractionController,
    PdfOperationsController,
    ContractCompareController,
    ContractReviewController,
  ],
  providers: [
    PreviewService,
    AIIdentifierService,
    DocumentStructureService,
    TemplateRepository,
    SkillRepository,
    RenderOutputRepository,
    TemplateWorkflowService,
    StudioSkillRenderDataService,
    MarkdownArtifactService,
    PdfPageRasterizerService,
    DocumentVisionOcrService,
    PdfContentExtractorService,
    PdfArtifactStorageService,
    PdfInputDecoderService,
    PdfMergeService,
    PdfSplitService,
    PdfCreateService,
    ContractCompareService,
    ContractAstParserService,
    SectionAlignerService,
    CharDiffEngineService,
    ContractHtmlRendererService,
    ContractReviewController,
    ContractReviewService,
    ContractTypeClassifierService,
    ContractChecklistMatrixService,
    ContractReviewEngineService,
    ContractReviewHtmlRendererService,
    ContractFormIntegrityScannerService,
    ContractLlmReviewService,
    ReviewFactExtractorService,
    ReviewElementEvaluatorService,
    ReviewElementsRegistryService,
  ],
  exports: [
    PreviewService,
    AIIdentifierService,
    DocumentStructureService,
    TemplateRepository,
    SkillRepository,
    RenderOutputRepository,
    TemplateWorkflowService,
    StudioSkillRenderDataService,
    MarkdownArtifactService,
    PdfPageRasterizerService,
    DocumentVisionOcrService,
    PdfContentExtractorService,
    PdfArtifactStorageService,
    PdfInputDecoderService,
    PdfMergeService,
    PdfSplitService,
    PdfCreateService,
    ContractCompareService,
    ContractAstParserService,
    SectionAlignerService,
    ContractReviewService,
    ContractTypeClassifierService,
    ContractChecklistMatrixService,
    ContractReviewEngineService,
    ContractReviewHtmlRendererService,
    ContractFormIntegrityScannerService,
    ContractLlmReviewService,
    ReviewFactExtractorService,
    ReviewElementEvaluatorService,
    ReviewElementsRegistryService,
    CharDiffEngineService,
    ContractHtmlRendererService,
  ],
})
export class DocumentRuntimeFacadeModule {}
