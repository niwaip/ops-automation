import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../prisma/prisma.module';
import { SystemBackupController } from './system-backup.controller';
import { SystemBackupService } from './system-backup.service';
import { AIModelBackupHandler } from './handlers/ai-model-backup.handler';
import { SkillWorkflowBackupHandler } from './handlers/skill-workflow-backup.handler';
import { CapabilityReleaseBackupHandler } from './handlers/capability-release-backup.handler';
import { TemplateFlowBackupHandler } from './handlers/template-flow-backup.handler';
import { UserOrgBackupHandler } from './handlers/user-org-backup.handler';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [SystemBackupController],
  providers: [
    SystemBackupService,
    AIModelBackupHandler,
    SkillWorkflowBackupHandler,
    CapabilityReleaseBackupHandler,
    TemplateFlowBackupHandler,
    UserOrgBackupHandler,
  ],
  exports: [SystemBackupService],
})
export class SystemBackupModule {}
