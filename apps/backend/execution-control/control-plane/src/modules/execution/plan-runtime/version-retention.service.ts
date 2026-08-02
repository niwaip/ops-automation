import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily sweep
const TERMINAL_RELEASE_STATUSES = ['published', 'deployed', 'rolled_back'];

/**
 * Version retention policy (design doc §15.4 P3 item 6).
 *
 * Bounded growth for long-lived contract artifacts:
 * - `builtin_skill_versions`: keep the active version + the N-1 most recent
 *   ones per skill. Versions still referenced by frozen execution plans
 *   (any plan node's `skillVersion` equals the version's `definitionVersion`,
 *   fix ⑪) or by deployments are never deleted. Every deletion is recorded as
 *   a `version_deleted_by_retention` audit event.
 * - `capability_releases`: old terminal releases get `archived_at` stamped,
 *   then their orphaned validations / builds / snapshots are pruned.
 *
 * Safety: OFF by default (`VERSION_RETENTION_ENABLED !== 'true'` — nothing is
 * scheduled and nothing is ever deleted).
 */
@Injectable()
export class VersionRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VersionRetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  public onModuleInit(): void {
    if (!this.isEnabled()) return;
    this.logger.log(
      `Version retention scheduled — sweep every ${SWEEP_INTERVAL_MS / 1000}s ` +
        `(max ${this.getMaxVersions()} versions/skill, ${this.getWindowDays()}-day release window)`
    );
    this.timer = setInterval(() => {
      this.retainActiveSkillVersions().catch((err: unknown) =>
        this.logger.error(`retainActiveSkillVersions failed: ${err instanceof Error ? err.message : String(err)}`)
      );
      this.pruneOldReleases().catch((err: unknown) =>
        this.logger.error(`pruneOldReleases failed: ${err instanceof Error ? err.message : String(err)}`)
      );
    }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  public onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  public isEnabled(): boolean {
    return process.env.VERSION_RETENTION_ENABLED === 'true';
  }

  public getMaxVersions(): number {
    const raw = Number.parseInt(process.env.VERSION_RETENTION_MAX_VERSIONS ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 10;
  }

  public getWindowDays(): number {
    const raw = Number.parseInt(process.env.VERSION_RETENTION_WINDOW_DAYS ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 90;
  }

  /**
   * Per-skill cleanup: keep active version + N-1 most recent, delete the rest
   * unless referenced by an execution plan or deployment.
   */
  public async retainActiveSkillVersions(): Promise<{
    deleted: number;
    keptByReference: number;
  }> {
    const maxVersions = this.getMaxVersions();
    const skills = await this.prisma.builtinSkill.findMany({
      select: { id: true, capabilityKey: true, activeVersionId: true },
    });

    let deleted = 0;
    let keptByReference = 0;

    for (const skill of skills) {
      const versions = await this.prisma.builtinSkillVersion.findMany({
        where: { builtinSkillId: skill.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, definitionVersion: true },
      });
      if (versions.length <= maxVersions) continue;

      const keepIds = new Set<string>(
        versions.slice(0, maxVersions).map((v) => v.id)
      );
      if (skill.activeVersionId) keepIds.add(skill.activeVersionId);

      for (const candidate of versions) {
        if (keepIds.has(candidate.id)) continue;
        if (await this.isVersionReferenced(candidate.id, candidate.definitionVersion)) {
          keptByReference += 1;
          continue;
        }
        await this.prisma.builtinSkillVersion.delete({ where: { id: candidate.id } });
        await this.prisma.builtinSkillAuditEvent.create({
          data: {
            builtinSkillId: skill.id,
            action: 'version_deleted_by_retention',
            versionId: candidate.id,
            payload: {
              definitionVersion: candidate.definitionVersion,
              maxVersions,
              capabilityKey: skill.capabilityKey,
            },
          },
        });
        deleted += 1;
      }
    }

    if (deleted + keptByReference > 0) {
      this.logger.log(
        `Version retention sweep: deleted ${deleted} version(s), kept ${keptByReference} referenced version(s)`
      );
    }
    return { deleted, keptByReference };
  }

  /**
   * Release hygiene: stamp `archived_at` on old terminal releases, then prune
   * their orphaned validations → builds → snapshots (FK-safe order).
   */
  public async pruneOldReleases(): Promise<{
    archivedReleases: number;
    prunedValidations: number;
    prunedBuilds: number;
    prunedSnapshots: number;
  }> {
    const windowDays = this.getWindowDays();

    const archivedReleases = await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET archived_at = now(), updated_at = now()
       WHERE archived_at IS NULL
         AND created_at < now() - ($1 * interval '1 day')
         AND status IN ('published', 'deployed', 'rolled_back')`,
      windowDays
    );

    const archivedReleaseIds =
      `(SELECT id FROM capability_releases WHERE archived_at IS NOT NULL AND archived_at < now() - ($1 * interval '1 day'))`;

    const prunedValidations = await this.prisma.$executeRawUnsafe(
      `DELETE FROM capability_validations WHERE release_id IN ${archivedReleaseIds}`,
      windowDays
    );
    const prunedBuilds = await this.prisma.$executeRawUnsafe(
      `DELETE FROM capability_builds WHERE release_id IN ${archivedReleaseIds}`,
      windowDays
    );
    const prunedSnapshots = await this.prisma.$executeRawUnsafe(
      `DELETE FROM capability_source_snapshots WHERE release_id IN ${archivedReleaseIds}`,
      windowDays
    );

    this.logger.log(
      `Release pruning sweep: archived ${archivedReleases} release(s), ` +
        `pruned ${prunedValidations} validation(s), ${prunedBuilds} build(s), ${prunedSnapshots} snapshot(s)`
    );
    return { archivedReleases, prunedValidations, prunedBuilds, prunedSnapshots };
  }

  /**
   * Fix ⑪: frozen plans reference a version by `definitionVersion` on each
   * plan node (`nodes[].skillVersion`, e.g. "1.0.0") — NOT by the row UUID and
   * NOT at the plan root. The old `plan_json @> {"skillVersion": <uuid>}`
   * containment check could never match, so referenced versions were
   * unprotected and deleted while frozen plans still bound them.
   */
  private async isVersionReferenced(
    versionId: string,
    definitionVersion: string
  ): Promise<boolean> {
    const [plans, deployments] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT COUNT(*)::int AS count
         FROM execution_plans
         WHERE plan_json -> 'nodes' IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM jsonb_array_elements(plan_json -> 'nodes') AS node
             WHERE node->>'skillVersion' = $1
           )`,
        definitionVersion
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT COUNT(*)::int AS count FROM builtin_skill_deployments WHERE builtin_skill_version_id = $1::uuid`,
        versionId
      ),
    ]);
    return (plans?.[0]?.count ?? 0) > 0 || (deployments?.[0]?.count ?? 0) > 0;
  }
}
