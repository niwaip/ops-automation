import { Module } from '@nestjs/common';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { LocatorValidator } from './validators/locator.validator';
import { TemplateValidator } from './validators/template.validator';
import { PlaywrightCompiler } from './compiler/playwright-to-json';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TemplateController],
  providers: [TemplateService, LocatorValidator, TemplateValidator, PlaywrightCompiler],
  exports: [TemplateService, TemplateValidator, PlaywrightCompiler],
})
export class TemplateModule {}
