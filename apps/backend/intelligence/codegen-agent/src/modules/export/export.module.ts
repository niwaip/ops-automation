import { Module } from '@nestjs/common';
import { GeneratedWorkUnitMapper } from './generated-work-unit.mapper';

@Module({
  providers: [GeneratedWorkUnitMapper],
  exports: [GeneratedWorkUnitMapper],
})
export class ExportModule {}
