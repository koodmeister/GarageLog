import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dashboard, computeWorstStatus } from './Dashboard';
import { useVehiclesStore } from '../stores/vehicles';
import { useMaintenanceStore } from '../stores/maintenance';
import type { Vehicle, MaintenanceItem } from '../lib/commands';
import { ToastProvider } from '../components/Toast';

vi.mock('../stores/vehicles', () => ({ useVehiclesStore: vi.fn() }));
vi.mock('../stores/maintenance', () => ({ useMaintenanceStore: vi.fn() }));

const mockUseVehiclesStore = vi.mocked(useVehiclesStore);
const mockUseMaintenanceStore = vi.mocked(useMaintenanceStore);

const mockVehicle: Vehicle = {
  id: 1,
  name: 'Toyota Camry',
  year: 2021,
  type: 'Car',
  current_odometer: 30000,
  odometer_updated_at: '2024-01-01T00:00:00Z',
  archived: false,
  archived_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

const archivedVehicle: Vehicle = {
  id: 2,
  name: 'Old Truck',
  year: 2005,
  type: 'Truck',
  current_odometer: 200000,
  odometer_updated_at: '2024-01-01T00:00:00Z',
  archived: true,
  archived_at: '2024-06-01T00:00:00Z',
  created_at: '2020-01-01T00:00:00Z',
};

const mockItem = (status: MaintenanceItem['status']): MaintenanceItem => ({
  id: 1,
  vehicle_id: 1,
  name: 'Oil Change',
  interval_months: 6,
  interval_km: 5000,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  last_serviced_at: null,
  last_odometer_at_service: null,
  status,
});

function makeVehiclesStore(overrides: Partial<ReturnType<typeof useVehiclesStore>> = {}) {
  return {
    vehicles: [],
    loading: false,
    selectedVehicleId: null,
    fetchVehicles: vi.fn().mockResolvedValue(undefined),
    selectVehicle: vi.fn(),
    createVehicle: vi.fn(),
    updateVehicle: vi.fn(),
    archiveVehicle: vi.fn().mockResolvedValue(undefined),
    restoreVehicle: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ReturnType<typeof useVehiclesStore>;
}

function makeMaintenanceStore(overrides: Partial<ReturnType<typeof useMaintenanceStore>> = {}) {
  return {
    itemsByVehicle: {},
    fetchItems: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ReturnType<typeof useMaintenanceStore>;
}

function renderDashboard(
  vehiclesOverrides = {},
  maintenanceOverrides = {},
  onNavigate = vi.fn()
) {
  mockUseVehiclesStore.mockReturnValue(makeVehiclesStore(vehiclesOverrides) as unknown as never);
  mockUseMaintenanceStore.mockReturnValue(makeMaintenanceStore(maintenanceOverrides) as unknown as never);
  return render(
    <ToastProvider>
      <Dashboard onNavigate={onNavigate} />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard', () => {
  it('shows empty state when no vehicles', () => {
    renderDashboard({ vehicles: [] });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(
      screen.getByText('No vehicles yet. Add your first one to get started.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Vehicle/i })).toBeInTheDocument();
  });

  it('renders vehicle cards for active vehicles', () => {
    renderDashboard({ vehicles: [mockVehicle] });
    expect(screen.getAllByTestId('vehicle-card')).toHaveLength(1);
    expect(screen.getByText('Toyota Camry')).toBeInTheDocument();
  });

  it('shows + Add Vehicle card at end of active section', () => {
    renderDashboard({ vehicles: [mockVehicle] });
    expect(screen.getByTestId('add-vehicle-card')).toBeInTheDocument();
  });

  it('shows archived toggle row when there are archived vehicles', () => {
    renderDashboard({ vehicles: [mockVehicle, archivedVehicle] });
    const toggle = screen.getByTestId('archived-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent('1 archived vehicle');
  });

  it('does not show archived section when no archived vehicles', () => {
    renderDashboard({ vehicles: [mockVehicle] });
    expect(screen.queryByTestId('archived-toggle')).not.toBeInTheDocument();
  });

  it('expands archived vehicles on toggle click', () => {
    renderDashboard({ vehicles: [mockVehicle, archivedVehicle] });
    expect(screen.queryByTestId('archived-grid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('archived-toggle'));
    expect(screen.getByTestId('archived-grid')).toBeInTheDocument();
    expect(screen.getByText('Old Truck')).toBeInTheDocument();
  });

  it('collapses archived section on second toggle click', () => {
    renderDashboard({ vehicles: [mockVehicle, archivedVehicle] });
    fireEvent.click(screen.getByTestId('archived-toggle'));
    expect(screen.getByTestId('archived-grid')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('archived-toggle'));
    expect(screen.queryByTestId('archived-grid')).not.toBeInTheDocument();
  });

  it('navigates to vehicle detail on card click', () => {
    const onNavigate = vi.fn();
    renderDashboard({ vehicles: [mockVehicle] }, {}, onNavigate);
    fireEvent.click(screen.getByTestId('vehicle-card'));
    expect(onNavigate).toHaveBeenCalledWith('vehicle-detail', mockVehicle.id);
  });

  it('calls archiveVehicle when Archive is clicked in overflow menu', async () => {
    const archiveVehicle = vi.fn().mockResolvedValue(undefined);
    renderDashboard({ vehicles: [mockVehicle], archiveVehicle });
    fireEvent.click(screen.getByLabelText('More options'));
    fireEvent.click(screen.getByText('Archive'));
    expect(archiveVehicle).toHaveBeenCalledWith(mockVehicle.id);
  });

  it('calls restoreVehicle when Restore is clicked in overflow menu', async () => {
    const restoreVehicle = vi.fn().mockResolvedValue(undefined);
    renderDashboard({ vehicles: [mockVehicle, archivedVehicle], restoreVehicle });
    // Expand archived section
    fireEvent.click(screen.getByTestId('archived-toggle'));
    // The archived card should be present — click its overflow menu
    const overflowBtns = screen.getAllByLabelText('More options');
    // The archived vehicle is at index 1 (index 0 is the active vehicle)
    fireEvent.click(overflowBtns[1]);
    fireEvent.click(screen.getByText('Restore'));
    expect(restoreVehicle).toHaveBeenCalledWith(archivedVehicle.id);
  });

  it('uses worstStatus from itemsByVehicle', () => {
    renderDashboard(
      { vehicles: [mockVehicle] },
      { itemsByVehicle: { 1: [mockItem('Overdue')] } }
    );
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Overdue');
  });
});

describe('computeWorstStatus', () => {
  it('returns null for empty items', () => {
    expect(computeWorstStatus([])).toBeNull();
  });

  it('returns Overdue when any item is Overdue', () => {
    expect(
      computeWorstStatus([mockItem('Ok'), mockItem('Overdue'), mockItem('DueSoon')])
    ).toBe('Overdue');
  });

  it('returns DueSoon when any item is DueSoon (no Overdue)', () => {
    expect(
      computeWorstStatus([mockItem('Ok'), mockItem('DueSoon')])
    ).toBe('DueSoon');
  });

  it('returns Ok when all items are Ok', () => {
    expect(
      computeWorstStatus([mockItem('Ok'), mockItem('Ok')])
    ).toBe('Ok');
  });

  it('returns Unknown when all items are Unknown', () => {
    expect(
      computeWorstStatus([mockItem('Unknown'), mockItem('Unknown')])
    ).toBe('Unknown');
  });

  it('Overdue takes precedence over everything', () => {
    expect(
      computeWorstStatus([mockItem('Unknown'), mockItem('DueSoon'), mockItem('Overdue'), mockItem('Ok')])
    ).toBe('Overdue');
  });
});
