import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthModule, JwtAuthGuard, RbacGuard, UserModule } from '@ops/identity-access';
import { OrganizationModule } from '@ops/organization';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CapabilityReleaseModule } from '@ops/release-manager/release';
import { SkillModule } from '@ops/skill-registry/registry';
import { ExecutionFlowModule } from '@ops/workflow-registry/flow-template';
import { TemporalWorkflowModule } from '@ops/workflow-registry/temporal';
import { ReleaseManagerRuntimeAdapterModule } from './release-manager/platform/release-manager-runtime-adapter.module';
import { PrismaModule } from './prisma/prisma.module';
import { IdentityAccessBridgeModule } from './governance/identity-access/identity-access-bridge.module';
import { OrganizationBridgeModule } from './governance/organization/organization-bridge.module';
import { WorkflowRegistryBridgeModule } from './workflow-registry/platform/workflow-registry-bridge.module';
import { SkillRegistryBridgeModule } from './skill-registry/platform/skill-registry-bridge.module';
import { WorkbenchBridgeModule } from './governance/workbench/workbench-bridge.module';
import { ImGatewayBridgeModule } from './governance/im-gateway/im-gateway-bridge.module';
import { SystemBackupBridgeModule } from './governance/system-backup/system-backup-bridge.module';

import { BuiltinSkillModule } from '@ops/skill-registry/builtin';
import {
  UserConnectionModule,
  UserCredentialModule,
  WorkspaceModule,
  WorkbenchTodoModule,
  WorkbenchInboxModule,
  WorkbenchCoordinationModule,
} from '@ops/workbench';
import { SystemBackupModule } from '@ops/system-backup';
import { ImChannelModule } from '@ops/im-gateway';

import { JwtSecretValidatorService } from './jwt-secret-validator.service';

@Module({
  imports: [
    // Passport module for JWT authentication
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // JWT module configuration
    JwtModule.register({
      global: true,
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
    WorkbenchBridgeModule,
    ImGatewayBridgeModule,
    SystemBackupBridgeModule,

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
    UserCredentialModule,
    WorkspaceModule,
    WorkbenchTodoModule,
    WorkbenchInboxModule,
    WorkbenchCoordinationModule,
  ],
  providers: [
    Reflector,
    JwtSecretValidatorService,
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
