CREATE TYPE "public"."lead_type" AS ENUM('store', 'driver');--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "lead_type" NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"details" text,
	"handled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "prep_minutes" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_tenant_idx" ON "leads" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE leads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON leads USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
ALTER TABLE stores ADD CONSTRAINT stores_prep_range CHECK (prep_minutes BETWEEN 5 AND 180);
