
Object.defineProperty(exports, "__esModule", { value: true });

const {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
  NotFoundError,
  getPrismaClient,
  sqltag,
  empty,
  join,
  raw,
  skip,
  Decimal,
  Debug,
  objectEnumValues,
  makeStrictEnum,
  Extensions,
  warnOnce,
  defineDmmfProperty,
  Public,
  getRuntime
} = require('./runtime/library.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = PrismaClientKnownRequestError;
Prisma.PrismaClientUnknownRequestError = PrismaClientUnknownRequestError
Prisma.PrismaClientRustPanicError = PrismaClientRustPanicError
Prisma.PrismaClientInitializationError = PrismaClientInitializationError
Prisma.PrismaClientValidationError = PrismaClientValidationError
Prisma.NotFoundError = NotFoundError
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = sqltag
Prisma.empty = empty
Prisma.join = join
Prisma.raw = raw
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = Extensions.getExtensionContext
Prisma.defineExtension = Extensions.defineExtension

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}




  const path = require('path')

/**
 * Enums
 */
exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.ExecutionScalarFieldEnum = {
  id: 'id',
  orgId: 'orgId',
  createdBy: 'createdBy',
  skillId: 'skillId',
  skillVersion: 'skillVersion',
  status: 'status',
  runtimeType: 'runtimeType',
  riskLevel: 'riskLevel',
  inputJson: 'inputJson',
  normalizedInputJson: 'normalizedInputJson',
  resultJson: 'resultJson',
  failureReason: 'failureReason',
  failureCode: 'failureCode',
  currentStepId: 'currentStepId',
  requiresApproval: 'requiresApproval',
  approvalStatus: 'approvalStatus',
  takeoverRequired: 'takeoverRequired',
  takeoverReason: 'takeoverReason',
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ExecutionStepScalarFieldEnum = {
  id: 'id',
  executionId: 'executionId',
  stepIndex: 'stepIndex',
  name: 'name',
  type: 'type',
  status: 'status',
  action: 'action',
  targetJson: 'targetJson',
  inputJson: 'inputJson',
  outputJson: 'outputJson',
  assertionJson: 'assertionJson',
  errorMessage: 'errorMessage',
  errorCode: 'errorCode',
  retryCount: 'retryCount',
  snapshotId: 'snapshotId',
  takeoverTriggered: 'takeoverTriggered',
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RuntimeSessionScalarFieldEnum = {
  id: 'id',
  executionId: 'executionId',
  runtimeType: 'runtimeType',
  workerId: 'workerId',
  profileId: 'profileId',
  state: 'state',
  controlMode: 'controlMode',
  connectionInfoJson: 'connectionInfoJson',
  freezeReason: 'freezeReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  closedAt: 'closedAt'
};

exports.Prisma.ExecutionEventScalarFieldEnum = {
  id: 'id',
  executionId: 'executionId',
  runtimeSessionId: 'runtimeSessionId',
  stepId: 'stepId',
  eventType: 'eventType',
  eventSource: 'eventSource',
  payloadJson: 'payloadJson',
  createdAt: 'createdAt'
};

exports.Prisma.LlmOperationScalarFieldEnum = {
  id: 'id',
  operationKey: 'operationKey',
  displayName: 'displayName',
  description: 'description',
  owner: 'owner',
  status: 'status',
  source: 'source',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LlmOperationVersionScalarFieldEnum = {
  id: 'id',
  operationId: 'operationId',
  version: 'version',
  state: 'state',
  manifestJson: 'manifestJson',
  operationDigest: 'operationDigest',
  contractDigest: 'contractDigest',
  changeSummary: 'changeSummary',
  source: 'source',
  approvedBy: 'approvedBy',
  approvedAt: 'approvedAt',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LlmOperationActivationScalarFieldEnum = {
  id: 'id',
  operationId: 'operationId',
  versionId: 'versionId',
  environment: 'environment',
  label: 'label',
  activatedBy: 'activatedBy',
  reason: 'reason',
  rolloutPercent: 'rolloutPercent',
  activatedAt: 'activatedAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LlmOperationActivationEventScalarFieldEnum = {
  id: 'id',
  operationId: 'operationId',
  previousVersionId: 'previousVersionId',
  newVersionId: 'newVersionId',
  environment: 'environment',
  action: 'action',
  actor: 'actor',
  reason: 'reason',
  metadataJson: 'metadataJson',
  createdAt: 'createdAt'
};

exports.Prisma.LlmOperationEvalSuiteScalarFieldEnum = {
  id: 'id',
  operationId: 'operationId',
  versionId: 'versionId',
  name: 'name',
  description: 'description',
  suiteDigest: 'suiteDigest',
  createdBy: 'createdBy',
  createdAt: 'createdAt'
};

exports.Prisma.LlmOperationEvalCaseScalarFieldEnum = {
  id: 'id',
  suiteId: 'suiteId',
  name: 'name',
  inputJson: 'inputJson',
  expectedJson: 'expectedJson',
  isNegative: 'isNegative',
  errorContains: 'errorContains',
  createdAt: 'createdAt'
};

exports.Prisma.LlmOperationEvalRunScalarFieldEnum = {
  id: 'id',
  versionId: 'versionId',
  suiteId: 'suiteId',
  modelPolicySnapshot: 'modelPolicySnapshot',
  resultsJson: 'resultsJson',
  metricsJson: 'metricsJson',
  baselineVersionId: 'baselineVersionId',
  executedBy: 'executedBy',
  startedAt: 'startedAt',
  completedAt: 'completedAt'
};

exports.Prisma.LlmOperationInvocationScalarFieldEnum = {
  id: 'id',
  versionId: 'versionId',
  executionId: 'executionId',
  stepId: 'stepId',
  tenantId: 'tenantId',
  provider: 'provider',
  requestedModel: 'requestedModel',
  resolvedModel: 'resolvedModel',
  inputDigest: 'inputDigest',
  outputDigest: 'outputDigest',
  idempotencyKey: 'idempotencyKey',
  resultJson: 'resultJson',
  inputStorageRef: 'inputStorageRef',
  outputStorageRef: 'outputStorageRef',
  tokenUsageJson: 'tokenUsageJson',
  latencyMs: 'latencyMs',
  estimatedCost: 'estimatedCost',
  parseAttempts: 'parseAttempts',
  repairAttempts: 'repairAttempts',
  validationResult: 'validationResult',
  finishReason: 'finishReason',
  errorCode: 'errorCode',
  actor: 'actor',
  environment: 'environment',
  startedAt: 'startedAt',
  completedAt: 'completedAt'
};

exports.Prisma.LlmOperationAttestationScalarFieldEnum = {
  id: 'id',
  operationId: 'operationId',
  versionId: 'versionId',
  operationDigest: 'operationDigest',
  contractDigest: 'contractDigest',
  evalSuiteDigest: 'evalSuiteDigest',
  validatorVersion: 'validatorVersion',
  schemaTests: 'schemaTests',
  offlineEvals: 'offlineEvals',
  liveEvals: 'liveEvals',
  securityEvals: 'securityEvals',
  gateResultsJson: 'gateResultsJson',
  createdBy: 'createdBy',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  Execution: 'Execution',
  ExecutionStep: 'ExecutionStep',
  RuntimeSession: 'RuntimeSession',
  ExecutionEvent: 'ExecutionEvent',
  LlmOperation: 'LlmOperation',
  LlmOperationVersion: 'LlmOperationVersion',
  LlmOperationActivation: 'LlmOperationActivation',
  LlmOperationActivationEvent: 'LlmOperationActivationEvent',
  LlmOperationEvalSuite: 'LlmOperationEvalSuite',
  LlmOperationEvalCase: 'LlmOperationEvalCase',
  LlmOperationEvalRun: 'LlmOperationEvalRun',
  LlmOperationInvocation: 'LlmOperationInvocation',
  LlmOperationAttestation: 'LlmOperationAttestation'
};
/**
 * Create the Client
 */
const config = {
  "generator": {
    "name": "client",
    "provider": {
      "fromEnvVar": null,
      "value": "prisma-client-js"
    },
    "output": {
      "value": "/workspace/apps/backend/intelligence/ai-orchestrator/src/generated/prisma",
      "fromEnvVar": null
    },
    "config": {
      "engineType": "library"
    },
    "binaryTargets": [
      {
        "fromEnvVar": null,
        "value": "linux-arm64-openssl-1.1.x",
        "native": true
      }
    ],
    "previewFeatures": [],
    "sourceFilePath": "/workspace/apps/backend/intelligence/ai-orchestrator/prisma/schema.prisma",
    "isCustomOutput": true
  },
  "relativeEnvPaths": {
    "rootEnvPath": null
  },
  "relativePath": "../../../prisma",
  "clientVersion": "5.22.0",
  "engineVersion": "605197351a3c8bdd595af2d2a9bc3025bca48ea2",
  "datasourceNames": [
    "db"
  ],
  "activeProvider": "postgresql",
  "postinstall": false,
  "inlineDatasources": {
    "db": {
      "url": {
        "fromEnvVar": "DATABASE_URL",
        "value": null
      }
    }
  },
  "inlineSchema": "// This is your Prisma schema file,\n// learn more about it in the docs: https://pris.ly/d/prisma-schema\n\ngenerator client {\n  provider = \"prisma-client-js\"\n  output   = \"../src/generated/prisma\"\n}\n\ndatasource db {\n  provider = \"postgresql\"\n  url      = env(\"DATABASE_URL\")\n}\n\n// Execution - Skill execution instance (business truth source)\nmodel Execution {\n  id                  String    @id @default(uuid()) @db.Uuid\n  orgId               String?   @map(\"org_id\") @db.Uuid\n  createdBy           String    @map(\"created_by\") @db.Uuid\n  skillId             String    @map(\"skill_id\") @db.Uuid\n  skillVersion        String?   @map(\"skill_version\") @db.VarChar(50)\n  status              String    @db.VarChar(50)\n  runtimeType         String    @default(\"browser\") @map(\"runtime_type\") @db.VarChar(50)\n  riskLevel           String    @default(\"L0\") @map(\"risk_level\") @db.VarChar(10)\n  inputJson           Json?     @map(\"input_json\")\n  normalizedInputJson Json?     @map(\"normalized_input_json\")\n  resultJson          Json?     @map(\"result_json\")\n  failureReason       String?   @map(\"failure_reason\") @db.Text\n  failureCode         String?   @map(\"failure_code\") @db.VarChar(50)\n  currentStepId       String?   @map(\"current_step_id\") @db.Uuid\n  requiresApproval    Boolean   @default(false) @map(\"requires_approval\")\n  approvalStatus      String?   @map(\"approval_status\") @db.VarChar(50)\n  takeoverRequired    Boolean   @default(false) @map(\"takeover_required\")\n  takeoverReason      String?   @map(\"takeover_reason\") @db.Text\n  startedAt           DateTime? @map(\"started_at\") @db.Timestamptz\n  endedAt             DateTime? @map(\"ended_at\") @db.Timestamptz\n  createdAt           DateTime  @default(now()) @map(\"created_at\") @db.Timestamptz\n  updatedAt           DateTime  @default(now()) @updatedAt @map(\"updated_at\") @db.Timestamptz\n\n  steps           ExecutionStep[]\n  runtimeSessions RuntimeSession[]\n  events          ExecutionEvent[]\n\n  @@map(\"executions\")\n}\n\n// ExecutionStep - Minimum observable action in Execution\nmodel ExecutionStep {\n  id                String    @id @default(uuid()) @db.Uuid\n  executionId       String    @map(\"execution_id\") @db.Uuid\n  stepIndex         Int       @map(\"step_index\")\n  name              String?   @db.VarChar(255)\n  type              String    @db.VarChar(50)\n  status            String    @db.VarChar(50)\n  action            String?   @db.VarChar(100)\n  targetJson        Json?     @map(\"target_json\")\n  inputJson         Json?     @map(\"input_json\")\n  outputJson        Json?     @map(\"output_json\")\n  assertionJson     Json?     @map(\"assertion_json\")\n  errorMessage      String?   @map(\"error_message\") @db.Text\n  errorCode         String?   @map(\"error_code\") @db.VarChar(50)\n  retryCount        Int       @default(0) @map(\"retry_count\")\n  snapshotId        String?   @map(\"snapshot_id\") @db.VarChar(255)\n  takeoverTriggered Boolean   @default(false) @map(\"takeover_triggered\")\n  startedAt         DateTime? @map(\"started_at\") @db.Timestamptz\n  endedAt           DateTime? @map(\"ended_at\") @db.Timestamptz\n  createdAt         DateTime  @default(now()) @map(\"created_at\") @db.Timestamptz\n  updatedAt         DateTime  @default(now()) @updatedAt @map(\"updated_at\") @db.Timestamptz\n\n  execution Execution @relation(fields: [executionId], references: [id], onDelete: Cascade)\n\n  @@unique([executionId, stepIndex])\n  @@index([executionId, status])\n  @@map(\"execution_steps\")\n}\n\n// RuntimeSession - Runtime resource session (resource truth source)\nmodel RuntimeSession {\n  id                 String    @id @default(uuid()) @db.Uuid\n  executionId        String?   @map(\"execution_id\") @db.Uuid\n  runtimeType        String    @default(\"browser\") @map(\"runtime_type\") @db.VarChar(50)\n  workerId           String?   @map(\"worker_id\") @db.VarChar(255)\n  profileId          String?   @map(\"profile_id\") @db.VarChar(255)\n  state              String    @db.VarChar(50)\n  controlMode        String    @default(\"AGENT_RUNNING\") @map(\"control_mode\") @db.VarChar(50)\n  connectionInfoJson Json?     @map(\"connection_info_json\")\n  freezeReason       String?   @map(\"freeze_reason\") @db.Text\n  createdAt          DateTime  @default(now()) @map(\"created_at\") @db.Timestamptz\n  updatedAt          DateTime  @default(now()) @updatedAt @map(\"updated_at\") @db.Timestamptz\n  closedAt           DateTime? @map(\"closed_at\") @db.Timestamptz\n\n  execution Execution? @relation(fields: [executionId], references: [id])\n\n  @@map(\"runtime_sessions\")\n}\n\n// ExecutionEvent - Key state transition events\nmodel ExecutionEvent {\n  id               String   @id @default(uuid()) @db.Uuid\n  executionId      String   @map(\"execution_id\") @db.Uuid\n  runtimeSessionId String?  @map(\"runtime_session_id\") @db.Uuid\n  stepId           String?  @map(\"step_id\") @db.Uuid\n  eventType        String   @map(\"event_type\") @db.VarChar(100)\n  eventSource      String?  @map(\"event_source\") @db.VarChar(50)\n  payloadJson      Json?    @map(\"payload_json\")\n  createdAt        DateTime @default(now()) @map(\"created_at\") @db.Timestamptz\n\n  execution Execution @relation(fields: [executionId], references: [id], onDelete: Cascade)\n\n  @@index([executionId, createdAt(sort: Desc)])\n  @@map(\"execution_events\")\n}\n\n// LLM Operation: stable identity\nmodel LlmOperation {\n  id           String   @id @default(uuid()) @db.Uuid\n  operationKey String   @unique @map(\"operation_key\") @db.VarChar(100)\n  displayName  String   @map(\"display_name\") @db.VarChar(255)\n  description  String   @db.Text\n  owner        String   @db.VarChar(100)\n  status       String   @default(\"active\") @db.VarChar(32) // active | deprecated | disabled\n  source       String   @default(\"admin_created\") @db.VarChar(32) // system_seed | admin_created | imported\n  createdAt    DateTime @default(now()) @map(\"created_at\") @db.Timestamptz\n  updatedAt    DateTime @default(now()) @updatedAt @map(\"updated_at\") @db.Timestamptz\n\n  versions         LlmOperationVersion[]\n  activations      LlmOperationActivation[]\n  activationEvents LlmOperationActivationEvent[]\n  attestations     LlmOperationAttestation[]\n\n  @@map(\"llm_operations\")\n}\n\n// LLM Operation Version: immutable version snapshot\nmodel LlmOperationVersion {\n  id              String    @id @default(uuid()) @db.Uuid\n  operationId     String    @map(\"operation_id\") @db.Uuid\n  version         String    @db.VarChar(50)\n  state           String    @default(\"draft\") @db.VarChar(32) // draft | validating | candidate | approved | deprecated | retired | rejected | validation_failed | approval_rejected | activation_failed\n  manifestJson    Json      @map(\"manifest_json\")\n  operationDigest String    @map(\"operation_digest\") @db.VarChar(128)\n  contractDigest  String    @map(\"contract_digest\") @db.VarChar(128)\n  changeSummary   String    @default(\"\") @map(\"change_summary\") @db.Text\n  source          String    @default(\"admin_created\") @db.VarChar(32) // system_seed | admin_created | imported\n  approvedBy      String?   @map(\"approved_by\") @db.VarChar(255)\n  approvedAt      DateTime? @map(\"approved_at\") @db.Timestamptz\n  createdBy       String    @map(\"created_by\") @db.VarChar(255)\n  createdAt       DateTime  @default(now()) @map(\"created_at\") @db.Timestamptz\n  updatedAt       DateTime  @default(now()) @updatedAt @map(\"updated_at\") @db.Timestamptz\n\n  operation        LlmOperation                  @relation(fields: [operationId], references: [id], onDelete: Cascade)\n  activations      LlmOperationActivation[]\n  activationEvents LlmOperationActivationEvent[]\n  evalRuns         LlmOperationEvalRun[]\n  invocations      LlmOperationInvocation[]\n  attestations     LlmOperationAttestation[]\n\n  @@unique([operationId, version])\n  @@unique([operationId, operationDigest])\n  @@index([operationId, state])\n  @@map(\"llm_operation_versions\")\n}\n\n// Activation pointer (current env → version)\nmodel LlmOperationActivation {\n  id             String   @id @default(uuid()) @db.Uuid\n  operationId    String   @map(\"operation_id\") @db.Uuid\n  versionId      String   @map(\"version_id\") @db.Uuid\n  environment    String   @db.VarChar(32) // dev | staging | production | canary\n  label          String?  @db.VarChar(32) // staging | production | canary\n  activatedBy    String   @map(\"activated_by\") @db.VarChar(255)\n  reason         String   @db.Text\n  rolloutPercent Int?     @map(\"rollout_percent\")\n  activatedAt    DateTime @default(now()) @map(\"activated_at\") @db.Timestamptz\n  updatedAt      DateTime @default(now()) @updatedAt @map(\"updated_at\") @db.Timestamptz\n\n  operation LlmOperation        @relation(fields: [operationId], references: [id], onDelete: Cascade)\n  version   LlmOperationVersion @relation(fields: [versionId], references: [id])\n\n  @@unique([operationId, environment])\n  @@index([environment])\n  @@map(\"llm_operation_activations\")\n}\n\n// Activation history (append-only)\nmodel LlmOperationActivationEvent {\n  id                String   @id @default(uuid()) @db.Uuid\n  operationId       String   @map(\"operation_id\") @db.Uuid\n  previousVersionId String?  @map(\"previous_version_id\") @db.Uuid\n  newVersionId      String   @map(\"new_version_id\") @db.Uuid\n  environment       String   @db.VarChar(32)\n  action            String   @db.VarChar(32) // activate | rollback | disable | canary_adjust\n  actor             String   @db.VarChar(255)\n  reason            String   @db.Text\n  metadataJson      Json?    @map(\"metadata_json\")\n  createdAt         DateTime @default(now()) @map(\"created_at\") @db.Timestamptz\n\n  operation LlmOperation        @relation(fields: [operationId], references: [id], onDelete: Cascade)\n  version   LlmOperationVersion @relation(fields: [newVersionId], references: [id])\n\n  @@index([operationId, createdAt(sort: Desc)])\n  @@map(\"llm_operation_activation_events\")\n}\n\n// Eval suite (versioned fixture bundle)\nmodel LlmOperationEvalSuite {\n  id          String   @id @default(uuid()) @db.Uuid\n  operationId String   @map(\"operation_id\") @db.Uuid\n  versionId   String?  @map(\"version_id\") @db.Uuid\n  name        String   @db.VarChar(255)\n  description String?  @db.Text\n  suiteDigest String   @map(\"suite_digest\") @db.VarChar(128)\n  createdBy   String   @map(\"created_by\") @db.VarChar(255)\n  createdAt   DateTime @default(now()) @map(\"created_at\") @db.Timestamptz\n\n  cases    LlmOperationEvalCase[]\n  evalRuns LlmOperationEvalRun[]\n\n  @@index([operationId, versionId])\n  @@map(\"llm_operation_eval_suites\")\n}\n\n// Eval case (single fixture)\nmodel LlmOperationEvalCase {\n  id            String   @id @default(uuid()) @db.Uuid\n  suiteId       String   @map(\"suite_id\") @db.Uuid\n  name          String   @db.VarChar(255)\n  inputJson     Json     @map(\"input_json\")\n  expectedJson  Json?    @map(\"expected_json\")\n  isNegative    Boolean  @default(false) @map(\"is_negative\")\n  errorContains String?  @map(\"error_contains\") @db.VarChar(255)\n  createdAt     DateTime @default(now()) @map(\"created_at\") @db.Timestamptz\n\n  suite LlmOperationEvalSuite @relation(fields: [suiteId], references: [id], onDelete: Cascade)\n\n  @@index([suiteId])\n  @@map(\"llm_operation_eval_cases\")\n}\n\n// Eval run (execution of a suite against a version)\nmodel LlmOperationEvalRun {\n  id                  String    @id @default(uuid()) @db.Uuid\n  versionId           String    @map(\"version_id\") @db.Uuid\n  suiteId             String    @map(\"suite_id\") @db.Uuid\n  modelPolicySnapshot Json      @map(\"model_policy_snapshot\")\n  resultsJson         Json      @map(\"results_json\")\n  metricsJson         Json      @map(\"metrics_json\")\n  baselineVersionId   String?   @map(\"baseline_version_id\") @db.Uuid\n  executedBy          String    @map(\"executed_by\") @db.VarChar(255)\n  startedAt           DateTime  @default(now()) @map(\"started_at\") @db.Timestamptz\n  completedAt         DateTime? @map(\"completed_at\") @db.Timestamptz\n\n  version LlmOperationVersion   @relation(fields: [versionId], references: [id])\n  suite   LlmOperationEvalSuite @relation(fields: [suiteId], references: [id])\n\n  @@index([versionId])\n  @@index([suiteId])\n  @@map(\"llm_operation_eval_runs\")\n}\n\n// Invocation audit (per call)\nmodel LlmOperationInvocation {\n  id               String    @id @default(uuid()) @db.Uuid\n  versionId        String    @map(\"version_id\") @db.Uuid\n  executionId      String?   @map(\"execution_id\") @db.Uuid\n  stepId           String?   @map(\"step_id\") @db.Uuid\n  tenantId         String?   @map(\"tenant_id\") @db.Uuid\n  provider         String    @db.VarChar(64)\n  requestedModel   String    @map(\"requested_model\") @db.VarChar(128)\n  resolvedModel    String?   @map(\"resolved_model\") @db.VarChar(128)\n  inputDigest      String?   @map(\"input_digest\") @db.VarChar(128)\n  outputDigest     String?   @map(\"output_digest\") @db.VarChar(128)\n  idempotencyKey   String?   @map(\"idempotency_key\") @db.VarChar(255)\n  resultJson       Json?     @map(\"result_json\")\n  inputStorageRef  String?   @map(\"input_storage_ref\") @db.VarChar(255)\n  outputStorageRef String?   @map(\"output_storage_ref\") @db.VarChar(255)\n  tokenUsageJson   Json?     @map(\"token_usage_json\")\n  latencyMs        Int?      @map(\"latency_ms\")\n  estimatedCost    Decimal?  @map(\"estimated_cost\") @db.Decimal(20, 8)\n  parseAttempts    Int       @default(1) @map(\"parse_attempts\")\n  repairAttempts   Int       @default(0) @map(\"repair_attempts\")\n  validationResult String    @map(\"validation_result\") @db.VarChar(32) // passed | failed | skipped\n  finishReason     String?   @map(\"finish_reason\") @db.VarChar(64)\n  errorCode        String?   @map(\"error_code\") @db.VarChar(64)\n  actor            String    @map(\"actor\") @db.VarChar(255)\n  environment      String    @db.VarChar(32)\n  startedAt        DateTime  @default(now()) @map(\"started_at\") @db.Timestamptz\n  completedAt      DateTime? @map(\"completed_at\") @db.Timestamptz\n\n  version LlmOperationVersion @relation(fields: [versionId], references: [id])\n\n  @@unique([versionId, idempotencyKey])\n  @@index([versionId, startedAt(sort: Desc)])\n  @@index([executionId])\n  @@map(\"llm_operation_invocations\")\n}\n\n// Attestation: independent first-class attestation record\nmodel LlmOperationAttestation {\n  id               String   @id @default(uuid()) @db.Uuid\n  operationId      String   @map(\"operation_id\") @db.Uuid\n  versionId        String   @map(\"version_id\") @db.Uuid\n  operationDigest  String   @map(\"operation_digest\") @db.VarChar(128)\n  contractDigest   String   @map(\"contract_digest\") @db.VarChar(128)\n  evalSuiteDigest  String?  @map(\"eval_suite_digest\") @db.VarChar(128)\n  validatorVersion String   @map(\"validator_version\") @db.VarChar(32)\n  schemaTests      String   @map(\"schema_tests\") @db.VarChar(16) // passed | failed | skipped\n  offlineEvals     String   @map(\"offline_evals\") @db.VarChar(16)\n  liveEvals        String   @map(\"live_evals\") @db.VarChar(16)\n  securityEvals    String   @map(\"security_evals\") @db.VarChar(16)\n  gateResultsJson  Json     @map(\"gate_results_json\")\n  createdBy        String   @map(\"created_by\") @db.VarChar(255)\n  createdAt        DateTime @default(now()) @map(\"created_at\") @db.Timestamptz\n\n  operation LlmOperation        @relation(fields: [operationId], references: [id], onDelete: Cascade)\n  version   LlmOperationVersion @relation(fields: [versionId], references: [id])\n\n  @@unique([versionId, operationDigest])\n  @@index([operationId, createdAt(sort: Desc)])\n  @@map(\"llm_operation_attestations\")\n}\n",
  "inlineSchemaHash": "494a8f91af80f52c9a4103f78b3ec3b6f71285827a13d4f2e018618b521c26bc",
  "copyEngine": true
}

const fs = require('fs')

config.dirname = __dirname
if (!fs.existsSync(path.join(__dirname, 'schema.prisma'))) {
  const alternativePaths = [
    "src/generated/prisma",
    "generated/prisma",
  ]
  
  const alternativePath = alternativePaths.find((altPath) => {
    return fs.existsSync(path.join(process.cwd(), altPath, 'schema.prisma'))
  }) ?? alternativePaths[0]

  config.dirname = path.join(process.cwd(), alternativePath)
  config.isBundled = true
}

config.runtimeDataModel = JSON.parse("{\"models\":{\"Execution\":{\"dbName\":\"executions\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"orgId\",\"dbName\":\"org_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdBy\",\"dbName\":\"created_by\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"skillId\",\"dbName\":\"skill_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"skillVersion\",\"dbName\":\"skill_version\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"status\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"runtimeType\",\"dbName\":\"runtime_type\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":\"browser\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"riskLevel\",\"dbName\":\"risk_level\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":\"L0\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"inputJson\",\"dbName\":\"input_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"normalizedInputJson\",\"dbName\":\"normalized_input_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"resultJson\",\"dbName\":\"result_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"failureReason\",\"dbName\":\"failure_reason\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"failureCode\",\"dbName\":\"failure_code\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"currentStepId\",\"dbName\":\"current_step_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"requiresApproval\",\"dbName\":\"requires_approval\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"approvalStatus\",\"dbName\":\"approval_status\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"takeoverRequired\",\"dbName\":\"takeover_required\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"takeoverReason\",\"dbName\":\"takeover_reason\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"startedAt\",\"dbName\":\"started_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"endedAt\",\"dbName\":\"ended_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"steps\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"ExecutionStep\",\"relationName\":\"ExecutionToExecutionStep\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"runtimeSessions\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"RuntimeSession\",\"relationName\":\"ExecutionToRuntimeSession\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"events\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"ExecutionEvent\",\"relationName\":\"ExecutionToExecutionEvent\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"ExecutionStep\":{\"dbName\":\"execution_steps\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"executionId\",\"dbName\":\"execution_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"stepIndex\",\"dbName\":\"step_index\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"type\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"status\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"action\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"targetJson\",\"dbName\":\"target_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"inputJson\",\"dbName\":\"input_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"outputJson\",\"dbName\":\"output_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"assertionJson\",\"dbName\":\"assertion_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"errorMessage\",\"dbName\":\"error_message\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"errorCode\",\"dbName\":\"error_code\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"retryCount\",\"dbName\":\"retry_count\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Int\",\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"snapshotId\",\"dbName\":\"snapshot_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"takeoverTriggered\",\"dbName\":\"takeover_triggered\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"startedAt\",\"dbName\":\"started_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"endedAt\",\"dbName\":\"ended_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"execution\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Execution\",\"relationName\":\"ExecutionToExecutionStep\",\"relationFromFields\":[\"executionId\"],\"relationToFields\":[\"id\"],\"relationOnDelete\":\"Cascade\",\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[[\"executionId\",\"stepIndex\"]],\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"executionId\",\"stepIndex\"]}],\"isGenerated\":false},\"RuntimeSession\":{\"dbName\":\"runtime_sessions\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"executionId\",\"dbName\":\"execution_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"runtimeType\",\"dbName\":\"runtime_type\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":\"browser\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"workerId\",\"dbName\":\"worker_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"profileId\",\"dbName\":\"profile_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"state\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"controlMode\",\"dbName\":\"control_mode\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":\"AGENT_RUNNING\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"connectionInfoJson\",\"dbName\":\"connection_info_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"freezeReason\",\"dbName\":\"freeze_reason\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"closedAt\",\"dbName\":\"closed_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"execution\",\"kind\":\"object\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Execution\",\"relationName\":\"ExecutionToRuntimeSession\",\"relationFromFields\":[\"executionId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"ExecutionEvent\":{\"dbName\":\"execution_events\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"executionId\",\"dbName\":\"execution_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"runtimeSessionId\",\"dbName\":\"runtime_session_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"stepId\",\"dbName\":\"step_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"eventType\",\"dbName\":\"event_type\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"eventSource\",\"dbName\":\"event_source\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"payloadJson\",\"dbName\":\"payload_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"execution\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Execution\",\"relationName\":\"ExecutionToExecutionEvent\",\"relationFromFields\":[\"executionId\"],\"relationToFields\":[\"id\"],\"relationOnDelete\":\"Cascade\",\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"LlmOperation\":{\"dbName\":\"llm_operations\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"operationKey\",\"dbName\":\"operation_key\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":true,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"displayName\",\"dbName\":\"display_name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"description\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"owner\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"status\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":\"active\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"source\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":\"admin_created\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"versions\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationVersion\",\"relationName\":\"LlmOperationToLlmOperationVersion\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"activations\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationActivation\",\"relationName\":\"LlmOperationToLlmOperationActivation\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"activationEvents\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationActivationEvent\",\"relationName\":\"LlmOperationToLlmOperationActivationEvent\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"attestations\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationAttestation\",\"relationName\":\"LlmOperationToLlmOperationAttestation\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"LlmOperationVersion\":{\"dbName\":\"llm_operation_versions\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"operationId\",\"dbName\":\"operation_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"version\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"state\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":\"draft\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"manifestJson\",\"dbName\":\"manifest_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"operationDigest\",\"dbName\":\"operation_digest\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"contractDigest\",\"dbName\":\"contract_digest\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"changeSummary\",\"dbName\":\"change_summary\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":\"\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"source\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":\"admin_created\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"approvedBy\",\"dbName\":\"approved_by\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"approvedAt\",\"dbName\":\"approved_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdBy\",\"dbName\":\"created_by\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"operation\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperation\",\"relationName\":\"LlmOperationToLlmOperationVersion\",\"relationFromFields\":[\"operationId\"],\"relationToFields\":[\"id\"],\"relationOnDelete\":\"Cascade\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"activations\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationActivation\",\"relationName\":\"LlmOperationActivationToLlmOperationVersion\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"activationEvents\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationActivationEvent\",\"relationName\":\"LlmOperationActivationEventToLlmOperationVersion\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"evalRuns\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationEvalRun\",\"relationName\":\"LlmOperationEvalRunToLlmOperationVersion\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"invocations\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationInvocation\",\"relationName\":\"LlmOperationInvocationToLlmOperationVersion\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"attestations\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationAttestation\",\"relationName\":\"LlmOperationAttestationToLlmOperationVersion\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[[\"operationId\",\"version\"],[\"operationId\",\"operationDigest\"]],\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"operationId\",\"version\"]},{\"name\":null,\"fields\":[\"operationId\",\"operationDigest\"]}],\"isGenerated\":false},\"LlmOperationActivation\":{\"dbName\":\"llm_operation_activations\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"operationId\",\"dbName\":\"operation_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"versionId\",\"dbName\":\"version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"environment\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"label\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"activatedBy\",\"dbName\":\"activated_by\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"reason\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"rolloutPercent\",\"dbName\":\"rollout_percent\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"activatedAt\",\"dbName\":\"activated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"operation\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperation\",\"relationName\":\"LlmOperationToLlmOperationActivation\",\"relationFromFields\":[\"operationId\"],\"relationToFields\":[\"id\"],\"relationOnDelete\":\"Cascade\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"version\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationVersion\",\"relationName\":\"LlmOperationActivationToLlmOperationVersion\",\"relationFromFields\":[\"versionId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[[\"operationId\",\"environment\"]],\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"operationId\",\"environment\"]}],\"isGenerated\":false},\"LlmOperationActivationEvent\":{\"dbName\":\"llm_operation_activation_events\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"operationId\",\"dbName\":\"operation_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"previousVersionId\",\"dbName\":\"previous_version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"newVersionId\",\"dbName\":\"new_version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"environment\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"action\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"actor\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"reason\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"metadataJson\",\"dbName\":\"metadata_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"operation\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperation\",\"relationName\":\"LlmOperationToLlmOperationActivationEvent\",\"relationFromFields\":[\"operationId\"],\"relationToFields\":[\"id\"],\"relationOnDelete\":\"Cascade\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"version\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationVersion\",\"relationName\":\"LlmOperationActivationEventToLlmOperationVersion\",\"relationFromFields\":[\"newVersionId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"LlmOperationEvalSuite\":{\"dbName\":\"llm_operation_eval_suites\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"operationId\",\"dbName\":\"operation_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"versionId\",\"dbName\":\"version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"description\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"suiteDigest\",\"dbName\":\"suite_digest\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdBy\",\"dbName\":\"created_by\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"cases\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationEvalCase\",\"relationName\":\"LlmOperationEvalCaseToLlmOperationEvalSuite\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"evalRuns\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationEvalRun\",\"relationName\":\"LlmOperationEvalRunToLlmOperationEvalSuite\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"LlmOperationEvalCase\":{\"dbName\":\"llm_operation_eval_cases\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"suiteId\",\"dbName\":\"suite_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"inputJson\",\"dbName\":\"input_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"expectedJson\",\"dbName\":\"expected_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isNegative\",\"dbName\":\"is_negative\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"errorContains\",\"dbName\":\"error_contains\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"suite\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationEvalSuite\",\"relationName\":\"LlmOperationEvalCaseToLlmOperationEvalSuite\",\"relationFromFields\":[\"suiteId\"],\"relationToFields\":[\"id\"],\"relationOnDelete\":\"Cascade\",\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"LlmOperationEvalRun\":{\"dbName\":\"llm_operation_eval_runs\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"versionId\",\"dbName\":\"version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"suiteId\",\"dbName\":\"suite_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"modelPolicySnapshot\",\"dbName\":\"model_policy_snapshot\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"resultsJson\",\"dbName\":\"results_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"metricsJson\",\"dbName\":\"metrics_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"baselineVersionId\",\"dbName\":\"baseline_version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"executedBy\",\"dbName\":\"executed_by\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"startedAt\",\"dbName\":\"started_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"completedAt\",\"dbName\":\"completed_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"version\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationVersion\",\"relationName\":\"LlmOperationEvalRunToLlmOperationVersion\",\"relationFromFields\":[\"versionId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"suite\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationEvalSuite\",\"relationName\":\"LlmOperationEvalRunToLlmOperationEvalSuite\",\"relationFromFields\":[\"suiteId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"LlmOperationInvocation\":{\"dbName\":\"llm_operation_invocations\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"versionId\",\"dbName\":\"version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"executionId\",\"dbName\":\"execution_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"stepId\",\"dbName\":\"step_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"tenantId\",\"dbName\":\"tenant_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"provider\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"requestedModel\",\"dbName\":\"requested_model\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"resolvedModel\",\"dbName\":\"resolved_model\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"inputDigest\",\"dbName\":\"input_digest\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"outputDigest\",\"dbName\":\"output_digest\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"idempotencyKey\",\"dbName\":\"idempotency_key\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"resultJson\",\"dbName\":\"result_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"inputStorageRef\",\"dbName\":\"input_storage_ref\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"outputStorageRef\",\"dbName\":\"output_storage_ref\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"tokenUsageJson\",\"dbName\":\"token_usage_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"latencyMs\",\"dbName\":\"latency_ms\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Int\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"estimatedCost\",\"dbName\":\"estimated_cost\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Decimal\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"parseAttempts\",\"dbName\":\"parse_attempts\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Int\",\"default\":1,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"repairAttempts\",\"dbName\":\"repair_attempts\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Int\",\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"validationResult\",\"dbName\":\"validation_result\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"finishReason\",\"dbName\":\"finish_reason\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"errorCode\",\"dbName\":\"error_code\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"actor\",\"dbName\":\"actor\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"environment\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"startedAt\",\"dbName\":\"started_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"completedAt\",\"dbName\":\"completed_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"version\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationVersion\",\"relationName\":\"LlmOperationInvocationToLlmOperationVersion\",\"relationFromFields\":[\"versionId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[[\"versionId\",\"idempotencyKey\"]],\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"versionId\",\"idempotencyKey\"]}],\"isGenerated\":false},\"LlmOperationAttestation\":{\"dbName\":\"llm_operation_attestations\",\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"default\":{\"name\":\"uuid(4)\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"operationId\",\"dbName\":\"operation_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"versionId\",\"dbName\":\"version_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"operationDigest\",\"dbName\":\"operation_digest\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"contractDigest\",\"dbName\":\"contract_digest\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"evalSuiteDigest\",\"dbName\":\"eval_suite_digest\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"validatorVersion\",\"dbName\":\"validator_version\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"schemaTests\",\"dbName\":\"schema_tests\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"offlineEvals\",\"dbName\":\"offline_evals\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"liveEvals\",\"dbName\":\"live_evals\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"securityEvals\",\"dbName\":\"security_evals\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"gateResultsJson\",\"dbName\":\"gate_results_json\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdBy\",\"dbName\":\"created_by\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"operation\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperation\",\"relationName\":\"LlmOperationToLlmOperationAttestation\",\"relationFromFields\":[\"operationId\"],\"relationToFields\":[\"id\"],\"relationOnDelete\":\"Cascade\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"version\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"LlmOperationVersion\",\"relationName\":\"LlmOperationAttestationToLlmOperationVersion\",\"relationFromFields\":[\"versionId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[[\"versionId\",\"operationDigest\"]],\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"versionId\",\"operationDigest\"]}],\"isGenerated\":false}},\"enums\":{},\"types\":{}}")
defineDmmfProperty(exports.Prisma, config.runtimeDataModel)
config.engineWasm = undefined


const { warnEnvConflicts } = require('./runtime/library.js')

warnEnvConflicts({
    rootEnvPath: config.relativeEnvPaths.rootEnvPath && path.resolve(config.dirname, config.relativeEnvPaths.rootEnvPath),
    schemaEnvPath: config.relativeEnvPaths.schemaEnvPath && path.resolve(config.dirname, config.relativeEnvPaths.schemaEnvPath)
})

const PrismaClient = getPrismaClient(config)
exports.PrismaClient = PrismaClient
Object.assign(exports, Prisma)

// file annotations for bundling tools to include these files
path.join(__dirname, "libquery_engine-linux-arm64-openssl-1.1.x.so.node");
path.join(process.cwd(), "src/generated/prisma/libquery_engine-linux-arm64-openssl-1.1.x.so.node")
// file annotations for bundling tools to include these files
path.join(__dirname, "schema.prisma");
path.join(process.cwd(), "src/generated/prisma/schema.prisma")
