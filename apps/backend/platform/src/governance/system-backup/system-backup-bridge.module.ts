import { Global, Module } from '@nestjs/common';
import { SYSTEM_BACKUP_PRISMA } from '@ops/system-backup';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: SYSTEM_BACKUP_PRISMA,
      useExisting: PrismaService,
    },
  ],
  exports: [SYSTEM_BACKUP_PRISMA],
})
export class SystemBackupBridgeModule {}
