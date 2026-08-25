import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { RecordPlanningDecisionDto } from './experience-learning.dto';
import { PlanningDecisionService } from './planning-decision.service';

@ApiTags('Internal Planning Decision')
@ApiBearerAuth()
@Controller('internal/planning-decisions')
export class PlanningDecisionController {
  constructor(private readonly decisions: PlanningDecisionService) {}

  @Post()
  @ApiOperation({ summary: 'Persist a validated planning decision' })
  record(@Body() body: RecordPlanningDecisionDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    return this.decisions.record(userId, body);
  }
}
