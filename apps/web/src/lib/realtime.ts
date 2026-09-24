import { ORDER_STATUS_LABELS, type OrderStatus } from '@dm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useToast } from '../components/toast';
import { getAccessToken } from './api';
import { useAuth } from './auth';
import { orderNo } from './format';

/** نغمة قصيرة لما يوصل طلب جديد (للمحل ومدير التشغيل) */
function chime(): void {
  try {
    const ctx = new AudioContext();
    const notes = [880, 1175];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  } catch {
    // المتصفح مانع الصوت: مش مشكلة
  }
}

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
      const isNew =
        e.status === 'placed' &&
        (user.role === 'store' || user.role === 'ops' || user.role === 'admin');
      toast(
        isNew
          ? `طلب جديد ${orderNo(e.number)}`
          : `طلب ${orderNo(e.number)}: ${ORDER_STATUS_LABELS[e.status]}`,
        'info',
      );
      if (isNew || (user.role === 'driver' && e.status !== 'delivered')) {
        chime();
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
