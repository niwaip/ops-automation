import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  GenerateRenderDataWithSkillDto,
  RenderResolvedDto,
} from '../../runtime-facade/render-entry/document-runtime-facade.dto';
import { StudioSkillRenderDataService } from './studio-skill-render-data.service';

@ApiTags('studio')
@Controller('studio')
export class StudioSkillRenderController {
  constructor(private readonly studioSkillRenderDataService: StudioSkillRenderDataService) {}

  @Post('generate-render-data-with-skill')
  @ApiOperation({
    summary: 'Generate standardized render data from skill without rendering',
    description:
      '参考 preview-with-skill 的数据构造逻辑生成标准渲染数据，正式渲染仍应调用 /studio/render-resolved。',
  })
  @ApiBody({ type: GenerateRenderDataWithSkillDto })
  async generateRenderDataWithSkill(@Body() body: GenerateRenderDataWithSkillDto): Promise<{
    success: boolean;
    generatedData?: Record<string, unknown>;
    renderResolvedRequest?: RenderResolvedDto;
    skillUsed?: Record<string, unknown>;
    debugLogs?: string[];
    error?: string;
  }> {
    try {
      const result = await this.studioSkillRenderDataService.generate({
        templateId: body.templateId,
        skillId: body.skillId,
        skill: body.skill,
        simulatedData: body.simulatedData,
      });

      const renderResolvedRequest: RenderResolvedDto = {
        ...(result.templateId ? { templateId: result.templateId } : {}),
        ...(result.skillId ? { skillId: result.skillId } : {}),
        ...(body.publishedSkillId ? { publishedSkillId: body.publishedSkillId } : {}),
        data: result.generatedData,
        ...(body.workflowInputParams ? { workflowInputParams: body.workflowInputParams } : {}),
        ...(body.workflowInputPolicy ? { workflowInputPolicy: body.workflowInputPolicy } : {}),
        ...(body.outputFormat ? { outputFormat: body.outputFormat } : {}),
        ...(body.outputName ? { outputName: body.outputName } : {}),
        ...(body.sourceLanguage ? { sourceLanguage: body.sourceLanguage } : {}),
        ...(body.targetLanguages ? { targetLanguages: body.targetLanguages } : {}),
        ...(body.prepareLocalizedRenderData === true ? { prepareLocalizedRenderData: true } : {}),
      };

      return {
        success: true,
        generatedData: result.generatedData,
        renderResolvedRequest,
        skillUsed: result.skillUsed,
        debugLogs: result.debugLogs,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
