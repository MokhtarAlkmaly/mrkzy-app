import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/**
 * حالة الاتصال بالإنترنت لحظياً (تتحدث تلقائياً عند الانقطاع والعودة).
 * على الخادم (SSR) تُعتبر متصلاً حتى يتولى المتصفح.
 */
export const useOnlineStatus = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
