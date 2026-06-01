import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WorkerModule } from '../worker/worker.module';
import { RecorderGateway } from './recorder.gateway';
import { RecorderService } from './recorder.service';

@Module({
  imports: [EventEmitterModule.forRoot(), WorkerModule],
  providers: [RecorderGateway, RecorderService],
  exports: [RecorderService],
})
export class RecorderModule {}
