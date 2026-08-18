ALTER TABLE "interaction_events" ADD COLUMN "channel" text;--> statement-breakpoint
CREATE INDEX "interaction_events_channel_idx" ON "interaction_events" USING btree ("channel");