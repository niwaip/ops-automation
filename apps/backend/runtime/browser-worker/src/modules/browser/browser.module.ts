import { Module } from '@nestjs/common';
import { BrowserController } from './browser.controller';
import { BrowserService } from './browser.service';
import { ChromeDevtoolsCliAdapter } from './adapters/chrome-devtools-cli.adapter';
import { PlaywrightCliAdapter } from './adapters/playwright-cli.adapter';
import { WorkerModule } from '../worker/worker.module';
import { BrowserSessionService } from './application/browser-session.service';
import { BrowserCommandService } from './application/browser-command.service';
import { BrowserParameterizationService } from './application/browser-parameterization.service';
import { BrowserStepService } from './application/browser-step.service';
import { BrowserScriptExportService } from './application/browser-script-export.service';
import { BrowserSchemaService } from './application/browser-schema.service';
import { BrowserSessionRegistry } from './infrastructure/browser-session.registry';
import { BrowserStepMapper } from './mappers/browser-step.mapper';

@Module({
  imports: [WorkerModule],
  controllers: [BrowserController],
  providers: [
    BrowserService,
    BrowserSessionService,
    BrowserCommandService,
    BrowserParameterizationService,
    BrowserStepService,
    BrowserScriptExportService,
    BrowserSchemaService,
    BrowserStepMapper,
    BrowserSessionRegistry,
    PlaywrightCliAdapter,
    ChromeDevtoolsCliAdapter,
  ],
  exports: [BrowserService],
})
export class BrowserModule {}
