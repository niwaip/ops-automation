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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateWorkbenchTodoDto,
  ExecuteTodoTaskDto,
  ExtractTodoPreviewDto,
  QueryWorkbenchTodoDto,
  UpdateWorkbenchTodoDto,
} from './dto/workbench-todo.dto';
import { WorkbenchTodoService } from './workbench-todo.service';

@ApiTags('Workbench Todos')
@ApiBearerAuth()
@Controller('workbench-todos')
export class WorkbenchTodoController {
  constructor(private readonly todoService: WorkbenchTodoService) {}

  private extractUserId(req: any): string {
    return req.user?.id || req.user?.userId || 'anonymous';
  }

  @Get()
  @ApiOperation({ summary: '获取当前用户的工作台待办列表' })
  async list(@Request() req: any, @Query() query: QueryWorkbenchTodoDto) {
    const userId = this.extractUserId(req);
    return await this.todoService.findAll(userId, query);
  }

  @Post()
  @ApiOperation({ summary: '创建新的工作台待办' })
  async create(@Request() req: any, @Body() body: CreateWorkbenchTodoDto) {
    const userId = this.extractUserId(req);
    return await this.todoService.create(userId, body);
  }

  @Post('extract-preview')
  @ApiOperation({ summary: '从对话文本/邮件/消息中智能抽取 5W1H 待办预览' })
  async extractPreview(@Request() req: any, @Body() body: ExtractTodoPreviewDto) {
    const userId = this.extractUserId(req);
    return await this.todoService.extractPreview(userId, body);
  }

  @Get('capabilities')
  @ApiOperation({ summary: '获取可用于执行自动化任务的工作流与能力列表' })
  async discoverCapabilities() {
    return await this.todoService.discoverTaskRunnableWorkflows();
  }

  @Get(':id')
  @ApiOperation({ summary: '获取待办任务详情' })
  async getById(@Request() req: any, @Param('id') id: string) {
    const userId = this.extractUserId(req);
    return await this.todoService.findById(userId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新待办任务' })
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UpdateWorkbenchTodoDto
  ) {
    const userId = this.extractUserId(req);
    return await this.todoService.update(userId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除待办任务' })
  async delete(@Request() req: any, @Param('id') id: string) {
    const userId = this.extractUserId(req);
    return await this.todoService.delete(userId, id);
  }

  @Post(':id/execute')
  @ApiOperation({ summary: '触发执行待办绑定的自动化工作流' })
  async executeTask(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: ExecuteTodoTaskDto
  ) {
    const userId = this.extractUserId(req);
    const authToken = req.headers?.authorization;
    return await this.todoService.executeTask(userId, id, body, authToken);
  }
}
