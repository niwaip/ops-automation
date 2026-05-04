/**
 * Carbone Engine - App Module
 */

import { Module } from '@nestjs/common';
import { StudioModule } from './modules/studio/studio.module';

@Module({
  imports: [StudioModule],
})
export class AppModule {}