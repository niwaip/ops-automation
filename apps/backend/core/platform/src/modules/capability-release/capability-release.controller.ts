import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, Public } from '../../decorators';
import { CapabilityReleaseService } from './capability-release.service';
import {
  ApproveCapabilityReleaseDTO,
  BridgeRecorderExportDTO,
  CreateCapabilityBuildDTO,
  CreateCapabilityReleaseDTO,
  DeployCapabilityReleaseDTO,
  ExecuteCapabilityRuntimeDTO,
  GenerateSkillDraftDTO,
  PublishSkillDraftDTO,
  RollbackCapabilityReleaseDTO,
  UpdateCapabilitySourceDTO,
  UpdateSkillDraftDTO,
  ValidateCapabilityDTO,
  AnalyzeFailureDTO,
  SuggestReleaseWizardAssistDTO,
} from './interfaces';

@ApiTags('Capabilities')
@Controller('capabilities')
export class CapabilityReleaseController {
  constructor(private readonly capabilityReleaseService: CapabilityReleaseService) {}

  @Get()
  @Roles('admin')
  async listReleases() {
    const releases = await this.capabilityReleaseService.listReleases();
    return { releases };
  }

  @Get('release-center')
  async listPublishedCapabilities() {
    const releases = await this.capabilityReleaseService.listPublishedCapabilities();
    return { releases };
  }

  @Post('bridge/recorder-export')
  @Roles('admin')
  @ApiOperation({ summary: 'Bridge recorder export artifacts into release + skill draft' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['exportArtifacts'],
      properties: {
        releaseId: { type: 'string', format: 'uuid', nullable: true },
        userGoal: { type: 'string', nullable: true },
        sourceName: { type: 'string', nullable: true },
        exportArtifacts: {
          type: 'object',
          properties: {
            guidance: { type: 'string', nullable: true },
            commands: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            skillDraft: {
              type: 'object',
              properties: {
                name: { type: 'string', nullable: true },
                description: { type: 'string', nullable: true },
                publishPayload: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
      additionalProperties: false,
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        release: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            sourceType: { type: 'string', example: 'browser_recording' },
          },
        },
        skillDraft: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
          },
        },
        bridgeMode: { type: 'string', example: 'browser_recording_native' },
      },
    },
  })
  async bridgeRecorderExport(@Body() body: BridgeRecorderExportDTO, @Request() req: any) {
    return this.capabilityReleaseService.bridgeRecorderExport(body, req.user?.id);
  }

  @Post('runtime/execute')
  @Public()
  async executeCapabilityRuntime(@Body() body: ExecuteCapabilityRuntimeDTO, @Request() req: any) {
    return this.capabilityReleaseService.executeCapabilityRuntime(body, req.user?.id);
  }

  @Get('runtime/skills/:skillId/context')
  @Public()
  async getPublishedSkillRuntimeContext(@Param('skillId') skillId: string) {
    return this.capabilityReleaseService.getPublishedSkillRuntimeContext(skillId);
  }

  @Get('release-center/:id')
  async getPublishedCapabilityDetail(@Param('id') id: string) {
    const release = await this.capabilityReleaseService.getPublishedCapabilityDetail(id);
    return { release };
  }

  @Post('runtime/skills/:skillId/execute')
  async executePublishedSkill(
    @Param('skillId') skillId: string,
    @Body() body: { input?: Record<string, unknown> },
    @Request() req: any
  ) {
    const result = await this.capabilityReleaseService.executePublishedSkill(
      skillId,
      body?.input,
      req.user?.id
    );
    return result;
  }

  @Get(':id')
  @Roles('admin')
  async getRelease(@Param('id') id: string) {
    const release = await this.capabilityReleaseService.getCapabilityDetail(id);
    return { release };
  }

  @Delete(':id')
  @Roles('admin')
  async archiveCapability(@Param('id') id: string, @Request() req: any) {
    return this.capabilityReleaseService.archiveCapability(id, req.user?.id);
  }

  @Post()
  @Roles('admin')
  async createCapability(@Body() body: CreateCapabilityReleaseDTO, @Request() req: any) {
    const release = await this.capabilityReleaseService.createCapability(body, req.user?.id);
    return { release };
  }

  @Put(':id/source')
  @Roles('admin')
  async updateSource(
    @Param('id') id: string,
    @Body() body: UpdateCapabilitySourceDTO,
    @Request() req: any
  ) {
    const release = await this.capabilityReleaseService.updateSource(id, body, req.user?.id);
    return { release };
  }

  @Post(':id/build')
  @Roles('admin')
  async build(
    @Param('id') id: string,
    @Body() body: CreateCapabilityBuildDTO,
    @Request() req: any
  ) {
    return this.capabilityReleaseService.build(id, body, req.user?.id);
  }

  @Get(':id/build/stream')
  @Roles('admin')
  async buildStream(
    @Param('id') id: string,
    @Query('buildType') buildType: CreateCapabilityBuildDTO['buildType'] | undefined,
    @Query('modelId') modelId: string | undefined,
    @Query('errorContext') errorContext: string | undefined,
    @Request() req: any,
    @Res() res: Response
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, payload: Record<string, unknown>) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await this.capabilityReleaseService.buildStream(
        id,
        {
          buildType,
          modelId,
          errorContext,
        },
        req.user?.id,
        sendEvent
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      sendEvent('error', { message });
    } finally {
      res.end();
    }
  }

  @Get(':id/builds')
  @Roles('admin')
  async getBuilds(@Param('id') id: string) {
    const release = await this.capabilityReleaseService.getCapabilityDetail(id);
    return { builds: release.builds };
  }

  @Post(':id/validate/static')
  @Roles('admin')
  async validateStatic(
    @Param('id') id: string,
    @Body() body: ValidateCapabilityDTO,
    @Request() req: any
  ) {
    return this.capabilityReleaseService.validateStatic(id, body, req.user?.id);
  }

  @Post(':id/validate/sandbox')
  @Roles('admin')
  async validateSandbox(
    @Param('id') id: string,
    @Body() body: ValidateCapabilityDTO,
    @Request() req: any
  ) {
    return this.capabilityReleaseService.validateSandbox(
      id,
      body,
      req.user?.id,
      req.headers?.authorization
    );
  }

  @Get(':id/validate/sandbox/stream')
  @Roles('admin')
  async validateSandboxStream(
    @Param('id') id: string,
    @Query('buildId') buildId: string | undefined,
    @Query('fn') fn: string | undefined,
    @Query('testUserInput') testUserInput: string | undefined,
    @Query('input') input: string | undefined,
    @Request() req: any,
    @Res() res: Response
  ) {
    const parsedInput = input ? JSON.parse(input) : undefined;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, payload: Record<string, unknown>) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await this.capabilityReleaseService.validateSandboxStream(
        id,
        {
          buildId,
          fn,
          testUserInput,
          input: parsedInput,
        },
        req.user?.id,
        req.headers?.authorization,
        sendEvent
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      sendEvent('error', { message });
    } finally {
      res.end();
    }
  }

  @Get(':id/validations')
  @Roles('admin')
  async getValidations(@Param('id') id: string) {
    const release = await this.capabilityReleaseService.getCapabilityDetail(id);
    return { validations: release.validations };
  }

  @Post(':id/generate-skill-draft')
  @Roles('admin')
  async generateSkillDraft(
    @Param('id') id: string,
    @Body() body: GenerateSkillDraftDTO,
    @Request() req: any
  ) {
    return this.capabilityReleaseService.generateSkillDraft(id, body, req.user?.id);
  }

  @Get(':id/skill-draft')
  @Roles('admin')
  async getCurrentSkillDraft(@Param('id') id: string) {
    const skillDraft = await this.capabilityReleaseService.getCurrentSkillDraft(id);
    return { skillDraft };
  }

  @Put(':id/skill-draft')
  @Roles('admin')
  async updateSkillDraft(
    @Param('id') id: string,
    @Body() body: UpdateSkillDraftDTO,
    @Request() req: any
  ) {
    const skillDraft = await this.capabilityReleaseService.updateSkillDraft(id, body, req.user?.id);
    return { skillDraft };
  }

  @Post(':id/publish-skill')
  @Roles('admin')
  async publishSkill(
    @Param('id') id: string,
    @Body() body: PublishSkillDraftDTO,
    @Request() req: any
  ) {
    return this.capabilityReleaseService.publishSkill(id, body, req.user?.id);
  }

  @Post(':id/approve')
  @Roles('admin')
  async approveRelease(
    @Param('id') id: string,
    @Body() body: ApproveCapabilityReleaseDTO,
    @Request() req: any
  ) {
    const release = await this.capabilityReleaseService.approveRelease(id, body, req.user?.id);
    return { release };
  }

  @Post(':id/deploy')
  @Roles('admin')
  async deploy(
    @Param('id') id: string,
    @Body() body: DeployCapabilityReleaseDTO,
    @Request() req: any
  ) {
    return this.capabilityReleaseService.deploy(id, body, req.user?.id);
  }

  @Post(':id/wizard-assist')
  @Roles('admin')
  async suggestWizardAssist(
    @Param('id') id: string,
    @Body() body: SuggestReleaseWizardAssistDTO,
    @Request() req: any
  ) {
    return this.capabilityReleaseService.suggestWizardAssist(id, body, req.user?.id);
  }

  @Get(':id/deployments')
  @Roles('admin')
  async getDeployments(@Param('id') id: string) {
    const deployments = await this.capabilityReleaseService.getDeployments(id);
    return { deployments };
  }

  @Get(':id/audit-events')
  @Roles('admin')
  async getAuditEvents(@Param('id') id: string) {
    const auditEvents = await this.capabilityReleaseService.getAuditEvents(id);
    return { auditEvents };
  }

  @Post(':id/rollback')
  @Roles('admin')
  async rollback(
    @Param('id') id: string,
    @Body() body: RollbackCapabilityReleaseDTO,
    @Request() req: any
  ) {
    return this.capabilityReleaseService.rollback(id, body, req.user?.id);
  }

  @Post(':id/analyze-failure')
  @Roles('admin')
  async analyzeFailure(
    @Param('id') id: string,
    @Body() body: AnalyzeFailureDTO,
    @Request() req: any
  ) {
    return this.capabilityReleaseService.analyzeFailure(id, body, req.user?.id);
  }
}
