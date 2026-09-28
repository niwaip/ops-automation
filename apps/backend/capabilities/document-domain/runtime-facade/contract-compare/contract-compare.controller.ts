import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type {
  BuiltinContractCompareDiffDto,
  BuiltinContractCompareInvokeDto,
  BuiltinContractCompareRenderDto,
} from './contract-compare.types';
import { ContractCompareService } from './contract-compare.service';

@Controller('internal/document/contract-compare')
export class ContractCompareController {
  constructor(private readonly compareService: ContractCompareService) {}

  @Post('diff')
  @HttpCode(HttpStatus.OK)
  async diff(@Body() dto: BuiltinContractCompareDiffDto) {
    const input = {
      ...(dto.input || {}),
      idempotencyKey: dto.idempotencyKey || dto.executionId,
    };

    const output = await this.compareService.diffContracts(input);

    return {
      success: true,
      output,
    };
  }

  @Post('render-report')
  @HttpCode(HttpStatus.OK)
  async renderReport(@Body() dto: BuiltinContractCompareRenderDto) {
    const idempotencyKey = dto.idempotencyKey || dto.executionId;
    const output = await this.compareService.renderCompareReport(dto.input, idempotencyKey);

    return {
      success: true,
      output,
      artifacts: output.artifacts,
    };
  }

  @Post('invoke')
  @HttpCode(HttpStatus.OK)
  async invoke(@Body() dto: BuiltinContractCompareInvokeDto) {
    const input = {
      ...(dto.input || {}),
      idempotencyKey: dto.idempotencyKey || dto.executionId,
    };

    const output = await this.compareService.compareContracts(input);

    return {
      success: true,
      output,
      artifacts: output.artifacts,
    };
  }
}
