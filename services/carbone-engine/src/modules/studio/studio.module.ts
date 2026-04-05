/**
 * Carbone Engine - Studio Module
 */

import { Module } from '@nestjs/common';
import { StudioController } from './studio.controller';
import { PreviewService } from './preview.service';
import { AIIdentifierService } from './ai-identifier.service';

@Module({
  controllers: [StudioController],
  providers: [PreviewService, AIIdentifierService],
})
export class StudioModule {}