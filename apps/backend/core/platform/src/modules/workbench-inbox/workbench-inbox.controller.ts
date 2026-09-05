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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ConvertInboxToTodoDto,
  IngestInboxItemDto,
  QueryInboxDto,
  UpdateInboxStatusDto,
} from './dto/workbench-inbox.dto';
import { WorkbenchInboxService } from './workbench-inbox.service';

@ApiTags('Workbench Inbox')
@ApiBearerAuth()
@Controller('workbench-inbox')
export class WorkbenchInboxController {
  constructor(private readonly inboxService: WorkbenchInboxService) {}

  private extractUserId(req: any): string {
    return req.user?.id || req.user?.userId || 'anonymous';
  }

  @Post()
  @ApiOperation({ summary: '接入多源内容至 GTD 收件箱' })
  async ingest(@Request() req: any, @Body() body: IngestInboxItemDto) {
    const userId = this.extractUserId(req);
    return await this.inboxService.ingest(userId, body);
  }

  @Get()
  @ApiOperation({ summary: '分页查询当前用户的收件箱列表' })
  async list(@Request() req: any, @Query() query: QueryInboxDto) {
    const userId = this.extractUserId(req);
    return await this.inboxService.findAll(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取收件箱单条记录详情' })
  async getById(@Request() req: any, @Param('id') id: string) {
    const userId = this.extractUserId(req);
    return await this.inboxService.findById(userId, id);
  }

  @Post(':id/clarify')
  @ApiOperation({ summary: '使用大模型对收件箱条目进行深度 GTD 厘清与 5W1H 要素提取' })
  async clarify(@Request() req: any, @Param('id') id: string) {
    const userId = this.extractUserId(req);
    return await this.inboxService.clarify(userId, id);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: '将收件箱条目正式转换为待办任务 (WorkbenchTodo)' })
  async convertToTodo(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: ConvertInboxToTodoDto
  ) {
    const userId = this.extractUserId(req);
    return await this.inboxService.convertToTodo(userId, id, body);
  }

  @Put(':id/status')
  @ApiOperation({ summary: '更新收件箱条目状态（如归档、废弃）' })
  async updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UpdateInboxStatusDto
  ) {
    const userId = this.extractUserId(req);
    return await this.inboxService.updateStatus(userId, id, body.status);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除收件箱条目' })
  async delete(@Request() req: any, @Param('id') id: string) {
    const userId = this.extractUserId(req);
    return await this.inboxService.delete(userId, id);
  }
}
