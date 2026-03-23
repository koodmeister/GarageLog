import { create } from 'zustand';
import { Vehicle, commands } from '../lib/commands';

interface VehiclesStore {
  vehicles: Vehicle[];
  loading: boolean;
  selectedVehicleId: number | null;
  fetchVehicles: () => Promise<void>;
  selectVehicle: (id: number | null) => void;
  createVehicle: (args: { name: string; year: number; vehicle_type: string; initial_odometer: number }) => Promise<Vehicle>;
  updateVehicle: (args: { id: number; name: string; year: number; vehicle_type: string }) => Promise<Vehicle>;
  archiveVehicle: (id: number) => Promise<void>;
  restoreVehicle: (id: number) => Promise<void>;
}

export const useVehiclesStore = create<VehiclesStore>()((set) => ({
  vehicles: [],
  loading: false,
  selectedVehicleId: null,

  fetchVehicles: async () => {
    set({ loading: true });
    try {
      const vehicles = await commands.getVehicles();
      set({ vehicles, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  selectVehicle: (id) => set({ selectedVehicleId: id }),

  createVehicle: async (args) => {
    const vehicle = await commands.createVehicle(args);
    const vehicles = await commands.getVehicles();
    set({ vehicles });
    return vehicle;
  },

  updateVehicle: async (args) => {
    const vehicle = await commands.updateVehicle(args);
    const vehicles = await commands.getVehicles();
    set({ vehicles });
    return vehicle;
  },

  archiveVehicle: async (id) => {
    await commands.archiveVehicle(id);
    const vehicles = await commands.getVehicles();
    set({ vehicles });
  },

  restoreVehicle: async (id) => {
    await commands.restoreVehicle(id);
    const vehicles = await commands.getVehicles();
    set({ vehicles });
  },
}));
