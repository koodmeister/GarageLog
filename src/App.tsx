import './App.css';
import { useState } from 'react';
import { ToastProvider, useToast } from './components/Toast';
import { Dashboard } from './pages/Dashboard';
import { VehicleDetail } from './pages/VehicleDetail';
import { Settings } from './pages/Settings';
import { AddEditVehicle } from './components/modals/AddEditVehicle';
import { UpdateOdometer } from './components/modals/UpdateOdometer';
import { AddEditMaintenanceItem } from './components/modals/AddEditMaintenanceItem';
import { LogService } from './components/modals/LogService';
import { ServiceHistory } from './components/modals/ServiceHistory';
import { useVehiclesStore } from './stores/vehicles';
import { useMaintenanceStore } from './stores/maintenance';

type Page = 'dashboard' | 'vehicle-detail' | 'settings';

type ModalState =
  | { type: 'none' }
  | { type: 'add-edit-vehicle'; vehicleId?: number }
  | { type: 'update-odometer'; vehicleId: number }
  | { type: 'add-edit-item'; vehicleId: number; itemId?: number }
  | { type: 'log-service'; itemId: number; vehicleId: number }
  | { type: 'service-history'; itemId: number };

function AppInner() {
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });

  const { vehicles, fetchVehicles } = useVehiclesStore();
  const { fetchItems } = useMaintenanceStore();
  const { showError } = useToast();

  // ── Navigation ──────────────────────────────────────────────
  const navigateTo = (p: 'vehicle-detail' | 'settings', vehicleId?: number) => {
    setSelectedVehicleId(vehicleId ?? null);
    setPage(p);
  };

  const navigateToDashboard = () => {
    setPage('dashboard');
    setSelectedVehicleId(null);
  };

  // ── Modal openers ────────────────────────────────────────────
  const openAddVehicle = () => setModal({ type: 'add-edit-vehicle' });

  const openEditVehicle = (vehicleId: number) =>
    setModal({ type: 'add-edit-vehicle', vehicleId });

  const openUpdateOdometer = (vehicleId: number) =>
    setModal({ type: 'update-odometer', vehicleId });

  const openAddEditItem = (vehicleId: number, itemId?: number) =>
    setModal({ type: 'add-edit-item', vehicleId, itemId });

  const openLogService = (itemId: number, vehicleId: number) =>
    setModal({ type: 'log-service', itemId, vehicleId });

  const openServiceHistory = (itemId: number) =>
    setModal({ type: 'service-history', itemId });

  const closeModal = () => setModal({ type: 'none' });

  // ── Modal resolution helpers ─────────────────────────────────
  const afterVehicleSaved = async () => {
    closeModal();
    try {
      await fetchVehicles();
    } catch (err) {
      showError(String(err));
    }
  };

  const afterOdometerUpdated = async () => {
    closeModal();
    try {
      await fetchVehicles();
    } catch (err) {
      showError(String(err));
    }
  };

  const afterItemSaved = async (vehicleId: number) => {
    closeModal();
    try {
      await fetchItems(vehicleId);
    } catch (err) {
      showError(String(err));
    }
  };

  const afterServiceLogged = async (vehicleId: number) => {
    closeModal();
    try {
      await fetchItems(vehicleId);
    } catch (err) {
      showError(String(err));
    }
  };

  // ── Resolve objects needed by modals ────────────────────────
  const vehicleForModal = (id: number) => vehicles.find((v) => v.id === id);

  const itemForModal = (itemId: number) => {
    for (const [, items] of Object.entries(useMaintenanceStore.getState().itemsByVehicle)) {
      const found = items.find((i) => i.id === itemId);
      if (found) return found;
    }
    return null;
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>
      {/* Pages */}
      {page === 'dashboard' && (
        <Dashboard
          onNavigate={navigateTo}
          onAddVehicle={openAddVehicle}
        />
      )}

      {page === 'vehicle-detail' && selectedVehicleId !== null && (
        <VehicleDetail
          vehicleId={selectedVehicleId}
          onNavigate={(p) => {
            if (p === 'dashboard') navigateToDashboard();
            else { setPage(p); }
          }}
          onOpenAddEditVehicle={openEditVehicle}
          onOpenUpdateOdometer={openUpdateOdometer}
          onOpenAddEditItem={openAddEditItem}
          onOpenLogService={(itemId) => openLogService(itemId, selectedVehicleId)}
          onOpenServiceHistory={openServiceHistory}
        />
      )}

      {page === 'settings' && (
        <Settings onNavigate={(p) => { if (p === 'dashboard') navigateToDashboard(); }} />
      )}

      {/* Modals */}
      {modal.type === 'add-edit-vehicle' && (() => {
        const existingVehicle = modal.vehicleId !== undefined
          ? vehicleForModal(modal.vehicleId)
          : undefined;
        return (
          <AddEditVehicle
            mode={modal.vehicleId !== undefined ? 'edit' : 'add'}
            vehicle={existingVehicle}
            onSuccess={() => { afterVehicleSaved(); }}
            onClose={closeModal}
          />
        );
      })()}

      {modal.type === 'update-odometer' && (() => {
        const v = vehicleForModal(modal.vehicleId);
        if (!v) return null;
        return (
          <UpdateOdometer
            vehicle={v}
            onSuccess={() => { afterOdometerUpdated(); }}
            onClose={closeModal}
          />
        );
      })()}

      {modal.type === 'add-edit-item' && (() => {
        const item = modal.itemId !== undefined ? itemForModal(modal.itemId) : null;
        return (
          <AddEditMaintenanceItem
            mode={modal.itemId !== undefined ? 'edit' : 'add'}
            vehicleId={modal.vehicleId}
            item={item ?? undefined}
            onSuccess={() => { afterItemSaved(modal.vehicleId); }}
            onClose={closeModal}
          />
        );
      })()}

      {modal.type === 'log-service' && (() => {
        const item = itemForModal(modal.itemId);
        const v = vehicleForModal(modal.vehicleId);
        if (!item || !v) return null;
        return (
          <LogService
            item={item}
            vehicle={v}
            onSuccess={() => { afterServiceLogged(modal.vehicleId); }}
            onClose={closeModal}
          />
        );
      })()}

      {modal.type === 'service-history' && (() => {
        const item = itemForModal(modal.itemId);
        if (!item) return null;
        return (
          <ServiceHistory
            item={item}
            onClose={closeModal}
          />
        );
      })()}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

export default App;
