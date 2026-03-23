import { useState } from 'react';
import { ToastProvider } from './components/Toast';
import { Dashboard } from './pages/Dashboard';

type Page = 'dashboard' | 'vehicle-detail' | 'settings';

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);

  const navigateTo = (p: 'vehicle-detail' | 'settings', vehicleId?: number) => {
    setSelectedVehicleId(vehicleId ?? null);
    setPage(p);
  };

  return (
    <ToastProvider>
      <div>
        {page === 'dashboard' && (
          <Dashboard
            onNavigate={navigateTo}
          />
        )}
        {page === 'vehicle-detail' && <div>Vehicle Detail {selectedVehicleId}</div>}
        {page === 'settings' && <div>Settings (coming soon)</div>}
      </div>
    </ToastProvider>
  );
}

export default App;
