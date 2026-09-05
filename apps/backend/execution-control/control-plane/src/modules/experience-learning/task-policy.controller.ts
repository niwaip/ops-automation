import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import {
  CreateTaskPolicyDraftDto,
  CreateTaskPolicyProposalDto,
  ReviewTaskPolicyProposalDto,
} from './task-policy.dto';
import { TaskPolicyRegistryService } from './task-policy-registry.service';
import { TaskPolicyReplayService } from './task-policy-replay.service';

@ApiTags('Effective Task Policy')
@ApiBearerAuth()
@Controller('internal/task-policies')
export class EffectiveTaskPolicyController {
  constructor(private readonly policies: TaskPolicyRegistryService) {}

  @Get('effective')
  @ApiOperation({ summary: 'Resolve the immutable effective fixed-command policy snapshot' })
  effective(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    return this.policies.getEffectivePolicy({
      userId,
      organizationId: request.user?.organizationId,
    });
  }
}

@ApiTags('Task Policy Governance')
@ApiBearerAuth()
@Controller('admin/task-policies')
export class TaskPolicyAdminController {
  constructor(
    private readonly policies: TaskPolicyRegistryService,
    private readonly replay: TaskPolicyReplayService
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    this.requireAdmin(request);
    return this.policies.listPolicies();
  }

  @Get('proposals')
  proposals(@Req() request: AuthenticatedRequest) {
    this.requireAdmin(request);
    return this.policies.listProposals();
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    this.requireAdmin(request);
    return this.policies.getPolicy(id);
  }

  @Post('drafts')
  createDraft(
    @Body() body: CreateTaskPolicyDraftDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.policies.createDraft(body, this.requireAdmin(request));
  }

  @Post(':id/publish')
  async publish(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    const actor = this.requireAdmin(request);
    const policy = await this.policies.getPolicy(id);
    await this.replay.assertPublishable(id, policy.digest);
    return this.policies.publish(id, actor);
  }

  @Post(':id/replay')
  replayPolicy(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.replay.run(id, this.requireAdmin(request));
  }

  @Post('proposals')
  createProposal(
    @Body() body: CreateTaskPolicyProposalDto,
    @Req() request: AuthenticatedRequest
  ) {
    this.requireAdmin(request);
    return this.policies.createProposal(body);
  }

  @Post('proposals/:id/review')
  reviewProposal(
    @Param('id') id: string,
    @Body() body: ReviewTaskPolicyProposalDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.policies.reviewProposal(id, body.status, this.requireAdmin(request));
  }

  private requireAdmin(request: AuthenticatedRequest) {
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can govern task policies');
    }
    return userId;
  }
}
