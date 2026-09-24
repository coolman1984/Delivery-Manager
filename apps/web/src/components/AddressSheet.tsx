import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MapPin, MapPinned, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { get, post } from '../lib/api';
import { useSelectedAddress } from '../lib/address';
import { money } from '../lib/format';
import type { Zone } from '../lib/types';
import { Modal } from './dialog';
import { Button, cx, ErrorBox, Input, Select, Textarea } from './ui';

/** اختيار عنوان التوصيل من أعلى الصفحة الرئيسية (زي التطبيقات الكبيرة) */
export function AddressSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { address, addresses, select } = useSelectedAddress();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Modal open={open && !adding} onClose={onClose} title="التوصيل على" icon={MapPin}>
        <div className="space-y-2">
          {addresses.map((a) => {
            const active = address?.id === a.id;
            return (
              <button
                key={a.id}
                onClick={() => {
                  select(a.id);
                  onClose();
                }}
                className={cx(
                  'flex w-full cursor-pointer items-start gap-3 rounded-2xl p-3.5 text-start ring-1 transition',
                  active ? 'bg-brand-50/70 ring-2 ring-brand-500' : 'ring-ink-200 hover:bg-ink-50',
                )}
              >
                <span
                  className={cx(
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                    active ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300',
                  )}
                >
                  {active && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{a.label}</span>
                  <span className="block text-sm text-ink-500">
                    {a.zoneName} — {a.details}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-ink-500">توصيل {money(a.deliveryFee)}</span>
              </button>
            );
          })}
          <Button variant="soft" icon={Plus} block onClick={() => setAdding(true)}>
            عنوان جديد
          </Button>
        </div>
      </Modal>
      <AddAddressModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(id) => {
          select(id);
          setAdding(false);
          onClose();
        }}
      />
    </>
  );
}

export function AddAddressModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const [zoneId, setZoneId] = useState('');
  const [label, setLabel] = useState('البيت');
  const [details, setDetails] = useState('');
  const queryClient = useQueryClient();
  const zones = useQuery({
    queryKey: ['catalog', 'zones'],
    queryFn: () => get<Zone[]>('/catalog/zones'),
    enabled: open,
  });
  const add = useMutation({
    mutationFn: () => post<{ id: string }>('/me/addresses', { label, zoneId, details }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      onAdded(res.id);
      onClose();
      setDetails('');
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate();
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="عنوان جديد"
      description="اكتب العنوان بالتفصيل عشان الطيار يوصلك بسرعة"
      icon={MapPinned}
    >
      <form onSubmit={submit} className="space-y-4">
        <Select label="المنطقة" value={zoneId} onChange={(e) => setZoneId(e.target.value)} required>
          <option value="">اختار المنطقة</option>
          {zones.data?.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name} — توصيل {money(z.deliveryFee)}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          {['البيت', 'الشغل', 'عند أهلي'].map((l) => (
            <button
              type="button"
              key={l}
              onClick={() => setLabel(l)}
              className={cx(
                'cursor-pointer rounded-full px-3.5 py-1.5 text-sm transition',
                label === l ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <Input
          label="اسم العنوان"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          required
        />
        <Textarea
          label="العنوان بالتفصيل"
          placeholder="الشارع، رقم العمارة، الدور، الشقة، وأي علامة مميزة"
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          minLength={5}
          maxLength={300}
          required
        />
        {add.error && <ErrorBox error={add.error} />}
        <Button type="submit" size="lg" block loading={add.isPending}>
          حفظ العنوان
        </Button>
      </form>
    </Modal>
  );
}
