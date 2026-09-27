import { Module } from '@nestjs/common';
import { ModelController } from './model.controller';
import { ModelProxyController } from './model-proxy.controller';
import { ModelService } from './model.service';
import { ModelOcrService } from './model-ocr.service';
import { DebugSettingsModule } from '../debug-settings/debug-settings.module';
import { ControlPlaneClientModule } from '../../client/control-plane-client.module';
import { ModelInvocationTelemetryService } from './model-invocation-telemetry.service';
import { SandboxSearchProxyController } from './sandbox-search-proxy.controller';

@Module({
  imports: [DebugSettingsModule, ControlPlaneClientModule],
  controllers: [ModelController, ModelProxyController, SandboxSearchProxyController],
  providers: [ModelService, ModelOcrService, ModelInvocationTelemetryService],
  exports: [ModelService, ModelOcrService, ModelInvocationTelemetryService],
})
export class ModelModule {}
