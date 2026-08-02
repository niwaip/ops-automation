import { Injectable, Logger } from '@nestjs/common';
import { ContractViolationError } from './contract-violation.error';

export interface LegacyValidationContext {
  executionId?: string;
  nodeId?: string;
  capabilityId?: string;
  capabilityVersion?: string;
}

/**
 * V1 Legacy Output Adapter (design doc §7.2 / §17.3).
 *
 * Heuristic per-field contract validation + alias mapping for capabilities
 * WITHOUT an authoritative output schema (plans frozen before schema-based
 * arbitration). All compatibility logic lives here — the scheduler must not
 * gain any new field-name special cases (§17.3).
 *
 * Each use is a legacy usage signal (§12.2): the marker
 * `legacy=true, contractCheckMode=heuristic` is logged. New plans never route
 * here (freeze is fail-closed on authoritative schemas, §17.1).
 */
@Injectable()
export class LegacyOutputAdapterService {
  private readonly logger = new Logger(LegacyOutputAdapterService.name);

  public validateV1Contract(step: any, output: Record<string, any>, ctx: LegacyValidationContext): void {
    const contract = step.outputContractJson;
    if (!contract || typeof contract !== 'object') return;

    const nodeId = ctx.nodeId || step.planNodeId || step.id;

    this.logger.warn(
      `Legacy Output Adapter used (no authoritative output schema): legacy=true, contractCheckMode=heuristic, node '${nodeId}'`,
      {
        legacy: true,
        contractCheckMode: 'heuristic',
        nodeId,
        capabilityId: ctx.capabilityId,
        capabilityVersion: ctx.capabilityVersion,
      },
    );

    // Alias/normalization (searchResults synthesis, businessData surfacing, the
    // results/news_item_list/data closure) is handled by OutputNormalizerService
    // before this method is called (§15.3 item 6). This method ONLY performs
    // field-level type validation.
    for (const expectedKey of Object.keys(contract)) {
      if (this.isOutputContractMetadataField(expectedKey)) continue;
      const val = output ? output[expectedKey] : undefined;

      if (val === undefined || val === null) {
        this.raise(
          `Runtime output contract violation for node '${nodeId}': missing expected output field '${expectedKey}'`,
          ctx,
          { instancePath: `/${expectedKey}`, keyword: 'required' },
        );
      }

      // Deep type contract validations - generic type checks
      if (expectedKey === 'results' || expectedKey === 'news_item_list' || expectedKey === 'searchResults') {
        if (!Array.isArray(val)) {
          if (typeof val === 'string' || (typeof val === 'object' && val !== null)) {
            // Accept string or object representation of search results
          } else {
            this.raise(
              `Runtime output contract violation for node '${nodeId}': field '${expectedKey}' must be an Array or Object, got ${typeof val}`,
              ctx,
              { instancePath: `/${expectedKey}`, keyword: 'type' },
            );
          }
        }
        continue;
      }

      if (expectedKey === 'markdown_content') {
        if (typeof val !== 'string') {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field 'markdown_content' must be a string, got ${typeof val}`,
            ctx,
            { instancePath: '/markdown_content', keyword: 'type' },
          );
        }
        if (val.trim().length === 0) {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field 'markdown_content' must be a non-empty string`,
            ctx,
            { instancePath: '/markdown_content', keyword: 'minLength' },
          );
        }
        continue;
      }

      if (expectedKey === 'downloadUrl') {
        if (typeof val !== 'string') {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field 'downloadUrl' must be a string, got ${typeof val}`,
            ctx,
            { instancePath: '/downloadUrl', keyword: 'type' },
          );
        }
        if (!val.startsWith('/') && !val.startsWith('http://') && !val.startsWith('https://')) {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field 'downloadUrl' must be a valid URL (starts with /, http://, or https://)`,
            ctx,
            { instancePath: '/downloadUrl', keyword: 'format' },
          );
        }
        continue;
      }

      if (expectedKey === 'artifact_ref' || expectedKey === 'artifact') {
        if (typeof val !== 'object' || val === null) {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field '${expectedKey}' must be an object (ArtifactRef), got ${typeof val}`,
            ctx,
            { instancePath: `/${expectedKey}`, keyword: 'type' },
          );
        }
        if (!val.url || typeof val.url !== 'string') {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field '${expectedKey}.url' is required and must be a string`,
            ctx,
            { instancePath: `/${expectedKey}/url`, keyword: 'required' },
          );
        }
        if (!val.name || typeof val.name !== 'string') {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field '${expectedKey}.name' is required and must be a string`,
            ctx,
            { instancePath: `/${expectedKey}/name`, keyword: 'required' },
          );
        }
        if (!val.mimeType || typeof val.mimeType !== 'string') {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field '${expectedKey}.mimeType' is required and must be a string`,
            ctx,
            { instancePath: `/${expectedKey}/mimeType`, keyword: 'required' },
          );
        }
        // Validate MIME type format
        if (!/^[a-z]+\/[a-z0-9\-\+\.]+(;\s*charset=[a-zA-Z0-9\-]+)?$/.test(val.mimeType)) {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field '${expectedKey}.mimeType' has invalid format: '${val.mimeType}'`,
            ctx,
            { instancePath: `/${expectedKey}/mimeType`, keyword: 'format' },
          );
        }
        continue;
      }

      if (expectedKey === 'artifacts') {
        if (!Array.isArray(val)) {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field 'artifacts' must be an Array, got ${typeof val}`,
            ctx,
            { instancePath: '/artifacts', keyword: 'type' },
          );
        }
        if (val.length === 0) {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field 'artifacts' must be a non-empty Array when declared in output contract`,
            ctx,
            { instancePath: '/artifacts', keyword: 'minItems' },
          );
        }
        const invalidArtifact = val.find(art => !art || typeof art !== 'object' || !art.url || typeof art.url !== 'string' || !art.name || !art.mimeType);
        if (invalidArtifact) {
          this.raise(
            `Runtime output contract violation for node '${nodeId}': field 'artifacts' items must be valid ArtifactRef objects with url, name, and mimeType`,
            ctx,
            { instancePath: '/artifacts', keyword: 'items' },
          );
        }
        continue;
      }

      // Generic type-aware checks based on the value type
      // Note: contract[expectedKey] === 'string' is the most common fallback
      // (extractSchemaSummary defaults unknown object-valued params to 'string'),
      // so we tolerate non-string runtime values here. The presence check above
      // is what really guards against missing outputs; the type tag is only a
      // descriptive hint that schemas can't always express precisely.
      if (contract[expectedKey] === 'object' && (typeof val !== 'object' || val === null || Array.isArray(val))) {
        this.raise(
          `Runtime output contract violation for node '${nodeId}': field '${expectedKey}' expected object, got ${typeof val}`,
          ctx,
          { instancePath: `/${expectedKey}`, keyword: 'type' },
        );
      }
    }
  }

  private raise(
    message: string,
    ctx: LegacyValidationContext,
    extra?: { instancePath?: string; keyword?: string },
  ): never {
    throw new ContractViolationError(
      'OUTPUT_SCHEMA_VIOLATION',
      message,
      {
        executionId: ctx.executionId,
        nodeId: ctx.nodeId,
        capabilityId: ctx.capabilityId,
        capabilityVersion: ctx.capabilityVersion,
        contractCheckMode: 'heuristic',
        instancePath: extra?.instancePath,
        keyword: extra?.keyword,
      },
    );
  }

  private isOutputContractMetadataField(fieldName: string): boolean {
    return [
      'runtimeType',
      'executionRuntimeType',
      'promptTemplateId',
      'promptTemplateVersion',
      'modelPolicyId',
      'temperature',
      'maxInputTokens',
      'maxOutputTokens',
      '_frozenMetadata',
    ].includes(fieldName);
  }
}
