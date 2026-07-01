import { Module } from '@nestjs/common';
import { DocumentRenderModule } from './render/document-render.module';
import { DocumentTemplateModule } from './template/document-template.module';
import { PrismaModule } from './template/prisma.module';

@Module({
  imports: [PrismaModule, DocumentTemplateModule, DocumentRenderModule],
})
export class AppModule {}
