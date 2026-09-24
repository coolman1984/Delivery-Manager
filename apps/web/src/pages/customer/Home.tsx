import { STORE_TYPE_LABELS, STORE_TYPES, type StoreType } from '@dm/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Empty, ErrorBox, Loading } from '../../components/ui';
import { get } from '../../lib/api';
import type { StoreSummary } from '../../lib/types';

const ICONS: Record<StoreType, string> = {
  restaurant: '🍗',
  pharmacy: '💊',
  grocery: '🛒',
  other: '🏬',
};

export default function Home() {
  const [type, setType] = useState<StoreType | null>(null);
  const stores = useQuery({
    queryKey: ['catalog', 'stores', type],
    queryFn: () => get<StoreSummary[]>(`/catalog/stores${type ? `?type=${type}` : ''}`),
  });

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={type === null} onClick={() => setType(null)}>
          الكل
        </Chip>
        {STORE_TYPES.filter((t) => t !== 'other').map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(t)}>
            {ICONS[t]} {STORE_TYPE_LABELS[t]}
          </Chip>
        ))}
      </div>
      {stores.isPending && <Loading />}
      {stores.error && <ErrorBox error={stores.error} />}
      {stores.data?.length === 0 && <Empty text="مفيش محلات هنا لسه" />}
      <div className="grid gap-3 sm:grid-cols-2">
        {stores.data?.map((s) => (
          <Link
            key={s.id}
            to={`/stores/${s.id}`}
            className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 active:bg-slate-50"
          >
            <div className="flex size-14 items-center justify-center rounded-xl bg-brand-50 text-3xl">
              {ICONS[s.type]}
            </div>
            <div className="flex-1">
              <div className="font-semibold">{s.name}</div>
              <div className="text-sm text-slate-500">
                {STORE_TYPE_LABELS[s.type]} · {s.zoneName}
              </div>
            </div>
            <span
              className={`text-xs font-semibold ${s.isOpen ? 'text-emerald-600' : 'text-slate-400'}`}
            >
              {s.isOpen ? 'مفتوح' : 'مقفول'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${active ? 'bg-brand-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}
    >
      {children}
    </button>
  );
}
