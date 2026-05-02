/**
 * Skill Module
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../prisma/prisma.module';
import { SkillService } from './skill.service';
import { SkillController } from './skill.controller';
import { ExecutionFlowModule } from '../execution-flow/execution-flow.module';
import { ToolCatalogService } from './tool-catalog.service';
import { ToolCatalogController } from './tool-catalog.controller';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
    ExecutionFlowModule,
  ],
  controllers: [SkillController, ToolCatalogController],
  providers: [SkillService, ToolCatalogService],
  exports: [SkillService, ToolCatalogService],
})
export class SkillModule {}
