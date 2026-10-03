import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type {
  BuiltinContractReviewInvokeDto,
  BuiltinContractReviewParseDto,
  BuiltinContractReviewRenderDto,
} from './contract-review.types';
import { ContractReviewService } from './contract-review.service';

@Controller('internal/document/contract-review')
export class ContractReviewController {
  constructor(private readonly reviewService: ContractReviewService) {}

  @Post('parse')
  @HttpCode(HttpStatus.OK)
  async parse(@Body() dto: BuiltinContractReviewParseDto) {
    const input = {
      ...(dto.input || {}),
      idempotencyKey: dto.idempotencyKey || dto.executionId,
    };

    const output = await this.reviewService.parseContract(input);

    return {
      success: true,
      output,
    };
  }

  @Post('render-report')
  @HttpCode(HttpStatus.OK)
  async renderReport(@Body() dto: BuiltinContractReviewRenderDto) {
    const idempotencyKey = dto.idempotencyKey || dto.executionId;
    const output = await this.reviewService.renderReport(dto.input, idempotencyKey);

    return {
      success: true,
      output,
      artifacts: output.artifacts,
    };
  }

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

