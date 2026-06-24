import { Module } from '@nestjs/common';
import { BrowserRuntimeBridgeService } from './browser-runtime-bridge.service';
import { RuntimeResultNormalizerService } from './runtime-result-normalizer.service';

@Module({
  providers: [BrowserRuntimeBridgeService, RuntimeResultNormalizerService],
  exports: [BrowserRuntimeBridgeService, RuntimeResultNormalizerService],
})
export class RuntimeBridgeModule {}
