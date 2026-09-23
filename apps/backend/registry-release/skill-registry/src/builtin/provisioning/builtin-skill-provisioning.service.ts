import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
import axios from 'axios';
import {
  BuiltinSkillManifest,
  BuiltinSkillHandlerResult,
  canonicalizeObject,
  computeCanonicalDigest,
} from '@ops/backend-builtin-skill-contract';
import { BuiltinSkillRegistryService } from '../registry/builtin-skill-registry.service';
import { BuiltinSkillAuditService } from '../audit/builtin-skill-audit.service';
import { getCarboneServiceUrl } from '../../registry/skill-registry.ports';
import {
  ARTIFACT_SMOKE_HANDLER_KEYS,
  verifyBuiltinArtifactSmoke,
} from './builtin-skill-artifact-smoke-verifier';
import { executeLocalSmokeHandler } from './builtin-skill-local-handlers';

@Injectable()
export class BuiltinSkillProvisioningService {
  private readonly logger = new Logger(BuiltinSkillProvisioningService.name);

  constructor(
    private readonly registryService: BuiltinSkillRegistryService,
    private readonly auditService: BuiltinSkillAuditService
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

  private computeContentDigest(content: string): string {
    return `sha256:${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`;
  }

  public validateManifest(manifestJson: any): BuiltinSkillManifest {
    if (!manifestJson || typeof manifestJson !== 'object') {
      throw new BadRequestException('Invalid BuiltinSkillManifest: must be an object');
    }
    const m = manifestJson as BuiltinSkillManifest;
    if (m.kind !== 'BuiltinWorkflowSkill' || !m.metadata?.key || !m.spec?.definitionVersion) {
      throw new BadRequestException(
        'Invalid BuiltinSkillManifest: missing required fields (kind, metadata.key, spec.definitionVersion)'
      );
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
      throw new BadRequestException(
        `Builtin skill bundle missing manifest.yaml at '${manifestPath}'`
      );
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const rawManifest = yaml.load(manifestContent);
    const manifest = this.validateManifest(rawManifest);

    const digest = this.computeDigest(manifestContent, resolvedDir);

    const lockPath = path.join(resolvedDir, 'bundle-lock.json');
    if (!fs.existsSync(lockPath)) {
      throw new BadRequestException(
        `Builtin skill bundle missing bundle-lock.json at '${lockPath}'`
      );
    }

    try {
      const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (lockJson.capabilityKey && lockJson.capabilityKey !== manifest.metadata.key) {
        throw new BadRequestException(
          `Bundle lock capabilityKey mismatch: expected '${manifest.metadata.key}', got '${lockJson.capabilityKey}'`
        );
      }
      if (
        lockJson.definitionVersion &&
        lockJson.definitionVersion !== manifest.spec.definitionVersion
      ) {
        throw new BadRequestException(
          `Bundle lock definitionVersion mismatch: expected '${manifest.spec.definitionVersion}', got '${lockJson.definitionVersion}'`
        );
      }
      if (lockJson.definitionDigest && lockJson.definitionDigest !== digest) {
        throw new BadRequestException(
          `Bundle lock definitionDigest mismatch: expected '${digest}', got '${lockJson.definitionDigest}'`
        );
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Failed to parse bundle-lock.json in ${bundleDir}: ${err.message}`);
      throw new BadRequestException(`Invalid bundle-lock.json in ${bundleDir}: ${err.message}`);
    }

    this.logger.log(
      `Provisioning builtin skill '${manifest.metadata.key}' v${manifest.spec.definitionVersion} (digest: ${digest})`
    );

    const { skill, version } = await this.registryService.upsertSkillFromManifest(manifest, digest);

    // Strict Smoke Test Verification & Real Handler Fixture Execution
    let smokePassed = true;
    let smokeError: string | null = null;
    let smokeFixtureDigest: string | undefined;
    let externalDependencyInfo: any = undefined;

    const smokeInputRef = manifest.spec.smokeTest?.inputRef || 'fixtures/smoke-input.json';
    const smokeInputPath = path.join(resolvedDir, smokeInputRef);

    const skipSmoke =
      process.env.BUILTIN_SKILL_PROVISION_SKIP_SMOKE === 'true' || environment === 'bootstrap';

    if (skipSmoke) {
      this.logger.log(
        `Skipping handler smoke execution for '${manifest.metadata.key}' (skipSmoke=true)`
      );
      if (fs.existsSync(smokeInputPath)) {
        smokeFixtureDigest = this.computeContentDigest(fs.readFileSync(smokeInputPath, 'utf8'));
      }
    } else if (!fs.existsSync(smokeInputPath)) {
      smokePassed = false;
      smokeError = `Smoke test fixture file missing at '${smokeInputPath}'`;
    } else {
      try {
        const smokeInputContent = fs.readFileSync(smokeInputPath, 'utf8');
        smokeFixtureDigest = this.computeContentDigest(smokeInputContent);
        const smokeInput = JSON.parse(smokeInputContent);
        if (!smokeInput || typeof smokeInput !== 'object') {
          throw new Error('Smoke input fixture must be a valid non-empty JSON object');
        }

        // Contract validation: verify required fields
        const requiredFields = manifest.spec.contracts?.input?.schema?.required as
          | string[]
          | undefined;
        if (Array.isArray(requiredFields)) {
          for (const field of requiredFields) {
            if (
              smokeInput[field] === undefined ||
              smokeInput[field] === null ||
              smokeInput[field] === ''
            ) {
              throw new Error(`Smoke test input missing required contract field: '${field}'`);
            }
          }
        }

        // Execute real handler logic during smoke test to verify execution + output contract + idempotency
        const handlerKey = manifest.spec.runtime.handlerKey;
        const smokeIdempotencyKey = `smoke-${manifest.metadata.key}-${Date.now()}`;
        const smokeResult = await this.executeSmokeHandler(
          handlerKey,
          smokeInput,
          smokeIdempotencyKey
        );
        if (smokeResult?.externalDependency) {
          externalDependencyInfo = smokeResult.externalDependency;
          this.logger.log(
            `[BuiltinSkillProvisioningService] Verified '${manifest.metadata.key}' external dependency: [${externalDependencyInfo.type}] ${externalDependencyInfo.status} (${externalDependencyInfo.message})`
          );
        }

        // Verify output contract
        if (!smokeResult || typeof smokeResult !== 'object') {
          throw new Error('Smoke test execution returned invalid result');
        }

        if (ARTIFACT_SMOKE_HANDLER_KEYS.has(handlerKey)) {
          await verifyBuiltinArtifactSmoke({
            handlerKey,
            smokeResult,
            rerun: () => this.executeSmokeHandler(handlerKey, smokeInput, smokeIdempotencyKey),
          });
        }

        if (handlerKey === 'document.content-extractor.pdf') {
          const handlerOutput = (smokeResult as any).output || smokeResult;
          if (
            typeof handlerOutput.text !== 'string' ||
            !handlerOutput.text.includes('Builtin PDF Content Extractor') ||
            handlerOutput.pageCount !== 2 ||
            handlerOutput.extractedPageCount !== 2 ||
            !Array.isArray(handlerOutput.pages) ||
            handlerOutput.pages.length !== 2 ||
            handlerOutput.extraction?.format !== 'pdf' ||
            handlerOutput.extraction?.method !== 'embedded_text' ||
            handlerOutput.extraction?.ocrUsed !== false
          ) {
            throw new Error('Smoke test execution failed PDF extraction output contract');
          }
        }

        this.logger.log(
          `Smoke test contract, real handler execution, and idempotency verification passed for ${manifest.metadata.key}: ${smokeInputPath}`
        );
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
        payload: {
          environment,
          definitionVersion: version.definitionVersion,
          digest,
          error: smokeError,
        },
      });

      throw new BadRequestException(`Builtin skill provision failed smoke test: ${smokeError}`);
    }

    let finalVersion = version;
    if (!skipSmoke) {
      const workflowPath = path.join(resolvedDir, 'workflow.json');
      const runtimeSource = fs.existsSync(workflowPath)
        ? fs.readFileSync(workflowPath, 'utf8')
        : manifest.spec.runtime.handlerKey;
      finalVersion = await this.registryService.attestVersion({
        builtinSkillId: skill.id,
        builtinSkillVersionId: version.id,
        sourceDigest: digest,
        contractDigest: this.computeContentDigest(
          JSON.stringify(canonicalizeObject(manifest.spec.contracts))
        ),
        runtimeDigest: this.computeContentDigest(runtimeSource),
        fixtureDigest: smokeFixtureDigest,
      });
    }

    const smokeTestStatus = skipSmoke ? 'untested' : 'passed';
    const deploymentStatus = skipSmoke ? 'registered' : 'healthy';

    await this.registryService.markDeployment({
      builtinSkillVersionId: finalVersion.id,
      environment,
      status: deploymentStatus,
      smokeTestStatus,
      smokeTestDigest: skipSmoke ? undefined : digest,
    });

    await this.auditService.logEvent({
      builtinSkillId: skill.id,
      action: skipSmoke ? 'provision_untested' : 'provision_passed',
      versionId: finalVersion.id,
      payload: {
        environment,
        definitionVersion: finalVersion.definitionVersion,
        digest,
        smokeTestStatus,
        status: deploymentStatus,
        externalDependency: externalDependencyInfo,
      },
    });

    return { skill, version: finalVersion, digest };
  }

  private async executeSmokeHandler(
    handlerKey: string,
    input: Record<string, unknown>,
    idempotencyKeyOverride?: string
  ): Promise<any> {
    const documentHandlerEndpoints: Record<string, { capabilityKey: string; endpoint: string }> =
      {
        'document.markdown-artifact-writer': {
          capabilityKey: 'platform.document.markdown-artifact-writer',
          endpoint: '/internal/document/markdown-artifacts/invoke',
        },
        'document.content-extractor.pdf': {
          capabilityKey: 'platform.document.pdf-content-extractor',
          endpoint: '/internal/document/content-extractors/pdf/invoke',
        },
        'document.pdf.merge': {
          capabilityKey: 'platform.document.pdf-merge',
          endpoint: '/internal/document/pdf/merge/invoke',
        },
        'document.pdf.split': {
          capabilityKey: 'platform.document.pdf-split',
          endpoint: '/internal/document/pdf/split/invoke',
        },
        'document.pdf.create': {
          capabilityKey: 'platform.document.pdf-create',
          endpoint: '/internal/document/pdf/create/invoke',
        },
        'document.contract.compare': {
          capabilityKey: 'platform.document.contract-comparator',
          endpoint: '/internal/document/contract-compare/invoke',
        },
        'document.contract.review': {
          capabilityKey: 'platform.document.contract-reviewer',
          endpoint: '/internal/document/contract-review/invoke',
        },
      };
    const documentHandler = documentHandlerEndpoints[handlerKey];
    if (documentHandler) {
      const domainUrl = getCarboneServiceUrl();
      const smokeExecutionId = idempotencyKeyOverride || 'smoke-' + Date.now();
      const timeoutMs = Number(process.env.BUILTIN_SKILL_SMOKE_TIMEOUT_MS) || 60000;
      const response = await axios.post(
        `${domainUrl}${documentHandler.endpoint}`,
        {
          executionId: smokeExecutionId,
          stepId: 'smoke-step',
          capabilityKey: documentHandler.capabilityKey,
          definitionVersion: '0.0.0-smoke',
          idempotencyKey: smokeExecutionId,
          input,
        },
        { timeout: timeoutMs }
      );
      return response.data as BuiltinSkillHandlerResult;
    }

    return await executeLocalSmokeHandler(handlerKey, input, idempotencyKeyOverride);
  }

  public resolveTargetBundles(targetArg?: string): string[] {
    const findBundlesInDir = (dirPath: string): string[] => {
      if (!fs.existsSync(dirPath)) return [];
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(dirPath, entry.name))
          .filter((bundleDir) => fs.existsSync(path.join(bundleDir, 'manifest.yaml')))
          .sort();
      } catch {
        return [];
      }
    };

    if (targetArg && targetArg !== 'all') {
      const resolved = path.isAbsolute(targetArg) ? targetArg : path.resolve(process.cwd(), targetArg);
      if (fs.existsSync(path.join(resolved, 'manifest.yaml'))) {
        return [resolved];
      }
    }

    const searchRoots = [
      process.env.BUILTIN_SKILLS_DIR,
      path.resolve(process.cwd(), 'builtin-skills'),
      path.resolve(process.cwd(), '../../builtin-skills'),
      path.resolve(process.cwd(), '../../../builtin-skills'),
      path.resolve(__dirname, '../../../../../../builtin-skills'),
      path.resolve(__dirname, '../../../../../builtin-skills'),
      path.resolve(__dirname, '../../../../builtin-skills'),
      '/workspace/builtin-skills',
    ].filter(Boolean) as string[];

    for (const root of searchRoots) {
      const bundles = findBundlesInDir(root);
      if (bundles.length > 0) {
        if (!targetArg || targetArg === 'all') return bundles;
        const matched = bundles.filter((bundleDir) =>
          path.basename(bundleDir) === targetArg || path.resolve(bundleDir) === path.resolve(targetArg)
        );
        if (matched.length === 1) return matched;
      }
    }

    throw new BadRequestException(
      targetArg && targetArg !== 'all'
        ? `Built-in skill bundle '${targetArg}' not found; no other bundles were selected`
        : 'No built-in skill bundles found'
    );
  }

  public async verifyAndActivateAll(
    targetArg?: string,
    environment: string = 'production'
  ): Promise<{
    succeeded: string[];
    failed: Array<{ bundle: string; error: string }>;
  }> {
    const bundles = this.resolveTargetBundles(targetArg);
    const succeeded: string[] = [];
    const failed: Array<{ bundle: string; error: string }> = [];

    this.logger.log(`Verifying and activating ${bundles.length} built-in skill bundle(s)...`);

    for (const bundleDir of bundles) {
      const bundleName = path.basename(bundleDir);
      try {
        const result = await this.provisionBundle(bundleDir, environment);
        await this.registryService.activateVersion(
          result.skill.capabilityKey,
          result.version.definitionVersion,
          environment
        );
        succeeded.push(`${result.skill.capabilityKey}@${result.version.definitionVersion}`);
        this.logger.log(
          `Successfully verified and activated ${result.skill.capabilityKey} v${result.version.definitionVersion}`
        );
      } catch (err: any) {
        this.logger.error(`Failed to verify and activate bundle ${bundleName}: ${err.message}`);
        failed.push({ bundle: bundleName, error: err.message });
      }
    }

    return { succeeded, failed };
  }
}
