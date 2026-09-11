import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_BACKUP_PRISMA, SystemBackupPrismaPort } from '../ports';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class TaskPolicyBackupHandler {
  private readonly logger = new Logger(TaskPolicyBackupHandler.name);

  constructor(
    @Inject(SYSTEM_BACKUP_PRISMA) private readonly prisma: SystemBackupPrismaPort
  ) {}

  async count(): Promise<number> {
    try {
      const [policies, recipes, aliases] = await Promise.all([
        this.prisma.taskPolicySet ? this.prisma.taskPolicySet.count() : 0,
        this.prisma.taskRecipe ? this.prisma.taskRecipe.count() : 0,
        this.prisma.taskCommandAlias ? this.prisma.taskCommandAlias.count() : 0,
      ]);
      return policies + recipes + aliases;
    } catch {
      return 0;
    }
  }

  async export(): Promise<{
    policySets: any[];
    recipes: any[];
    commandAliases: any[];
    capabilityBindings: any[];
  }> {
    try {
      const [policySets, recipes, commandAliases, capabilityBindings] = await Promise.all([
        this.prisma.taskPolicySet ? this.prisma.taskPolicySet.findMany() : [],
        this.prisma.taskRecipe ? this.prisma.taskRecipe.findMany() : [],
        this.prisma.taskCommandAlias ? this.prisma.taskCommandAlias.findMany() : [],
        this.prisma.taskCapabilityBinding ? this.prisma.taskCapabilityBinding.findMany() : [],
      ]);
      return {
        policySets: Array.isArray(policySets) ? policySets : [],
        recipes: Array.isArray(recipes) ? recipes : [],
        commandAliases: Array.isArray(commandAliases) ? commandAliases : [],
        capabilityBindings: Array.isArray(capabilityBindings) ? capabilityBindings : [],
      };
    } catch (err) {
      this.logger.warn(`Failed to export task policies: ${err}`);
      return {
        policySets: [],
        recipes: [],
        commandAliases: [],
        capabilityBindings: [],
      };
    }
  }

  async preview(backupData?: {
    policySets?: any[];
    recipes?: any[];
    commandAliases?: any[];
  }): Promise<BackupModulePreview> {
    const policySets = backupData?.policySets || [];
    const recipes = backupData?.recipes || [];
    const commandAliases = backupData?.commandAliases || [];

    const allItems = [
      ...policySets.map((p) => ({ ...p, _type: 'PolicySet' })),
      ...recipes.map((r) => ({ ...r, _type: 'Recipe' })),
      ...commandAliases.map((a) => ({ ...a, _type: 'Alias' })),
    ];

    let currentPolicySets: any[] = [];
    try {
      if (this.prisma.taskPolicySet) {
        currentPolicySets = await this.prisma.taskPolicySet.findMany({
          select: { id: true, name: true },
        });
      }
    } catch {
      currentPolicySets = [];
    }

    const currentMap = new Map<string, any>();
    for (const p of currentPolicySets) {
      currentMap.set(p.id, p);
      if (p.name) currentMap.set(`name:${p.name}`, p);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of allItems) {
      const id = item.id;
      const name = item.name || item.alias || id;
      const exists = currentMap.has(id) || currentMap.has(`name:${name}`);
      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `${item._type}: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `${item._type}: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'taskPolicies',
      totalInBackup: allItems.length,
      newCount,
      conflictCount,
      items,
    };
  }

  async import(
    backupData: {
      policySets?: any[];
      recipes?: any[];
      commandAliases?: any[];
      capabilityBindings?: any[];
    },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const policySets = backupData.policySets || [];
    for (const p of policySets) {
      try {
        if (!this.prisma.taskPolicySet) continue;
        const exists = await this.prisma.taskPolicySet.findUnique({
          where: { id: p.id },
        });
        if (exists) {
          if (strategy === 'skip_existing') {
            skipped += 1;
          } else {
            const { id, createdAt, updatedAt, ...rest } = p;
            await this.prisma.taskPolicySet.update({
              where: { id },
              data: rest,
            });
            updated += 1;
          }
        } else {
          await this.prisma.taskPolicySet.create({
            data: p,
          });
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import policySet ${p.id}: ${err}`);
        skipped += 1;
      }
    }

    return { created, updated, skipped };
  }
}
