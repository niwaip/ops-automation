import { Module } from '@nestjs/common';
import { ModelModule } from '../model/model.module';
import { BranchAnalysisService } from './branch-analysis.service';

@Module({
  imports: [ModelModule],
  providers: [BranchAnalysisService],
  exports: [BranchAnalysisService],
})
export class BranchAnalysisModule {}
