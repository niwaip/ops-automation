import { Module } from '@nestjs/common';
import { TemplateClient } from './template.client';

@Module({
  providers: [TemplateClient],
  exports: [TemplateClient],
})
export class TemplateModule {}
