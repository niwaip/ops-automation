import { Module } from '@nestjs/common';
import { RecorderGateway } from './recorder.gateway';

@Module({
  providers: [RecorderGateway],
  exports: [RecorderGateway],
})
export class RecorderModule {}