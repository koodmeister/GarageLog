import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useMaintenanceStore } from './maintenance';
import type { MaintenanceItem } from '../lib/commands';

const mockInvoke = vi.mocked(invoke);

const mockItem: MaintenanceItem = {
  id: 1,
  vehicle_id: 5,
  name: 'Oil Change',
  interval_months: 6,
  interval_km: 5000,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  last_serviced_at: null,
  last_odometer_at_service: null,
  status: 'Ok',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the store state between tests
  useMaintenanceStore.setState({
    itemsByVehicle: {},
  });
});

describe('useMaintenanceStore', () => {
  it('starts with empty itemsByVehicle', () => {
    const state = useMaintenanceStore.getState();
    expect(state.itemsByVehicle).toEqual({});
  });

  it('fetchItems calls invoke with get_maintenance_items and updates store', async () => {
    mockInvoke.mockResolvedValueOnce([mockItem]);

    await useMaintenanceStore.getState().fetchItems(5);

    expect(mockInvoke).toHaveBeenCalledWith('get_maintenance_items', { vehicle_id: 5 });
    expect(useMaintenanceStore.getState().itemsByVehicle[5]).toEqual([mockItem]);
  });

  it('fetchItems for multiple vehicles stores them separately', async () => {
    const item2: MaintenanceItem = { ...mockItem, id: 2, vehicle_id: 7 };
    mockInvoke.mockResolvedValueOnce([mockItem]);
    mockInvoke.mockResolvedValueOnce([item2]);

    await useMaintenanceStore.getState().fetchItems(5);
    await useMaintenanceStore.getState().fetchItems(7);

    const state = useMaintenanceStore.getState();
    expect(state.itemsByVehicle[5]).toEqual([mockItem]);
    expect(state.itemsByVehicle[7]).toEqual([item2]);
  });
});
