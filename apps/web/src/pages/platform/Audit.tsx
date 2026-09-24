import { useQuery } from '@tanstack/react-query';
import { Card, ErrorBox, PageHeader, SkeletonList } from '../../components/ui';
import { dateTime } from '../../lib/format';
import { pget } from './api';

interface Row {
  id: string;
  action: string;
  tenantName: string | null;
  adminName: string | null;
  ip: string | null;
  createdAt: string;
}

const LABELS: Record<string, string> = {
  'platform.login': 'دخول',
  'platform.login_failed': '⚠️ محاولة دخول غلط',
  'platform.account_locked': '🔒 الحساب اتقفل مؤقتاً',
  'platform.login_blocked_locked': '🔒 محاولة دخول والحساب مقفول',
  'platform.logout': 'خروج من كل الأجهزة',
  'platform.totp_enrolled': 'تسجيل تطبيق الكود',
  'platform.admin_created': 'إنشاء حساب مالك',
  'tenant.created': 'إنشاء شركة',
  'tenant.updated': 'تعديل بيانات شركة',
  'tenant.suspended': 'إيقاف شركة',
  'tenant.activated': 'تشغيل شركة',
  'tenant.auto_suspended': 'إيقاف تلقائي (الاشتراك خلص)',
  'tenant.admin_password_reset': 'كلمة سر جديدة لمدير شركة',
  'subscription.payment': 'تسجيل دفعة اشتراك',
  'plan.created': 'إنشاء باقة',
  'plan.updated': 'تعديل باقة',
};

export default function Audit() {
  const q = useQuery({
    queryKey: ['platform', 'audit'],
    queryFn: () => pget<Row[]>('/audit-logs'),
  });
  return (
    <div>
      <PageHeader title="السجل" subtitle="كل عملية في لوحة المنصة: مين عملها وإمتى ومن أنهي جهاز" />
      {q.isPending && <SkeletonList count={5} className="h-14" />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-xs text-ink-500">
              <tr>
                <th className="px-4 py-3 text-start font-medium">العملية</th>
                <th className="px-4 py-3 text-start font-medium">الشركة</th>
                <th className="px-4 py-3 text-start font-medium">مين</th>
                <th className="px-4 py-3 text-start font-medium">إمتى</th>
                <th className="px-4 py-3 text-start font-medium">الجهاز</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {q.data.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-ink-900">
                    {LABELS[r.action] ?? r.action}
                  </td>
                  <td className="px-4 py-3 text-ink-600">{r.tenantName ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-600">{r.adminName ?? 'النظام'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-600">
                    {dateTime(r.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-ink-400" dir="ltr">
                    {r.ip ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
