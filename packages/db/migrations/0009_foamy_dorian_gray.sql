CREATE TABLE "tenant_config" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"cors_allowlist" text[] DEFAULT '{}' NOT NULL,
	"agent_id" text DEFAULT 'cao' NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"texts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
