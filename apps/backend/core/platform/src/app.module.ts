import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule, JwtAuthGuard, RbacGuard, UserModule } from '@ops/identity-access';
import { OrganizationModule } from '@ops/organization';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CapabilityReleaseModule } from '@ops/release-manager/release';
import { SkillModule } from '@ops/skill-registry/registry';
import { ExecutionFlowModule } from '@ops/workflow-registry/flow-template';
import { TemporalWorkflowModule } from './modules/temporal-workflow/temporal-workflow.module';
import { ReleaseManagerRuntimeAdapterModule } from './release-manager/platform/release-manager-runtime-adapter.module';
import { PrismaModule } from './prisma/prisma.module';
import { IdentityAccessBridgeModule } from './governance/identity-access/identity-access-bridge.module';
import { OrganizationBridgeModule } from './governance/organization/organization-bridge.module';
import { WorkflowRegistryBridgeModule } from './workflow-registry/platform/workflow-registry-bridge.module';
import { SkillRegistryBridgeModule } from './skill-registry/platform/skill-registry-bridge.module';

import { BuiltinSkillModule } from '@ops/skill-registry/builtin';
import { SystemBackupModule } from './modules/system-backup/system-backup.module';
import { ImChannelModule } from './modules/im-channel/im-channel.module';
import { UserConnectionModule } from './modules/user-connection/user-connection.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { WorkbenchTodoModule } from './modules/workbench-todo/workbench-todo.module';
import { WorkbenchInboxModule } from './modules/workbench-inbox/workbench-inbox.module';
import { WorkbenchCoordinationModule } from './modules/workbench-coordination/workbench-coordination.module';

@Module({
  imports: [
    // Passport module for JWT authentication
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // JWT module configuration
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: {
        expiresIn: '15m', // Access token: 15 minutes
      },
    }),

    // Prisma module for database
    PrismaModule,
    IdentityAccessBridgeModule,
    OrganizationBridgeModule,
    WorkflowRegistryBridgeModule,
    SkillRegistryBridgeModule,

    // Governance modules
    AuthModule,
    UserModule,
    OrganizationModule,

    // Registry-release modules
    SkillModule,
    BuiltinSkillModule,
    ExecutionFlowModule,
    TemporalWorkflowModule,
    ReleaseManagerRuntimeAdapterModule,
    CapabilityReleaseModule,
    SystemBackupModule,
    ImChannelModule,
    UserConnectionModule,
    WorkspaceModule,
    WorkbenchTodoModule,
    WorkbenchInboxModule,
    WorkbenchCoordinationModule,
  ],
  providers: [
    // Global JWT guard - applied to all routes by default
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global RBAC guard - applied after JWT guard
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
  ],
})
export class AppModule {}
