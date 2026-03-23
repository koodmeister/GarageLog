import { useState, useRef, useEffect } from 'react';
import { Vehicle } from '../lib/commands';

export interface VehicleCardProps {
  vehicle: Vehicle;
  worstStatus: 'Overdue' | 'DueSoon' | 'Ok' | 'Unknown' | null;
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onClick: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  car: 'Car',
  Car: 'Car',
  motorcycle: 'Motorcycle',
  Motorcycle: 'Motorcycle',
  truck: 'Truck',
  Truck: 'Truck',
  other: 'Other',
  Other: 'Other',
};

const TYPE_EMOJI: Record<string, string> = {
  car: '\uD83D\uDE97',
  Car: '\uD83D\uDE97',
  motorcycle: '\uD83C\uDFCD\uFE0F',
  Motorcycle: '\uD83C\uDFCD\uFE0F',
  truck: '\uD83D\uDE9B',
  Truck: '\uD83D\uDE9B',
  other: '\uD83D\uDD27',
  Other: '\uD83D\uDD27',
};

function typeEmoji(type: string): string {
  return TYPE_EMOJI[type] ?? '\uD83D\uDD27';
}

// suppress unused warning
void TYPE_ICONS;

interface StatusBadgeProps {
  status: 'Overdue' | 'DueSoon' | 'Ok' | 'Unknown' | null;
}

function StatusBadge({ status }: StatusBadgeProps) {
  if (status === null) return null;

  const styles: Record<string, React.CSSProperties> = {
    Overdue: { backgroundColor: '#dc2626', color: '#fff' },
    DueSoon: { backgroundColor: '#d97706', color: '#fff' },
    Ok: { backgroundColor: '#16a34a', color: '#fff' },
    Unknown: { backgroundColor: '#6b7280', color: '#fff' },
  };

  const labels: Record<string, string> = {
    Overdue: 'Overdue',
    DueSoon: 'Due Soon',
    Ok: 'All Good',
    Unknown: 'Unknown',
  };

  return (
    <span
      data-testid="status-badge"
      style={{
        ...styles[status],
        padding: '0.2rem 0.5rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        display: 'inline-block',
      }}
    >
      {labels[status]}
    </span>
  );
}

export function VehicleCard({
  vehicle,
  worstStatus,
  onEdit,
  onArchive,
  onRestore,
  onClick,
}: VehicleCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const isArchived = vehicle.archived;

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    background: isArchived ? '#f3f4f6' : '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.75rem',
    padding: '1rem',
    cursor: 'pointer',
    opacity: isArchived ? 0.65 : 1,
    transition: 'box-shadow 0.15s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  };

  return (
    <div
      style={cardStyle}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${vehicle.year} ${vehicle.name}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      data-testid="vehicle-card"
    >
      {/* Overflow menu button */}
      <div
        ref={menuRef}
        style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          aria-label="More options"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.25rem',
            color: '#6b7280',
            padding: '0.125rem 0.25rem',
            lineHeight: 1,
          }}
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
              minWidth: '120px',
              overflow: 'hidden',
            }}
            data-testid="overflow-menu"
          >
            {isArchived ? (
              <button
                style={menuItemStyle}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onRestore?.();
                }}
              >
                Restore
              </button>
            ) : (
              <>
                <button
                  style={menuItemStyle}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onEdit?.();
                  }}
                >
                  Edit
                </button>
                <button
                  style={{ ...menuItemStyle, color: '#dc2626' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onArchive?.();
                  }}
                >
                  Archive
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Type icon + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingRight: '2rem' }}>
        <span style={{ fontSize: '1.5rem' }} aria-hidden="true">
          {typeEmoji(vehicle.type)}
        </span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '1rem', color: '#111827' }}>
            {vehicle.name}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{vehicle.year}</div>
        </div>
      </div>

      {/* Odometer */}
      <div style={{ fontSize: '0.875rem', color: '#374151' }}>
        <span style={{ color: '#6b7280' }}>Odometer: </span>
        {vehicle.current_odometer.toLocaleString()} km
      </div>

      {/* Status badge */}
      <div>
        <StatusBadge status={worstStatus} />
      </div>
    </div>
  );
}

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

export function AddVehicleCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      style={{
        background: '#f9fafb',
        border: '2px dashed #d1d5db',
        borderRadius: '0.75rem',
        padding: '1rem',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        minHeight: '140px',
        color: '#6b7280',
        transition: 'border-color 0.15s ease',
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Add Vehicle"
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      data-testid="add-vehicle-card"
    >
      <span style={{ fontSize: '2rem', lineHeight: 1 }}>+</span>
      <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Add Vehicle</span>
    </div>
  );
}
