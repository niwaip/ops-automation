
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


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

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

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



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  username: 'username',
  passwordHash: 'passwordHash',
  email: 'email',
  role: 'role',
  ldapDn: 'ldapDn',
  adSid: 'adSid',
  externalId: 'externalId',
  activeOrgId: 'activeOrgId',
  isActive: 'isActive',
  lastLoginAt: 'lastLoginAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RoleScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  permissions: 'permissions',
  isSystem: 'isSystem',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserRoleScalarFieldEnum = {
  userId: 'userId',
  roleId: 'roleId',
  assignedAt: 'assignedAt',
  assignedBy: 'assignedBy'
};

exports.Prisma.OrganizationScalarFieldEnum = {
  id: 'id',
  name: 'name',
  code: 'code',
  type: 'type',
  description: 'description',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DepartmentScalarFieldEnum = {
  id: 'id',
  orgId: 'orgId',
  parentId: 'parentId',
  name: 'name',
  code: 'code',
  managerUserId: 'managerUserId',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TeamScalarFieldEnum = {
  id: 'id',
  orgId: 'orgId',
  departmentId: 'departmentId',
  name: 'name',
  code: 'code',
  leadUserId: 'leadUserId',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OrgMembershipScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  orgId: 'orgId',
  departmentId: 'departmentId',
  title: 'title',
  status: 'status',
  joinedAt: 'joinedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TeamMembershipScalarFieldEnum = {
  id: 'id',
  orgMembershipId: 'orgMembershipId',
  teamId: 'teamId',
  role: 'role',
  isPrimary: 'isPrimary',
  createdAt: 'createdAt'
};

exports.Prisma.OrgRoleBindingScalarFieldEnum = {
  id: 'id',
  orgId: 'orgId',
  membershipId: 'membershipId',
  roleId: 'roleId',
  scopeType: 'scopeType',
  scopeRefId: 'scopeRefId',
  assignedBy: 'assignedBy',
  assignedAt: 'assignedAt'
};

exports.Prisma.IdentityProviderConfigScalarFieldEnum = {
  id: 'id',
  orgId: 'orgId',
  name: 'name',
  providerType: 'providerType',
  tenantId: 'tenantId',
  issuer: 'issuer',
  clientId: 'clientId',
  clientSecretEnc: 'clientSecretEnc',
  discoveryUrl: 'discoveryUrl',
  authUrl: 'authUrl',
  tokenUrl: 'tokenUrl',
  jwksUrl: 'jwksUrl',
  scopes: 'scopes',
  isEnabled: 'isEnabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ExecutionFlowTemplateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  goal: 'goal',
  expectedResult: 'expectedResult',
  paramsSchema: 'paramsSchema',
  category: 'category',
  steps: 'steps',
  executionFlowKeys: 'executionFlowKeys',
  validation: 'validation',
  usageCount: 'usageCount',
  isPublic: 'isPublic',
  createdBy: 'createdBy',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SkillConfigScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  triggerKeywords: 'triggerKeywords',
  paramsSchema: 'paramsSchema',
  outputSchema: 'outputSchema',
  candidateSchemaJson: 'candidateSchemaJson',
  candidateSchemaGeneratedAt: 'candidateSchemaGeneratedAt',
  templateId: 'templateId',
  carboneTemplateId: 'carboneTemplateId',
  carboneSkillId: 'carboneSkillId',
  apiEndpoints: 'apiEndpoints',
  executionFlow: 'executionFlow',
  executionFlowTemplateIds: 'executionFlowTemplateIds',
  tools: 'tools',
  configStatus: 'configStatus',
  lastValidationSummary: 'lastValidationSummary',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SkillPermissionScalarFieldEnum = {
  skillId: 'skillId',
  roleId: 'roleId',
  grantedAt: 'grantedAt',
  grantedBy: 'grantedBy'
};

exports.Prisma.SkillAccessRequestScalarFieldEnum = {
  id: 'id',
  skillId: 'skillId',
  requesterUserId: 'requesterUserId',
  status: 'status',
  reason: 'reason',
  responseNote: 'responseNote',
  processedAt: 'processedAt',
  processedBy: 'processedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ToolCatalogScalarFieldEnum = {
  id: 'id',
  name: 'name',
  displayName: 'displayName',
  description: 'description',
  category: 'category',
  runtimeType: 'runtimeType',
  status: 'status',
  riskLevel: 'riskLevel',
  allowSkillBinding: 'allowSkillBinding',
  promptExposure: 'promptExposure',
  defaultRequiresConfirmation: 'defaultRequiresConfirmation',
  defaultRequiresApproval: 'defaultRequiresApproval',
  metadataJson: 'metadataJson',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SkillToolBindingScalarFieldEnum = {
  id: 'id',
  skillId: 'skillId',
  toolName: 'toolName',
  bindingSource: 'bindingSource',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ChatSessionScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  title: 'title',
  modelId: 'modelId',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ChatMessageScalarFieldEnum = {
  id: 'id',
  sessionId: 'sessionId',
  role: 'role',
  content: 'content',
  metadata: 'metadata',
  createdAt: 'createdAt'
};

exports.Prisma.ExecutionScalarFieldEnum = {
  id: 'id',
  orgId: 'orgId',
  createdBy: 'createdBy',
  skillId: 'skillId',
  skillVersion: 'skillVersion',
  status: 'status',
  runtimeType: 'runtimeType',
  riskLevel: 'riskLevel',
  executionMode: 'executionMode',
  inputJson: 'inputJson',
  normalizedInputJson: 'normalizedInputJson',
  resultJson: 'resultJson',
  failureReason: 'failureReason',
  failureCode: 'failureCode',
  currentStepId: 'currentStepId',
  currentPhaseKey: 'currentPhaseKey',
  currentPhaseStatus: 'currentPhaseStatus',
  requiresApproval: 'requiresApproval',
  approvalStatus: 'approvalStatus',
  takeoverRequired: 'takeoverRequired',
  takeoverStatus: 'takeoverStatus',
  takeoverReason: 'takeoverReason',
  triggerType: 'triggerType',
  scheduleId: 'scheduleId',
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
  leaseExpiresAt: 'leaseExpiresAt',
  connectionInfoJson: 'connectionInfoJson',
  capabilitiesJson: 'capabilitiesJson',
  healthStatus: 'healthStatus',
  freezeReason: 'freezeReason',
  lastActivityAt: 'lastActivityAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  closedAt: 'closedAt'
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
  planNodeId: 'planNodeId',
  nodeKind: 'nodeKind',
  capabilityId: 'capabilityId',
  capabilityVersion: 'capabilityVersion',
  dependsOnJson: 'dependsOnJson',
  inputBindingsJson: 'inputBindingsJson',
  outputContractJson: 'outputContractJson',
  outputSchemaJson: 'outputSchemaJson',
  inputSchemaJson: 'inputSchemaJson',
  resolvedInputJson: 'resolvedInputJson',
  idempotencyKey: 'idempotencyKey',
  leaseOwner: 'leaseOwner',
  leaseExpiresAt: 'leaseExpiresAt',
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ExecutionPlanScalarFieldEnum = {
  id: 'id',
  executionId: 'executionId',
  schemaVersion: 'schemaVersion',
  plannerVersion: 'plannerVersion',
  catalogVersion: 'catalogVersion',
  planType: 'planType',
  status: 'status',
  objective: 'objective',
  planJson: 'planJson',
  validationJson: 'validationJson',
  planHash: 'planHash',
  createdAt: 'createdAt',
  frozenAt: 'frozenAt'
};

exports.Prisma.ExecutionArtifactScalarFieldEnum = {
  id: 'id',
  executionId: 'executionId',
  producerStepId: 'producerStepId',
  producerNodeId: 'producerNodeId',
  artifactType: 'artifactType',
  externalArtifactId: 'externalArtifactId',
  name: 'name',
  url: 'url',
  mimeType: 'mimeType',
  sizeBytes: 'sizeBytes',
  sha256: 'sha256',
  metadataJson: 'metadataJson',
  createdAt: 'createdAt'
};

exports.Prisma.ExecutionResultRefScalarFieldEnum = {
  id: 'id',
  executionId: 'executionId',
  producerStepId: 'producerStepId',
  schemaDigest: 'schemaDigest',
  payloadJson: 'payloadJson',
  previewJson: 'previewJson',
  sizeBytes: 'sizeBytes',
  createdAt: 'createdAt'
};

exports.Prisma.ExecutionPhaseScalarFieldEnum = {
  id: 'id',
  executionId: 'executionId',
  phaseKey: 'phaseKey',
  phaseName: 'phaseName',
  phaseType: 'phaseType',
  status: 'status',
  attempt: 'attempt',
  runtimeSessionId: 'runtimeSessionId',
  inputJson: 'inputJson',
  outputJson: 'outputJson',
  precheckJson: 'precheckJson',
  postcheckJson: 'postcheckJson',
  recoveryDecisionJson: 'recoveryDecisionJson',
  errorCode: 'errorCode',
  errorMessage: 'errorMessage',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ExecutionPhaseArtifactScalarFieldEnum = {
  id: 'id',
  phaseId: 'phaseId',
  artifactType: 'artifactType',
  snapshotId: 'snapshotId',
  pageUrl: 'pageUrl',
  pageFingerprint: 'pageFingerprint',
  payloadJson: 'payloadJson',
  createdAt: 'createdAt'
};

exports.Prisma.ExecutionTakeoverScalarFieldEnum = {
  id: 'id',
  executionId: 'executionId',
  phaseId: 'phaseId',
  runtimeSessionId: 'runtimeSessionId',
  status: 'status',
  reason: 'reason',
  requestedBy: 'requestedBy',
  resolvedBy: 'resolvedBy',
  resolutionNote: 'resolutionNote',
  createdAt: 'createdAt',
  resolvedAt: 'resolvedAt'
};

exports.Prisma.ExecutionPhaseStepScalarFieldEnum = {
  id: 'id',
  phaseId: 'phaseId',
  stepIndex: 'stepIndex',
  stepId: 'stepId',
  action: 'action',
  status: 'status',
  inputJson: 'inputJson',
  outputJson: 'outputJson',
  errorMessage: 'errorMessage',
  errorCode: 'errorCode',
  snapshotId: 'snapshotId',
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  createdAt: 'createdAt'
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

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  action: 'action',
  resource: 'resource',
  ipAddress: 'ipAddress',
  statusCode: 'statusCode',
  durationMs: 'durationMs',
  requestBody: 'requestBody',
  responseBody: 'responseBody',
  createdAt: 'createdAt'
};

exports.Prisma.ActivityScalarFieldEnum = {
  id: 'id',
  name: 'name',
  fn: 'fn',
  timeout: 'timeout',
  retryPolicy: 'retryPolicy',
  handler: 'handler',
  config: 'config',
  generatedCode: 'generatedCode',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TemporalWorkflowScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  taskQueue: 'taskQueue',
  workflowDsl: 'workflowDsl',
  activityDsl: 'activityDsl',
  generatedCode: 'generatedCode',
  artifactVersion: 'artifactVersion',
  artifactHash: 'artifactHash',
  validationStatus: 'validationStatus',
  validationScore: 'validationScore',
  validationResultJson: 'validationResultJson',
  validatedAt: 'validatedAt',
  isActive: 'isActive',
  deployedAt: 'deployedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SkillScheduleScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  skillId: 'skillId',
  skillVersion: 'skillVersion',
  inputJson: 'inputJson',
  cronExpression: 'cronExpression',
  timezone: 'timezone',
  isActive: 'isActive',
  lastRunAt: 'lastRunAt',
  nextRunAt: 'nextRunAt',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserSavedSkillScalarFieldEnum = {
  id: 'id',
  ownerUserId: 'ownerUserId',
  name: 'name',
  description: 'description',
  visibility: 'visibility',
  status: 'status',
  activeVersionId: 'activeVersionId',
  latestVersion: 'latestVersion',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserWorkflowAliasScalarFieldEnum = {
  id: 'id',
  ownerUserId: 'ownerUserId',
  skillId: 'skillId',
  skillVersion: 'skillVersion',
  alias: 'alias',
  normalizedAlias: 'normalizedAlias',
  status: 'status',
  confirmedAt: 'confirmedAt',
  createdAt: 'createdAt'
};

exports.Prisma.UserSavedSkillVersionScalarFieldEnum = {
  id: 'id',
  skillId: 'skillId',
  ownerUserId: 'ownerUserId',
  version: 'version',
  sourceExecutionId: 'sourceExecutionId',
  schemaVersion: 'schemaVersion',
  planSnapshotJson: 'planSnapshotJson',
  planHash: 'planHash',
  fixedInputJson: 'fixedInputJson',
  inputHash: 'inputHash',
  outputSchemaJson: 'outputSchemaJson',
  sampleResultJson: 'sampleResultJson',
  aiReviewJson: 'aiReviewJson',
  reviewStatus: 'reviewStatus',
  createdAt: 'createdAt'
};

exports.Prisma.AssistantFeedbackEventScalarFieldEnum = {
  id: 'id',
  eventId: 'eventId',
  ownerUserId: 'ownerUserId',
  sessionId: 'sessionId',
  messageId: 'messageId',
  executionId: 'executionId',
  revision: 'revision',
  eventType: 'eventType',
  rating: 'rating',
  reasonCode: 'reasonCode',
  sanitizedComment: 'sanitizedComment',
  occurredAt: 'occurredAt',
  createdAt: 'createdAt'
};

exports.Prisma.AssistantFeedbackCurrentScalarFieldEnum = {
  ownerUserId: 'ownerUserId',
  sessionId: 'sessionId',
  messageId: 'messageId',
  eventId: 'eventId',
  revision: 'revision',
  eventType: 'eventType',
  rating: 'rating',
  reasonCode: 'reasonCode',
  sanitizedComment: 'sanitizedComment',
  updatedAt: 'updatedAt'
};

exports.Prisma.RoutingObservationScalarFieldEnum = {
  id: 'id',
  ownerUserId: 'ownerUserId',
  requestFingerprint: 'requestFingerprint',
  routeSource: 'routeSource',
  matchMethod: 'matchMethod',
  selectedSourceId: 'selectedSourceId',
  selectedVersion: 'selectedVersion',
  candidateCount: 'candidateCount',
  matchScore: 'matchScore',
  plannerInvoked: 'plannerInvoked',
  plannerInputTokens: 'plannerInputTokens',
  contractStatus: 'contractStatus',
  businessStatus: 'businessStatus',
  errorCode: 'errorCode',
  routingPolicyVersion: 'routingPolicyVersion',
  routingPolicyDigest: 'routingPolicyDigest',
  createdAt: 'createdAt'
};

exports.Prisma.PlanningDecisionScalarFieldEnum = {
  id: 'id',
  ownerUserId: 'ownerUserId',
  executionId: 'executionId',
  requestFingerprint: 'requestFingerprint',
  schemaVersion: 'schemaVersion',
  routeClass: 'routeClass',
  routeSource: 'routeSource',
  decisionJson: 'decisionJson',
  shadow: 'shadow',
  routingPolicyVersion: 'routingPolicyVersion',
  routingPolicyDigest: 'routingPolicyDigest',
  catalogSnapshotDigest: 'catalogSnapshotDigest',
  createdAt: 'createdAt'
};

exports.Prisma.PromptSnapshotScalarFieldEnum = {
  id: 'id',
  ownerUserId: 'ownerUserId',
  executionId: 'executionId',
  purpose: 'purpose',
  promptTemplateVersion: 'promptTemplateVersion',
  promptTemplateDigest: 'promptTemplateDigest',
  systemPromptDigest: 'systemPromptDigest',
  catalogSnapshotDigest: 'catalogSnapshotDigest',
  modelPolicyDigest: 'modelPolicyDigest',
  generationParamsJson: 'generationParamsJson',
  inputRefsJson: 'inputRefsJson',
  createdAt: 'createdAt'
};

exports.Prisma.LlmUsageLedgerScalarFieldEnum = {
  id: 'id',
  ownerUserId: 'ownerUserId',
  executionId: 'executionId',
  planningDecisionId: 'planningDecisionId',
  stepId: 'stepId',
  promptSnapshotId: 'promptSnapshotId',
  traceId: 'traceId',
  purpose: 'purpose',
  provider: 'provider',
  modelId: 'modelId',
  inputTokens: 'inputTokens',
  outputTokens: 'outputTokens',
  cachedTokens: 'cachedTokens',
  estimatedCost: 'estimatedCost',
  currency: 'currency',
  createdAt: 'createdAt'
};

exports.Prisma.ExecutionOutboxScalarFieldEnum = {
  id: 'id',
  aggregateType: 'aggregateType',
  aggregateId: 'aggregateId',
  eventType: 'eventType',
  payloadJson: 'payloadJson',
  availableAt: 'availableAt',
  claimedBy: 'claimedBy',
  leaseExpiresAt: 'leaseExpiresAt',
  attempts: 'attempts',
  publishedAt: 'publishedAt',
  createdAt: 'createdAt'
};

exports.Prisma.ScheduleFireScalarFieldEnum = {
  id: 'id',
  scheduleId: 'scheduleId',
  scheduledAt: 'scheduledAt',
  status: 'status',
  executionId: 'executionId',
  claimedBy: 'claimedBy',
  leaseExpiresAt: 'leaseExpiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.HabitLearningRunScalarFieldEnum = {
  id: 'id',
  idempotencyKey: 'idempotencyKey',
  policyVersion: 'policyVersion',
  status: 'status',
  windowStart: 'windowStart',
  windowEnd: 'windowEnd',
  leaseOwner: 'leaseOwner',
  leaseExpiresAt: 'leaseExpiresAt',
  candidateCount: 'candidateCount',
  processedUsers: 'processedUsers',
  errorSummary: 'errorSummary',
  startedAt: 'startedAt',
  completedAt: 'completedAt'
};

exports.Prisma.UserHabitCandidateScalarFieldEnum = {
  id: 'id',
  idempotencyKey: 'idempotencyKey',
  ownerUserId: 'ownerUserId',
  kind: 'kind',
  status: 'status',
  riskLevel: 'riskLevel',
  intentKey: 'intentKey',
  savedSkillId: 'savedSkillId',
  savedVersion: 'savedVersion',
  evidenceJson: 'evidenceJson',
  reviewJson: 'reviewJson',
  shadowJson: 'shadowJson',
  sourceRunId: 'sourceRunId',
  policyVersion: 'policyVersion',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserHabitScalarFieldEnum = {
  id: 'id',
  ownerUserId: 'ownerUserId',
  kind: 'kind',
  status: 'status',
  intentKey: 'intentKey',
  savedSkillId: 'savedSkillId',
  savedVersion: 'savedVersion',
  valueJson: 'valueJson',
  sourceCandidateId: 'sourceCandidateId',
  version: 'version',
  contractDigest: 'contractDigest',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserPersonalizationPreferenceScalarFieldEnum = {
  ownerUserId: 'ownerUserId',
  recommendationEnabled: 'recommendationEnabled',
  updatedAt: 'updatedAt'
};

exports.Prisma.ScopedMemoryScalarFieldEnum = {
  id: 'id',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  organizationId: 'organizationId',
  kind: 'kind',
  memoryKey: 'memoryKey',
  valueJson: 'valueJson',
  source: 'source',
  version: 'version',
  status: 'status',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CandidateRecipeScalarFieldEnum = {
  id: 'id',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  intentFingerprint: 'intentFingerprint',
  topologyDigest: 'topologyDigest',
  recipeJson: 'recipeJson',
  riskLevel: 'riskLevel',
  status: 'status',
  version: 'version',
  shadowRuns: 'shadowRuns',
  shadowPasses: 'shadowPasses',
  approvedBy: 'approvedBy',
  rollbackVersion: 'rollbackVersion',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CandidateRecipeEvaluationScalarFieldEnum = {
  id: 'id',
  candidateRecipeId: 'candidateRecipeId',
  fixtureId: 'fixtureId',
  passed: 'passed',
  comparisonJson: 'comparisonJson',
  createdAt: 'createdAt'
};

exports.Prisma.HabitGovernanceAuditScalarFieldEnum = {
  id: 'id',
  actorUserId: 'actorUserId',
  targetType: 'targetType',
  targetId: 'targetId',
  action: 'action',
  reason: 'reason',
  beforeJson: 'beforeJson',
  afterJson: 'afterJson',
  createdAt: 'createdAt'
};

exports.Prisma.BuiltinSkillScalarFieldEnum = {
  id: 'id',
  capabilityKey: 'capabilityKey',
  displayName: 'displayName',
  description: 'description',
  owner: 'owner',
  category: 'category',
  defaultAccess: 'defaultAccess',
  lifecycle: 'lifecycle',
  isEnabled: 'isEnabled',
  activeVersionId: 'activeVersionId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BuiltinSkillVersionScalarFieldEnum = {
  id: 'id',
  builtinSkillId: 'builtinSkillId',
  definitionVersion: 'definitionVersion',
  apiVersion: 'apiVersion',
  definitionDigest: 'definitionDigest',
  manifestJson: 'manifestJson',
  workflowJson: 'workflowJson',
  runtimeBuild: 'runtimeBuild',
  attestationId: 'attestationId',
  createdAt: 'createdAt'
};

exports.Prisma.BuiltinSkillDeploymentScalarFieldEnum = {
  id: 'id',
  builtinSkillVersionId: 'builtinSkillVersionId',
  environment: 'environment',
  status: 'status',
  runtimeBuild: 'runtimeBuild',
  deployedAt: 'deployedAt',
  smokeTestStatus: 'smokeTestStatus',
  smokeTestDigest: 'smokeTestDigest',
  failureCode: 'failureCode'
};

exports.Prisma.BuiltinSkillPermissionOverrideScalarFieldEnum = {
  id: 'id',
  builtinSkillId: 'builtinSkillId',
  orgId: 'orgId',
  principalType: 'principalType',
  principalId: 'principalId',
  effect: 'effect',
  reason: 'reason',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  expiresAt: 'expiresAt'
};

exports.Prisma.BuiltinSkillAuditEventScalarFieldEnum = {
  id: 'id',
  builtinSkillId: 'builtinSkillId',
  action: 'action',
  versionId: 'versionId',
  operator: 'operator',
  payload: 'payload',
  createdAt: 'createdAt'
};

exports.Prisma.CapabilityReleaseScalarFieldEnum = {
  id: 'id',
  sourceType: 'sourceType',
  sourceId: 'sourceId',
  sourceName: 'sourceName',
  sourceStatus: 'sourceStatus',
  releaseVersion: 'releaseVersion',
  status: 'status',
  approvalStatus: 'approvalStatus',
  deploymentStatus: 'deploymentStatus',
  currentSourceSnapshotId: 'currentSourceSnapshotId',
  currentBuildId: 'currentBuildId',
  latestSuccessfulBuildId: 'latestSuccessfulBuildId',
  latestValidationId: 'latestValidationId',
  latestSuccessfulValidationId: 'latestSuccessfulValidationId',
  currentSkillDraftId: 'currentSkillDraftId',
  publishedSkillId: 'publishedSkillId',
  lastDeploymentId: 'lastDeploymentId',
  rollbackOfReleaseId: 'rollbackOfReleaseId',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  archivedAt: 'archivedAt'
};

exports.Prisma.CapabilitySourceSnapshotScalarFieldEnum = {
  id: 'id',
  releaseId: 'releaseId',
  snapshotVersion: 'snapshotVersion',
  sourceType: 'sourceType',
  sourceId: 'sourceId',
  sourcePayloadJson: 'sourcePayloadJson',
  summary: 'summary',
  createdBy: 'createdBy',
  createdAt: 'createdAt'
};

exports.Prisma.CapabilityBuildScalarFieldEnum = {
  id: 'id',
  releaseId: 'releaseId',
  sourceSnapshotId: 'sourceSnapshotId',
  buildType: 'buildType',
  modelId: 'modelId',
  promptVersion: 'promptVersion',
  promptSnapshot: 'promptSnapshot',
  inputSnapshotJson: 'inputSnapshotJson',
  generatedCode: 'generatedCode',
  generatedConfigJson: 'generatedConfigJson',
  logsJson: 'logsJson',
  diffSummary: 'diffSummary',
  buildDiffJson: 'buildDiffJson',
  status: 'status',
  errorSummary: 'errorSummary',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  createdBy: 'createdBy',
  createdAt: 'createdAt'
};

exports.Prisma.CapabilityValidationScalarFieldEnum = {
  id: 'id',
  releaseId: 'releaseId',
  buildId: 'buildId',
  validationType: 'validationType',
  inputSnapshotJson: 'inputSnapshotJson',
  resultSnapshotJson: 'resultSnapshotJson',
  logsJson: 'logsJson',
  score: 'score',
  success: 'success',
  errorSummary: 'errorSummary',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  createdBy: 'createdBy',
  createdAt: 'createdAt'
};

exports.Prisma.CapabilityFixtureScalarFieldEnum = {
  id: 'id',
  releaseId: 'releaseId',
  buildId: 'buildId',
  name: 'name',
  fixtureType: 'fixtureType',
  inputJson: 'inputJson',
  expectedOutputJson: 'expectedOutputJson',
  isNegative: 'isNegative',
  errorContains: 'errorContains',
  createdAt: 'createdAt'
};

exports.Prisma.CapabilityAttestationScalarFieldEnum = {
  id: 'id',
  releaseId: 'releaseId',
  buildId: 'buildId',
  sourceDigest: 'sourceDigest',
  contractDigest: 'contractDigest',
  generatedCodeDigest: 'generatedCodeDigest',
  fixtureDigest: 'fixtureDigest',
  validatorVersion: 'validatorVersion',
  gateResultsJson: 'gateResultsJson',
  createdAt: 'createdAt'
};

exports.Prisma.SkillDraftScalarFieldEnum = {
  id: 'id',
  releaseId: 'releaseId',
  generatedFromBuildId: 'generatedFromBuildId',
  generatedFromValidationId: 'generatedFromValidationId',
  sourceType: 'sourceType',
  name: 'name',
  description: 'description',
  triggerKeywords: 'triggerKeywords',
  paramsSchema: 'paramsSchema',
  executionFlowTemplateIds: 'executionFlowTemplateIds',
  tools: 'tools',
  apiEndpoints: 'apiEndpoints',
  draftPayloadJson: 'draftPayloadJson',
  status: 'status',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DeploymentRecordScalarFieldEnum = {
  id: 'id',
  releaseId: 'releaseId',
  publishedSkillId: 'publishedSkillId',
  environment: 'environment',
  runtimeType: 'runtimeType',
  artifactUri: 'artifactUri',
  artifactHash: 'artifactHash',
  workerVersion: 'workerVersion',
  reloadStrategy: 'reloadStrategy',
  requestPayloadJson: 'requestPayloadJson',
  resultSnapshotJson: 'resultSnapshotJson',
  logsJson: 'logsJson',
  status: 'status',
  success: 'success',
  smokeValidationId: 'smokeValidationId',
  rollbackTargetReleaseId: 'rollbackTargetReleaseId',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  createdBy: 'createdBy',
  createdAt: 'createdAt'
};

exports.Prisma.ReleaseAuditEventScalarFieldEnum = {
  id: 'id',
  releaseId: 'releaseId',
  eventType: 'eventType',
  actorId: 'actorId',
  actorName: 'actorName',
  success: 'success',
  summary: 'summary',
  detailsJson: 'detailsJson',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.UserRoleType = exports.$Enums.UserRoleType = {
  employee: 'employee',
  admin: 'admin',
  agent: 'agent'
};

exports.OrganizationType = exports.$Enums.OrganizationType = {
  enterprise: 'enterprise',
  subsidiary: 'subsidiary',
  partner: 'partner'
};

exports.MembershipStatus = exports.$Enums.MembershipStatus = {
  active: 'active',
  invited: 'invited',
  suspended: 'suspended',
  left: 'left'
};

exports.IdentityProviderType = exports.$Enums.IdentityProviderType = {
  microsoft_oidc: 'microsoft_oidc',
  oidc: 'oidc',
  saml: 'saml'
};

exports.Prisma.ModelName = {
  User: 'User',
  Role: 'Role',
  UserRole: 'UserRole',
  Organization: 'Organization',
  Department: 'Department',
  Team: 'Team',
  OrgMembership: 'OrgMembership',
  TeamMembership: 'TeamMembership',
  OrgRoleBinding: 'OrgRoleBinding',
  IdentityProviderConfig: 'IdentityProviderConfig',
  ExecutionFlowTemplate: 'ExecutionFlowTemplate',
  SkillConfig: 'SkillConfig',
  SkillPermission: 'SkillPermission',
  SkillAccessRequest: 'SkillAccessRequest',
  ToolCatalog: 'ToolCatalog',
  SkillToolBinding: 'SkillToolBinding',
  ChatSession: 'ChatSession',
  ChatMessage: 'ChatMessage',
  Execution: 'Execution',
  RuntimeSession: 'RuntimeSession',
  ExecutionStep: 'ExecutionStep',
  ExecutionPlan: 'ExecutionPlan',
  ExecutionArtifact: 'ExecutionArtifact',
  ExecutionResultRef: 'ExecutionResultRef',
  ExecutionPhase: 'ExecutionPhase',
  ExecutionPhaseArtifact: 'ExecutionPhaseArtifact',
  ExecutionTakeover: 'ExecutionTakeover',
  ExecutionPhaseStep: 'ExecutionPhaseStep',
  ExecutionEvent: 'ExecutionEvent',
  AuditLog: 'AuditLog',
  Activity: 'Activity',
  TemporalWorkflow: 'TemporalWorkflow',
  SkillSchedule: 'SkillSchedule',
  UserSavedSkill: 'UserSavedSkill',
  UserWorkflowAlias: 'UserWorkflowAlias',
  UserSavedSkillVersion: 'UserSavedSkillVersion',
  AssistantFeedbackEvent: 'AssistantFeedbackEvent',
  AssistantFeedbackCurrent: 'AssistantFeedbackCurrent',
  RoutingObservation: 'RoutingObservation',
  PlanningDecision: 'PlanningDecision',
  PromptSnapshot: 'PromptSnapshot',
  LlmUsageLedger: 'LlmUsageLedger',
  ExecutionOutbox: 'ExecutionOutbox',
  ScheduleFire: 'ScheduleFire',
  HabitLearningRun: 'HabitLearningRun',
  UserHabitCandidate: 'UserHabitCandidate',
  UserHabit: 'UserHabit',
  UserPersonalizationPreference: 'UserPersonalizationPreference',
  ScopedMemory: 'ScopedMemory',
  CandidateRecipe: 'CandidateRecipe',
  CandidateRecipeEvaluation: 'CandidateRecipeEvaluation',
  HabitGovernanceAudit: 'HabitGovernanceAudit',
  BuiltinSkill: 'BuiltinSkill',
  BuiltinSkillVersion: 'BuiltinSkillVersion',
  BuiltinSkillDeployment: 'BuiltinSkillDeployment',
  BuiltinSkillPermissionOverride: 'BuiltinSkillPermissionOverride',
  BuiltinSkillAuditEvent: 'BuiltinSkillAuditEvent',
  CapabilityRelease: 'CapabilityRelease',
  CapabilitySourceSnapshot: 'CapabilitySourceSnapshot',
  CapabilityBuild: 'CapabilityBuild',
  CapabilityValidation: 'CapabilityValidation',
  CapabilityFixture: 'CapabilityFixture',
  CapabilityAttestation: 'CapabilityAttestation',
  SkillDraft: 'SkillDraft',
  DeploymentRecord: 'DeploymentRecord',
  ReleaseAuditEvent: 'ReleaseAuditEvent'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
