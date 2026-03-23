import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useVehiclesStore } from './vehicles';
import type { Vehicle } from '../lib/commands';

const mockInvoke = vi.mocked(invoke);

const mockVehicle: Vehicle = {
  id: 1,
  name: 'Test Car',
  year: 2020,
  type: 'Car',
  current_odometer: 10000,
  odometer_updated_at: '2024-01-01T00:00:00Z',
  archived: false,
  archived_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the store state between tests
  useVehiclesStore.setState({
    vehicles: [],
    loading: false,
    selectedVehicleId: null,
  });
});

describe('useVehiclesStore', () => {
  it('starts with an empty vehicles array', () => {
    const state = useVehiclesStore.getState();
    expect(state.vehicles).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.selectedVehicleId).toBeNull();
  });

  it('fetchVehicles calls invoke with get_vehicles and updates store', async () => {
    mockInvoke.mockResolvedValueOnce([mockVehicle]);

    await useVehiclesStore.getState().fetchVehicles();

    expect(mockInvoke).toHaveBeenCalledWith('get_vehicles');
    expect(useVehiclesStore.getState().vehicles).toEqual([mockVehicle]);
    expect(useVehiclesStore.getState().loading).toBe(false);
  });

  it('selectVehicle updates selectedVehicleId', () => {
    useVehiclesStore.getState().selectVehicle(42);
    expect(useVehiclesStore.getState().selectedVehicleId).toBe(42);

    useVehiclesStore.getState().selectVehicle(null);
    expect(useVehiclesStore.getState().selectedVehicleId).toBeNull();
  });

  it('fetchVehicles sets loading to false even on error', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('DB error'));

    await expect(useVehiclesStore.getState().fetchVehicles()).rejects.toThrow('DB error');
    expect(useVehiclesStore.getState().loading).toBe(false);
  });
});
