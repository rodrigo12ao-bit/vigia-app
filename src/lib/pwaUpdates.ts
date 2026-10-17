export type PwaUpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'offline' | 'error';

interface DiscoveryOptions {
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  online: () => boolean;
  onAvailable: () => void;
  onStatus: (status: PwaUpdateStatus) => void;
  now?: () => number;
  throttleMs?: number;
  intervalMs?: number;
  repeat?: (callback: () => void, milliseconds: number) => unknown;
  cancelRepeat?: (timer: unknown) => void;
}

// Discovery only: activation/reload remains behind the application's save step.
export function discoverPwaUpdates(registration: ServiceWorkerRegistration, options: DiscoveryOptions) {
  const now = options.now || Date.now;
  const throttle = options.throttleMs ?? 60000;
  const repeat = options.repeat || ((callback, milliseconds) => globalThis.setInterval(callback, milliseconds));
  const cancelRepeat = options.cancelRepeat || (timer => globalThis.clearInterval(timer as ReturnType<typeof globalThis.setInterval>));
  let lastAttempt = -Infinity;
  let stopped = false;
  let pending: Promise<void> | null = null;
  let removeWorkerListener: (() => void) | undefined;
  let observedWorker: ServiceWorker | null = null;

  const waiting = () => {
    // The first installation briefly waits before activating. It is an update
    // only when an earlier worker is already active for this registration.
    if (stopped || !registration.active || !registration.waiting) return false;
    options.onAvailable();
    options.onStatus('available');
    return true;
  };
  const watchInstalling = () => {
    const worker = registration.installing;
    if (stopped || !worker || observedWorker === worker) return;
    removeWorkerListener?.();
    observedWorker = worker;
    const changed = () => {
      if (stopped) return;
      if (waiting()) removeWorkerListener?.();
      else if (worker.state === 'redundant') {
        options.onStatus('error');
        removeWorkerListener?.();
      } else if (worker.state === 'activated') {
        options.onStatus('current');
        removeWorkerListener?.();
      } else if (worker.state === 'installed') {
        // Allow registration.waiting to settle before checking its new worker.
        queueMicrotask(() => { if (waiting()) removeWorkerListener?.(); });
      }
    };
    worker.addEventListener('statechange', changed);
    removeWorkerListener = () => worker.removeEventListener('statechange', changed);
    options.onStatus('checking');
    changed();
  };

  const check = (manual = false): Promise<void> => {
    if (stopped || waiting()) return Promise.resolve();
    if (!options.online()) {
      options.onStatus('offline');
      return Promise.resolve();
    }
    if (!manual && options.document.visibilityState !== 'visible') return Promise.resolve();
    if (pending) return pending;
    if (registration.installing) {
      watchInstalling();
      return Promise.resolve();
    }
    if (!manual && now() - lastAttempt < throttle) return Promise.resolve();
    lastAttempt = now();
    options.onStatus('checking');
    const operation = (async () => {
      try {
        await registration.update();
        if (stopped || waiting()) return;
        if (registration.installing) watchInstalling();
        else options.onStatus('current');
      } catch {
        if (!stopped) options.onStatus(options.online() ? 'error' : 'offline');
      }
    })().finally(() => { if (pending === operation) pending = null; });
    pending = operation;
    return operation;
  };

  const wake = () => { void check(); };
  const visible = () => { if (options.document.visibilityState === 'visible') wake(); };
  registration.addEventListener('updatefound', watchInstalling);
  options.window.addEventListener('focus', wake);
  options.window.addEventListener('online', wake);
  options.document.addEventListener('visibilitychange', visible);
  const timer = repeat(visible, options.intervalMs ?? 5 * 60 * 1000);
  watchInstalling();
  void check();

  return {
    check,
    dispose() {
      stopped = true;
      cancelRepeat(timer);
      removeWorkerListener?.();
      registration.removeEventListener('updatefound', watchInstalling);
      options.window.removeEventListener('focus', wake);
      options.window.removeEventListener('online', wake);
      options.document.removeEventListener('visibilitychange', visible);
    },
  };
}
