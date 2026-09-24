import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { get } from './api';
import { useAuth } from './auth';
import type { Address, Zone } from './types';

const KEY = 'dm.address';
const listeners = new Set<(id: string | null) => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** العنوان اللي العميل اختاره للتوصيل (بيتفكر على الموبايل) */
export function useSelectedAddress() {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(read);
  const addresses = useQuery({
    queryKey: ['addresses'],
    queryFn: () => get<Address[]>('/me/addresses'),
    enabled: user?.role === 'customer',
  });

  useEffect(() => {
    listeners.add(setSelectedId);
    return () => {
      listeners.delete(setSelectedId);
    };
  }, []);

  const select = useCallback((id: string) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // مش مشكلة
    }
    listeners.forEach((l) => l(id));
  }, []);

  const list = addresses.data ?? [];
  const address = list.find((a) => a.id === selectedId) ?? list[0] ?? null;
  return {
    address,
    addresses: list,
    loading: addresses.isPending && user?.role === 'customer',
    select,
  };
}

export function useZones() {
  return useQuery({
    queryKey: ['catalog', 'zones'],
    queryFn: () => get<Zone[]>('/catalog/zones'),
    staleTime: 300_000,
  });
}
