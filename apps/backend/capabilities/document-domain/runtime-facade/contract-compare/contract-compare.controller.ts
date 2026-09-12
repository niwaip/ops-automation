import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { BuiltinContractCompareInvokeDto } from './contract-compare.types';
import { ContractCompareService } from './contract-compare.service';

@Controller('internal/document/contract-compare')
export class ContractCompareController {
  constructor(private readonly compareService: ContractCompareService) {}

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
