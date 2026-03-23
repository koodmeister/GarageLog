import { useEffect, useState } from 'react';
import { useVehiclesStore } from '../stores/vehicles';
import { useMaintenanceStore } from '../stores/maintenance';
import { commands, MaintenanceItem } from '../lib/commands';
import { MaintenanceRow } from '../components/MaintenanceRow';
import { useToast } from '../components/Toast';

type FilterTab = 'All' | 'Overdue' | 'DueSoon' | 'Ok';

export interface VehicleDetailProps {
  vehicleId: number;
  onNavigate: (page: 'dashboard' | 'settings') => void;
  onOpenAddEditVehicle?: (vehicleId: number) => void;
  onOpenUpdateOdometer?: (vehicleId: number) => void;
  onOpenAddEditItem?: (vehicleId: number, itemId?: number) => void;
  onOpenLogService?: (itemId: number) => void;
  onOpenServiceHistory?: (itemId: number) => void;
}

const FILTER_TABS: FilterTab[] = ['All', 'Overdue', 'DueSoon', 'Ok'];

const FILTER_LABELS: Record<FilterTab, string> = {
  All: 'All',
  Overdue: 'Overdue',
  DueSoon: 'Due Soon',
  Ok: 'OK',
};

function filterItems(items: MaintenanceItem[], tab: FilterTab): MaintenanceItem[] {
  if (tab === 'All') return items;
  return items.filter((item) => item.status === tab);
}

export function VehicleDetail({
  vehicleId,
  onNavigate,
  onOpenAddEditVehicle,
  onOpenUpdateOdometer,
  onOpenAddEditItem,
  onOpenLogService,
  onOpenServiceHistory,
}: VehicleDetailProps) {
  const { vehicles } = useVehiclesStore();
  const { itemsByVehicle, fetchItems } = useMaintenanceStore();
  const { showError } = useToast();
  const [activeTab, setActiveTab] = useState<FilterTab>('All');

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const items: MaintenanceItem[] = itemsByVehicle[vehicleId] ?? [];
  const displayedItems = filterItems(items, activeTab);

  useEffect(() => {
    fetchItems(vehicleId).catch((err) => showError(String(err)));
  }, [vehicleId, fetchItems, showError]);

  const handleDelete = async (itemId: number) => {
    const confirmed = window.confirm(
      'Deleting this item will also remove all its service history. Continue?'
    );
    if (!confirmed) return;
    try {
      await commands.deleteMaintenanceItem(itemId);
      await fetchItems(vehicleId);
    } catch (err) {
      showError(String(err));
    }
  };

  if (!vehicle) {
    return (
      <div
        style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}
        data-testid="vehicle-not-found"
      >
        <p>Vehicle not found.</p>
        <button
          onClick={() => onNavigate('dashboard')}
          style={backButtonStyle}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Back button */}
      <button
        onClick={() => onNavigate('dashboard')}
        style={backButtonStyle}
        data-testid="back-button"
      >
        {'\u2190'} Back
      </button>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginTop: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1
            style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}
            data-testid="vehicle-title"
          >
            {vehicle.year} {vehicle.name}
          </h1>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
            {vehicle.type}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => onOpenAddEditVehicle?.(vehicleId)}
            style={secondaryButtonStyle}
            data-testid="edit-vehicle-btn"
          >
            Edit
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{ fontSize: '0.875rem', color: '#374151' }}
              data-testid="odometer-display"
            >
              {vehicle.current_odometer.toLocaleString()} km
            </span>
            <button
              onClick={() => onOpenUpdateOdometer?.(vehicleId)}
              style={primaryButtonStyle}
              data-testid="update-odometer-btn"
            >
              Update Odometer
            </button>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div
        style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}
        data-testid="filter-tabs"
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            data-testid={`tab-${tab}`}
            style={{
              padding: '0.375rem 0.875rem',
              border: '1px solid',
              borderColor: activeTab === tab ? '#2563eb' : '#e5e7eb',
              borderRadius: '9999px',
              background: activeTab === tab ? '#2563eb' : '#fff',
              color: activeTab === tab ? '#fff' : '#374151',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
          >
            {FILTER_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Maintenance items list */}
      {items.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 2rem',
            gap: '1rem',
            color: '#6b7280',
          }}
          data-testid="empty-state"
        >
          <p style={{ margin: 0 }}>No maintenance items yet. Add your first one.</p>
          <button
            onClick={() => onOpenAddEditItem?.(vehicleId)}
            style={primaryButtonStyle}
            data-testid="add-item-btn"
          >
            + Add Item
          </button>
        </div>
      ) : (
        <>
          {/* Add item button shown above list when items exist */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button
              onClick={() => onOpenAddEditItem?.(vehicleId)}
              style={primaryButtonStyle}
              data-testid="add-item-btn"
            >
              + Add Item
            </button>
          </div>

          {displayedItems.length === 0 ? (
            <div
              style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}
              data-testid="filtered-empty"
            >
              No items match this filter.
            </div>
          ) : (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
              data-testid="maintenance-list"
            >
              {displayedItems.map((item) => (
                <MaintenanceRow
                  key={item.id}
                  item={item}
                  onLogService={() => onOpenLogService?.(item.id)}
                  onHistory={() => onOpenServiceHistory?.(item.id)}
                  onEdit={() => onOpenAddEditItem?.(vehicleId, item.id)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const backButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#2563eb',
  fontSize: '0.875rem',
  padding: '0.25rem 0',
  fontWeight: 500,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#fff',
  color: '#374151',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
};
