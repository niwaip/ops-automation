import { Module } from '@nestjs/common';
import { StorageConfigService } from './storage-config.service';
import { StorageConfigController } from './storage-config.controller';

@Module({
  controllers: [StorageConfigController],
  providers: [StorageConfigService],
  exports: [StorageConfigService],
})
export class StorageConfigModule {}
