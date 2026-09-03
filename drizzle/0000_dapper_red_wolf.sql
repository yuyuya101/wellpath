CREATE TABLE "access_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"assessment_session_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT '2026-09-03T07:28:35.954Z' NOT NULL,
	CONSTRAINT "access_session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "assessment_result" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"free_summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT '2026-09-03T07:28:35.953Z' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT '2026-09-03T07:28:35.952Z' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT '2026-09-03T07:28:35.952Z' NOT NULL,
	"submitted_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assessment_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"answer" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT '2026-09-03T07:28:35.953Z' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT '2026-09-03T07:28:35.953Z' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"source" text,
	"started_at" timestamp with time zone DEFAULT '2026-09-03T07:28:35.953Z' NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "entitlement_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "payment_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"fingerprint" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT '2026-09-03T07:28:35.954Z' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_counter" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"subject" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT '2026-09-03T07:28:35.954Z' NOT NULL,
	CONSTRAINT "recovery_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"product_code" text NOT NULL,
	"external_ref" text,
	"started_at" timestamp with time zone DEFAULT '2026-09-03T07:28:35.953Z' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT '2026-09-03T07:28:35.953Z' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_session" ADD CONSTRAINT "access_session_assessment_session_id_assessment_session_id_fk" FOREIGN KEY ("assessment_session_id") REFERENCES "public"."assessment_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_result" ADD CONSTRAINT "assessment_result_session_id_assessment_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_step" ADD CONSTRAINT "assessment_step_session_id_assessment_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_session_id_assessment_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_session_id_assessment_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_token" ADD CONSTRAINT "recovery_token_session_id_assessment_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_session_id_assessment_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_step_session_key" ON "assessment_step" USING btree ("session_id","step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payment_idempotency" ON "payment_event" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rate_window" ON "rate_counter" USING btree ("scope","subject","window_start");--> statement-breakpoint
CREATE INDEX "idx_rate_window_start" ON "rate_counter" USING btree ("window_start");