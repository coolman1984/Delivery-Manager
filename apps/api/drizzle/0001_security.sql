-- ================================================================
-- حيطان الأمان جوه قاعدة البيانات نفسها
-- ١) عزل الشركات: كل صف بيظهر بس لو ختم شركته = الشركة الحالية للطلب
-- ٢) دفتر الحسابات وسجل العمليات: ممنوع تعديل أو مسح
-- ٣) كل قيد مالي لازم يكون متوازن (المدين = الدائن)
-- ٤) قيود منطقية على الأرقام (مفيش أسعار سالبة مثلاً)
-- ================================================================

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_counters', 'zones', 'stores', 'users', 'refresh_tokens', 'addresses',
    'driver_profiles', 'products', 'orders', 'order_items', 'order_events', 'ratings',
    'ledger_accounts', 'journals', 'ledger_lines', 'settlements', 'audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'السجل ده ممنوع يتعدل أو يتمسح (%)', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['journals', 'ledger_lines', 'settlements', 'audit_logs', 'order_events'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_change()',
      t || '_immutable', t
    );
  END LOOP;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION check_journal_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COALESCE(SUM(amount), 0) FROM ledger_lines WHERE journal_id = NEW.journal_id) <> 0 THEN
    RAISE EXCEPTION 'قيد غير متوازن: %', NEW.journal_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER ledger_lines_balanced
  AFTER INSERT ON ledger_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_journal_balanced();
--> statement-breakpoint

ALTER TABLE ledger_lines ADD CONSTRAINT ledger_lines_nonzero CHECK (amount <> 0);
--> statement-breakpoint
ALTER TABLE zones ADD CONSTRAINT zones_fee_nonneg CHECK (delivery_fee >= 0);
--> statement-breakpoint
ALTER TABLE stores ADD CONSTRAINT stores_commission_range CHECK (commission_bps BETWEEN 0 AND 10000);
--> statement-breakpoint
ALTER TABLE products ADD CONSTRAINT products_price_positive CHECK (price > 0);
--> statement-breakpoint
ALTER TABLE order_items ADD CONSTRAINT order_items_valid CHECK (
  quantity BETWEEN 1 AND 99 AND unit_price >= 0 AND line_total = unit_price * quantity
);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_amounts_valid CHECK (
  subtotal >= 0 AND delivery_fee >= 0 AND discount >= 0 AND commission_amount >= 0
  AND total = subtotal + delivery_fee - discount AND total >= 0
  AND (cash_collected IS NULL OR cash_collected >= 0)
);
--> statement-breakpoint
ALTER TABLE ratings ADD CONSTRAINT ratings_range CHECK (
  store_rating BETWEEN 1 AND 5 AND (driver_rating IS NULL OR driver_rating BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE settlements ADD CONSTRAINT settlements_valid CHECK (
  received_amount >= 0 AND expected_amount >= 0 AND shortage = expected_amount - received_amount
  AND shortage >= 0
);
