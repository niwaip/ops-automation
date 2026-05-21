import { Module } from '@nestjs/common';
import { BrowserController } from './browser.controller';
import { TakeoverController } from './takeover.controller';
import { BrowserService } from './browser.service';
import { ChromeDevtoolsCliAdapter } from './adapters/chrome-devtools-cli.adapter';
import { PlaywrightCliAdapter } from './adapters/playwright-cli.adapter';
import { WorkerModule } from '../worker/worker.module';
import { RecorderModule } from '../recorder/recorder.module';
import { BrowserSessionService } from './application/browser-session.service';
import { BrowserCommandService } from './application/browser-command.service';
import { BrowserParameterizationService } from './application/browser-parameterization.service';
import { BrowserStepService } from './application/browser-step.service';
import { BrowserScriptExportService } from './application/browser-script-export.service';
import { BrowserSchemaService } from './application/browser-schema.service';
import { CodegenScriptParserService } from './application/codegen-script-parser.service';
import { TakeoverOrchestratorService } from './application/takeover-orchestrator.service';
import { BrowserSessionRegistry } from './infrastructure/browser-session.registry';
import { BrowserStepMapper } from './mappers/browser-step.mapper';

@Module({
  imports: [WorkerModule, RecorderModule],
  controllers: [BrowserController, TakeoverController],
  providers: [
    BrowserService,
    BrowserSessionService,
    BrowserCommandService,
    BrowserParameterizationService,
    BrowserStepService,
    BrowserScriptExportService,
    BrowserSchemaService,
    CodegenScriptParserService,
    TakeoverOrchestratorService,
    BrowserStepMapper,
    BrowserSessionRegistry,
    PlaywrightCliAdapter,
    ChromeDevtoolsCliAdapter,
  ],
  exports: [BrowserService],
})
export class BrowserModule {}
