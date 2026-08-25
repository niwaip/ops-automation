import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SchedulerService } from './scheduler.service';
import { CreateScheduleDto, UpdateScheduleDto, ScheduleDto } from './scheduler.dto';
import { AuthenticatedRequest } from '../auth/auth.middleware';

@ApiTags('Schedules')
@ApiBearerAuth()
@Controller('schedules')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new schedule' })
  @ApiResponse({ status: 201, type: ScheduleDto })
  async create(
    @Body() dto: CreateScheduleDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ScheduleDto> {
    return this.schedulerService.create(this.requireUserId(req), dto);
  }

  @Get()
  @ApiOperation({ summary: 'List schedules' })
  @ApiResponse({ status: 200, type: ScheduleDto, isArray: true })
  async list(@Req() req: AuthenticatedRequest): Promise<ScheduleDto[]> {
    return this.schedulerService.list(this.requireUserId(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get schedule by ID' })
  @ApiResponse({ status: 200, type: ScheduleDto })
  async getById(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<ScheduleDto> {
    const schedule = await this.schedulerService.getById(id, this.requireUserId(req));
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found.`);
    }
    return schedule;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update schedule' })
  @ApiResponse({ status: 200, type: ScheduleDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ScheduleDto> {
    return this.schedulerService.update(id, this.requireUserId(req), dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete schedule' })
  @ApiResponse({ status: 200, description: 'Deleted successfully' })
  async delete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ): Promise<{ success: boolean }> {
    await this.schedulerService.delete(id, this.requireUserId(req));
    return { success: true };
  }

  @Post(':id/trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger schedule immediately' })
  @ApiResponse({ status: 200, description: 'Triggered successfully' })
  async trigger(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ): Promise<{ success: boolean }> {
    await this.schedulerService.triggerManually(id, this.requireUserId(req));
    return { success: true };
  }

  private requireUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
