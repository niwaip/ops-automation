import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SystemBackupController } from './system-backup.controller';
import { SystemBackupService } from './system-backup.service';
import { AIModelBackupHandler } from './handlers/ai-model-backup.handler';
import { SkillWorkflowBackupHandler } from './handlers/skill-workflow-backup.handler';
import { CapabilityReleaseBackupHandler } from './handlers/capability-release-backup.handler';
import { TemplateFlowBackupHandler } from './handlers/template-flow-backup.handler';
import { UserOrgBackupHandler } from './handlers/user-org-backup.handler';
import { TaskPolicyBackupHandler } from './handlers/task-policy-backup.handler';
import { WorkspaceBackupHandler } from './handlers/workspace-backup.handler';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [SystemBackupController],
  providers: [
    Reflector,
    SystemBackupService,
    AIModelBackupHandler,
    SkillWorkflowBackupHandler,
    CapabilityReleaseBackupHandler,
    TemplateFlowBackupHandler,
    UserOrgBackupHandler,
    TaskPolicyBackupHandler,
    WorkspaceBackupHandler,
  ],
  exports: [
    SystemBackupService,
    AIModelBackupHandler,
    SkillWorkflowBackupHandler,
    CapabilityReleaseBackupHandler,
    TemplateFlowBackupHandler,
    UserOrgBackupHandler,
    TaskPolicyBackupHandler,
    WorkspaceBackupHandler,
  ],
})
export class SystemBackupModule {}
