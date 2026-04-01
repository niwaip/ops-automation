import { Module } from '@nestjs/common';
import { CdpService } from './cdp.service';

@Module({
  providers: [CdpService],
  exports: [CdpService],
})
export class CdpModule {}