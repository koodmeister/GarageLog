import { useState } from 'react';
import { commands, Vehicle } from '../../lib/commands';

export interface UpdateOdometerProps {
  vehicle: Vehicle;
  onSuccess: (vehicle: Vehicle) => void;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const boxStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '0.75rem',
  padding: '1.5rem',
  width: '100%',
  maxWidth: '480px',
  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  marginBottom: '1rem',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 500,
  color: '#374151',
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '0.95rem',
  color: '#111827',
  outline: 'none',
};

const errorStyle: React.CSSProperties = {
  color: '#dc2626',
  fontSize: '0.8rem',
};

const warningStyle: React.CSSProperties = {
  color: '#92400e',
  background: '#fef3c7',
  border: '1px solid #fcd34d',
  borderRadius: '0.375rem',
  padding: '0.75rem',
  fontSize: '0.875rem',
  marginBottom: '1rem',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.75rem',
  marginTop: '1.25rem',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: '0.375rem',
  cursor: 'pointer',
  fontSize: '0.9rem',
  color: '#374151',
};

const submitBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#2563eb',
  border: 'none',
  borderRadius: '0.375rem',
  cursor: 'pointer',
  fontSize: '0.9rem',
  color: '#fff',
  fontWeight: 500,
};

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function UpdateOdometer({ vehicle, onSuccess, onClose }: UpdateOdometerProps) {
  const [reading, setReading] = useState(vehicle.current_odometer.toString());
  const [date, setDate] = useState(todayString());
  const [error, setError] = useState('');
  const [warningKm, setWarningKm] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const LARGE_JUMP = 10_000;

  async function doSubmit(force: boolean) {
    setSubmitting(true);
    setError('');
    try {
      const result = await commands.updateOdometer({
        vehicle_id: vehicle.id,
        new_reading: parseInt(reading, 10),
        date,
        force,
      });
      if (result.type === 'Updated') {
        onSuccess(result.vehicle);
        onClose();
      } else {
        // LargeJumpWarning should not happen when force=true
        setError('Unexpected response from server. Please try again.');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const readingNum = parseInt(reading, 10);
    if (reading.trim() === '' || isNaN(readingNum)) {
      setError('Please enter a valid odometer reading.');
      return;
    }

    if (readingNum < vehicle.current_odometer) {
      setError('Odometer cannot go backwards.');
      setWarningKm(null);
      setConfirmed(false);
      return;
    }

    const diff = readingNum - vehicle.current_odometer;
    if (diff > LARGE_JUMP && !confirmed) {
      setWarningKm(diff);
      setError('');
      return;
    }

    await doSubmit(confirmed || diff > LARGE_JUMP);
  }

  function handleConfirm() {
    setConfirmed(true);
    setWarningKm(null);
    doSubmit(true);
  }

  function handleCancelWarning() {
    setWarningKm(null);
    setConfirmed(false);
  }

  return (
    <div style={overlayStyle} data-testid="modal-overlay">
      <div style={boxStyle} data-testid="update-odometer-modal">
        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          Update Odometer
        </h2>
        <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          Current reading: <strong>{vehicle.current_odometer.toLocaleString()} km</strong>
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {/* New reading */}
          <div style={fieldStyle}>
            <label htmlFor="new-reading" style={labelStyle}>New Reading (km)</label>
            <input
              id="new-reading"
              type="number"
              value={reading}
              onChange={(e) => {
                setReading(e.target.value);
                setError('');
                setWarningKm(null);
                setConfirmed(false);
              }}
              style={inputStyle}
              data-testid="input-reading"
            />
            {error && (
              <span style={errorStyle} data-testid="error-reading">{error}</span>
            )}
          </div>

          {/* Date */}
          <div style={fieldStyle}>
            <label htmlFor="odometer-date" style={labelStyle}>Date</label>
            <input
              id="odometer-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
              data-testid="input-date"
            />
          </div>

          {/* Soft warning */}
          {warningKm !== null && (
            <div style={warningStyle} data-testid="large-jump-warning">
              <p style={{ margin: '0 0 0.5rem' }}>
                This is {warningKm.toLocaleString()} km more than your current reading. Are you sure?
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  style={{ ...submitBtnStyle, background: '#d97706' }}
                  onClick={handleConfirm}
                  data-testid="btn-confirm-warning"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  style={cancelBtnStyle}
                  onClick={handleCancelWarning}
                  data-testid="btn-cancel-warning"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={buttonRowStyle}>
            <button
              type="button"
              style={cancelBtnStyle}
              onClick={onClose}
              data-testid="btn-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              style={submitBtnStyle}
              disabled={submitting || warningKm !== null}
              data-testid="btn-submit"
            >
              Update
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
