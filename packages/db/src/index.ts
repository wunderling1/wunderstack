export * from "./schema/index.js";
export { getDb, getWriterDb, getProvisionerDb, closeDb, type Database } from "./client.js";
export { assertFundKey, quoteIdent, quoteLiteral, FUND_KEY_RE, SCHEMA_NAME_RE } from "./ident.js";
export {
  assertOpaqueConnectionKey,
  resolveConnection,
  connectionEnvName,
} from "./connection-key.js";
export { withSearchPath, withFundContext } from "./search-path.js";
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
} from "./fund-schema.js";
export {
  FUND_MIGRATION_PROVISION,
  FUND_MIGRATION_ROLEPLAY,
  FUND_MIGRATION_TURN_OUTCOME,
  FUND_MIGRATION_OUTCOME_CHECK,
  turnOutcomeAlterSql,
  outcomeCheckConstraintSql,
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
} from "./fund-ddl.js";
export {
  grantReaderOnControlSql,
  grantReaderOnFundSchemaSql,
  grantOwnerOnFundSchemaSql,
} from "./grants.js";
export { canDropPublicCorpus, type FundCopyCheck, type DropPublicDecision } from "./drop-public-corpus.js";
export { recordAuditEvent, AUDIT_ACTIONS, type AuditAction } from "./audit-events.js";
export {
  createFundEnvironment,
  buildFundEnvironmentStatements,
  FundExistsError,
  type CreateFundEnvironmentInput,
  type CreateFundEnvironmentResult,
  type CreatedAgentInstance,
} from "./fund-environment.js";
export {
  createFundUser,
  updateUserPassword,
  UserExistsError,
  UserNotFoundError,
  resetFundUserPassword,
  updateFundUserEmail,
  listFundUsers,
  type FundUserPublic,
} from "./dashboard-users.js";
export {
  getFund,
  getLatestFundDump,
  countFundDumps,
  updateFundDisplayName,
  getFundTheme,
  updateFundTheme,
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
} from "./fund-lifecycle.js";
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
} from "./resolve-instance.js";
export {
  generateTenantKey,
  fundSchemaName,
  getTenantConfig,
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
} from "./agent-instances.js";
export { getAgentConfig, parseAgentConfigData } from "./agent-config.js";
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
} from "./roleplay-scenarios.js";
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
} from "./lti11.js";

// Re-export the query operators consumers need, so the ORM stays behind this seam
// (no package/script imports drizzle-orm directly). Extend as new operators are needed.
export { eq, and, asc, desc, gte, gt, lt, lte, inArray, isNotNull, count, sql } from "drizzle-orm";
// pgvector distance helper used by retrieval (Fase 5). Kept here so the ORM stays behind
// this seam; add l2Distance/innerProduct here too if a later phase needs them.
export { cosineDistance } from "drizzle-orm";
