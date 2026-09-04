import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule, JwtAuthGuard, RbacGuard, UserModule } from '@ops/identity-access';
import { OrganizationModule } from '@ops/organization';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CapabilityReleaseModule } from '@ops/release-manager/release';
import { SkillModule } from './modules/skill/skill.module';
import { ExecutionFlowModule } from './modules/execution-flow/execution-flow.module';
import { TemporalWorkflowModule } from './modules/temporal-workflow/temporal-workflow.module';
import { ReleaseManagerRuntimeAdapterModule } from './release-manager/platform/release-manager-runtime-adapter.module';
import { PrismaModule } from './prisma/prisma.module';
import { IdentityAccessBridgeModule } from './governance/identity-access/identity-access-bridge.module';
import { OrganizationBridgeModule } from './governance/organization/organization-bridge.module';

import { BuiltinSkillModule } from './modules/builtin-skill/builtin-skill.module';
import { SystemBackupModule } from './modules/system-backup/system-backup.module';
import { ImChannelModule } from './modules/im-channel/im-channel.module';
import { UserConnectionModule } from './modules/user-connection/user-connection.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';

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
