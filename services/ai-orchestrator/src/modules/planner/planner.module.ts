import { Module } from '@nestjs/common';
import { RecognizerModule } from '../recognizer/recognizer.module';
import { PlannerService } from './planner.service';

@Module({
  imports: [RecognizerModule],
  providers: [PlannerService],
  exports: [PlannerService],
})
export class PlannerModule {}
