import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/context';
import './Toast.css';

const AUTO_DISMISS_MS = 5000;
const MAX_VISIBLE = 3;

export type ToastTone = 'success' | 'error';

export interface ToastOptions {
  /** Already-translated text. The provider deliberately knows nothing about i18n. */
  message: string;
  /** Sticky toasts never auto-dismiss - for errors the user must act on. */
  sticky?: boolean;
  /**
   * Visual tone. Defaults to 'success' (green): most toasts are
   * confirmations, and a confirmation should never look like an alarm. Pass
   * 'error' (red) only for genuine failures the user needs to notice.
   */
  tone?: ToastTone;
}

interface ToastItem {
  id: string;
  message: string;
  sticky: boolean;
  tone: ToastTone;
  /** Bumped when an identical message is shown again, which restarts the timer. */
  seq: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider');
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(({ message, sticky = false, tone = 'success' }: ToastOptions) => {
    // Generated outside the updater so the updater stays pure - StrictMode
    // invokes it twice, and a side effect in there would run twice too.
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => {
      const duplicate = prev.find((toast) => toast.message === message);
      if (duplicate) {
        // Same message already on screen: restart its timer instead of
        // stacking a copy. Retrying a denied camera must not pile up toasts.
        return prev.map((toast) =>
          toast.message === message ? { ...toast, sticky, tone, seq: toast.seq + 1 } : toast
        );
      }
      const next = [...prev, { id, message, sticky, tone, seq: 0 }];
      return next.slice(-MAX_VISIBLE);
    });
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  // Portalled to <body> so the viewport escapes the app layout: .tabs is
  // position:fixed with z-index:30, and a toast rendered inside the tree can
  // be clipped by it or drawn underneath.
  return createPortal(
    <div className="toast-viewport" aria-live="assertive" aria-atomic="false">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}

function ToastRow({
  toast,
  onDismiss
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  // Transition in on the frame after mount: the element must first paint in
  // its hidden state for the transition to have something to animate from.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // The timer lives on the row, keyed by seq. Re-showing the same message
  // bumps seq, so this effect tears down the old timer and starts a fresh
  // one - that is the "refresh the timer" behaviour, for free.
  useEffect(() => {
    if (toast.sticky) return;
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, toast.seq, toast.sticky, onDismiss]);

  return (
    <div className={`toast toast--${toast.tone} ${visible ? 'toast--visible' : ''}`} role="alert">
      <span className="toast__icon" aria-hidden="true">
        {toast.tone === 'error' ? '⚠' : '✓'}
      </span>
      <p className="toast__text">{toast.message}</p>
      <button
        type="button"
        className="toast__dismiss"
        onClick={() => onDismiss(toast.id)}
        aria-label={t('dismissNotification')}
      >
        ✕
      </button>
    </div>
  );
}
