import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ReviewUserWorkflowDto, UserWorkflowReviewResult } from './user-workflow-review.dto';
import { UserWorkflowReviewService } from './user-workflow-review.service';

@Controller('ai/internal/user-workflows')
export class UserWorkflowReviewController {
  constructor(private readonly reviewService: UserWorkflowReviewService) {}

  @Post('review')
  async review(
    @Body() dto: ReviewUserWorkflowDto,
    @Headers('x-internal-auth') internalAuth?: string,
    @Headers('x-internal-secret') internalSecret?: string
  ): Promise<UserWorkflowReviewResult> {
    const expected = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
    if (expected && internalAuth !== expected && internalSecret !== expected) {
      throw new UnauthorizedException('Invalid internal service credentials');
    }
    return this.reviewService.review(dto);
  }
}
