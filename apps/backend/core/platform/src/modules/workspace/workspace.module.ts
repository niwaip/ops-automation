import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { LocalDiskStorageService } from './storage/local-disk-storage.service';
import { STORAGE_DRIVER } from './storage/storage-driver.interface';
import { WorkspaceContentIndexerService } from './workspace-content-indexer.service';
import { WorkspaceDigestService } from './workspace-digest.service';
import { WorkspaceNoteService } from './workspace-note.service';

@Module({
  controllers: [WorkspaceController],
  providers: [
    WorkspaceService,
    WorkspaceNoteService,
    WorkspaceContentIndexerService,
    WorkspaceDigestService,
    LocalDiskStorageService,
    {
      provide: STORAGE_DRIVER,
      useExisting: LocalDiskStorageService,
    },
  ],
  exports: [
    WorkspaceService,
    WorkspaceNoteService,
    WorkspaceContentIndexerService,
    WorkspaceDigestService,
    STORAGE_DRIVER,
  ],
})
export class WorkspaceModule {}
