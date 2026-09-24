CREATE TYPE "public"."order_type" AS ENUM('delivery', 'errand');--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_endpoint" UNIQUE("tenant_id","endpoint")
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"auto_dispatch" boolean DEFAULT false NOT NULL,
	"errands_enabled" boolean DEFAULT true NOT NULL,
	"errand_extra_fee" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "store_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "type" "order_type" DEFAULT 'delivery' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "dropoff_lat" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "dropoff_lng" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pickup_text" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pickup_lat" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pickup_lng" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "errand_details" text;--> statement-breakpoint
ALTER TABLE "zones" ADD COLUMN "center_lat" double precision;--> statement-breakpoint
ALTER TABLE "zones" ADD COLUMN "center_lng" double precision;--> statement-breakpoint
ALTER TABLE "zones" ADD COLUMN "radius_km" double precision DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_settings', 'push_subscriptions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_type_store CHECK (
  (type = 'delivery' AND store_id IS NOT NULL) OR (type = 'errand' AND store_id IS NULL AND pickup_text IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE zones ADD CONSTRAINT zones_radius_range CHECK (radius_km > 0 AND radius_km <= 50);
--> statement-breakpoint
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_fee CHECK (errand_extra_fee >= 0);
--> statement-breakpoint
ALTER TABLE ratings ALTER COLUMN store_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE ratings ALTER COLUMN store_rating DROP NOT NULL;
