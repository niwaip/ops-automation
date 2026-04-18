/**
 * Execution Flow Template Controller
 * 执行流程模板API接口 - 用于管理流程模板
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ExecutionFlowTemplateService } from './execution-flow.service';
import {
  CreateExecutionFlowTemplateDTO,
  UpdateExecutionFlowTemplateDTO,
  ExecutionFlowTemplateDTO,
} from './interfaces';

@Controller('execution-flow-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExecutionFlowTemplateController {
  constructor(private readonly templateService: ExecutionFlowTemplateService) {}

  /**
   * 获取所有流程模板（支持分页和过滤）
   * 注意：静态路由必须放在动态路由（:id）之前
   */
  @Get('categories')
  async getCategories() {
    const categories = await this.templateService.getCategories();
    return { categories };
  }

  /**
   * 获取热门模板
   */
  @Get('popular')
  async getPopularTemplates(@Query('limit') limit?: string) {
    const templates = await this.templateService.getPopularTemplates(limit ? parseInt(limit, 10) : undefined);
    return { templates };
  }

  /**
   * 获取所有流程模板列表
   */
  @Get()
  async listTemplates(
    @Query('category') category?: string,
    @Query('isPublic') isPublic?: string,
    @Query('isActive') isActive?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string
  ): Promise<{ templates: ExecutionFlowTemplateDTO[]; total: number }> {
    return this.templateService.listTemplates({
      category,
      isPublic: isPublic === 'true' ? true : isPublic === 'false' ? false : undefined,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      search,
    });
  }

  /**
   * 获取单个模板详情
   */
  @Get(':id')
  async getTemplate(@Param('id') id: string): Promise<ExecutionFlowTemplateDTO> {
    const template = await this.templateService.getTemplate(id);
    if (!template) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
    return template;
  }

  /**
   * 创建新模板（仅管理员）
   */
  @Post()
  @Roles('admin')
  async createTemplate(
    @Body() data: CreateExecutionFlowTemplateDTO,
    @Request() req: any
  ): Promise<ExecutionFlowTemplateDTO> {
    const userId = req.user?.id;
    return this.templateService.createTemplate({
      ...data,
      createdBy: userId,
    });
  }

  /**
   * 更新模板（仅管理员）
   */
  @Put(':id')
  @Roles('admin')
  async updateTemplate(
    @Param('id') id: string,
    @Body() data: UpdateExecutionFlowTemplateDTO
  ): Promise<ExecutionFlowTemplateDTO> {
    const template = await this.templateService.updateTemplate(id, data);
    if (!template) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
    return template;
  }

  /**
   * 删除模板（仅管理员）
   */
  @Delete(':id')
  @Roles('admin')
  async deleteTemplate(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.templateService.deleteTemplate(id);
    if (!success) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
    return { success };
  }

  /**
   * 验证流程模板 - AI验证功能
   */
  @Post(':id/validate')
  @Roles('admin')
  async validateTemplate(
    @Param('id') id: string,
    @Query('aiServiceUrl') aiServiceUrl?: string
  ) {
    const validationResult = await this.templateService.validateTemplate(id, aiServiceUrl);
    return { validationResult };
  }

  /**
   * 复制模板（创建副本）
   */
  @Post(':id/clone')
  @Roles('admin')
  async cloneTemplate(
    @Param('id') id: string,
    @Body('name') newName: string,
    @Request() req: any
  ): Promise<ExecutionFlowTemplateDTO> {
    const userId = req.user?.id;
    return this.templateService.cloneTemplate(id, newName, userId);
  }

  /**
   * 导出模板为JSON格式
   */
  @Get(':id/export')
  async exportTemplate(@Param('id') id: string): Promise<{ data: string }> {
    const data = await this.templateService.exportTemplate(id);
    return { data };
  }

  /**
   * 导入模板（从JSON格式）
   */
  @Post('import')
  @Roles('admin')
  async importTemplate(
    @Body('data') jsonData: string,
    @Request() req: any
  ): Promise<ExecutionFlowTemplateDTO> {
    const userId = req.user?.id;
    return this.templateService.importTemplate(jsonData, userId);
  }

  /**
   * 使用模板（增加使用计数）
   */
  @Post(':id/use')
  async useTemplate(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.templateService.useTemplate(id);
    return { success: true };
  }
}