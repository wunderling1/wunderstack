export * from "./schema/index";
export { getDb, getWriterDb, getProvisionerDb, closeDb, type Database } from "./client";
export { assertFundKey, quoteIdent, quoteLiteral, FUND_KEY_RE, SCHEMA_NAME_RE } from "./ident";
export {
  assertOpaqueConnectionKey,
  resolveConnection,
  connectionEnvName,
} from "./connection-key";
export { withSearchPath, withFundContext } from "./search-path";
export {
  withFundSchema,
  listActiveFunds,
  findFundsWithoutSchema,
  registerFund,
  ensureFundTables,
  copyPublicCorpusIntoFund,
  recordFundMigration,
  listAppliedFundMigrations,
  type ActiveFund,
} from "./fund-schema";
export {
  FUND_MIGRATION_PROVISION,
  FUND_MIGRATION_ROLEPLAY,
  FUND_MIGRATION_TURN_OUTCOME,
  FUND_MIGRATION_OUTCOME_CHECK,
  FUND_MIGRATION_WINDOW_INDEXES,
  FUND_MIGRATION_OUTCOME_REASON_CHECK,
  turnOutcomeAlterSql,
  outcomeCheckConstraintSql,
  outcomeReasonCheckConstraintSql,
  outcomeReasonCheckViolationsSql,
  windowIndexesSql,
  provisionDdl,
  roleplayDdl,
  roleplayAlterSql,
  createRoleplayTablesSql,
  roleplayIndexesSql,
  createRoleplayTurnFunctionSql,
  dropPublicCorpusSql,
  publicCorpusTablesSql,
  appliedMigrationsSql,
  recordMigrationSql,
  countTableSql,
  createSchemaSql,
  createDocumentsLikeSql,
  createChunksLikeSql,
  createEventsLikeSql,
  addFundCheckSql,
  addChunksFkSql,
  truncateFundTablesSql,
  copyDocumentsSql,
  copyChunksSql,
  copyEventsSql,
  revokePublicFundSchemaSql,
  assertNoAnnOrPartitionSql,
} from "./fund-ddl";
export {
  grantReaderOnControlSql,
  grantReaderOnFundSchemaSql,
  grantOwnerOnFundSchemaSql,
} from "./grants";
export { canDropPublicCorpus, type FundCopyCheck, type DropPublicDecision } from "./drop-public-corpus";
export { recordAuditEvent, AUDIT_ACTIONS, type AuditAction } from "./audit-events";
export {
  createFundEnvironment,
  buildFundEnvironmentStatements,
  FundExistsError,
  type CreateFundEnvironmentInput,
  type CreateFundEnvironmentResult,
  type CreatedAgentInstance,
} from "./fund-environment";
export {
  createFundUser,
  updateUserPassword,
  UserExistsError,
  UserNotFoundError,
  resetFundUserPassword,
  updateFundUserEmail,
  listFundUsers,
  type FundUserPublic,
} from "./dashboard-users";
export {
  getFund,
  getLatestFundDump,
  countFundDumps,
  updateFundDisplayName,
  getFundTheme,
  updateFundTheme,
  parseStoredFundTheme,
  addFundAgent,
  openFundDump,
  deactivateFund,
  assertDeactivateAllowed,
  buildPgDumpArgs,
  redactSecrets,
  FundNotFoundError,
  FundInactiveError,
  DumpRequiredError,
  ConfirmationMismatchError,
  AgentInstanceExistsError,
  PgDumpMissingError,
  PgDumpFailedError,
  FundSchemaMissingError,
  type FundDumpAudit,
  type FundDumpStream,
  type AddedAgentInstance,
} from "./fund-lifecycle";
export {
  resolveInstanceByPublicKey,
  resolveInstanceByFundAgent,
  bindClaimsToInstance,
  instanceFromRow,
  pickUnkeyedInstance,
  retrievalScope,
  langfuseTagsFromInstance,
  type ResolvedInstance,
  type InstanceClaims,
  type BindClaimsResult,
  type UnkeyedInstancePick,
} from "./resolve-instance";
export {
  generateTenantKey,
  fundSchemaName,
  assertStoredSchemaName,
  getInstance,
  getInstanceByPublicKey,
  listInstances,
  listTenantConfigs,
  upsertTenantConfig,
  updateTenantConfig,
  createAgentInstance,
  rotateTenantKey,
  pinInstanceReleaseTag,
  type TenantConfigInput,
  type TenantConfig,
} from "./agent-instances";
export { getAgentConfig, parseAgentConfigData } from "./agent-config";
export {
  listScenarios,
  getScenario,
  createScenario,
  updateScenario,
  rowToDraft,
  nextScenarioVersion,
  scenarioContentFingerprint,
  ScenarioSlugTakenError,
  ScenarioNotFoundError,
} from "./roleplay-scenarios";
export {
  listLti11Consumers,
  getActiveLti11ConsumerByKey,
  getLti11ConsumerForDelivery,
  createLti11Consumer,
  deactivateLti11Consumer,
  setLti11GradePassback,
  acquireLti11Nonce,
  releaseLti11Nonce,
  insertLti11Launch,
  getUnexpiredLti11Launch,
  consumeLti11Launch,
  generateLti11Credentials,
  toPublicConsumer,
  LTI11_LAUNCH_TTL_MS,
  ConsumerKeyTakenError,
  Lti11ConsumerNotFoundError,
  type Lti11ConsumerPublic,
  type Lti11LaunchAuth,
} from "./lti11";

// Re-export the query operators consumers need, so the ORM stays behind this seam
// (no package/script imports drizzle-orm directly). Extend as new operators are needed.
export { eq, and, or, not, asc, desc, gte, gt, lt, lte, inArray, isNotNull, count, sql } from "drizzle-orm";
// `SQL` is the type of a composed fragment — needed by callers that build one filter and reuse it
// across several aggregate columns (see `breakdownCountSelect` in @wunderstack/analytics).
export type { SQL } from "drizzle-orm";
// pgvector distance helper used by retrieval (Fase 5). Kept here so the ORM stays behind
// this seam; add l2Distance/innerProduct here too if a later phase needs them.
export { cosineDistance } from "drizzle-orm";
