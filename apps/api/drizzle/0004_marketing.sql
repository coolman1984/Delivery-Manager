CREATE TYPE "public"."coupon_kind" AS ENUM('percent', 'fixed', 'free_delivery');--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"coupon_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_redemptions_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"kind" "coupon_kind" NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"max_discount" integer,
	"min_subtotal" integer DEFAULT 0 NOT NULL,
	"store_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_uses" integer,
	"per_customer_limit" integer DEFAULT 1 NOT NULL,
	"first_order_only" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_tenant_code" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "loyalty_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "store_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "store_rating" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coupon_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coupon_discount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "points_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "points_discount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "loyalty_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "loyalty_earn_per" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "loyalty_point_value" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points" ADD CONSTRAINT "loyalty_points_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points" ADD CONSTRAINT "loyalty_points_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points" ADD CONSTRAINT "loyalty_points_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_idx" ON "coupon_redemptions" USING btree ("coupon_id","customer_id");--> statement-breakpoint
CREATE INDEX "loyalty_customer_idx" ON "loyalty_points" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_order_reason" ON "loyalty_points" USING btree ("order_id","reason");
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['coupons', 'coupon_redemptions', 'loyalty_points'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER loyalty_points_immutable BEFORE UPDATE OR DELETE ON loyalty_points FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
ALTER TABLE coupons ADD CONSTRAINT coupons_valid CHECK (
  value >= 0 AND min_subtotal >= 0 AND (max_discount IS NULL OR max_discount > 0)
  AND (kind <> 'percent' OR value BETWEEN 1 AND 10000)
  AND per_customer_limit >= 1 AND (max_uses IS NULL OR max_uses >= 1)
  AND code = upper(code)
);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_discounts_valid CHECK (
  coupon_discount >= 0 AND points_used >= 0 AND points_discount >= 0
  AND discount = coupon_discount + points_discount
);
--> statement-breakpoint
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_loyalty CHECK (loyalty_earn_per > 0 AND loyalty_point_value >= 0);
