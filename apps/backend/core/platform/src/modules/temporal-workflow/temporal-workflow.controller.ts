import { Controller, Get, Post, Put, Delete, Body, Param, Res, Request } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import {
  TemporalWorkflowService,
  CreateTemporalWorkflowDTO,
  UpdateTemporalWorkflowDTO,
  TemporalValidationResult,
  WorkflowDsl,
  ActivityDsl,
  GenerateAiWorkflowDraftDTO,
  AiWorkflowDraft,
  AiWorkflowDraftSession,
  AiWorkflowDraftSessionListItem,
  GenerateAiWorkflowDraftSessionDTO,
  RefineAiWorkflowDraftSessionDTO,
  BrowserWorkflowDraft,
  GenerateBrowserWorkflowDraftDTO,
  CompileTemplateWorkflowDraftDTO,
  GenerateTemplateWorkflowDraftDTO,
  TemporalWorkflowArtifactDTO,
} from './temporal-workflow.service';
import { TemporalWorkflow } from '@prisma/client';

@ApiTags('Temporal Workflows')
@Controller('temporal')
export class TemporalWorkflowController {
  constructor(private readonly temporalWorkflowService: TemporalWorkflowService) {}

  @Get()
  @ApiOperation({ summary: 'List all temporal workflows' })
  async findAll(): Promise<TemporalWorkflow[]> {
    return this.temporalWorkflowService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new temporal workflow' })
  async create(@Body() data: CreateTemporalWorkflowDTO): Promise<TemporalWorkflow> {
    return this.temporalWorkflowService.create(data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a temporal workflow' })
  async update(
    @Param('id') id: string,
    @Body() data: UpdateTemporalWorkflowDTO,
  ): Promise<TemporalWorkflow> {
    return this.temporalWorkflowService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a temporal workflow' })
  async delete(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.temporalWorkflowService.delete(id);
  }

  @Post(':id/deploy')
  @ApiOperation({ summary: 'Deploy workflow to Temporal worker' })
  async deploy(@Param('id') id: string): Promise<TemporalWorkflow> {
    return this.temporalWorkflowService.deploy(id);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate workflow DSL and activity DSL' })
  async validate(
    @Body() data: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl },
  ): Promise<TemporalValidationResult> {
    return this.temporalWorkflowService.validate(data.workflowDsl, data.activityDsl);
  }

  @Post('generate-code')
  @ApiOperation({ summary: 'Generate workflow Python code from DSL' })
  async generateCode(
    @Body() data: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl; errorContext?: string; forceAiGeneration?: boolean },
  ): Promise<{ success: boolean; code?: string; error?: string; attempts?: number; autoRetried?: boolean; generationMode?: 'deterministic' | 'ai' }> {
    return this.temporalWorkflowService.generateWorkflowCode(
      data.workflowDsl,
      data.activityDsl,
      data.errorContext,
      Boolean(data.forceAiGeneration),
    );
  }

  @Post(':id/generate-and-save')
  @ApiOperation({ summary: 'Generate workflow Python code from saved DSL and persist generated code' })
  async generateAndSave(
    @Param('id') id: string,
    @Body() data: { errorContext?: string; forceAiGeneration?: boolean },
  ): Promise<{
    workflow: TemporalWorkflow;
    generation: {
      success: boolean;
      code: string;
      attempts?: number;
      autoRetried?: boolean;
      generationMode?: 'deterministic' | 'ai';
    };
  }> {
    return this.temporalWorkflowService.generateAndSaveWorkflowCode(
      id,
      data?.errorContext,
      Boolean(data?.forceAiGeneration),
    ) as unknown as {
      workflow: TemporalWorkflow;
      generation: {
        success: boolean;
        code: string;
        attempts?: number;
        autoRetried?: boolean;
        generationMode?: 'deterministic' | 'ai';
      };
    };
  }

  @Post(':id/generate-code-and-save')
  @ApiOperation({ summary: 'Alias of generate-and-save for persisted workflow artifact generation' })
  async generateCodeAndSave(
    @Param('id') id: string,
    @Body() data: { errorContext?: string; forceAiGeneration?: boolean },
  ) {
    return this.generateAndSave(id, data);
  }

  @Get(':id/artifact')
  @ApiOperation({ summary: 'Get persisted workflow artifact metadata and generated code' })
  async getArtifact(@Param('id') id: string): Promise<TemporalWorkflowArtifactDTO> {
    return this.temporalWorkflowService.getArtifact(id);
  }

  @Post('generate-code/stream')
  @ApiOperation({ summary: 'Generate workflow Python code from DSL with streaming status' })
  async generateCodeStream(
    @Body() data: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl; errorContext?: string; forceAiGeneration?: boolean },
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const result = await this.temporalWorkflowService.generateWorkflowCodeStreaming(
        data.workflowDsl,
        data.activityDsl,
        data.errorContext,
        data.forceAiGeneration,
        (log: string) => {
          res.write(`data: ${JSON.stringify({ type: 'log', content: log })}\n\n`);
        },
      );

      res.write(`data: ${JSON.stringify({
        type: 'done',
        success: result.success,
        code: result.code,
        error: result.error,
        attempts: result.attempts,
        autoRetried: result.autoRetried,
        generationMode: result.generationMode,
      })}\n\n`);
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
    }

    res.end();
  }

  @Post('generate-template-draft')
  @ApiOperation({ summary: 'Generate template-based workflow draft from Carbone template' })
  async generateTemplateDraft(
    @Body() data: GenerateTemplateWorkflowDraftDTO,
  ): Promise<import('./temporal-workflow.service').TemplateWorkflowDraft> {
    return this.temporalWorkflowService.generateTemplateWorkflowDraft(data);
  }

  @Post('compile-template-draft')
  @ApiOperation({ summary: 'Compile template-based workflow draft on backend with policy overrides' })
  async compileTemplateDraft(
    @Body() data: CompileTemplateWorkflowDraftDTO,
  ): Promise<import('./temporal-workflow.service').TemplateWorkflowDraft> {
    return this.temporalWorkflowService.compileTemplateWorkflowDraft(data);
  }

  @Post('generate-browser-draft')
  @ApiOperation({ summary: 'Generate browser-template workflow draft from browser script or structured commands' })
  async generateBrowserDraft(
    @Body() data: GenerateBrowserWorkflowDraftDTO,
  ): Promise<BrowserWorkflowDraft> {
    return this.temporalWorkflowService.generateBrowserWorkflowDraft(data);
  }

  @Post('generate-ai-draft')
  @ApiOperation({ summary: 'Generate AI-assisted workflow draft from natural language and optional URL' })
  async generateAiDraft(
    @Body() data: GenerateAiWorkflowDraftDTO,
  ): Promise<AiWorkflowDraft> {
    return this.temporalWorkflowService.generateAiWorkflowDraft(data);
  }

  @Post('draft-sessions')
  @ApiOperation({ summary: 'Create persistent AI workflow draft session' })
  async createAiDraftSession(
    @Body() data: GenerateAiWorkflowDraftSessionDTO,
    @Request() req: any,
  ): Promise<AiWorkflowDraftSession> {
    return this.temporalWorkflowService.createAiDraftSession(data, req.user?.id);
  }

  @Get('draft-sessions')
  @ApiOperation({ summary: 'List persistent AI workflow draft sessions' })
  async listAiDraftSessions(@Request() req: any): Promise<AiWorkflowDraftSessionListItem[]> {
    return this.temporalWorkflowService.listAiDraftSessions(req.user?.id);
  }

  @Get('draft-sessions/:sessionId')
  @ApiOperation({ summary: 'Get persistent AI workflow draft session' })
  async getAiDraftSession(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ): Promise<AiWorkflowDraftSession> {
    return this.temporalWorkflowService.getAiDraftSession(sessionId, req.user?.id);
  }

  @Delete('draft-sessions/:sessionId')
  @ApiOperation({ summary: 'Delete persistent AI workflow draft session' })
  async deleteAiDraftSession(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    return this.temporalWorkflowService.deleteAiDraftSession(sessionId, req.user?.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  async findOne(@Param('id') id: string): Promise<TemporalWorkflow | null> {
    return this.temporalWorkflowService.findOne(id);
  }

  @Post('refine-ai-draft')
  @ApiOperation({ summary: 'Refine existing AI-assisted workflow draft with multi-round feedback' })
  async refineAiDraft(
    @Body() data: import('./temporal-workflow.service').RefineAiWorkflowDraftDTO,
  ): Promise<AiWorkflowDraft> {
    return this.temporalWorkflowService.refineAiWorkflowDraft(data);
  }

  @Post('draft-sessions/:sessionId/messages')
  @ApiOperation({ summary: 'Append a refinement message to persistent AI workflow draft session' })
  async refineAiDraftSession(
    @Param('sessionId') sessionId: string,
    @Body() data: { userPrompt: string },
    @Request() req: any,
  ): Promise<AiWorkflowDraftSession> {
    return this.temporalWorkflowService.refineAiDraftSession({
      sessionId,
      userPrompt: data.userPrompt,
    } as RefineAiWorkflowDraftSessionDTO, req.user?.id);
  }

  @Post('optimize-http-config')
  @ApiOperation({ summary: 'Optimize builtin httpRequest step config with AI and live response preview' })
  async optimizeHttpConfig(
    @Body() data: { stepConfig: Record<string, any>; inputParams?: Record<string, any>; userRequest?: string },
  ): Promise<{ success: boolean; optimizedConfig?: Record<string, any>; previewResponse?: Record<string, any>; explanation?: string; error?: string }> {
    return this.temporalWorkflowService.optimizeHttpRequestConfig(
      data.stepConfig || {},
      data.inputParams || {},
      data.userRequest,
    );
  }

  @Post('preview-http-config')
  @ApiOperation({ summary: 'Preview builtin httpRequest step config with live response' })
  async previewHttpConfig(
    @Body() data: { stepConfig: Record<string, any>; inputParams?: Record<string, any> },
  ): Promise<{ success: boolean; baseConfig?: Record<string, any>; resolvedRequest?: Record<string, any>; previewResponse?: Record<string, any>; error?: string }> {
    return this.temporalWorkflowService.previewHttpRequestConfig(
      data.stepConfig || {},
      data.inputParams || {},
    );
  }

  @Post('generate-structured-transform-config')
  @ApiOperation({ summary: 'Generate builtin structuredTransform step config from real sample and user goal' })
  async generateStructuredTransformConfig(
    @Body() data: { sourceSample: any; userRequest: string; existingConfig?: Record<string, any> },
  ): Promise<{ success: boolean; config?: Record<string, any>; explanation?: string; error?: string }> {
    return this.temporalWorkflowService.generateStructuredTransformConfig(
      data.sourceSample,
      data.userRequest,
      data.existingConfig || {},
    );
  }

  @Post('validate-code')
  @ApiOperation({ summary: 'Validate generated workflow code with test worker' })
  async validateWorkflowReal(
    @Body() data: { code: string; fn: string; input?: Record<string, any>; taskQueue?: string; timeout?: string },
  ): Promise<{ success: boolean; logs: string[]; result?: any; error?: string; score: number }> {
    return this.temporalWorkflowService.validateWorkflowReal(data.code, data.fn, data.input, data.taskQueue, data.timeout);
  }

  @Post(':id/validate-saved-artifact')
  @ApiOperation({ summary: 'Validate saved generated workflow artifact with test worker' })
  async validateSavedArtifact(
    @Param('id') id: string,
    @Body() data: { input?: Record<string, any>; timeout?: string },
  ): Promise<{
    workflow: TemporalWorkflow;
    validation: { success: boolean; logs: string[]; result?: any; error?: string; score: number };
  }> {
    return this.temporalWorkflowService.validateSavedWorkflowArtifact(
      id,
      data?.input,
      data?.timeout,
    ) as unknown as {
      workflow: TemporalWorkflow;
      validation: { success: boolean; logs: string[]; result?: any; error?: string; score: number };
    };
  }

  @Post(':id/validate-artifact')
  @ApiOperation({ summary: 'Alias of validate-saved-artifact for persisted workflow artifact validation' })
  async validateArtifact(
    @Param('id') id: string,
    @Body() data: { input?: Record<string, any>; timeout?: string },
  ) {
    return this.validateSavedArtifact(id, data);
  }

  @Post('validate-code/stream')
  @ApiOperation({ summary: 'Validate generated workflow code with test worker and streaming logs' })
  async validateWorkflowRealStream(
    @Body() data: { code: string; fn: string; input?: Record<string, any>; taskQueue?: string; timeout?: string },
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const result = await this.temporalWorkflowService.validateWorkflowRealStreaming(
        data.code,
        data.fn,
        data.input,
        data.taskQueue,
        data.timeout,
        (log: string) => {
          res.write(`data: ${JSON.stringify({ type: 'log', content: log })}\n\n`);
        },
      );

      if (result.success) {
        res.write(`data: ${JSON.stringify({ type: 'done', success: true, score: result.score, result: result.result, traceback: result.traceback })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'done', success: false, error: result.error, score: result.score, result: result.result, traceback: result.traceback, logs: result.logs })}\n\n`);
      }
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
    }

    res.end();
  }
}
