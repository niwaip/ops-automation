import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../../auth/auth.middleware';
import { CandidateSchemaGeneratorService } from './candidate-schema-generator.service';

@ApiTags('Backfill')
@ApiBearerAuth()
@Controller('skills')
export class BackfillController {
  constructor(
    private readonly candidateSchemaGenerator: CandidateSchemaGeneratorService
  ) {}

  @Post(':name/generate-candidate-schema')
  @ApiOperation({
    summary: 'Generate a candidate output schema from execution samples (§17.2)',
    description:
      'Aggregates succeeded execution samples for a custom skill and stores a candidate schema for operator review. Never auto-applies.',
  })
  async generateCandidateSchema(
    @Param('name') name: string,
    @Body() body: { minSamples?: number },
    @Req() req: AuthenticatedRequest
  ) {
    this.requireAdmin(req);
    const result = await this.candidateSchemaGenerator.generateCandidateSchema(
      name,
      body?.minSamples ?? 3
    );
    return {
      capabilityId: name,
      status: 'candidate',
      ...result,
      message: 'Candidate schema stored for review — run accept-candidate-schema to make it authoritative',
    };
  }

  @Post(':name/accept-candidate-schema')
  @ApiOperation({
    summary: 'Operator-confirmed acceptance of a candidate schema (§17.2)',
    description:
      'Copies the stored candidate schema into skill_configs.output_schema. Only for custom skills that still have an empty output schema.',
  })
  async acceptCandidateSchema(
    @Param('name') name: string,
    @Req() req: AuthenticatedRequest
  ) {
    this.requireAdmin(req);
    const schema = await this.candidateSchemaGenerator.acceptCandidateSchema(name);
    return { capabilityId: name, status: 'accepted', outputSchema: schema };
  }

  private requireAdmin(req: AuthenticatedRequest): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can manage candidate schemas');
    }
  }
}
