import { Badge } from '../../components/ui';
import { num } from '../../lib/format';
import { daysLeft, type PlatformTenant } from './api';

/** حالة اشتراك الشركة بكلمة ولون واضحين */
export function SubscriptionBadge({
  tenant,
}: {
  tenant: Pick<PlatformTenant, 'status' | 'paidUntil'>;
}) {
  if (tenant.status === 'suspended')
    return (
      <Badge tone="danger" dot>
        موقوفة
      </Badge>
    );
  const d = daysLeft(tenant.paidUntil);
  if (d === null) return <Badge dot>من غير اشتراك</Badge>;
  if (d < 0)
    return (
      <Badge tone="danger" dot>
        متأخرة {num(-d)} يوم
      </Badge>
    );
  if (d <= 7)
    return (
      <Badge tone="warning" dot>
        باقي {num(d)} يوم
      </Badge>
    );
  return (
    <Badge tone="success" dot>
      شغالة · باقي {num(d)} يوم
    </Badge>
  );
}

export function dateOnly(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
