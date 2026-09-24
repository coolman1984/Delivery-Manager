import { get, post } from './api';

/** تفعيل إشعارات الموبايل (بتوصل حتى لو التطبيق مقفول) */
export async function pushSupported(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return false;
  try {
    const key = await get<{ enabled: boolean }>('/push/key');
    return key.enabled;
  } catch {
    return false;
  }
}

function toUint8(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enablePush(): Promise<'ok' | 'denied' | 'unsupported'> {
  const key = await get<{ enabled: boolean; publicKey: string | null }>('/push/key').catch(
    () => null,
  );
  if (!key?.enabled || !key.publicKey || !('serviceWorker' in navigator)) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toUint8(key.publicKey),
    }));
  const json = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  await post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
  return 'ok';
}
