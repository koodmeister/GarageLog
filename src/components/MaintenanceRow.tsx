import { useState, useRef, useEffect } from 'react';
import { MaintenanceItem } from '../lib/commands';

export interface MaintenanceRowProps {
  item: MaintenanceItem;
  onLogService: () => void;
  onHistory: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const STATUS_COLORS: Record<MaintenanceItem['status'], string> = {
  Overdue: '#ef4444',
  DueSoon: '#f59e0b',
  Ok: '#22c55e',
  Unknown: '#9ca3af',
};

const STATUS_LABELS: Record<MaintenanceItem['status'], string> = {
  Overdue: 'Overdue',
  DueSoon: 'Due Soon',
  Ok: 'OK',
  Unknown: 'Unknown',
};

function formatIntervalDescription(item: MaintenanceItem): string {
  const parts: string[] = [];
  if (item.interval_months != null) {
    parts.push(`Every ${item.interval_months} month${item.interval_months !== 1 ? 's' : ''}`);
  }
  if (item.interval_km != null) {
    parts.push(`${item.interval_km.toLocaleString()} km`);
  }
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} / ${parts[1]}`;
}

function formatLastServiced(item: MaintenanceItem): string {
  if (!item.last_serviced_at) return 'Never';
  const date = new Date(item.last_serviced_at).toLocaleDateString();
  if (item.last_odometer_at_service != null) {
    return `${date} @ ${item.last_odometer_at_service.toLocaleString()} km`;
  }
  return date;
}

export function MaintenanceRow({
  item,
  onLogService,
  onHistory,
  onEdit,
  onDelete,
}: MaintenanceRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const borderColor = STATUS_COLORS[item.status];
  const statusLabel = STATUS_LABELS[item.status];

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div
      data-testid="maintenance-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        position: 'relative',
      }}
    >
      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span
            style={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}
            data-testid="row-name"
          >
            {item.name}
          </span>
          <span
            data-testid="row-status"
            style={{
              color: borderColor,
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            {statusLabel}
          </span>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
          {formatIntervalDescription(item)}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '1rem',
            fontSize: '0.8rem',
            color: '#374151',
            marginTop: '0.25rem',
            flexWrap: 'wrap',
          }}
        >
          <span>
            <span style={{ color: '#6b7280' }}>Last: </span>
            {formatLastServiced(item)}
          </span>
          <span>
            <span style={{ color: '#6b7280' }}>Next: </span>
            {'—'}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <button
          onClick={onLogService}
          style={actionButtonStyle}
          data-testid="log-service-btn"
        >
          Log Service
        </button>
        <button
          onClick={onHistory}
          style={actionButtonStyle}
          data-testid="history-btn"
        >
          History
        </button>

        {/* Overflow menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            aria-label="More options"
            onClick={() => setMenuOpen((o) => !o)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: '#6b7280',
              padding: '0.125rem 0.25rem',
              lineHeight: 1,
            }}
            data-testid="row-overflow-btn"
          >
            {'\u22EF'}
          </button>

          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                zIndex: 10,
                minWidth: '100px',
                overflow: 'hidden',
              }}
              data-testid="row-overflow-menu"
            >
              <button
                style={menuItemStyle}
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              >
                Edit
              </button>
              <button
                style={{ ...menuItemStyle, color: '#dc2626' }}
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const actionButtonStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: '0.375rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 500,
  color: '#374151',
};

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0.5rem 1rem',
  textAlign: 'left',
  fontSize: '0.875rem',
  color: '#111827',
};
