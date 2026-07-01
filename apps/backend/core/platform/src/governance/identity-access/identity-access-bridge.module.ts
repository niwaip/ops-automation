import { Global, Module } from '@nestjs/common';
import {
  IDENTITY_ACCESS_AUTH_REPOSITORY,
  IDENTITY_ACCESS_USER_READER,
  IDENTITY_ACCESS_USER_MANAGEMENT_REPOSITORY,
  RBAC_PERMISSION_READER,
} from '@ops/identity-access';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlatformIdentityAccessAuthRepository } from './auth-repository.service';
import { PlatformIdentityAccessUserReader } from './identity-access-user-reader.service';
import { PlatformRbacPermissionReader } from './rbac-permission-reader.service';
import { PlatformIdentityAccessUserManagementRepository } from './user-management-repository.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    PlatformIdentityAccessAuthRepository,
    PlatformIdentityAccessUserReader,
    PlatformIdentityAccessUserManagementRepository,
    PlatformRbacPermissionReader,
    {
      provide: IDENTITY_ACCESS_AUTH_REPOSITORY,
      useExisting: PlatformIdentityAccessAuthRepository,
    },
    {
      provide: IDENTITY_ACCESS_USER_READER,
      useExisting: PlatformIdentityAccessUserReader,
    },
    {
      provide: IDENTITY_ACCESS_USER_MANAGEMENT_REPOSITORY,
      useExisting: PlatformIdentityAccessUserManagementRepository,
    },
    {
      provide: RBAC_PERMISSION_READER,
      useExisting: PlatformRbacPermissionReader,
    },
  ],
  exports: [
    IDENTITY_ACCESS_AUTH_REPOSITORY,
    IDENTITY_ACCESS_USER_READER,
    IDENTITY_ACCESS_USER_MANAGEMENT_REPOSITORY,
    RBAC_PERMISSION_READER,
  ],
})
export class IdentityAccessBridgeModule {}
