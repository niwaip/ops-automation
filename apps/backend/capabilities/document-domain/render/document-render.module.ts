import { Module } from '@nestjs/common';
import { DocumentRuntimeFacadeModule } from '../runtime-facade/document-runtime-facade.module';

@Module({
  imports: [DocumentRuntimeFacadeModule],
  exports: [DocumentRuntimeFacadeModule],
})
export class DocumentRenderModule {}
