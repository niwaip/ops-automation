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
  CreateCoordinationTaskDto,
  QueryCollaboratorsDto,
  SubmitCoordinationActionDto,
} from './dto/workbench-coordination.dto';
import {
  AssignWorkflowRolesDto,
  CreateOrgWorkflowDto,
  RequestWorkflowAccessDto,
  ReviewWorkflowAccessDto,
  UpdateOrgWorkflowDto,
  AvailableBaseWorkflowItem,
} from './org-workflow.entity';
import { OrgWorkflowService } from './org-workflow.service';
import {
  StageFlowAiDraftService,
  GenerateStageFlowAiDraftDto,
} from './stage-flow-ai-draft.service';
import { WorkbenchCoordinationService } from './workbench-coordination.service';

@ApiTags('Workbench Coordination')
@ApiBearerAuth()
@Controller(['workbench-coordination', 'api/workbench-coordination'])
export class WorkbenchCoordinationController {
  constructor(
    private readonly coordinationService: WorkbenchCoordinationService,
    private readonly orgWorkflowService: OrgWorkflowService,
    private readonly stageFlowAiDraftService: StageFlowAiDraftService
  ) {}

  private extractUserId(req: any): string {
    return req.user?.id || req.user?.userId || 'anonymous';
  }

  // ==========================================
  // 用户端 / 5174 组织工作流消费接口
  // ==========================================

  @Get('workflow-templates')
  @ApiOperation({ summary: '获取可用的组织工作流模版（含权限计算与流程定义）' })
  async getWorkflowTemplates(@Request() req: any) {
    const userId = this.extractUserId(req);
    if (userId && userId !== 'anonymous') {
      return await this.coordinationService.getWorkflowCatalogForUser(userId);
    }
    return this.coordinationService.getWorkflowTemplates();
  }

  @Post('workflow-templates/:id/request-access')
  @ApiOperation({ summary: '员工申请开通企业工作流权限' })
  async requestWorkflowAccess(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: RequestWorkflowAccessDto
  ) {
    const userId = this.extractUserId(req);
    return await this.orgWorkflowService.requestAccess(id, userId, body.reason);
  }

  @Get('collaborators')
  @ApiOperation({ summary: '查询可协同的组织成员列表' })
  async listCollaborators(
    @Request() req: any,
    @Query() query: QueryCollaboratorsDto
  ) {
    const userId = this.extractUserId(req);
    return await this.coordinationService.searchCollaborators(userId, query);
  }

  @Post('tasks')
  @ApiOperation({ summary: '发起协同任务并推入接收人 GTD 收集箱' })
  async createTask(
    @Request() req: any,
    @Body() body: CreateCoordinationTaskDto
  ) {
    const userId = this.extractUserId(req);
    return await this.coordinationService.createTask(userId, body);
  }

  @Post('tasks/:taskId/action')
  @ApiOperation({ summary: '提交协同操作动作（同意/拒绝/完成）' })
  async submitAction(
    @Request() req: any,
    @Param('taskId') taskId: string,
    @Body() body: SubmitCoordinationActionDto
  ) {
    const userId = this.extractUserId(req);
    return await this.coordinationService.submitAction(userId, taskId, body);
  }

  @Get('tasks')
  @ApiOperation({ summary: '查询协同任务与流程实例列表' })
  async listTasks(
    @Request() req: any,
    @Query('role') role?: 'all' | 'assignee' | 'initiator'
  ) {
    const userId = this.extractUserId(req);
    return await this.coordinationService.listTasks(userId, role);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: '获取协同任务详情' })
  async getTaskDetails(@Request() req: any, @Param('taskId') taskId: string) {
    const userId = this.extractUserId(req);
    return await this.coordinationService.getTaskDetails(userId, taskId);
  }

  // ==========================================
  // 管理端 / 5173 企业工作流编排与发布接口
  // ==========================================

  @Get('admin/available-base-workflows')
  @ApiOperation({ summary: '获取 5173 底层普通工作流资产（供组装勾选）' })
  async getAvailableBaseWorkflows() {
    return await this.orgWorkflowService.getAvailableBaseWorkflows();
  }

  @Post('admin/base-workflows')
  @ApiOperation({ summary: '注册用户创建或 AI 生成的流程专用原子工作流' })
  async registerBaseWorkflow(@Body() body: AvailableBaseWorkflowItem) {
    return await this.orgWorkflowService.registerCustomBaseWorkflow(body);
  }

  @Delete('admin/base-workflows/:id')
  @ApiOperation({ summary: '删除指定的流程专用原子工作流' })
  async deleteBaseWorkflow(@Param('id') id: string) {
    const success = await this.orgWorkflowService.deleteCustomBaseWorkflow(id);
    return { success, id };
  }

  @Delete('admin/base-workflows')
  @ApiOperation({ summary: '清空所有流程专用原子工作流' })
  async clearAllBaseWorkflows() {
    await this.orgWorkflowService.clearAllCustomBaseWorkflows();
    return { success: true };
  }

  @Post('admin/ai-draft-stage-flow')
  @ApiOperation({ summary: '通过 AI 对话生成符合固定契约的流程专用原子工作流草稿' })
  async generateStageFlowAiDraft(@Body() body: GenerateStageFlowAiDraftDto) {
    return await this.stageFlowAiDraftService.generateDraft(body);
  }

  @Get('admin/workflows')
  @ApiOperation({ summary: '管理员获取全量企业工作流（草稿+已发布）及全景统计' })
  async listAdminWorkflows() {
    return await this.orgWorkflowService.listAdminWorkflows();
  }

  @Post('admin/workflows')
  @ApiOperation({ summary: '管理员新建企业工作流（基于底层工作流组装与流程定义）' })
  async createWorkflow(
    @Request() req: any,
    @Body() body: CreateOrgWorkflowDto
  ) {
    const userId = this.extractUserId(req);
    return await this.orgWorkflowService.createWorkflow(body, userId);
  }

  @Get('admin/workflows/:id')
  @ApiOperation({ summary: '获取企业工作流详情' })
  getWorkflowDetail(@Param('id') id: string) {
    return this.orgWorkflowService.getWorkflowById(id);
  }

  @Put('admin/workflows/:id')
  @ApiOperation({ summary: '更新企业工作流配置、组装与流程定义' })
  async updateWorkflow(
    @Param('id') id: string,
    @Body() body: UpdateOrgWorkflowDto
  ) {
    return await this.orgWorkflowService.updateWorkflow(id, body);
  }

  @Post('admin/workflows/:id/publish')
  @ApiOperation({ summary: '管理员发布或下架企业工作流' })
  async togglePublish(
    @Param('id') id: string,
    @Body('publish') publish?: boolean
  ) {
    return await this.orgWorkflowService.togglePublish(id, publish);
  }

  @Delete('admin/workflows/:id')
  @ApiOperation({ summary: '删除企业工作流' })
  async deleteWorkflow(@Param('id') id: string) {
    await this.orgWorkflowService.deleteWorkflow(id);
    return { success: true };
  }

  @Put('admin/workflows/:id/permissions')
  @ApiOperation({ summary: '配置企业工作流授权角色' })
  async updateWorkflowPermissions(
    @Param('id') id: string,
    @Body() body: AssignWorkflowRolesDto
  ) {
    return await this.orgWorkflowService.updatePermissions(id, body.roleIds || []);
  }

  @Get('admin/workflows/:id/requests')
  @ApiOperation({ summary: '获取企业工作流权限开通申请列表' })
  listWorkflowAccessRequests(@Param('id') id: string) {
    return this.orgWorkflowService.listAccessRequests(id);
  }

  @Post('admin/access-requests/:requestId/review')
  @ApiOperation({ summary: '管理员审核企业工作流权限开通申请' })
  async reviewAccessRequest(
    @Request() req: any,
    @Param('requestId') requestId: string,
    @Body() body: ReviewWorkflowAccessDto
  ) {
    const reviewerId = this.extractUserId(req);
    return await this.orgWorkflowService.reviewAccessRequest(
      requestId,
      reviewerId,
      body.status,
      body.note
    );
  }
}
