-- Roleplay scenarios (control plane). Authored configuration, keyed per fund — the sessions they
-- produce live in the fund schema and are provisioned by fund-ddl (0002_roleplay), not here.
-- Flat by design: no reusable persona/situation blocks (DECISION-roleplay-agent.md, R2).
CREATE TABLE IF NOT EXISTS "control"."roleplay_scenarios" (
  "fund_key" text NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "partner_role" text NOT NULL,
  "user_role" text NOT NULL,
  "user_title" text DEFAULT '' NOT NULL,
  "persona" text NOT NULL,
  "context_description" text NOT NULL,
  "hidden_information" text DEFAULT '' NOT NULL,
  "learning_objective" text NOT NULL,
  "secondary_objective" text DEFAULT '' NOT NULL,
  "common_pitfalls" text[] DEFAULT '{}' NOT NULL,
  "instructions" text DEFAULT '' NOT NULL,
  "opening_line" text NOT NULL,
  "end_condition" text DEFAULT '' NOT NULL,
  "max_turns" integer DEFAULT 12 NOT NULL,
  -- Learner-facing preparation text. Never sent to the model: it describes the exercise, and the
  -- persona reading it leaks the intent of the assignment.
  "briefing" text DEFAULT '' NOT NULL,
  "rubric" jsonb NOT NULL,
  "difficulties" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "roleplay_scenarios_pkey" PRIMARY KEY ("fund_key", "slug"),
  CONSTRAINT "roleplay_scenarios_status_known" CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT "roleplay_scenarios_max_turns_range" CHECK (max_turns BETWEEN 1 AND 100),
  CONSTRAINT "roleplay_scenarios_version_positive" CHECK (version >= 1)
);
