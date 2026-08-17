import { Module } from '@nestjs/common';
import { ModelController } from './model.controller';
import { ModelService } from './model.service';
import { DebugSettingsModule } from '../debug-settings/debug-settings.module';

@Module({
  imports: [DebugSettingsModule],
  controllers: [ModelController],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule {}
