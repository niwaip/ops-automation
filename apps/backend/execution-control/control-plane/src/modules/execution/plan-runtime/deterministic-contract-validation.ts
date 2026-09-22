import { jsonSchemaValidator } from '@ops/backend-runtime-capability-contract';
import { ERROR_CODES } from '@ops/backend-error-codes';
import { ContractViolationError } from './contract-violation.error';
import { LegacyOutputAdapterService } from './legacy-output-adapter.service';
import { OutputNormalizerService } from './output-normalizer.service';

export function validateInputContract(
  step: any,
  input: Record<string, any>,
  executionId: string
): void {
  const inputSchema = step.inputSchemaJson;
  if (!inputSchema || typeof inputSchema !== 'object' || Object.keys(inputSchema).length === 0) {
    return;
  }
  // apiKey and transient scheduler metadata are not part of the capability input contract
  // — exclude them from contract validation so closed-object schemas (additionalProperties: false) don't reject them.
  const TRANSIENT_KEYS = new Set([
    'apiKey',
    'idempotencyKey',
    'userRequest',
    'user_request',
    'prompt',
    '__promptDebug',
    'chatSessionId',
    'sessionId',
    'session_id',
    'userId',
    'user_id',
    'channel',
    'channelType',
    'messageId',
    'authToken',
    'traceId',
    'modelId',
    'detailText',
    'systemInputs',
    'plannerContext',
    'telemetry',
    'browserPhaseVariables',
    'contentParts',
    'role',
    'planDraft',
    'deterministicPlan',
  ]);
  const contractInput: Record<string, any> = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!TRANSIENT_KEYS.has(k) && !k.startsWith('previousResult')) {
      if (
        inputSchema.additionalProperties === false &&
        inputSchema.properties &&
        typeof inputSchema.properties === 'object' &&
        !Object.prototype.hasOwnProperty.call(inputSchema.properties, k)
      ) {
        continue;
      }
      contractInput[k] = v;
    }
  }
  const validation = jsonSchemaValidator.validateInput(contractInput || {}, inputSchema);
  if (!validation.valid) {
    const firstError = validation.errors?.[0] as any;
    const errMsgs = validation.errors
      ?.map((e: any) => `${e.path}${e.keyword ? ` (${e.keyword})` : ''}: ${e.message}`)
      .join('; ');
    throw new ContractViolationError(
      ERROR_CODES.INPUT_SCHEMA_VIOLATION,
      `INPUT_SCHEMA_VIOLATION for node '${step.planNodeId || step.id}': ${errMsgs}`,
      {
        executionId,
        nodeId: step.planNodeId || step.id,
        capabilityId: step.capabilityId,
        capabilityVersion: step.capabilityVersion,
        contractCheckMode: 'schema',
        instancePath: firstError?.path,
        keyword: firstError?.keyword,
      }
    );
  }
}

export function validateOutputContract(
  step: any,
  output: Record<string, any>,
  executionId: string,
  outputNormalizer: OutputNormalizerService,
  legacyOutputAdapter: LegacyOutputAdapterService
): Record<string, any> {
  const contract = step.outputContractJson;
  // Authoritative schema is frozen at plan freeze time only (design doc §6.3/§9.3).
  // Planner self-reported schemas are never trusted at runtime.
  const outputSchema = step.outputSchemaJson;
  const dataPath = step.dataPath || contract?.dataPath;
  const frozenMeta =
    (contract && typeof contract === 'object' ? contract._frozenMetadata : null) || {};
  const nodeId = step.planNodeId || step.id;

  // Unified output normalization (§15.3 item 6): searchResults synthesis +
  // businessData surfacing always; the legacy alias closure only for the
  // keys the contract declares (so strict V2 schemas never see newly
  // synthesized keys). The normalized output is what callers persist.
  const contractKeys =
    contract && typeof contract === 'object' && !Array.isArray(contract)
      ? Object.keys(contract)
      : [];

  // V2 contract mode (see docs/design/unified-capability-contract-and-validation-design.md
  // §3.5 / §17.3): when an authoritative output schema is frozen with the
  // plan (resolved from the capability catalog at freeze time), the JSON
  // Schema is the SOLE runtime arbiter. Legacy capabilities without an
  // authoritative schema are delegated to the Legacy Output Adapter (§7.2 /
  // §17.3). Field names the planner declared but the schema does not (LLM
  // hallucination) are intentionally not enforced here — the schema is the
  // contract, and closed-object semantics (`additionalProperties: false`)
  // still catch genuine producer drift with a precise instance path.
  if (outputSchema && typeof outputSchema === 'object' && Object.keys(outputSchema).length > 0) {
    // Validate EXACTLY what the workflow returned (extracted payload, else
    // the raw output) — never the normalized copy, whose synthesized keys
    // would trip `additionalProperties: false` on flat outputs.
    // falsy-safe：extractDataByPath 仅在路径缺失时返回 undefined，合法的
    // falsy 业务值（0 / false / '' / []）必须原样保留，不能整体回退到 raw output。
    const extractedData = jsonSchemaValidator.extractDataByPath(
      output,
      dataPath || '$.result.businessData'
    );
    const rawTarget = extractedData === undefined ? output : extractedData;
    let schemaTarget = rawTarget;
    if (rawTarget && typeof rawTarget === 'object' && !Array.isArray(rawTarget)) {
      let hasContentRef = false;
      const copy: Record<string, unknown> = { ...rawTarget };
      for (const [k, v] of Object.entries(copy)) {
        if (
          v &&
          typeof v === 'object' &&
          (v as any).schemaVersion === 'content-ref/v1' &&
          (outputSchema as any)?.properties?.[k]?.type === 'string'
        ) {
          copy[k] = (v as any).preview || '';
          hasContentRef = true;
        }
      }
      if (hasContentRef) {
        schemaTarget = copy;
      }
    }
    const schemaValidation = jsonSchemaValidator.validate(schemaTarget, outputSchema);
    if (!schemaValidation.valid) {
      const errMsgs = schemaValidation.errors
        ?.map((e: any) => `${e.path}${e.keyword ? ` (${e.keyword})` : ''}: ${e.message}`)
        .join('; ');
      const firstError = schemaValidation.errors?.[0] as any;
      throw new ContractViolationError(
        ERROR_CODES.OUTPUT_SCHEMA_VIOLATION,
        `OUTPUT_SCHEMA_VIOLATION for node '${nodeId}': ${errMsgs}`,
        {
          executionId,
          nodeId,
          capabilityId: step.capabilityId,
          capabilityVersion: step.capabilityVersion,
          contractDigest: frozenMeta.contractDigest,
          contractCheckMode: 'schema',
          instancePath: firstError?.path,
          keyword: firstError?.keyword,
        }
      );
    }
    // Persist the normalized output for downstream node_output resolution.
    // The schema IS the contract: only its declared property names are
    // eligible for alias materialization (§15.3 item 6).
    const schemaProps = Object.keys((outputSchema as any).properties || {});
    return outputNormalizer.normalize(output, schemaProps) || {};
  }

  // V1 legacy: delegate all heuristic compatibility logic to the adapter.
  const normalizedOutput = outputNormalizer.normalize(output, contractKeys) || {};
  legacyOutputAdapter.validateV1Contract(step, normalizedOutput, {
    executionId,
    nodeId,
    capabilityId: step.capabilityId,
    capabilityVersion: step.capabilityVersion,
  });
  return normalizedOutput;
}
