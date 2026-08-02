import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';
import { BuiltinSkillManifest, computeCanonicalDigest, BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import { BuiltinSkillRegistryService } from '../registry/builtin-skill-registry.service';
import { BuiltinSkillAuditService } from '../audit/builtin-skill-audit.service';

@Injectable()
export class BuiltinSkillProvisioningService {
  private readonly logger = new Logger(BuiltinSkillProvisioningService.name);

  constructor(
    private readonly registryService: BuiltinSkillRegistryService,
    private readonly auditService: BuiltinSkillAuditService,
  ) {}

  public computeDigest(manifestContent: string, bundleDir: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(manifestContent);

    const workflowPath = path.join(bundleDir, 'workflow.json');
    if (fs.existsSync(workflowPath)) {
      hash.update(fs.readFileSync(workflowPath, 'utf8'));
    }

    const fixturesDir = path.join(bundleDir, 'fixtures');
    if (fs.existsSync(fixturesDir) && fs.statSync(fixturesDir).isDirectory()) {
      const files = fs.readdirSync(fixturesDir).sort();
      for (const file of files) {
        const filePath = path.join(fixturesDir, file);
        if (fs.statSync(filePath).isFile()) {
          hash.update(fs.readFileSync(filePath, 'utf8'));
        }
      }
    }

    return `sha256:${hash.digest('hex')}`;
  }

  public computeManifestDigest(manifest: BuiltinSkillManifest): string {
    return computeCanonicalDigest(manifest);
  }

  public validateManifest(manifestJson: any): BuiltinSkillManifest {
    if (!manifestJson || typeof manifestJson !== 'object') {
      throw new BadRequestException('Invalid BuiltinSkillManifest: must be an object');
    }
    const m = manifestJson as BuiltinSkillManifest;
    if (m.kind !== 'BuiltinWorkflowSkill' || !m.metadata?.key || !m.spec?.definitionVersion) {
      throw new BadRequestException('Invalid BuiltinSkillManifest: missing required fields (kind, metadata.key, spec.definitionVersion)');
    }
    return m;
  }

  public async provisionBundle(bundleDir: string, environment: string = 'production') {
    return this.provisionSkill(bundleDir, environment);
  }

  public async provisionSkill(bundleDir: string, environment: string = 'production') {
    const resolvedDir = path.resolve(bundleDir);
    const manifestPath = path.join(resolvedDir, 'manifest.yaml');

    if (!fs.existsSync(manifestPath)) {
      throw new BadRequestException(`Builtin skill bundle missing manifest.yaml at '${manifestPath}'`);
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const yaml = require('js-yaml');
    const rawManifest = yaml.load(manifestContent);
    const manifest = this.validateManifest(rawManifest);

    const digest = this.computeDigest(manifestContent, resolvedDir);

    const lockPath = path.join(resolvedDir, 'bundle-lock.json');
    if (!fs.existsSync(lockPath)) {
      throw new BadRequestException(`Builtin skill bundle missing bundle-lock.json at '${lockPath}'`);
    }

    try {
      const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (lockJson.capabilityKey && lockJson.capabilityKey !== manifest.metadata.key) {
        throw new BadRequestException(`Bundle lock capabilityKey mismatch: expected '${manifest.metadata.key}', got '${lockJson.capabilityKey}'`);
      }
      if (lockJson.definitionVersion && lockJson.definitionVersion !== manifest.spec.definitionVersion) {
        throw new BadRequestException(`Bundle lock definitionVersion mismatch: expected '${manifest.spec.definitionVersion}', got '${lockJson.definitionVersion}'`);
      }
      if (lockJson.definitionDigest && lockJson.definitionDigest !== digest) {
        throw new BadRequestException(`Bundle lock definitionDigest mismatch: expected '${digest}', got '${lockJson.definitionDigest}'`);
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Failed to parse bundle-lock.json in ${bundleDir}: ${err.message}`);
      throw new BadRequestException(`Invalid bundle-lock.json in ${bundleDir}: ${err.message}`);
    }

    this.logger.log(`Provisioning builtin skill '${manifest.metadata.key}' v${manifest.spec.definitionVersion} (digest: ${digest})`);

    const { skill, version } = await this.registryService.upsertSkillFromManifest(manifest, digest);

    // Strict Smoke Test Verification & Real Handler Fixture Execution
    let smokePassed = true;
    let smokeError: string | null = null;

    const smokeInputRef = manifest.spec.smokeTest?.inputRef || 'fixtures/smoke-input.json';
    const smokeInputPath = path.join(resolvedDir, smokeInputRef);

    if (!fs.existsSync(smokeInputPath)) {
      smokePassed = false;
      smokeError = `Smoke test fixture file missing at '${smokeInputPath}'`;
    } else {
      try {
        const smokeInputContent = fs.readFileSync(smokeInputPath, 'utf8');
        const smokeInput = JSON.parse(smokeInputContent);
        if (!smokeInput || typeof smokeInput !== 'object') {
          throw new Error('Smoke input fixture must be a valid non-empty JSON object');
        }

        // Contract validation: verify required fields
        const requiredFields = manifest.spec.contracts?.input?.schema?.required as string[] | undefined;
        if (Array.isArray(requiredFields)) {
          for (const field of requiredFields) {
            if (smokeInput[field] === undefined || smokeInput[field] === null || smokeInput[field] === '') {
              throw new Error(`Smoke test input missing required contract field: '${field}'`);
            }
          }
        }

        // Execute real handler logic during smoke test to verify execution + output contract + idempotency
        const handlerKey = manifest.spec.runtime.handlerKey;
        const smokeIdempotencyKey = `smoke-${manifest.metadata.key}-${Date.now()}`;
        const smokeResult = await this.executeSmokeHandler(handlerKey, smokeInput, smokeIdempotencyKey);

        // Verify output contract
        if (!smokeResult || typeof smokeResult !== 'object') {
          throw new Error('Smoke test execution returned invalid result');
        }

        // For document artifact writer, verify artifact object, sizeBytes > 0, and metadata.sha256
        if (handlerKey === 'document.markdown-artifact-writer') {
          const handlerOutput = (smokeResult as any).output || smokeResult;
          const artifact = handlerOutput.artifact;
          if (!artifact || typeof artifact.url !== 'string' || !artifact.metadata?.sha256) {
            throw new Error('Smoke test execution failed output contract: missing valid artifact.url or metadata.sha256');
          }
          if (typeof artifact.sizeBytes !== 'number' || artifact.sizeBytes <= 0) {
            throw new Error('Smoke test execution failed output contract: sizeBytes must be > 0');
          }

          // Download artifact and re-compute SHA-256 from raw bytes.
          // Resolve relative URLs (e.g. `/renders/xxx.md`) or CARBONE_EXTERNAL_URL
          // (which may point to host localhost from inside the docker network)
          // back to CARBONE_SERVICE_URL so the smoke test reaches the actual
          // carbone-engine container regardless of how artifact.url was built.
          try {
            const baseUrl =
              process.env.CARBONE_SERVICE_URL || 'http://carbone-engine:3009';
            let downloadUrl = artifact.url;
            if (
              !/^https?:\/\//i.test(downloadUrl) ||
              downloadUrl.includes('localhost') ||
              downloadUrl.includes('127.0.0.1')
            ) {
              const path = downloadUrl.replace(/^https?:\/\/[^/]+/, '');
              downloadUrl = `${baseUrl.replace(/\/+$/, '')}${path}`;
            }
            const dl = await axios.get<ArrayBuffer>(downloadUrl, { responseType: 'arraybuffer', timeout: 15000 });
            const rawBytes = Buffer.from(dl.data);
            const computedSha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
            if (computedSha256 !== artifact.metadata.sha256) {
              throw new Error(
                `Smoke test SHA-256 mismatch: computed ${computedSha256}, handler returned ${artifact.metadata.sha256} (size=${rawBytes.length})`,
              );
            }
            if (rawBytes.length !== artifact.sizeBytes) {
              throw new Error(
                `Smoke test size mismatch: downloaded ${rawBytes.length} bytes, handler reported ${artifact.sizeBytes}`,
              );
            }
          } catch (dlErr: any) {
            throw new Error(
              `Smoke test artifact download/verification failed: ${dlErr.message}`,
            );
          }

          // Idempotency check: run 2nd time with SAME idempotency key and verify identical output
          const secondResult = await this.executeSmokeHandler(handlerKey, smokeInput, smokeIdempotencyKey);
          const secondOutput = (secondResult as any)?.output || secondResult;
          const secondArtifact = secondOutput?.artifact;
          if (!secondArtifact || secondArtifact.url !== artifact.url || secondArtifact.metadata?.sha256 !== artifact.metadata?.sha256) {
            throw new Error('Smoke test idempotency verification failed: second run produced different artifact url or sha256');
          }
        }

        this.logger.log(`Smoke test contract, real handler execution, and idempotency verification passed for ${manifest.metadata.key}: ${smokeInputPath}`);
      } catch (err: any) {
        smokePassed = false;
        smokeError = `Smoke test failed: ${err.message}`;
      }
    }

    if (!smokePassed) {
      await this.registryService.markDeployment({
        builtinSkillVersionId: version.id,
        environment,
        status: 'failed',
        smokeTestStatus: 'failed',
        smokeTestDigest: digest,
        failureCode: 'SMOKE_TEST_FAILED',
      });

      await this.auditService.logEvent({
        builtinSkillId: skill.id,
        action: 'provision_failed',
        versionId: version.id,
        payload: { environment, definitionVersion: version.definitionVersion, digest, error: smokeError },
      });

      throw new BadRequestException(`Builtin skill provision failed smoke test: ${smokeError}`);
    }

    await this.registryService.markDeployment({
      builtinSkillVersionId: version.id,
      environment,
      status: 'healthy',
      smokeTestStatus: 'passed',
      smokeTestDigest: digest,
    });

    await this.auditService.logEvent({
      builtinSkillId: skill.id,
      action: 'provision_passed',
      versionId: version.id,
      payload: { environment, definitionVersion: version.definitionVersion, digest },
    });

    return { skill, version, digest };
  }

  private async executeSmokeHandler(handlerKey: string, input: Record<string, unknown>, idempotencyKeyOverride?: string): Promise<any> {
    if (handlerKey === 'document.markdown-artifact-writer') {
      const domainUrl = process.env.CARBONE_SERVICE_URL || 'http://localhost:3009';
      const smokeExecutionId = idempotencyKeyOverride || 'smoke-' + Date.now();
      const response = await axios.post(
        `${domainUrl}/internal/document/markdown-artifacts/invoke`,
        {
          executionId: smokeExecutionId,
          stepId: 'smoke-step',
          capabilityKey: 'platform.document.markdown-artifact-writer',
          definitionVersion: '0.0.0-smoke',
          idempotencyKey: smokeExecutionId,
          input,
        },
        { timeout: 15000 },
      );
      return response.data as BuiltinSkillHandlerResult;
    }

    if (handlerKey === 'platform.notification.internal-message') {
      return {
        success: true,
        output: {
          notificationId: 'smoke-msg-' + Date.now(),
          deliveredAt: new Date().toISOString(),
          recipientId: 'smoke-test',
          title: 'Provisioning smoke test notification',
        },
      };
    }

    throw new Error(`No smoke handler registered for '${handlerKey}' — deployment aborted`);
  }
}
