import { useEffect, useState } from 'react';
import { useVehiclesStore } from '../stores/vehicles';
import { useMaintenanceStore } from '../stores/maintenance';
import { MaintenanceItem } from '../lib/commands';
import { VehicleCard, AddVehicleCard } from '../components/VehicleCard';
import { useToast } from '../components/Toast';

export interface DashboardProps {
  onNavigate: (page: 'vehicle-detail' | 'settings', vehicleId?: number) => void;
  onAddVehicle?: () => void;
}

export function computeWorstStatus(
  items: MaintenanceItem[]
): 'Overdue' | 'DueSoon' | 'Ok' | 'Unknown' | null {
  if (items.length === 0) return null;
  if (items.some((i) => i.status === 'Overdue')) return 'Overdue';
  if (items.some((i) => i.status === 'DueSoon')) return 'DueSoon';
  if (items.some((i) => i.status === 'Ok')) return 'Ok';
  return 'Unknown';
}

export function Dashboard({ onNavigate, onAddVehicle }: DashboardProps) {
  const { vehicles, fetchVehicles, archiveVehicle, restoreVehicle } = useVehiclesStore();
  const { itemsByVehicle, fetchItems } = useMaintenanceStore();
  const { showError } = useToast();
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  useEffect(() => {
    fetchVehicles().catch((err) => showError(String(err)));
  }, [fetchVehicles, showError]);

  useEffect(() => {
    for (const v of vehicles) {
      fetchItems(v.id).catch((err) => showError(String(err)));
    }
  }, [vehicles, fetchItems, showError]);

  const activeVehicles = vehicles.filter((v) => !v.archived);
  const archivedVehicles = vehicles.filter((v) => v.archived);

  const handleArchive = async (id: number) => {
    try {
      await archiveVehicle(id);
    } catch (err) {
      showError(String(err));
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await restoreVehicle(id);
    } catch (err) {
      showError(String(err));
    }
  };

  // Empty state
  if (vehicles.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 2rem',
          gap: '1rem',
          color: '#6b7280',
        }}
        data-testid="empty-state"
      >
        <p style={{ fontSize: '1rem', margin: 0 }}>
          No vehicles yet. Add your first one to get started.
        </p>
        <button
          onClick={onAddVehicle}
          style={{
            padding: '0.5rem 1.25rem',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          + Add Vehicle
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Active vehicles grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '1rem',
        }}
        data-testid="active-grid"
      >
        {activeVehicles.map((vehicle) => (
          <VehicleCard
            key={vehicle.id}
            vehicle={vehicle}
            worstStatus={computeWorstStatus(itemsByVehicle[vehicle.id] ?? [])}
            onClick={() => onNavigate('vehicle-detail', vehicle.id)}
            onEdit={() => {
              // will be wired in Task 13
            }}
            onArchive={() => handleArchive(vehicle.id)}
          />
        ))}

        {/* Add Vehicle card always at end */}
        <AddVehicleCard onClick={onAddVehicle ?? (() => {})} />
      </div>

      {/* Archived section */}
      {archivedVehicles.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <button
            onClick={() => setArchivedExpanded((e) => !e)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              color: '#6b7280',
              padding: '0.5rem 0',
              fontWeight: 500,
            }}
            data-testid="archived-toggle"
            aria-expanded={archivedExpanded}
          >
            <span>
              {archivedVehicles.length} archived vehicle
              {archivedVehicles.length !== 1 ? 's' : ''}
            </span>
            <span
              style={{
                display: 'inline-block',
                transform: archivedExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s ease',
              }}
            >
              {'\u25B6'}
            </span>
          </button>

          {archivedExpanded && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '1rem',
                marginTop: '0.75rem',
              }}
              data-testid="archived-grid"
            >
              {archivedVehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  worstStatus={computeWorstStatus(itemsByVehicle[vehicle.id] ?? [])}
                  onClick={() => onNavigate('vehicle-detail', vehicle.id)}
                  onRestore={() => handleRestore(vehicle.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
