import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { TemplateEntity } from './template.entity';
import { LocatorValidator } from '../../validators/locator.validator';
import { TemplateValidator } from '../../validators/template.validator';
import { PlaywrightCompiler } from '../../compiler/playwright-to-json';

@Module({
  imports: [TypeOrmModule.forFeature([TemplateEntity])],
  controllers: [TemplateController],
  providers: [
    TemplateService,
    LocatorValidator,
    TemplateValidator,
    PlaywrightCompiler,
  ],
  exports: [TemplateService, TemplateValidator, PlaywrightCompiler],
})
export class TemplateModule {}