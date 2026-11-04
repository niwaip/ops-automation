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
      const [policies, recipes, aliases, bindings] = await Promise.all([
        this.prisma.taskPolicySet ? this.prisma.taskPolicySet.count() : 0,
        this.prisma.taskRecipe ? this.prisma.taskRecipe.count() : 0,
        this.prisma.taskCommandAlias ? this.prisma.taskCommandAlias.count() : 0,
        this.prisma.taskCapabilityBinding ? this.prisma.taskCapabilityBinding.count() : 0,
      ]);
      return policies + recipes + aliases + bindings;
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
    capabilityBindings?: any[];
  }): Promise<BackupModulePreview> {
    const policySets = backupData?.policySets || [];
    const recipes = backupData?.recipes || [];
    const commandAliases = backupData?.commandAliases || [];
    const capabilityBindings = backupData?.capabilityBindings || [];

    const allItems = [
      ...policySets.map((p) => ({ ...p, _type: 'PolicySet' })),
      ...recipes.map((r) => ({ ...r, _type: 'Recipe' })),
      ...commandAliases.map((a) => ({ ...a, _type: 'Alias' })),
      ...capabilityBindings.map((b) => ({ ...b, _type: 'CapabilityBinding' })),
    ];

    const currentMap = new Map<string, any>();
    try {
      if (this.prisma.taskPolicySet) {
        const currentPolicySets = await this.prisma.taskPolicySet.findMany({
          select: { id: true, name: true },
        });
        for (const p of currentPolicySets) {
          currentMap.set(`policyset:${p.id}`, p);
          if (p.name) currentMap.set(`policyset:name:${p.name}`, p);
        }
      }
      if (this.prisma.taskRecipe) {
        const currentRecipes = await this.prisma.taskRecipe.findMany({
          select: { id: true, policySetId: true, recipeKey: true, version: true, name: true },
        });
        for (const r of currentRecipes) {
          currentMap.set(`recipe:${r.id}`, r);
          currentMap.set(`recipe:${r.policySetId}:${r.recipeKey}:${r.version}`, r);
        }
      }
      if (this.prisma.taskCommandAlias) {
        const currentAliases = await this.prisma.taskCommandAlias.findMany({
          select: { id: true, policySetId: true, canonicalCommand: true, alias: true },
        });
        for (const a of currentAliases) {
          currentMap.set(`alias:${a.id}`, a);
          currentMap.set(`alias:${a.policySetId}:${a.canonicalCommand}:${a.alias}`, a);
        }
      }
      if (this.prisma.taskCapabilityBinding) {
        const currentBindings = await this.prisma.taskCapabilityBinding.findMany({
          select: { id: true, policySetId: true, capabilityRole: true, capabilityId: true, capabilityVersion: true },
        });
        for (const b of currentBindings) {
          currentMap.set(`binding:${b.id}`, b);
          currentMap.set(`binding:${b.policySetId}:${b.capabilityRole}:${b.capabilityId}:${b.capabilityVersion || ''}`, b);
        }
      }
    } catch (err) {
      this.logger.debug(`Error reading current task policies for preview: ${err}`);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of allItems) {
      const id = item.id;
      let name = item.name || item.alias || item.canonicalCommand || id;
      if (item._type === 'CapabilityBinding') {
        name = `${item.capabilityRole} -> ${item.capabilityId}`;
      }

      let exists = false;
      if (item._type === 'PolicySet') {
        exists = currentMap.has(`policyset:${id}`) || (item.name && currentMap.has(`policyset:name:${item.name}`));
      } else if (item._type === 'Recipe') {
        exists = currentMap.has(`recipe:${id}`) || currentMap.has(`recipe:${item.policySetId}:${item.recipeKey}:${item.version}`);
      } else if (item._type === 'Alias') {
        exists = currentMap.has(`alias:${id}`) || currentMap.has(`alias:${item.policySetId}:${item.canonicalCommand}:${item.alias}`);
      } else if (item._type === 'CapabilityBinding') {
        exists = currentMap.has(`binding:${id}`) || currentMap.has(`binding:${item.policySetId}:${item.capabilityRole}:${item.capabilityId}:${item.capabilityVersion || ''}`);
      }

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

    // 1. Task Policy Sets
    const policySets = backupData.policySets || [];
    for (const p of policySets) {
      try {
        if (!this.prisma.taskPolicySet || !p.id) continue;
        const exists = await this.prisma.taskPolicySet.findUnique({
          where: { id: p.id },
        });
        if (exists) {
          if (strategy === 'skip_existing') {
            skipped += 1;
          } else {
            const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = p;
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

    // 2. Task Recipes
    const recipes = backupData.recipes || [];
    for (const r of recipes) {
      try {
        if (!this.prisma.taskRecipe || !r.id || !r.policySetId) continue;
        const parentExists = await this.prisma.taskPolicySet.findUnique({
          where: { id: r.policySetId },
        });
        if (!parentExists) continue;

        let exists = await this.prisma.taskRecipe.findUnique({
          where: { id: r.id },
        });
        if (!exists && r.recipeKey && r.version) {
          exists = await this.prisma.taskRecipe.findUnique({
            where: {
              policySetId_recipeKey_version: {
                policySetId: r.policySetId,
                recipeKey: r.recipeKey,
                version: r.version,
              },
            },
          });
        }

        if (exists) {
          if (strategy === 'skip_existing') {
            skipped += 1;
          } else {
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = r;
            await this.prisma.taskRecipe.update({
              where: { id: exists.id },
              data: rest,
            });
            updated += 1;
          }
        } else {
          await this.prisma.taskRecipe.create({
            data: r,
          });
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import task recipe ${r.id}: ${err}`);
        skipped += 1;
      }
    }

    // 3. Command Aliases
    const aliases = backupData.commandAliases || [];
    for (const a of aliases) {
      try {
        if (!this.prisma.taskCommandAlias || !a.id || !a.policySetId) continue;
        const parentExists = await this.prisma.taskPolicySet.findUnique({
          where: { id: a.policySetId },
        });
        if (!parentExists) continue;

        let exists = await this.prisma.taskCommandAlias.findUnique({
          where: { id: a.id },
        });
        if (!exists && a.canonicalCommand && a.alias) {
          exists = await this.prisma.taskCommandAlias.findUnique({
            where: {
              policySetId_canonicalCommand_alias: {
                policySetId: a.policySetId,
                canonicalCommand: a.canonicalCommand,
                alias: a.alias,
              },
            },
          });
        }

        if (exists) {
          if (strategy === 'skip_existing') {
            skipped += 1;
          } else {
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = a;
            await this.prisma.taskCommandAlias.update({
              where: { id: exists.id },
              data: rest,
            });
            updated += 1;
          }
        } else {
          await this.prisma.taskCommandAlias.create({
            data: a,
          });
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import command alias ${a.id}: ${err}`);
        skipped += 1;
      }
    }

    // 4. Capability Bindings
    const bindings = backupData.capabilityBindings || [];
    for (const b of bindings) {
      try {
        if (!this.prisma.taskCapabilityBinding || !b.id || !b.policySetId) continue;
        const parentExists = await this.prisma.taskPolicySet.findUnique({
          where: { id: b.policySetId },
        });
        if (!parentExists) continue;

        let exists = await this.prisma.taskCapabilityBinding.findUnique({
          where: { id: b.id },
        });
        if (!exists && b.capabilityRole && b.capabilityId) {
          exists = await this.prisma.taskCapabilityBinding.findUnique({
            where: {
              policySetId_capabilityRole_capabilityId_capabilityVersion: {
                policySetId: b.policySetId,
                capabilityRole: b.capabilityRole,
                capabilityId: b.capabilityId,
                capabilityVersion: b.capabilityVersion || null,
              },
            },
          });
        }

        if (exists) {
          if (strategy === 'skip_existing') {
            skipped += 1;
          } else {
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = b;
            await this.prisma.taskCapabilityBinding.update({
              where: { id: exists.id },
              data: rest,
            });
            updated += 1;
          }
        } else {
          await this.prisma.taskCapabilityBinding.create({
            data: b,
          });
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import capability binding ${b.id}: ${err}`);
        skipped += 1;
      }
    }

    return { created, updated, skipped };
  }
}
