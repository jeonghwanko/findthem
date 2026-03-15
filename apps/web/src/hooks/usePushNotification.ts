import { useState, useEffect } from 'react';
import { api } from '../api/client';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    arr[i] = rawData.charCodeAt(i);
  }
  return arr;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function usePushNotification() {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const isSupported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  useEffect(() => {
    if (!isSupported) return;
    // 이미 구독 중인지 확인
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => null);
  }, [isSupported]);

  async function subscribe() {
    if (!isSupported || loading) return;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      const { publicKey } = await api.get<{ publicKey: string }>('/push/vapid-key');
      if (!publicKey) return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const p256dhBuffer = subscription.getKey('p256dh');
      const authBuffer = subscription.getKey('auth');
      if (!p256dhBuffer || !authBuffer) return;

      await api.post('/push/subscribe', {
        endpoint: subscription.endpoint,
        p256dh: arrayBufferToBase64(p256dhBuffer),
        auth: arrayBufferToBase64(authBuffer),
        userAgent: navigator.userAgent,
      });

      setSubscribed(true);
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    if (!isSupported || loading) return;
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;

      // 브라우저 구독 먼저 해제 (실패해도 API 호출 불필요)
      await subscription.unsubscribe();
      await api.delete(`/push/unsubscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`);
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }

  return { permission, subscribed, loading, isSupported, subscribe, unsubscribe };
}
