import { invoke } from '@tauri-apps/api/core';

// Types
export interface Vehicle {
  id: number;
  name: string;
  year: number;
  type: string;
  current_odometer: number;
  odometer_updated_at: string;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  vin: string | null;
  license_plate: string | null;
}

export interface MaintenanceItem {
  id: number;
  vehicle_id: number;
  name: string;
  interval_months: number | null;
  interval_km: number | null;
  notes: string | null;
  created_at: string;
  last_serviced_at: string | null;
  last_odometer_at_service: number | null;
  status: 'Overdue' | 'DueSoon' | 'Ok' | 'Unknown';
}

export interface ServiceRecord {
  id: number;
  maintenance_item_id: number;
  serviced_at: string;
  odometer_at_service: number | null;
  cost: number | null;
  shop: string | null;
  notes: string | null;
}

export type OdometerResult =
  | { type: 'Updated'; vehicle: Vehicle }
  | { type: 'LargeJumpWarning'; km_above_current: number };

export type LogServiceResult =
  | { type: 'Logged'; record: ServiceRecord }
  | { type: 'BelowCurrentAdvisory'; record: ServiceRecord }
  | { type: 'LargeJumpWarning'; km_above_current: number };

export interface ImportConflict {
  imported_vehicle_name: string;
  imported_vehicle_year: number;
  existing_vehicle_id: number;
}

export interface ImportSummary {
  vehicle_count: number;
  maintenance_item_count: number;
  service_record_count: number;
  conflicts: ImportConflict[];
  import_data: string;
}

export interface VehicleResolution {
  imported_vehicle_index: number;
  action: 'merge' | 'skip';
  target_vehicle_id: number | null;
}

// Commands
export const commands = {
  getVehicles: () => invoke<Vehicle[]>('get_vehicles'),
  createVehicle: (args: { name: string; year: number; vehicle_type: string; initial_odometer: number; vin: string | null; license_plate: string | null }) =>
    invoke<Vehicle>('create_vehicle', args),
  updateVehicle: (args: { id: number; name: string; year: number; vehicle_type: string; vin: string | null; license_plate: string | null }) =>
    invoke<Vehicle>('update_vehicle', args),
  archiveVehicle: (id: number) => invoke<void>('archive_vehicle', { id }),
  restoreVehicle: (id: number) => invoke<void>('restore_vehicle', { id }),

  updateOdometer: (args: { vehicle_id: number; new_reading: number; date: string; force: boolean }) =>
    invoke<OdometerResult>('update_odometer', args),

  getMaintenanceItems: (vehicle_id: number) =>
    invoke<MaintenanceItem[]>('get_maintenance_items', { vehicle_id }),
  createMaintenanceItem: (args: { vehicle_id: number; name: string; interval_months: number | null; interval_km: number | null; notes: string | null }) =>
    invoke<MaintenanceItem>('create_maintenance_item', args),
  updateMaintenanceItem: (args: { id: number; name: string; interval_months: number | null; interval_km: number | null; notes: string | null }) =>
    invoke<MaintenanceItem>('update_maintenance_item', args),
  deleteMaintenanceItem: (id: number) => invoke<void>('delete_maintenance_item', { id }),

  logService: (args: { maintenance_item_id: number; serviced_at: string; odometer_at_service: number | null; cost: number | null; shop: string | null; notes: string | null; force: boolean }) =>
    invoke<LogServiceResult>('log_service', args),
  getServiceHistory: (maintenance_item_id: number) =>
    invoke<ServiceRecord[]>('get_service_history', { maintenance_item_id }),

  exportJson: () => invoke<void>('export_json'),
  exportCsv: () => invoke<void>('export_csv'),
  importJson: () => invoke<ImportSummary>('import_json'),
  confirmImport: (args: { import_data: string; resolutions: VehicleResolution[] }) =>
    invoke<void>('confirm_import', args),

  checkNotificationsNow: () => invoke<void>('check_notifications_now'),
};
