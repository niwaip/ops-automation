import { Injectable } from '@nestjs/common';
import { TemporalWorkflowBrowserDraftService } from '../../modules/temporal-workflow/browser-bridge/temporal-workflow-browser-draft.service';
import { TemporalWorkflowAiDraftService } from '../../modules/temporal-workflow/temporal-workflow-draft.service';
import { TemporalWorkflowSupportService } from '../../modules/temporal-workflow/temporal-workflow-support.service';
import { TemporalWorkflowTemplateService } from './temporal-workflow-template.service';
import type {
  AiWorkflowDraft,
  BrowserWorkflowDraft,
  CompileTemplateWorkflowDraftDTO,
  GenerateAiWorkflowDraftDTO,
  GenerateBrowserWorkflowDraftDTO,
  GenerateTemplateWorkflowDraftDTO,
  RefineAiWorkflowDraftDTO,
  TemplateWorkflowDraft,
} from '../../modules/temporal-workflow/temporal-workflow.types';

@Injectable()
export class TemporalWorkflowDraftOrchestrationService {
  constructor(
    private readonly aiDraftService: TemporalWorkflowAiDraftService,
    private readonly browserDraftService: TemporalWorkflowBrowserDraftService,
    private readonly workflowSupportService: TemporalWorkflowSupportService,
    private readonly workflowTemplateService: TemporalWorkflowTemplateService
  ) {}

  async generateTemplateWorkflowDraft(
    data: GenerateTemplateWorkflowDraftDTO
  ): Promise<TemplateWorkflowDraft> {
    return this.workflowTemplateService.generateTemplateWorkflowDraftFromRequest(
      data,
      this.workflowSupportService.createTemplateSupport()
    );
  }

  async compileTemplateWorkflowDraft(
    data: CompileTemplateWorkflowDraftDTO
  ): Promise<TemplateWorkflowDraft> {
    return this.workflowTemplateService.compileTemplateWorkflowDraft(
      data,
      this.workflowSupportService.createTemplateSupport()
    );
  }

  async generateBrowserWorkflowDraft(
    data: GenerateBrowserWorkflowDraftDTO
  ): Promise<BrowserWorkflowDraft> {
    return this.browserDraftService.generateBrowserWorkflowDraft(
      data,
      this.workflowSupportService.createBrowserDraftSupport()
    );
  }

  async generateAiWorkflowDraft(data: GenerateAiWorkflowDraftDTO): Promise<AiWorkflowDraft> {
    return this.aiDraftService.generateWorkflowDraft(
      data,
      this.workflowSupportService.createAiDraftSupport()
    );
  }

  async refineAiWorkflowDraft(data: RefineAiWorkflowDraftDTO): Promise<AiWorkflowDraft> {
    return this.aiDraftService.refineWorkflowDraft(
      data,
      this.workflowSupportService.createAiDraftSupport()
    );
  }
}
