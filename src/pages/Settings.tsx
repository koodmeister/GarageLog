import { useState, useEffect } from 'react';
import { commands, ImportSummary, VehicleResolution } from '../lib/commands';
import { useToast } from '../components/Toast';

export interface SettingsProps {
  onNavigate: (page: 'dashboard') => void;
}

type ImportStep =
  | { type: 'idle' }
  | { type: 'summary'; summary: ImportSummary; resolutions: VehicleResolution[] }
  | { type: 'complete' };

const STORAGE_KEY = 'notifications_enabled';

function getNotificationsEnabled(): boolean {
  const val = localStorage.getItem(STORAGE_KEY);
  if (val === null) return true; // default enabled
  return val === 'true';
}

export function Settings({ onNavigate }: SettingsProps) {
  const { showError } = useToast();
  const [importStep, setImportStep] = useState<ImportStep>({ type: 'idle' });
  const [notificationsEnabled, setNotificationsEnabled] = useState(getNotificationsEnabled);

  // Keep localStorage in sync
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(notificationsEnabled));
  }, [notificationsEnabled]);

  const handleExportJson = async () => {
    try {
      await commands.exportJson();
    } catch (err) {
      showError(String(err));
    }
  };

  const handleExportCsv = async () => {
    try {
      await commands.exportCsv();
    } catch (err) {
      showError(String(err));
    }
  };

  const handleImportJson = async () => {
    try {
      const summary = await commands.importJson();
      const resolutions: VehicleResolution[] = summary.conflicts.map((c, i) => ({
        imported_vehicle_index: i,
        action: 'merge',
        target_vehicle_id: c.existing_vehicle_id,
      }));
      setImportStep({ type: 'summary', summary, resolutions });
    } catch (err) {
      showError(String(err));
    }
  };

  const handleResolutionChange = (index: number, action: 'merge' | 'skip') => {
    if (importStep.type !== 'summary') return;
    const updated = importStep.resolutions.map((r) =>
      r.imported_vehicle_index === index ? { ...r, action } : r
    );
    setImportStep({ ...importStep, resolutions: updated });
  };

  const handleConfirmImport = async () => {
    if (importStep.type !== 'summary') return;
    try {
      await commands.confirmImport({
        import_data: importStep.summary.import_data,
        resolutions: importStep.resolutions,
      });
      setImportStep({ type: 'complete' });
    } catch (err) {
      showError(String(err));
    }
  };

  const handleResetImport = () => {
    setImportStep({ type: 'idle' });
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '2rem',
    padding: '1.25rem 1.5rem',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.75rem',
  };

  const headingStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#111827',
    marginBottom: '1rem',
    marginTop: 0,
  };

  const btnStyle = (variant: 'primary' | 'secondary' = 'secondary'): React.CSSProperties => ({
    padding: '0.5rem 1.125rem',
    borderRadius: '0.5rem',
    border: variant === 'primary' ? 'none' : '1px solid #d1d5db',
    background: variant === 'primary' ? '#2563eb' : '#fff',
    color: variant === 'primary' ? '#fff' : '#374151',
    fontWeight: 500,
    fontSize: '0.875rem',
    cursor: 'pointer',
  });

  return (
    <div style={{ padding: '1.5rem', maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => onNavigate('dashboard')}
          style={{ ...btnStyle('secondary'), padding: '0.375rem 0.75rem' }}
          aria-label="Back to dashboard"
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
          Settings
        </h1>
      </div>

      {/* Export section */}
      <section style={sectionStyle} aria-labelledby="export-heading">
        <h2 id="export-heading" style={headingStyle}>Export</h2>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button style={btnStyle('primary')} onClick={handleExportJson}>
            Export JSON
          </button>
          <button style={btnStyle('secondary')} onClick={handleExportCsv}>
            Export CSV
          </button>
        </div>
      </section>

      {/* Import section */}
      <section style={sectionStyle} aria-labelledby="import-heading">
        <h2 id="import-heading" style={headingStyle}>Import</h2>

        {importStep.type === 'idle' && (
          <button style={btnStyle('secondary')} onClick={handleImportJson}>
            Import JSON
          </button>
        )}

        {importStep.type === 'summary' && (
          <div>
            <p style={{ margin: '0 0 1rem', color: '#374151', fontSize: '0.9rem' }} data-testid="import-summary">
              {importStep.summary.vehicle_count} vehicles,{' '}
              {importStep.summary.maintenance_item_count} maintenance items,{' '}
              {importStep.summary.service_record_count} service records found
            </p>

            {importStep.summary.conflicts.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <table
                  data-testid="conflict-table"
                  style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
                >
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: '#6b7280', fontWeight: 500 }}>
                        Vehicle
                      </th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: '#6b7280', fontWeight: 500 }}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {importStep.summary.conflicts.map((conflict, i) => {
                      const resolution = importStep.resolutions.find(
                        (r) => r.imported_vehicle_index === i
                      );
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#111827' }}>
                            {conflict.imported_vehicle_name} ({conflict.imported_vehicle_year})
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                data-testid={`merge-btn-${i}`}
                                style={{
                                  ...btnStyle(resolution?.action === 'merge' ? 'primary' : 'secondary'),
                                  padding: '0.25rem 0.625rem',
                                  fontSize: '0.8rem',
                                }}
                                onClick={() => handleResolutionChange(i, 'merge')}
                              >
                                Merge
                              </button>
                              <button
                                data-testid={`skip-btn-${i}`}
                                style={{
                                  ...btnStyle(resolution?.action === 'skip' ? 'primary' : 'secondary'),
                                  padding: '0.25rem 0.625rem',
                                  fontSize: '0.8rem',
                                }}
                                onClick={() => handleResolutionChange(i, 'skip')}
                              >
                                Skip
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button style={btnStyle('primary')} onClick={handleConfirmImport}>
                Confirm Import
              </button>
              <button style={btnStyle('secondary')} onClick={handleResetImport}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {importStep.type === 'complete' && (
          <div>
            <p
              data-testid="import-complete"
              style={{ margin: '0 0 0.75rem', color: '#16a34a', fontWeight: 500 }}
            >
              Import complete
            </p>
            <button style={btnStyle('secondary')} onClick={handleResetImport}>
              Done
            </button>
          </div>
        )}
      </section>

      {/* Notifications section */}
      <section style={sectionStyle} aria-labelledby="notifications-heading">
        <h2 id="notifications-heading" style={headingStyle}>Notifications</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            data-testid="notifications-toggle"
            checked={notificationsEnabled}
            onChange={(e) => setNotificationsEnabled(e.target.checked)}
            style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.9rem', color: '#374151' }}>
            Enable maintenance notifications
          </span>
        </label>
      </section>
    </div>
  );
}
