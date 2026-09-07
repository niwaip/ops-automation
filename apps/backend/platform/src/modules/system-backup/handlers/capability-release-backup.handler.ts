import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class CapabilityReleaseBackupHandler {
  private readonly logger = new Logger(CapabilityReleaseBackupHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async count(): Promise<number> {
    return this.prisma.capabilityRelease.count();
  }

  async export(): Promise<{
    capabilityReleases: any[];
    capabilitySourceSnapshots: any[];
    capabilityBuilds: any[];
    skillDrafts: any[];
  }> {
    const [capabilityReleases, capabilitySourceSnapshots, capabilityBuilds, skillDrafts] =
      await Promise.all([
        this.prisma.capabilityRelease.findMany(),
        this.prisma.capabilitySourceSnapshot.findMany(),
        this.prisma.capabilityBuild.findMany(),
        this.prisma.skillDraft.findMany(),
      ]);

    return {
      capabilityReleases,
      capabilitySourceSnapshots,
      capabilityBuilds,
      skillDrafts,
    };
  }

  async preview(backupData?: {
    capabilityReleases?: any[];
  }): Promise<BackupModulePreview> {
    const backupReleases = backupData?.capabilityReleases || [];
    const currentReleases = await this.prisma.capabilityRelease.findMany({
      select: { id: true, sourceName: true, releaseVersion: true },
    });
    const currentMap = new Map<string, any>();
    for (const r of currentReleases) {
      currentMap.set(r.id, r);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of backupReleases) {
      const id = item.id;
      const name = `${item.sourceName || 'Capability'} (v${item.releaseVersion || 1})`;
      const exists = currentMap.has(id);
      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `Release: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `Release: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'capabilityReleases',
      totalInBackup: backupReleases.length,
      newCount,
      conflictCount,
      items,
    };
  }

  async import(
    backupData: {
      capabilityReleases?: any[];
      capabilitySourceSnapshots?: any[];
      capabilityBuilds?: any[];
      skillDrafts?: any[];
    },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // 1. Capability Releases
    const releases = backupData.capabilityReleases || [];
    for (const rel of releases) {
      if (!rel.id) continue;
      const existing = await this.prisma.capabilityRelease.findUnique({ where: { id: rel.id } });
      if (existing) {
        if (strategy === 'merge_override') {
          await this.prisma.capabilityRelease.update({
            where: { id: rel.id },
            data: {
              sourceType: rel.sourceType || 'workflow',
              sourceId: rel.sourceId,
              sourceName: rel.sourceName,
              sourceStatus: rel.sourceStatus || 'draft',
              releaseVersion: rel.releaseVersion || 1,
              status: rel.status || 'published',
              approvalStatus: rel.approvalStatus || 'not_required',
              deploymentStatus: rel.deploymentStatus || 'deployed',
              publishedSkillId: rel.publishedSkillId,
              createdBy: rel.createdBy,
            },
          });
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        await this.prisma.capabilityRelease.create({
          data: {
            id: rel.id,
            sourceType: rel.sourceType || 'workflow',
            sourceId: rel.sourceId,
            sourceName: rel.sourceName,
            sourceStatus: rel.sourceStatus || 'draft',
            releaseVersion: rel.releaseVersion || 1,
            status: rel.status || 'published',
            approvalStatus: rel.approvalStatus || 'not_required',
            deploymentStatus: rel.deploymentStatus || 'deployed',
            publishedSkillId: rel.publishedSkillId,
            createdBy: rel.createdBy,
          },
        });
        created += 1;
      }
    }

    // 2. Source Snapshots
    const snapshots = backupData.capabilitySourceSnapshots || [];
    for (const snap of snapshots) {
      if (!snap.id || !snap.releaseId) continue;
      const existing = await this.prisma.capabilitySourceSnapshot.findUnique({
        where: { id: snap.id },
      });
      if (existing) {
        if (strategy === 'merge_override') {
          await this.prisma.capabilitySourceSnapshot.update({
            where: { id: snap.id },
            data: {
              sourceType: snap.sourceType || 'workflow',
              sourceId: snap.sourceId,
              sourcePayloadJson: snap.sourcePayloadJson || {},
              snapshotVersion: snap.snapshotVersion || 1,
              summary: snap.summary,
              createdBy: snap.createdBy,
            },
          });
        }
      } else {
        await this.prisma.capabilitySourceSnapshot.create({
          data: {
            id: snap.id,
            releaseId: snap.releaseId,
            sourceType: snap.sourceType || 'workflow',
            sourceId: snap.sourceId,
            sourcePayloadJson: snap.sourcePayloadJson || {},
            snapshotVersion: snap.snapshotVersion || 1,
            summary: snap.summary,
            createdBy: snap.createdBy,
          },
        });
      }
    }

    // 3. Capability Builds
    const builds = backupData.capabilityBuilds || [];
    for (const b of builds) {
      if (!b.id || !b.releaseId) continue;
      const existing = await this.prisma.capabilityBuild.findUnique({ where: { id: b.id } });
      if (existing) {
        if (strategy === 'merge_override') {
          await this.prisma.capabilityBuild.update({
            where: { id: b.id },
            data: {
              buildType: b.buildType || 'llm',
              modelId: b.modelId || 'default',
              promptVersion: b.promptVersion,
              promptSnapshot: b.promptSnapshot,
              inputSnapshotJson: b.inputSnapshotJson || {},
              generatedCode: b.generatedCode || '',
              generatedConfigJson: b.generatedConfigJson,
              logsJson: b.logsJson || [],
              diffSummary: b.diffSummary,
              status: b.status || 'succeeded',
              errorSummary: b.errorSummary,
              createdBy: b.createdBy,
            },
          });
        }
      } else {
        await this.prisma.capabilityBuild.create({
          data: {
            id: b.id,
            releaseId: b.releaseId,
            sourceSnapshotId: b.sourceSnapshotId,
            buildType: b.buildType || 'llm',
            modelId: b.modelId || 'default',
            promptVersion: b.promptVersion,
            promptSnapshot: b.promptSnapshot,
            inputSnapshotJson: b.inputSnapshotJson || {},
            generatedCode: b.generatedCode || '',
            generatedConfigJson: b.generatedConfigJson,
            logsJson: b.logsJson || [],
            diffSummary: b.diffSummary,
            status: b.status || 'succeeded',
            errorSummary: b.errorSummary,
            createdBy: b.createdBy,
          },
        });
      }
    }

    // 4. Update Release references
    for (const rel of releases) {
      if (!rel.id) continue;
      try {
        await this.prisma.capabilityRelease.update({
          where: { id: rel.id },
          data: {
            currentSourceSnapshotId: rel.currentSourceSnapshotId,
            currentBuildId: rel.currentBuildId,
          },
        });
      } catch (err) {
        this.logger.debug(`Update release reference ignored: ${err}`);
      }
    }

    // 5. Skill Drafts
    const drafts = backupData.skillDrafts || [];
    for (const draft of drafts) {
      if (!draft.id || !draft.releaseId) continue;
      const existing = await this.prisma.skillDraft.findUnique({ where: { id: draft.id } });
      if (existing) {
        if (strategy === 'merge_override') {
          await this.prisma.skillDraft.update({
            where: { id: draft.id },
            data: {
              sourceType: draft.sourceType || 'workflow',
              name: draft.name || 'Draft',
              description: draft.description || '',
              draftPayloadJson: draft.draftPayloadJson || {},
              status: draft.status || 'draft',
              createdBy: draft.createdBy,
            },
          });
        }
      } else {
        await this.prisma.skillDraft.create({
          data: {
            id: draft.id,
            releaseId: draft.releaseId,
            sourceType: draft.sourceType || 'workflow',
            name: draft.name || 'Draft',
            description: draft.description || '',
            draftPayloadJson: draft.draftPayloadJson || {},
            status: draft.status || 'draft',
            createdBy: draft.createdBy,
          },
        });
      }
    }

    return { created, updated, skipped };
  }
}
