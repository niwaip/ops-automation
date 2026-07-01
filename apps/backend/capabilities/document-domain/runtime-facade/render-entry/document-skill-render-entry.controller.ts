import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StudioSkillRenderController } from '../../render/resolved-render/studio-skill-render.controller';
import { StudioSkillRenderDataService } from '../../render/resolved-render/studio-skill-render-data.service';
import { GenerateRenderDataWithSkillDto } from './document-runtime-facade.dto';

@ApiTags('document-runtime-facade')
@Controller('studio')
export class DocumentSkillRenderEntryController extends StudioSkillRenderController {
  constructor(studioSkillRenderDataService: StudioSkillRenderDataService) {
    super(studioSkillRenderDataService);
  }

  @Post('generate-render-data-with-skill')
  @ApiOperation({
    summary: 'Generate render data from the document-domain runtime facade',
    description:
      '文档能力域运行时入口，负责根据模板与技能上下文生成标准化渲染数据。',
  })
  @ApiBody({ type: GenerateRenderDataWithSkillDto })
  override async generateRenderDataWithSkill(@Body() body: GenerateRenderDataWithSkillDto) {
    return super.generateRenderDataWithSkill(body);
  }
}
