CREATE TABLE "interaction_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"fund" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text,
	"trace_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"question" text,
	"theme" text,
	"feedback" text
);
--> statement-breakpoint
CREATE INDEX "interaction_events_tenant_occurred_idx" ON "interaction_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "interaction_events_fund_idx" ON "interaction_events" USING btree ("fund");--> statement-breakpoint
CREATE INDEX "interaction_events_session_idx" ON "interaction_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "interaction_events_trace_idx" ON "interaction_events" USING btree ("trace_id");