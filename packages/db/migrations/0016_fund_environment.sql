-- Fund display name + forced password change for dashboard onboarding.
ALTER TABLE "control"."funds" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "control"."users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;
