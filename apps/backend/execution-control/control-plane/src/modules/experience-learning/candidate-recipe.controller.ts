import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import {
  CreateCandidateRecipeDto,
  PromoteCandidateRecipeDto,
  RecordCandidateRecipeEvaluationDto,
} from './experience-learning.dto';
import { CandidateRecipeService } from './candidate-recipe.service';

@ApiTags('Candidate Recipe Governance')
@ApiBearerAuth()
@Controller('admin/candidate-recipes')
export class CandidateRecipeController {
  constructor(private readonly recipes: CandidateRecipeService) {}

  @Post()
  @ApiOperation({ summary: 'Create a candidate recipe; it is never executable on creation' })
  create(@Body() body: CreateCandidateRecipeDto, @Req() request: AuthenticatedRequest) {
    this.requireAdmin(request);
    return this.recipes.createCandidate(body);
  }

  @Post(':candidateRecipeId/evaluations')
  @ApiOperation({ summary: 'Record one idempotent Shadow evaluation fixture' })
  recordEvaluation(
    @Param('candidateRecipeId') candidateRecipeId: string,
    @Body() body: RecordCandidateRecipeEvaluationDto,
    @Req() request: AuthenticatedRequest
  ) {
    this.requireAdmin(request);
    return this.recipes.recordShadowEvaluation(
      candidateRecipeId,
      body.fixtureId,
      body.passed,
      body.comparison
    );
  }

  @Post(':candidateRecipeId/promotions')
  @ApiOperation({ summary: 'Promote a recipe only when governed evidence thresholds are met' })
  promote(
    @Param('candidateRecipeId') candidateRecipeId: string,
    @Body() body: PromoteCandidateRecipeDto,
    @Req() request: AuthenticatedRequest
  ) {
    const actorId = this.requireAdmin(request);
    return this.recipes.promote(candidateRecipeId, body.target, actorId);
  }

  private requireAdmin(request: AuthenticatedRequest): string {
    const actorId = request.user?.id;
    if (!actorId) throw new UnauthorizedException('Authentication required');
    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can govern candidate recipes');
    }
    return actorId;
  }
}
