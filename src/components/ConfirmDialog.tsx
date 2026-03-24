interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      data-testid="confirm-dialog-overlay"
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
        }}
        data-testid="confirm-dialog"
      >
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', color: '#111827', lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.9rem',
              color: '#374151',
            }}
            data-testid="confirm-dialog-cancel"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '0.5rem 1rem',
              background: '#dc2626',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.9rem',
              color: '#fff',
              fontWeight: 500,
            }}
            data-testid="confirm-dialog-confirm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
