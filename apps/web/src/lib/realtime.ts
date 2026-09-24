import { ORDER_STATUS_LABELS, type OrderStatus } from '@dm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from './api';
import { useAuth } from './auth';
import { useToast } from '../components/toast';

/**
 * الإشعارات الفورية: أول ما يحصل تغيير في طلب، الشاشة بتتحدث لوحدها
 * ويظهر تنبيه، من غير ما المستخدم يعمل تحديث للصفحة.
 */
export function useRealtime(): void {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!user) return;
    const socket = io({
      path: '/api/v1/rt',
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: getAccessToken() }),
      reconnectionDelayMax: 10_000,
    });
    socket.on('order.updated', (e: { id: string; number: number; status: OrderStatus }) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order', e.id] });
      void queryClient.invalidateQueries({ queryKey: ['driver-me'] });
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      toast(`طلب #${e.number}: ${ORDER_STATUS_LABELS[e.status]}`);
      if (e.status === 'placed' && (user.role === 'store' || user.role === 'ops')) {
        navigator.vibrate?.([200, 100, 200]);
      }
    });
    socket.on(
      'driver.updated',
      () => void queryClient.invalidateQueries({ queryKey: ['finance', 'drivers'] }),
    );
    return () => {
      socket.disconnect();
    };
  }, [user, queryClient, toast]);
}
