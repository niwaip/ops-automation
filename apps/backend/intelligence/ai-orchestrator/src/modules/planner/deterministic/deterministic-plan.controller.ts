import { Controller, Post, Body, HttpCode, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import { DeterministicPlanGeneratorService } from './deterministic-plan-generator.service';
import type { GenerateDeterministicPlanRequestDto } from './deterministic-plan-generator.service';

@Controller('ai/plans/deterministic')
export class DeterministicPlanController {
  constructor(private readonly generatorService: DeterministicPlanGeneratorService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generate(@Body() dto: GenerateDeterministicPlanRequestDto) {
    try {
      return await this.generatorService.generatePlan(dto);
    } catch (err: any) {
      if (err.code === 'CAPABILITY_NOT_FOUND') {
        throw new NotFoundException({
          code: 'CAPABILITY_NOT_FOUND',
          message: err.message || 'No published executable skills available for planning',
        });
      }
      throw new BadRequestException({
        code: err.code || 'PLAN_GENERATION_FAILED',
        message: err.message || 'Plan generation failed',
      });
    }
  }
}
