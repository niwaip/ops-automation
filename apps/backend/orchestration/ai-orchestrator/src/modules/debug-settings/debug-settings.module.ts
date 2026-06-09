import { Global, Module } from '@nestjs/common';
import { PromptDebugSettingsService } from './prompt-debug-settings.service';

@Global()
@Module({
  providers: [PromptDebugSettingsService],
  exports: [PromptDebugSettingsService],
})
export class DebugSettingsModule {}
