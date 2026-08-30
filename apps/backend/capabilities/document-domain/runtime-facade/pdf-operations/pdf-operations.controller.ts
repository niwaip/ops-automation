import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PdfCreateService } from './pdf-create.service';
import { PdfMergeService } from './pdf-merge.service';
import type {
  BuiltinPdfOperationInvokeDto,
  PdfCreateInput,
  PdfMergeInput,
  PdfOperationOutput,
  PdfSplitInput,
} from './pdf-operation.types';
import { PdfSplitService } from './pdf-split.service';

@Controller('internal/document/pdf')
export class PdfOperationsController {
  constructor(
    private readonly mergeService: PdfMergeService,
    private readonly splitService: PdfSplitService,
    private readonly createService: PdfCreateService
  ) {}

  @Post('merge/invoke')
  @HttpCode(HttpStatus.OK)
  async merge(@Body() dto: BuiltinPdfOperationInvokeDto) {
    const output = await this.mergeService.merge(
      (dto.input || {}) as unknown as PdfMergeInput,
      dto.idempotencyKey
    );
    return this.toHandlerResult(output);
  }

  @Post('split/invoke')
  @HttpCode(HttpStatus.OK)
  async split(@Body() dto: BuiltinPdfOperationInvokeDto) {
    const output = await this.splitService.split(
      (dto.input || {}) as unknown as PdfSplitInput,
      dto.idempotencyKey
    );
    return this.toHandlerResult(output);
  }

  @Post('create/invoke')
  @HttpCode(HttpStatus.OK)
  async create(@Body() dto: BuiltinPdfOperationInvokeDto) {
    const output = await this.createService.create(
      (dto.input || {}) as unknown as PdfCreateInput,
      dto.idempotencyKey
    );
    return this.toHandlerResult(output);
  }

  private toHandlerResult(output: PdfOperationOutput) {
    return {
      success: true,
      output,
      artifacts: output.artifacts,
    };
  }
}
