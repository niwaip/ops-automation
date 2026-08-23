import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import {
  SaveExecutionAsSkillDto,
  SavedSkillDto,
  UpdateSavedSkillAliasesDto,
  WorkflowSaveEligibilityDto,
} from './saved-skill.dto';
import { SavedSkillService } from './saved-skill.service';

@ApiTags('Saved Skills')
@ApiBearerAuth()
@Controller('saved-skills')
export class SavedSkillController {
  constructor(private readonly savedSkillService: SavedSkillService) {}

  @Get()
  @ApiOperation({ summary: 'List current user private saved workflows' })
  list(@Req() req: AuthenticatedRequest): Promise<{ skills: SavedSkillDto[] }> {
    return this.savedSkillService.list(this.requireUserId(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get current user private saved workflow' })
  getById(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ): Promise<SavedSkillDto> {
    return this.savedSkillService.getById(this.requireUserId(req), id);
  }

  @Put(':id/aliases')
  @ApiOperation({ summary: 'Replace current user confirmed aliases for a saved workflow' })
  updateAliases(
    @Param('id') id: string,
    @Body() dto: UpdateSavedSkillAliasesDto,
    @Req() req: AuthenticatedRequest
  ): Promise<SavedSkillDto> {
    return this.savedSkillService.replaceAliases(
      this.requireUserId(req),
      id,
      dto.aliases
    );
  }

  private requireUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}

@ApiTags('Executions')
@ApiBearerAuth()
@Controller('executions')
export class ExecutionSavedSkillController {
  constructor(private readonly savedSkillService: SavedSkillService) {}

  @Get(':id/workflow-save-eligibility')
  @ApiOperation({ summary: 'Check whether an execution can be saved as a private workflow' })
  getEligibility(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ): Promise<WorkflowSaveEligibilityDto> {
    return this.savedSkillService.getEligibility(this.requireUserId(req), id);
  }

  @Post(':id/save-as-skill')
  @ApiOperation({ summary: 'Save a successful deterministic execution as a private workflow' })
  save(
    @Param('id') id: string,
    @Body() dto: SaveExecutionAsSkillDto,
    @Req() req: AuthenticatedRequest
  ): Promise<SavedSkillDto> {
    return this.savedSkillService.saveFromExecution(this.requireUserId(req), id, dto);
  }

  private requireUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
