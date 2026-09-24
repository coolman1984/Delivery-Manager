CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"monthly_price" integer NOT NULL,
	"max_stores" integer,
	"max_drivers" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret_enc" text,
	"totp_enabled_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"token_version" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "platform_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"action" text NOT NULL,
	"target_tenant_id" uuid,
	"ip" text,
	"user_agent" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"months" smallint NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "paid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_admin_id_platform_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_target_tenant_id_tenants_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_created_by_platform_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."platform_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_audit_created_idx" ON "platform_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscription_payments_tenant_idx" ON "subscription_payments" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER subscription_payments_immutable BEFORE UPDATE OR DELETE ON subscription_payments FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER platform_audit_logs_immutable BEFORE UPDATE OR DELETE ON platform_audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
ALTER TABLE plans ADD CONSTRAINT plans_valid CHECK (
  monthly_price >= 0 AND (max_stores IS NULL OR max_stores >= 1) AND (max_drivers IS NULL OR max_drivers >= 1)
);
--> statement-breakpoint
ALTER TABLE subscription_payments ADD CONSTRAINT subscription_payments_valid CHECK (
  amount >= 0 AND months BETWEEN 1 AND 24 AND period_to > period_from
);
--> statement-breakpoint
ALTER TABLE platform_admins ADD CONSTRAINT platform_admins_email_lower CHECK (email = lower(email));
--> statement-breakpoint
-- أرقام مجمّعة عن كل شركة للوحة مالك المنصة (عدد بس، من غير أي بيانات عملاء).
-- بتشتغل بصلاحيات المالك، ومسموح بيها لحساب لوحة المنصة بس (شوف migrate.ts).
CREATE OR REPLACE FUNCTION platform_tenant_stats()
RETURNS TABLE (
  tenant_id uuid,
  orders_30d bigint,
  delivered_30d bigint,
  gmv_30d bigint,
  stores bigint,
  drivers bigint,
  customers bigint,
  last_order_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT t.id,
    (SELECT count(*) FROM orders o WHERE o.tenant_id = t.id AND o.placed_at > now() - interval '30 days'),
    (SELECT count(*) FROM orders o WHERE o.tenant_id = t.id AND o.placed_at > now() - interval '30 days' AND o.status = 'delivered'),
    (SELECT coalesce(sum(o.total), 0) FROM orders o WHERE o.tenant_id = t.id AND o.placed_at > now() - interval '30 days' AND o.status = 'delivered'),
    (SELECT count(*) FROM stores s WHERE s.tenant_id = t.id),
    (SELECT count(*) FROM users u WHERE u.tenant_id = t.id AND u.role = 'driver' AND u.is_active),
    (SELECT count(*) FROM users u WHERE u.tenant_id = t.id AND u.role = 'customer'),
    (SELECT max(o.placed_at) FROM orders o WHERE o.tenant_id = t.id)
  FROM tenants t
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_tenant_stats() FROM PUBLIC;
