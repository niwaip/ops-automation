import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { BuiltinContractReviewInvokeDto } from './contract-review.types';
import { ContractReviewService } from './contract-review.service';

@Controller('internal/document/contract-review')
export class ContractReviewController {
  constructor(private readonly reviewService: ContractReviewService) {}

  @Post('invoke')
  @HttpCode(HttpStatus.OK)
  async invoke(@Body() dto: BuiltinContractReviewInvokeDto) {
    const isSmoke =
      dto.definitionVersion === '0.0.0-smoke' ||
      String(dto.executionId || '').startsWith('smoke-') ||
      dto.input?.skipLlmReview === true;

    const input = {
      ...(dto.input || {}),
      idempotencyKey: dto.idempotencyKey || dto.executionId,
      ...(isSmoke ? { skipLlmReview: true } : {}),
    };

    const output = await this.reviewService.reviewContract(input);

    return {
      success: true,
      output,
      artifacts: output.artifacts,
    };
  }
}
