import { Module } from '@nestjs/common';
import { RecorderGateway } from './recorder.gateway';
import { RecorderService } from './recorder.service';

@Module({
  providers: [RecorderGateway, RecorderService],
  exports: [RecorderService],
})
export class RecorderModule {}