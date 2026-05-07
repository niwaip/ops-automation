import { Module } from '@nestjs/common';
import { BrowserController } from './browser.controller';
import { BrowserService } from './browser.service';
import { ChromeDevtoolsCliAdapter } from './adapters/chrome-devtools-cli.adapter';
import { LegacyCodegenAdapter } from './adapters/legacy-codegen.adapter';
import { PlaywrightCliAdapter } from './adapters/playwright-cli.adapter';
import { WorkerModule } from '../worker/worker.module';

@Module({
  imports: [WorkerModule],
  controllers: [BrowserController],
  providers: [BrowserService, LegacyCodegenAdapter, PlaywrightCliAdapter, ChromeDevtoolsCliAdapter],
  exports: [BrowserService],
})
export class BrowserModule {}
