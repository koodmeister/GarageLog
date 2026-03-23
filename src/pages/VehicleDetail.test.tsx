import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VehicleDetail } from './VehicleDetail';
import { useVehiclesStore } from '../stores/vehicles';
import { useMaintenanceStore } from '../stores/maintenance';
import { commands } from '../lib/commands';
import type { Vehicle, MaintenanceItem } from '../lib/commands';
import { ToastProvider } from '../components/Toast';

vi.mock('../stores/vehicles', () => ({ useVehiclesStore: vi.fn() }));
vi.mock('../stores/maintenance', () => ({ useMaintenanceStore: vi.fn() }));
vi.mock('../lib/commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/commands')>();
  return {
    ...actual,
    commands: {
      ...actual.commands,
      deleteMaintenanceItem: vi.fn().mockResolvedValue(undefined),
    },
  };
});

const mockUseVehiclesStore = vi.mocked(useVehiclesStore);
const mockUseMaintenanceStore = vi.mocked(useMaintenanceStore);

const mockVehicle: Vehicle = {
  id: 1,
  name: 'Honda Civic',
  year: 2020,
  type: 'Car',
  current_odometer: 45000,
  odometer_updated_at: '2024-01-01T00:00:00Z',
  archived: false,
  archived_at: null,
  created_at: '2020-01-01T00:00:00Z',
};

function makeItem(overrides: Partial<MaintenanceItem> = {}): MaintenanceItem {
  return {
    id: 1,
    vehicle_id: 1,
    name: 'Oil Change',
    interval_months: 6,
    interval_km: 5000,
    notes: null,
    created_at: '2024-01-01T00:00:00Z',
    last_serviced_at: null,
    last_odometer_at_service: null,
    status: 'Ok',
    ...overrides,
  };
}

function makeVehiclesStore(overrides: Partial<ReturnType<typeof useVehiclesStore>> = {}) {
  return {
    vehicles: [mockVehicle],
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

function renderDetail(
  vehiclesOverrides: Partial<ReturnType<typeof useVehiclesStore>> = {},
  maintenanceOverrides: Partial<ReturnType<typeof useMaintenanceStore>> = {},
  props: Partial<Parameters<typeof VehicleDetail>[0]> = {}
) {
  mockUseVehiclesStore.mockReturnValue(makeVehiclesStore(vehiclesOverrides) as unknown as never);
  mockUseMaintenanceStore.mockReturnValue(makeMaintenanceStore(maintenanceOverrides) as unknown as never);
  return render(
    <ToastProvider>
      <VehicleDetail
        vehicleId={1}
        onNavigate={vi.fn()}
        {...props}
      />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VehicleDetail', () => {
  it('renders vehicle header with name, year, and odometer', () => {
    renderDetail();
    expect(screen.getByTestId('vehicle-title')).toHaveTextContent('2020 Honda Civic');
    // toLocaleString output varies by environment; just confirm the number and unit are present
    expect(screen.getByTestId('odometer-display')).toHaveTextContent(/45.?000\s*km/);
  });

  it('shows "Vehicle not found" when vehicleId does not match any vehicle', () => {
    renderDetail({ vehicles: [] });
    expect(screen.getByTestId('vehicle-not-found')).toBeInTheDocument();
    expect(screen.getByText('Vehicle not found.')).toBeInTheDocument();
  });

  it('shows back button that calls onNavigate with dashboard', () => {
    const onNavigate = vi.fn();
    renderDetail({}, {}, { onNavigate });
    fireEvent.click(screen.getByTestId('back-button'));
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });

  it('renders empty state with "+ Add Item" button when no maintenance items', () => {
    renderDetail({}, { itemsByVehicle: { 1: [] } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No maintenance items yet. Add your first one.')).toBeInTheDocument();
    expect(screen.getByTestId('add-item-btn')).toBeInTheDocument();
  });

  it('calls onOpenAddEditItem when "+ Add Item" button clicked in empty state', () => {
    const onOpenAddEditItem = vi.fn();
    renderDetail({}, { itemsByVehicle: { 1: [] } }, { onOpenAddEditItem });
    fireEvent.click(screen.getByTestId('add-item-btn'));
    // Called with vehicleId only (no itemId), so second arg is absent
    expect(onOpenAddEditItem).toHaveBeenCalledWith(1);
  });

  it('renders maintenance rows when items exist', () => {
    const items = [
      makeItem({ id: 1, name: 'Oil Change', status: 'Ok' }),
      makeItem({ id: 2, name: 'Tyre Rotation', status: 'Overdue' }),
    ];
    renderDetail({}, { itemsByVehicle: { 1: items } });
    expect(screen.getAllByTestId('maintenance-row')).toHaveLength(2);
    expect(screen.getByText('Oil Change')).toBeInTheDocument();
    expect(screen.getByText('Tyre Rotation')).toBeInTheDocument();
  });

  it('shows filter tabs', () => {
    renderDetail();
    expect(screen.getByTestId('tab-All')).toBeInTheDocument();
    expect(screen.getByTestId('tab-Overdue')).toBeInTheDocument();
    expect(screen.getByTestId('tab-DueSoon')).toBeInTheDocument();
    expect(screen.getByTestId('tab-Ok')).toBeInTheDocument();
  });

  it('filter tabs filter items by status', () => {
    const items = [
      makeItem({ id: 1, name: 'Oil Change', status: 'Ok' }),
      makeItem({ id: 2, name: 'Brake Fluid', status: 'Overdue' }),
      makeItem({ id: 3, name: 'Air Filter', status: 'DueSoon' }),
    ];
    renderDetail({}, { itemsByVehicle: { 1: items } });

    // All tab shows all items
    expect(screen.getAllByTestId('maintenance-row')).toHaveLength(3);

    // Switch to Overdue tab
    fireEvent.click(screen.getByTestId('tab-Overdue'));
    expect(screen.getAllByTestId('maintenance-row')).toHaveLength(1);
    expect(screen.getByText('Brake Fluid')).toBeInTheDocument();
    expect(screen.queryByText('Oil Change')).not.toBeInTheDocument();

    // Switch to Ok tab
    fireEvent.click(screen.getByTestId('tab-Ok'));
    expect(screen.getAllByTestId('maintenance-row')).toHaveLength(1);
    expect(screen.getByText('Oil Change')).toBeInTheDocument();
    expect(screen.queryByText('Brake Fluid')).not.toBeInTheDocument();
  });

  it('calls onOpenAddEditVehicle with vehicleId when Edit button clicked', () => {
    const onOpenAddEditVehicle = vi.fn();
    renderDetail({}, {}, { onOpenAddEditVehicle });
    fireEvent.click(screen.getByTestId('edit-vehicle-btn'));
    expect(onOpenAddEditVehicle).toHaveBeenCalledWith(1);
  });

  it('calls onOpenUpdateOdometer with vehicleId when Update Odometer button clicked', () => {
    const onOpenUpdateOdometer = vi.fn();
    renderDetail({}, {}, { onOpenUpdateOdometer });
    fireEvent.click(screen.getByTestId('update-odometer-btn'));
    expect(onOpenUpdateOdometer).toHaveBeenCalledWith(1);
  });

  it('calls onOpenLogService when Log Service button clicked on a row', () => {
    const onOpenLogService = vi.fn();
    const items = [makeItem({ id: 42 })];
    renderDetail({}, { itemsByVehicle: { 1: items } }, { onOpenLogService });
    fireEvent.click(screen.getByTestId('log-service-btn'));
    expect(onOpenLogService).toHaveBeenCalledWith(42);
  });

  it('calls onOpenServiceHistory when History button clicked on a row', () => {
    const onOpenServiceHistory = vi.fn();
    const items = [makeItem({ id: 42 })];
    renderDetail({}, { itemsByVehicle: { 1: items } }, { onOpenServiceHistory });
    fireEvent.click(screen.getByTestId('history-btn'));
    expect(onOpenServiceHistory).toHaveBeenCalledWith(42);
  });

  it('calls onOpenAddEditItem with vehicleId and itemId when Edit chosen in row overflow', () => {
    const onOpenAddEditItem = vi.fn();
    const items = [makeItem({ id: 7 })];
    renderDetail({}, { itemsByVehicle: { 1: items } }, { onOpenAddEditItem });
    fireEvent.click(screen.getByTestId('row-overflow-btn'));
    // Multiple "Edit" buttons exist (vehicle header + row menu); target the one inside the overflow menu
    const overflowMenu = screen.getByTestId('row-overflow-menu');
    fireEvent.click(overflowMenu.querySelector('button')!);
    expect(onOpenAddEditItem).toHaveBeenCalledWith(1, 7);
  });

  it('delete calls window.confirm then deleteMaintenanceItem and re-fetches', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchItems = vi.fn().mockResolvedValue(undefined);
    const items = [makeItem({ id: 5 })];
    renderDetail({}, { itemsByVehicle: { 1: items }, fetchItems });

    fireEvent.click(screen.getByTestId('row-overflow-btn'));
    fireEvent.click(screen.getByText('Delete'));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Deleting this item will also remove all its service history. Continue?'
    );
    await waitFor(() => {
      expect(commands.deleteMaintenanceItem).toHaveBeenCalledWith(5);
    });
    await waitFor(() => {
      expect(fetchItems).toHaveBeenCalledWith(1);
    });

    confirmSpy.mockRestore();
  });

  it('does not call deleteMaintenanceItem if confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const items = [makeItem({ id: 5 })];
    renderDetail({}, { itemsByVehicle: { 1: items } });

    fireEvent.click(screen.getByTestId('row-overflow-btn'));
    fireEvent.click(screen.getByText('Delete'));

    expect(confirmSpy).toHaveBeenCalled();
    expect(commands.deleteMaintenanceItem).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('fetches items on mount', () => {
    const fetchItems = vi.fn().mockResolvedValue(undefined);
    renderDetail({}, { fetchItems });
    expect(fetchItems).toHaveBeenCalledWith(1);
  });
});
