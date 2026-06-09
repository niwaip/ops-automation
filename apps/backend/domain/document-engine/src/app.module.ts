/**
 * Carbone Engine - App Module
 */

import { Module } from '@nestjs/common';
import { StudioModule } from './modules/studio/studio.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, StudioModule],
})
export class AppModule {}
