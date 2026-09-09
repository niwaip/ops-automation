import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_BACKUP_PRISMA, SystemBackupPrismaPort } from '../ports';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class WorkspaceBackupHandler {
  private readonly logger = new Logger(WorkspaceBackupHandler.name);

  constructor(
    @Inject(SYSTEM_BACKUP_PRISMA) private readonly prisma: SystemBackupPrismaPort
  ) {}

  async count(): Promise<number> {
    try {
      if (this.prisma.workspace) {
        return await this.prisma.workspace.count();
      }
      return 0;
    } catch {
      return 0;
    }
  }

  async export(): Promise<{
    workspaces: any[];
    documents: any[];
  }> {
    try {
      const [workspaces, documents] = await Promise.all([
        this.prisma.workspace ? this.prisma.workspace.findMany() : [],
        this.prisma.workspaceDocument ? this.prisma.workspaceDocument.findMany() : [],
      ]);
      return {
        workspaces: Array.isArray(workspaces) ? workspaces : [],
        documents: Array.isArray(documents) ? documents : [],
      };
    } catch (err) {
      this.logger.warn(`Failed to export workspaces: ${err}`);
      return { workspaces: [], documents: [] };
    }
  }

  async preview(backupData?: {
    workspaces?: any[];
  }): Promise<BackupModulePreview> {
    const workspaces = backupData?.workspaces || [];
    let currentWorkspaces: any[] = [];
    try {
      if (this.prisma.workspace) {
        currentWorkspaces = await this.prisma.workspace.findMany({
          select: { id: true, name: true },
        });
      }
    } catch {
      currentWorkspaces = [];
    }

    const currentMap = new Map<string, any>();
    for (const w of currentWorkspaces) {
      currentMap.set(w.id, w);
      if (w.name) currentMap.set(`name:${w.name}`, w);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of workspaces) {
      const id = item.id;
      const name = item.name || id;
      const exists = currentMap.has(id) || currentMap.has(`name:${name}`);
      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `Workspace: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `Workspace: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'workspaces',
      totalInBackup: workspaces.length,
      newCount,
      conflictCount,
      items,
    };
  }

  async import(
    backupData: {
      workspaces?: any[];
      documents?: any[];
    },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const workspaces = backupData.workspaces || [];
    for (const w of workspaces) {
      try {
        if (!this.prisma.workspace) continue;
        const exists = await this.prisma.workspace.findUnique({
          where: { id: w.id },
        });
        if (exists) {
          if (strategy === 'skip_existing') {
            skipped += 1;
          } else {
            const { id, createdAt, updatedAt, ...rest } = w;
            await this.prisma.workspace.update({
              where: { id },
              data: rest,
            });
            updated += 1;
          }
        } else {
          await this.prisma.workspace.create({
            data: w,
          });
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import workspace ${w.id}: ${err}`);
        skipped += 1;
      }
    }

    return { created, updated, skipped };
  }
}
