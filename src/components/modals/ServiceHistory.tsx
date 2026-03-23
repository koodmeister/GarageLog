import { useEffect, useState } from 'react';
import { commands, MaintenanceItem, ServiceRecord } from '../../lib/commands';

export interface ServiceHistoryProps {
  item: MaintenanceItem;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const boxStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '0.75rem',
  padding: '1.5rem',
  width: '100%',
  maxWidth: '480px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
};

const recordStyle: React.CSSProperties = {
  padding: '0.75rem',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
  marginBottom: '0.5rem',
};

export function ServiceHistory({ item, onClose }: ServiceHistoryProps) {
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    commands
      .getServiceHistory(item.id)
      .then((data) => {
        if (!cancelled) {
          // Sort newest first by serviced_at
          const sorted = [...data].sort(
            (a, b) =>
              new Date(b.serviced_at).getTime() - new Date(a.serviced_at).getTime()
          );
          setRecords(sorted);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  return (
    <div style={overlayStyle} data-testid="modal-overlay">
      <div style={boxStyle} data-testid="service-history-modal">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            flexShrink: 0,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '1.125rem',
                fontWeight: 600,
                color: '#111827',
              }}
            >
              Service History
            </h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              {item.name}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: '#6b7280',
              padding: '0.25rem',
              lineHeight: 1,
            }}
            aria-label="Close"
            data-testid="btn-close"
          >
            &times;
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div
              style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}
              data-testid="loading-state"
            >
              Loading...
            </div>
          )}

          {!loading && error && (
            <div
              style={{ color: '#dc2626', padding: '1rem' }}
              data-testid="error-state"
            >
              {error}
            </div>
          )}

          {!loading && !error && records.length === 0 && (
            <div
              style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}
              data-testid="empty-state"
            >
              No service history yet. Use Log Service to record the first entry.
            </div>
          )}

          {!loading && !error && records.length > 0 && (
            <div data-testid="records-list">
              {records.map((record) => (
                <div
                  key={record.id}
                  style={recordStyle}
                  data-testid="service-record"
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '0.25rem',
                    }}
                  >
                    <span
                      style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}
                      data-testid="record-date"
                    >
                      {new Date(record.serviced_at).toLocaleDateString()}
                    </span>
                    {record.cost != null && (
                      <span
                        style={{ fontSize: '0.875rem', color: '#374151' }}
                        data-testid="record-cost"
                      >
                        ${record.cost.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '1rem',
                      marginTop: '0.25rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    {record.odometer_at_service != null && (
                      <span
                        style={{ fontSize: '0.8rem', color: '#6b7280' }}
                        data-testid="record-odometer"
                      >
                        {record.odometer_at_service.toLocaleString()} km
                      </span>
                    )}
                    {record.shop && (
                      <span
                        style={{ fontSize: '0.8rem', color: '#6b7280' }}
                        data-testid="record-shop"
                      >
                        {record.shop}
                      </span>
                    )}
                  </div>

                  {record.notes && (
                    <div
                      style={{
                        marginTop: '0.375rem',
                        fontSize: '0.8rem',
                        color: '#374151',
                      }}
                      data-testid="record-notes"
                    >
                      {record.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
