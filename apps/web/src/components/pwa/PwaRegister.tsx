'use client';

import { useEffect } from 'react';

/**
 * Registers the Progressive Web App service worker once on the client.
 * Safe no-op when service workers are unavailable (SSR, unsupported browsers).
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Installability still works with manifest alone on some browsers;
        // SW failure must not break the app.
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return null;
}
