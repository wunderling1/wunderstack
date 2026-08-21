-- Control-plane audit log (fund lifecycle). Owner retains rights; named reader via grant-reader.ts.
CREATE TABLE "control"."audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"fund_key" text NOT NULL,
	"actor" text DEFAULT 'runbook' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
