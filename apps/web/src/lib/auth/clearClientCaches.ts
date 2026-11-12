/**
 * Clear Cache Storage and unregister service workers on logout / account close
 * so a closed or signed-out session cannot keep serving a stale PWA shell.
 */
export async function clearClientAuthCaches(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // ignore cache wipe failures
  }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch {
    // ignore SW unregister failures
  }
}
