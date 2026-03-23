import { useState } from 'react';
import { ToastProvider } from './components/Toast';

type Page = 'dashboard' | 'vehicle-detail' | 'settings';

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);

  const navigateTo = (p: Page, vehicleId?: number) => {
    setSelectedVehicleId(vehicleId ?? null);
    setPage(p);
  };

  // navigateTo will be used by child pages in Tasks 11-15
  void navigateTo;

  return (
    <ToastProvider>
      <div>
        {page === 'dashboard' && <div>Dashboard (coming soon)</div>}
        {page === 'vehicle-detail' && <div>Vehicle Detail {selectedVehicleId}</div>}
        {page === 'settings' && <div>Settings (coming soon)</div>}
      </div>
    </ToastProvider>
  );
}

export default App;
