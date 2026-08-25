import { agentKeySchema, env, type AgentKey } from "@wunderstack/shared";
import { eq, sql } from "drizzle-orm";

import { generateTenantKey, fundSchemaName } from "./agent-instances.js";
import { recordAuditEvent } from "./audit-events.js";
import { getProvisionerDb, type Database } from "./client.js";
import { createFundUser } from "./dashboard-users.js";
import {
  FUND_MIGRATION_PROVISION,
  provisionDdl,
  recordMigrationSql,
  revokePublicFundSchemaSql,
} from "./fund-ddl.js";
import {
  grantOwnerOnFundSchemaSql,
  grantReaderOnFundSchemaSql,
} from "./grants.js";
import { assertFundKey } from "./ident.js";
import { agentInstances } from "./schema/control/agent-instances.js";
import { funds } from "./schema/control/funds.js";

export class FundExistsError extends Error {
  readonly fundKey: string;

  constructor(fundKey: string) {
    super(`Fund ${JSON.stringify(fundKey)} already exists in control.funds.`);
    this.name = "FundExistsError";
    this.fundKey = fundKey;
  }
}

export interface CreateFundEnvironmentInput {
  fundKey: string;
  name: string;
  agentKeys: string[];
  user?: { email: string; passwordHash: string };
}

export interface CreatedAgentInstance {
  agentKey: AgentKey;
  publicKey: string;
}

export interface CreateFundEnvironmentResult {
  fundKey: string;
  name: string;
  schemaName: string;
  instances: CreatedAgentInstance[];
  userEmail: string | null;
}

/**
 * Build the ordered list of raw SQL statements createFundEnvironment executes inside its transaction
 * (DDL + grants + provision migration row). Control-plane INSERTs are separate Drizzle calls.
 * Exported for tests that assert the full statement list without opening a DB.
 */
export function buildFundEnvironmentStatements(input: {
  schemaName: string;
  fundKey: string;
  ownerRole?: string;
  readerRole?: string;
}): string[] {
  const statements: string[] = [
    ...provisionDdl(input.schemaName, input.fundKey, false),
    ...revokePublicFundSchemaSql(input.schemaName),
  ];
  if (input.ownerRole) {
    statements.push(...grantOwnerOnFundSchemaSql(input.ownerRole, input.schemaName));
  }
  if (input.readerRole) {
    statements.push(...grantReaderOnFundSchemaSql(input.readerRole, input.schemaName));
  }
  statements.push(recordMigrationSql(input.schemaName, FUND_MIGRATION_PROVISION));
  return statements;
}

/**
 * Atomic "create fund environment": control.funds + schema + grants + agent_instances + optional
 * user + audit. One provisioner transaction — a half-fund cannot remain. Plaintext passwords never
 * enter this package.
 */
export async function createFundEnvironment(
  input: CreateFundEnvironmentInput,
): Promise<CreateFundEnvironmentResult> {
  const fundKey = assertFundKey(input.fundKey);
  const name = input.name.trim();
  if (!name) {
    throw new Error("Fund display name is required.");
  }

  const agentKeys = input.agentKeys.map((key) => {
    const parsed = agentKeySchema.safeParse(key);
    if (!parsed.success) {
      throw new Error(`Invalid agent key: ${JSON.stringify(key)}`);
    }
    return parsed.data;
  });
  if (agentKeys.length === 0) {
    throw new Error("At least one agent key is required.");
  }
  const uniqueKeys = [...new Set(agentKeys)];

  const schemaName = fundSchemaName(fundKey);
  const db = getProvisionerDb();

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ key: funds.key })
      .from(funds)
      .where(eq(funds.key, fundKey))
      .limit(1);
    if (existing[0]) {
      throw new FundExistsError(fundKey);
    }

    await tx.insert(funds).values({
      key: fundKey,
      name,
      schemaName,
      status: "active",
    });

    const ownerRole = env.DB_OWNER_ROLE?.trim();
    const readerRole = env.DB_READER_ROLE?.trim();
    if (!ownerRole) {
      console.warn(
        "[createFundEnvironment] DB_OWNER_ROLE is unset; skipping owner grants on the new schema. Ingest/runtime may fail if the provisioner is not the addon owner.",
      );
    }
    if (!readerRole) {
      console.warn(
        "[createFundEnvironment] DB_READER_ROLE is unset; skipping reader grants on the new schema. The dashboard reader will not see this fund until grant-reader is re-run.",
      );
    }

    for (const statement of buildFundEnvironmentStatements({
      schemaName,
      fundKey,
      ownerRole: ownerRole || undefined,
      readerRole: readerRole || undefined,
    })) {
      await tx.execute(sql.raw(statement));
    }

    const instances: CreatedAgentInstance[] = [];
    for (const agentKey of uniqueKeys) {
      const publicKey = generateTenantKey();
      await tx.insert(agentInstances).values({
        tenantId: fundKey,
        agentKey,
        publicKey,
        schemaName,
        status: "active",
        corsAllowlist: [],
        theme: {},
        texts: {},
      });
      instances.push({ agentKey, publicKey });
    }

    let userEmail: string | null = null;
    if (input.user) {
      const user = await createFundUser(
        {
          email: input.user.email,
          passwordHash: input.user.passwordHash,
          tenantId: fundKey,
          mustChangePassword: true,
        },
        tx as unknown as Database,
      );
      userEmail = user.email;
    }

    await recordAuditEvent(
      {
        action: "fund_created",
        fundKey,
        actor: "dashboard",
        details: {
          name,
          agentKeys: uniqueKeys,
          userEmail,
        },
      },
      tx as unknown as Database,
    );

    return { fundKey, name, schemaName, instances, userEmail };
  });
}
