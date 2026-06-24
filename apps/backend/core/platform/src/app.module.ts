import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from './modules/auth';
import { UserModule } from './modules/user';
import { SkillModule } from './skill-registry/registry';
import { ExecutionFlowModule } from './workflow-registry/flow-template';
import { TemporalWorkflowModule } from './workflow-registry/workflow-template';
import { CapabilityReleaseModule } from './release-manager/release';
import { OrganizationModule } from './modules/organization';
import { PrismaModule } from './prisma/prisma.module';
import { IdentityAccessBridgeModule } from './governance/identity-access/identity-access-bridge.module';
import { JwtAuthGuard, RbacGuard } from './guards';

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

    // Governance modules
    AuthModule,
    UserModule,
    OrganizationModule,

    // Registry-release modules
    SkillModule,
    ExecutionFlowModule,
    TemporalWorkflowModule,
    CapabilityReleaseModule,
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
