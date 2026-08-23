import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { RecordRoutingObservationDto } from './experience-learning.dto';
import { RoutingObservationService } from './routing-observation.service';

@ApiTags('Internal Routing Observation')
@ApiBearerAuth()
@Controller('internal/routing-observations')
export class RoutingObservationController {
  constructor(private readonly observations: RoutingObservationService) {}

  @Post()
  @ApiOperation({ summary: 'Record a sanitized routing decision fact' })
  record(@Body() body: RecordRoutingObservationDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    return this.observations.record(userId, body);
  }
}

@ApiTags('Habit Learning Admin')
@ApiBearerAuth()
@Controller('admin/habit-learning')
export class RoutingObservationAdminController {
  constructor(private readonly observations: RoutingObservationService) {}

  @Get('routing-diagnostics')
  getDiagnostics(@Req() req: AuthenticatedRequest) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can view routing diagnostics');
    }
    return this.observations.getDiagnostics();
  }
}

