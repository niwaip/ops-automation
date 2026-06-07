import { Module } from '@nestjs/common';
import { RecognizerModule } from '../recognizer/recognizer.module';
import { ModelModule } from '../model/model.module';
import { PlannerService } from './planner.service';

@Module({
  imports: [RecognizerModule, ModelModule],
  providers: [PlannerService],
  exports: [PlannerService],
})
export class PlannerModule {}
