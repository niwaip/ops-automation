import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { BuiltinContractReviewInvokeDto } from './contract-review.types';
import { ContractReviewService } from './contract-review.service';

@Controller('internal/document/contract-review')
export class ContractReviewController {
  constructor(private readonly reviewService: ContractReviewService) {}

  @Post('invoke')
  @HttpCode(HttpStatus.OK)
  async invoke(@Body() dto: BuiltinContractReviewInvokeDto) {
    const input = {
      ...(dto.input || {}),
      idempotencyKey: dto.idempotencyKey || dto.executionId,
    };

    const output = await this.reviewService.reviewContract(input);

    return {
      success: true,
      output,
      artifacts: output.artifacts,
    };
  }
}
