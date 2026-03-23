import { useState } from 'react';
import { commands, MaintenanceItem, Vehicle } from '../../lib/commands';
import { Spinner } from '../Spinner';

export interface LogServiceProps {
  item: MaintenanceItem;
  vehicle: Vehicle;
  onSuccess: () => void;
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

const advisoryStyle: React.CSSProperties = {
  color: '#92400e',
  background: '#fef3c7',
  border: '1px solid #fcd34d',
  borderRadius: '0.375rem',
  padding: '0.5rem 0.75rem',
  fontSize: '0.8rem',
  marginBottom: '0.75rem',
};

const warningStyle: React.CSSProperties = {
  color: '#92400e',
  background: '#fff7ed',
  border: '1px solid #fed7aa',
  borderRadius: '0.375rem',
  padding: '0.75rem',
  fontSize: '0.875rem',
  marginBottom: '0.75rem',
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

const confirmBtnStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: '#d97706',
  border: 'none',
  borderRadius: '0.375rem',
  cursor: 'pointer',
  fontSize: '0.85rem',
  color: '#fff',
  fontWeight: 500,
};

const declineBtnStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: '0.375rem',
  cursor: 'pointer',
  fontSize: '0.85rem',
  color: '#374151',
};

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function LogService({ item, vehicle, onSuccess, onClose }: LogServiceProps) {
  const [date, setDate] = useState(todayString());
  const [odometer, setOdometer] = useState(
    vehicle.current_odometer != null ? String(vehicle.current_odometer) : ''
  );
  const [cost, setCost] = useState('');
  const [shop, setShop] = useState('');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Soft warning state: when odometer is a large jump
  const [showLargeJumpWarning, setShowLargeJumpWarning] = useState(false);
  const [largeJumpKmAbove, setLargeJumpKmAbove] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  const parsedOdometer = odometer.trim() !== '' ? parseInt(odometer, 10) : null;
  const odometerBelowCurrent =
    parsedOdometer !== null &&
    !isNaN(parsedOdometer) &&
    parsedOdometer < vehicle.current_odometer;

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};

    if (!date.trim()) {
      errs.date = 'Date is required.';
    }

    if (odometer.trim() !== '') {
      const val = parseInt(odometer, 10);
      if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
        errs.odometer = 'Must be a non-negative integer.';
      }
    }

    if (cost.trim() !== '') {
      const val = parseFloat(cost);
      if (isNaN(val) || val < 0) {
        errs.cost = 'Must be a non-negative number.';
      }
    }

    return errs;
  }

  async function doSubmit(force: boolean) {
    setSubmitting(true);
    setErrors({});
    try {
      const parsedCost = cost.trim() !== '' ? parseFloat(cost) : null;
      const parsedOdom =
        odometer.trim() !== '' ? parseInt(odometer, 10) : null;

      const result = await commands.logService({
        maintenance_item_id: item.id,
        serviced_at: date,
        odometer_at_service: parsedOdom,
        cost: parsedCost,
        shop: shop.trim() || null,
        notes: notes.trim() || null,
        force,
      });

      if (result.type === 'Logged' || result.type === 'BelowCurrentAdvisory') {
        onSuccess();
        onClose();
      } else {
        // LargeJumpWarning came back even with force=true — treat as error
        setErrors({ submit: 'Unexpected large jump warning from server.' });
      }
    } catch (err) {
      setErrors({ submit: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const odom = odometer.trim() !== '' ? parseInt(odometer, 10) : null;

    // If no odometer entered OR below current: submit with force: false
    if (odom === null || odom < vehicle.current_odometer) {
      await doSubmit(false);
      return;
    }

    // Large jump check: > current + 10,000 and not yet confirmed
    const diff = odom - vehicle.current_odometer;
    if (diff > 10000 && !confirmed) {
      setLargeJumpKmAbove(diff);
      setShowLargeJumpWarning(true);
      return;
    }

    // Within range or already confirmed
    await doSubmit(confirmed);
  }

  function handleConfirmWarning() {
    setConfirmed(true);
    setShowLargeJumpWarning(false);
  }

  function handleDeclineWarning() {
    setShowLargeJumpWarning(false);
  }

  return (
    <div style={overlayStyle} data-testid="modal-overlay">
      <div style={boxStyle} data-testid="log-service-modal">
        <h2
          style={{
            margin: '0 0 0.25rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          Log Service
        </h2>
        <p
          style={{
            margin: '0 0 1.25rem',
            fontSize: '0.875rem',
            color: '#6b7280',
          }}
        >
          {item.name}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {/* Date */}
          <div style={fieldStyle}>
            <label htmlFor="service-date" style={labelStyle}>
              Date
            </label>
            <input
              id="service-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
              data-testid="input-date"
            />
            {errors.date && (
              <span style={errorStyle} data-testid="error-date">
                {errors.date}
              </span>
            )}
          </div>

          {/* Odometer */}
          <div style={fieldStyle}>
            <label htmlFor="service-odometer" style={labelStyle}>
              Odometer at Service (km, optional)
            </label>
            <input
              id="service-odometer"
              type="number"
              value={odometer}
              onChange={(e) => {
                setOdometer(e.target.value);
                // Reset warning/confirmed state when user changes odometer
                setShowLargeJumpWarning(false);
                setConfirmed(false);
              }}
              style={inputStyle}
              placeholder="e.g. 50000"
              min={0}
              data-testid="input-odometer"
            />
            {errors.odometer && (
              <span style={errorStyle} data-testid="error-odometer">
                {errors.odometer}
              </span>
            )}
          </div>

          {/* Below current advisory (non-blocking) */}
          {odometerBelowCurrent && (
            <div style={advisoryStyle} data-testid="advisory-below-current">
              This is below your current odometer — the reading won't be updated.
            </div>
          )}

          {/* Large jump soft warning */}
          {showLargeJumpWarning && (
            <div style={warningStyle} data-testid="warning-large-jump">
              <div style={{ marginBottom: '0.5rem' }}>
                This is {largeJumpKmAbove.toLocaleString()} km more than your current
                reading. Are you sure?
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  style={confirmBtnStyle}
                  onClick={handleConfirmWarning}
                  data-testid="btn-confirm-warning"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  style={declineBtnStyle}
                  onClick={handleDeclineWarning}
                  data-testid="btn-cancel-warning"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Cost */}
          <div style={fieldStyle}>
            <label htmlFor="service-cost" style={labelStyle}>
              Cost (optional)
            </label>
            <input
              id="service-cost"
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              style={inputStyle}
              placeholder="e.g. 59.99"
              min={0}
              step="0.01"
              data-testid="input-cost"
            />
            {errors.cost && (
              <span style={errorStyle} data-testid="error-cost">
                {errors.cost}
              </span>
            )}
          </div>

          {/* Shop */}
          <div style={fieldStyle}>
            <label htmlFor="service-shop" style={labelStyle}>
              Shop (optional)
            </label>
            <input
              id="service-shop"
              type="text"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Quick Lube"
              data-testid="input-shop"
            />
          </div>

          {/* Notes */}
          <div style={fieldStyle}>
            <label htmlFor="service-notes" style={labelStyle}>
              Notes (optional)
            </label>
            <textarea
              id="service-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical', minHeight: '4rem' }}
              placeholder="Any additional notes..."
              data-testid="input-notes"
            />
          </div>

          {errors.submit && (
            <div
              style={{ ...errorStyle, marginBottom: '0.75rem' }}
              data-testid="error-submit"
            >
              {errors.submit}
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
              disabled={submitting || showLargeJumpWarning}
              data-testid="btn-submit"
            >
              {submitting && <Spinner />}
              Log Service
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
