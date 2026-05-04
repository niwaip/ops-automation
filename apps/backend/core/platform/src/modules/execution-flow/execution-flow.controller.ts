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
import { Public } from '../../decorators/permissions.decorator';
import { ExecutionFlowTemplateService } from './execution-flow-template.service';
import {
  CreateExecutionFlowTemplateDTO,
  UpdateExecutionFlowTemplateDTO,
  ExecutionFlowTemplateDTO,
} from './interfaces';

type ValidationErrorCode =
  | 'VALIDATION_TIMEOUT'
  | 'AI_JSON_PARSE_ERROR'
  | 'FLOW_EXECUTION_ERROR'
  | 'NETWORK_ERROR'
  | 'TEMPLATE_NOT_FOUND'
  | 'VALIDATION_UNKNOWN_ERROR';

@Controller('flows')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExecutionFlowTemplateController {
  constructor(private readonly templateService: ExecutionFlowTemplateService) {}

  private classifyValidationError(error: any): {
    code: ValidationErrorCode;
    message: string;
    status: HttpStatus;
  } {
    const rawMessage = typeof error?.message === 'string' && error.message.trim()
      ? error.message
      : '验证失败，请检查服务状态后重试';
    const normalizedMessage = rawMessage.toLowerCase();

    if (normalizedMessage.includes('template not found')) {
      return {
        code: 'TEMPLATE_NOT_FOUND',
        message: '模板不存在',
        status: HttpStatus.NOT_FOUND,
      };
    }

    if (
      error?.code === 'ECONNABORTED' ||
      normalizedMessage.includes('timeout') ||
      normalizedMessage.includes('超时')
    ) {
      return {
        code: 'VALIDATION_TIMEOUT',
        message: rawMessage,
        status: HttpStatus.GATEWAY_TIMEOUT,
      };
    }

    if (
      normalizedMessage.includes('json') ||
      normalizedMessage.includes('parse') ||
      normalizedMessage.includes('invalid') ||
      normalizedMessage.includes('不是有效 json')
    ) {
      return {
        code: 'AI_JSON_PARSE_ERROR',
        message: rawMessage,
        status: HttpStatus.BAD_GATEWAY,
      };
    }

    if (
      normalizedMessage.includes('flow_execute') ||
      normalizedMessage.includes('react') ||
      normalizedMessage.includes('执行测试') ||
      normalizedMessage.includes('执行引擎') ||
      normalizedMessage.includes('stream')
    ) {
      return {
        code: 'FLOW_EXECUTION_ERROR',
        message: rawMessage,
        status: HttpStatus.BAD_GATEWAY,
      };
    }

    if (
      normalizedMessage.includes('network') ||
      normalizedMessage.includes('fetch') ||
      normalizedMessage.includes('socket') ||
      normalizedMessage.includes('econnrefused')
    ) {
      return {
        code: 'NETWORK_ERROR',
        message: rawMessage,
        status: HttpStatus.BAD_GATEWAY,
      };
    }

    return {
      code: 'VALIDATION_UNKNOWN_ERROR',
      message: rawMessage,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

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
   * 获取所有流程模板列表（公开API，用于内部服务调用）
   */
  @Get()
  @Public()
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
   * 获取单个模板详情（公开API，用于内部服务调用）
   */
  @Get(':id')
  @Public()
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
   * 支持真实执行测试（enableExecutionTest=true）
   */
  @Post(':id/validate')
  @Roles('admin')
  async validateTemplate(
    @Param('id') id: string,
    @Query('aiServiceUrl') aiServiceUrl?: string,
    @Query('enableExecutionTest') enableExecutionTest?: string,
    @Body() body?: { testParams?: Record<string, unknown>; testUserInput?: string },
  ) {
    try {
      const enableExec = enableExecutionTest === 'true';
      const testParams = body?.testParams;
      const testUserInput = body?.testUserInput;
      const validationResult = await this.templateService.validateTemplate(
        id,
        aiServiceUrl,
        testParams,
        enableExec,
        testUserInput,
      );
      return { validationResult };
    } catch (error) {
      const classified = this.classifyValidationError(error);
      throw new HttpException(
        {
          code: classified.code,
          message: classified.message,
        },
        classified.status
      );
    }
  }

  /**
   * 应用 AI 优化建议
   */
  @Post(':id/apply-adjustment')
  @Roles('admin')
  async applyAdjustment(@Param('id') id: string): Promise<ExecutionFlowTemplateDTO> {
    const updated = await this.templateService.applyAdjustment(id);

    if (!updated) {
      throw new HttpException('Failed to apply AI adjustment', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return updated;
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
