import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { WorkflowAuthoringService } from './workflow-authoring.service';
import type {
  OptimizeDescriptionRequestDto,
  TestPlannerMatchingRequestDto,
} from './workflow-authoring.types';

@Controller('ai/workflow-authoring')
export class WorkflowAuthoringController {
  constructor(private readonly authoringService: WorkflowAuthoringService) {}

  @Post('optimize-description')
  @HttpCode(HttpStatus.OK)
  async optimizeDescription(@Body() dto: OptimizeDescriptionRequestDto) {
    if (!dto || !dto.name) {
      throw new BadRequestException('Workflow name is required');
    }
    try {
      return await this.authoringService.optimizeDescription(dto);
    } catch (err: any) {
      throw new BadRequestException({
        code: 'OPTIMIZE_DESCRIPTION_FAILED',
        message: err.message || 'Failed to optimize description',
      });
    }
  }

  @Post('test-planner-matching')
  @HttpCode(HttpStatus.OK)
  async testPlannerMatching(
    @Body() dto: TestPlannerMatchingRequestDto,
    @Headers('authorization') authHeader?: string
  ) {
    if (!dto || !dto.candidateSkill || !dto.candidateSkill.name) {
      throw new BadRequestException('Candidate skill with name is required');
    }
    const token =
      dto.authToken ||
      (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader);

    try {
      return await this.authoringService.testPlannerMatching({
        ...dto,
        authToken: token,
      });
    } catch (err: any) {
      throw new BadRequestException({
        code: 'TEST_PLANNER_MATCHING_FAILED',
        message: err.message || 'Failed to test planner matching',
      });
    }
  }
}
