import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import {
  HabitGovernanceActionDto,
  UpdatePersonalizationDto,
  UpdateUserHabitStatusDto,
} from './experience-learning.dto';
import { HabitLearningService } from './habit-learning.service';

@ApiTags('Habit Learning Admin')
@ApiBearerAuth()
@Controller('admin/habit-learning')
export class HabitLearningAdminController {
  constructor(private readonly habits: HabitLearningService) {}

  @Get('status')
  getStatus(@Req() req: AuthenticatedRequest) {
    this.requireAdmin(req);
    return this.habits.getOverview();
  }

  @Get('candidates')
  listCandidates(@Req() req: AuthenticatedRequest) {
    this.requireAdmin(req);
    return this.habits.listCandidates();
  }

  @Get('candidates/:id')
  getCandidate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    this.requireAdmin(req);
    return this.habits.getCandidate(id);
  }

  @Post('candidates/:id/:action')
  governCandidate(
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: HabitGovernanceActionDto,
    @Req() req: AuthenticatedRequest
  ) {
    const actorUserId = this.requireAdmin(req);
    if (!['hold', 'reject', 'rollback'].includes(action)) {
      throw new ForbiddenException(`Unsupported governance action: ${action}`);
    }
    return this.habits.applyCandidateAction(
      actorUserId,
      id,
      action as 'hold' | 'reject' | 'rollback',
      body.reason
    );
  }

  @Get('habits')
  listHabits(@Req() req: AuthenticatedRequest) {
    this.requireAdmin(req);
    return this.habits.listAdminHabits();
  }

  @Get('runs')
  listRuns(@Req() req: AuthenticatedRequest) {
    this.requireAdmin(req);
    return this.habits.listRuns();
  }

  @Post('runs/run-now')
  @ApiOperation({ summary: 'Run an idempotent manual habit-learning batch' })
  runNow(@Req() req: AuthenticatedRequest) {
    this.requireAdmin(req);
    return this.habits.runNow();
  }

  private requireAdmin(req: AuthenticatedRequest): string {
    if (req.user?.role !== 'admin' || !req.user.id) {
      throw new ForbiddenException('Only admins can govern habit learning');
    }
    return req.user.id;
  }
}

@ApiTags('User Personalization')
@ApiBearerAuth()
@Controller()
export class UserHabitController {
  constructor(private readonly habits: HabitLearningService) {}

  @Get('user-habits')
  getState(@Req() req: AuthenticatedRequest) {
    return this.habits.getUserState(this.requireUser(req));
  }

  @Patch('user-habits/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateUserHabitStatusDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.habits.updateUserHabitStatus(this.requireUser(req), id, body.status);
  }

  @Delete('user-habits')
  clear(@Req() req: AuthenticatedRequest) {
    return this.habits.clearUserPersonalization(this.requireUser(req));
  }

  @Patch('user-preferences/personalization')
  updatePersonalization(
    @Body() body: UpdatePersonalizationDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.habits.updatePersonalization(
      this.requireUser(req),
      body.recommendationEnabled
    );
  }

  private requireUser(req: AuthenticatedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
