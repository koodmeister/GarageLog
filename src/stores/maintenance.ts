import { create } from 'zustand';
import { MaintenanceItem, commands } from '../lib/commands';

interface MaintenanceStore {
  itemsByVehicle: Record<number, MaintenanceItem[]>;
  fetchItems: (vehicleId: number) => Promise<void>;
}

export const useMaintenanceStore = create<MaintenanceStore>()((set) => ({
  itemsByVehicle: {},

  fetchItems: async (vehicleId) => {
    const items = await commands.getMaintenanceItems(vehicleId);
    set((state) => ({
      itemsByVehicle: {
        ...state.itemsByVehicle,
        [vehicleId]: items,
      },
    }));
  },
}));
