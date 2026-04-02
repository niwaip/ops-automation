import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RecorderGateway } from './recorder.gateway';
import { RecorderService } from './recorder.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [RecorderGateway, RecorderService],
  exports: [RecorderService],
})
export class RecorderModule {}