
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
  templateId: 'templateId',
  carboneTemplateId: 'carboneTemplateId',
  carboneSkillId: 'carboneSkillId',
  apiEndpoints: 'apiEndpoints',
  executionFlow: 'executionFlow',
  executionFlowTemplateIds: 'executionFlowTemplateIds',
  tools: 'tools',
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
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
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
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
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

exports.Prisma.ModelName = {
  User: 'User',
  Role: 'Role',
  UserRole: 'UserRole',
  ExecutionFlowTemplate: 'ExecutionFlowTemplate',
  SkillConfig: 'SkillConfig',
  SkillPermission: 'SkillPermission',
  ChatSession: 'ChatSession',
  ChatMessage: 'ChatMessage',
  Execution: 'Execution',
  ExecutionPhase: 'ExecutionPhase',
  ExecutionPhaseStep: 'ExecutionPhaseStep',
  ExecutionPhaseArtifact: 'ExecutionPhaseArtifact',
  ExecutionTakeover: 'ExecutionTakeover',
  RuntimeSession: 'RuntimeSession',
  ExecutionStep: 'ExecutionStep',
  ExecutionEvent: 'ExecutionEvent',
  AuditLog: 'AuditLog'
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
