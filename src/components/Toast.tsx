import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';

interface ToastMessage {
  id: number;
  message: string;
}

interface ToastContextValue {
  showError: (msg: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showError = useCallback((msg: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message: msg }]);
    const timer = setTimeout(() => dismiss(id), 5000);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showError }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          zIndex: 9999,
          maxWidth: '360px',
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              backgroundColor: '#dc2626',
              color: '#fff',
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            }}
          >
            <span style={{ flex: 1, fontSize: '0.875rem', lineHeight: '1.25rem' }}>
              {toast.message}
            </span>
            <button
              onClick={() => dismiss(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                padding: 0,
                fontSize: '1rem',
                lineHeight: 1,
                opacity: 0.8,
              }}
              aria-label="Dismiss"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
