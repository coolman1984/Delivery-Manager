import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, Plus, Store, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/dialog';
import { useToast } from '../../components/toast';
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Input,
  PageHeader,
  SkeletonList,
  Switch,
} from '../../components/ui';
import { money, num, toPiasters } from '../../lib/format';
import { pget, ppatch, ppost, type Plan } from './api';

export default function Plans() {
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const q = useQuery({ queryKey: ['platform', 'plans'], queryFn: () => pget<Plan[]>('/plans') });
  return (
    <div>
      <PageHeader
        title="الباقات"
        subtitle="سعر كل باقة في الشهر، وأقصى عدد محلات وطيارين"
        actions={
          <Button icon={Plus} variant="dark" onClick={() => setEditing('new')}>
            باقة جديدة
          </Button>
        }
      />
      {q.isPending && <SkeletonList count={3} />}
      {q.error && <ErrorBox error={q.error} />}
      <div className="grid gap-4 md:grid-cols-3">
        {q.data?.map((p, i) => (
          <Card key={p.id} className={i === 1 ? 'ring-2 ring-amber-300' : ''}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-bold text-ink-900">{p.name}</div>
                {!p.isActive && <Badge tone="danger">موقوفة</Badge>}
              </div>
              <button
                onClick={() => setEditing(p)}
                className="cursor-pointer rounded-xl p-2 text-ink-500 hover:bg-ink-100"
                aria-label={`تعديل ${p.name}`}
              >
                <Pencil className="size-4" />
              </button>
            </div>
            <div className="tabular mt-3 text-3xl font-bold text-ink-900">
              {money(p.monthlyPrice)}
            </div>
            <div className="text-sm text-ink-500">في الشهر</div>
            <ul className="mt-4 space-y-2 text-sm text-ink-700">
              <li className="flex items-center gap-2">
                <Store className="size-4 text-ink-400" />
                {p.maxStores ? `لحد ${num(p.maxStores)} محل` : 'محلات من غير حد'}
              </li>
              <li className="flex items-center gap-2">
                <Users className="size-4 text-ink-400" />
                {p.maxDrivers ? `لحد ${num(p.maxDrivers)} طيار` : 'طيارين من غير حد'}
              </li>
            </ul>
          </Card>
        ))}
      </div>
      {editing && (
        <PlanModal plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function PlanModal({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(plan?.name ?? '');
  const [price, setPrice] = useState(plan ? String(plan.monthlyPrice / 100) : '');
  const [maxStores, setMaxStores] = useState(plan?.maxStores ? String(plan.maxStores) : '');
  const [maxDrivers, setMaxDrivers] = useState(plan?.maxDrivers ? String(plan.maxDrivers) : '');
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        monthlyPrice: toPiasters(price),
        maxStores: maxStores ? Number(maxStores) : null,
        maxDrivers: maxDrivers ? Number(maxDrivers) : null,
      };
      return plan ? ppatch(`/plans/${plan.id}`, { ...body, isActive }) : ppost('/plans', body);
    },
    onSuccess: () => {
      toast('اتحفظت');
      void qc.invalidateQueries({ queryKey: ['platform'] });
      onClose();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }
  return (
    <Modal open onClose={onClose} title={plan ? `تعديل ${plan.name}` : 'باقة جديدة'} icon={Package}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="اسم الباقة"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
        />
        <Input
          label="السعر في الشهر (جنيه)"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="أقصى عدد محلات"
            hint="فاضي = من غير حد"
            inputMode="numeric"
            value={maxStores}
            onChange={(e) => setMaxStores(e.target.value)}
          />
          <Input
            label="أقصى عدد طيارين"
            hint="فاضي = من غير حد"
            inputMode="numeric"
            value={maxDrivers}
            onChange={(e) => setMaxDrivers(e.target.value)}
          />
        </div>
        {plan && (
          <label className="flex items-center justify-between rounded-2xl p-3 ring-1 ring-ink-200">
            <span>الباقة متاحة للشركات الجديدة</span>
            <Switch checked={isActive} onChange={setIsActive} label="الباقة متاحة" />
          </label>
        )}
        {save.error && <ErrorBox error={save.error} />}
        <Button type="submit" block variant="dark" loading={save.isPending}>
          حفظ
        </Button>
      </form>
    </Modal>
  );
}
