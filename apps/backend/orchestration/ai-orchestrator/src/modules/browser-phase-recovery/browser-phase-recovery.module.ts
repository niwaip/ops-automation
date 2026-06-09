import { Module } from '@nestjs/common';
import { ModelModule } from '../model/model.module';
import { BrowserPhaseRecoveryService } from './browser-phase-recovery.service';

@Module({
  imports: [ModelModule],
  providers: [BrowserPhaseRecoveryService],
  exports: [BrowserPhaseRecoveryService],
})
export class BrowserPhaseRecoveryModule {}
