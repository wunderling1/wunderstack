-- LTI 1.1 (control plane). Consumers, replay nonces, and pending launches — configuration and
-- launch-context, not fund data. Sessions and outbox rows stay in the fund schema; there is no
-- lti11_user_mappings table (R3: no learner accounts) and no lti11_grade_links table (the Fase 7
-- outbox + session.result_target already dedup a grade).
--
-- Grade passback is opt-in per consumer (default false). The returned score is the existing
-- weighted formative review score, not a new pass/fail primitive (DECISION-roleplay-agent.md, R4/R7).

CREATE TABLE IF NOT EXISTS "control"."lti11_consumers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fund_key" text NOT NULL,
  "name" text NOT NULL,
  "consumer_key" text NOT NULL,
  "consumer_secret" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "grade_passback_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lti11_consumers_consumer_key_uq" UNIQUE ("consumer_key"),
  CONSTRAINT "lti11_consumers_valid_status" CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS "control"."lti11_nonces" (
  "consumer_key" text NOT NULL,
  "nonce" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + interval '90 minutes') NOT NULL,
  CONSTRAINT "lti11_nonces_pkey" PRIMARY KEY ("consumer_key", "nonce")
);

CREATE TABLE IF NOT EXISTS "control"."lti11_launches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "consumer_id" uuid NOT NULL REFERENCES "control"."lti11_consumers"("id") ON DELETE CASCADE,
  -- Opaque LMS user_id, HMAC'd before insert so an email-shaped platform id never lands in storage.
  "lti_user_id" text NOT NULL,
  "resource_link_id" text,
  "context_id" text,
  "outcome_service_url" text,
  "result_sourcedid" text,
  "scenario_slug" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + interval '4 hours') NOT NULL,
  -- Set on the first successful /api/roleplay/start for this launch (single-use).
  "consumed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "idx_lti11_consumers_fund" ON "control"."lti11_consumers" ("fund_key");
CREATE INDEX IF NOT EXISTS "idx_lti11_nonces_expires" ON "control"."lti11_nonces" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_lti11_launches_expires" ON "control"."lti11_launches" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_lti11_launches_consumer" ON "control"."lti11_launches" ("consumer_id");

-- Replay protection: claim a nonce atomically. Stale rows are deleted inline because there is no
-- cron. Returns true iff THIS call inserted the row; false is a replay.
CREATE OR REPLACE FUNCTION "control"."acquire_lti11_nonce"(
  p_consumer_key text,
  p_nonce text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted_count integer;
BEGIN
  DELETE FROM "control"."lti11_nonces" WHERE expires_at < now();

  INSERT INTO "control"."lti11_nonces"(consumer_key, nonce)
  VALUES (p_consumer_key, p_nonce)
  ON CONFLICT (consumer_key, nonce) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION "control"."acquire_lti11_nonce"(text, text) FROM PUBLIC;
