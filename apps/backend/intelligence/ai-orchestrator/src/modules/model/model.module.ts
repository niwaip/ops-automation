import { Module } from '@nestjs/common';
import { ModelController } from './model.controller';
import { ModelService } from './model.service';
import { DebugSettingsModule } from '../debug-settings/debug-settings.module';
import { ControlPlaneClientModule } from '../../client/control-plane-client.module';
import { ModelInvocationTelemetryService } from './model-invocation-telemetry.service';

@Module({
  imports: [DebugSettingsModule, ControlPlaneClientModule],
  controllers: [ModelController],
  providers: [ModelService, ModelInvocationTelemetryService],
  exports: [ModelService, ModelInvocationTelemetryService],
})
export class ModelModule {}
