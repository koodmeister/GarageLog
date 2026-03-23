import { useState } from 'react';
import { commands, MaintenanceItem } from '../../lib/commands';
import { Spinner } from '../Spinner';

export interface AddEditMaintenanceItemProps {
  mode: 'add' | 'edit';
  vehicleId: number;
  item?: MaintenanceItem;
  onSuccess: (item: MaintenanceItem) => void;
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

export function AddEditMaintenanceItem({
  mode,
  vehicleId,
  item,
  onSuccess,
  onClose,
}: AddEditMaintenanceItemProps) {
  const [name, setName] = useState(item?.name ?? '');
  const [intervalMonths, setIntervalMonths] = useState(
    item?.interval_months != null ? String(item.interval_months) : ''
  );
  const [intervalKm, setIntervalKm] = useState(
    item?.interval_km != null ? String(item.interval_km) : ''
  );
  const [notes, setNotes] = useState(item?.notes ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};

    if (!name.trim()) {
      errs.name = 'Name is required.';
    }

    const monthsEmpty = intervalMonths.trim() === '';
    const kmEmpty = intervalKm.trim() === '';

    if (!monthsEmpty) {
      const val = parseInt(intervalMonths, 10);
      if (isNaN(val) || val < 1 || !Number.isInteger(val)) {
        errs.interval_months = 'Must be an integer \u2265 1.';
      }
    }

    if (!kmEmpty) {
      const val = parseInt(intervalKm, 10);
      if (isNaN(val) || val < 1 || !Number.isInteger(val)) {
        errs.interval_km = 'Must be an integer \u2265 1.';
      }
    }

    if (monthsEmpty && kmEmpty) {
      errs.intervals = 'At least one interval (months or km) is required.';
    }

    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const parsedMonths =
        intervalMonths.trim() !== '' ? parseInt(intervalMonths, 10) : null;
      const parsedKm =
        intervalKm.trim() !== '' ? parseInt(intervalKm, 10) : null;

      let result: MaintenanceItem;
      if (mode === 'add') {
        result = await commands.createMaintenanceItem({
          vehicle_id: vehicleId,
          name: name.trim(),
          interval_months: parsedMonths,
          interval_km: parsedKm,
          notes: notes.trim() || null,
        });
      } else {
        result = await commands.updateMaintenanceItem({
          id: item!.id,
          name: name.trim(),
          interval_months: parsedMonths,
          interval_km: parsedKm,
          notes: notes.trim() || null,
        });
      }
      onSuccess(result);
      onClose();
    } catch (err) {
      setErrors({ submit: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={overlayStyle} data-testid="modal-overlay">
      <div style={boxStyle} data-testid="add-edit-maintenance-item-modal">
        <h2
          style={{
            margin: '0 0 1.25rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          {mode === 'add' ? 'Add Maintenance Item' : 'Edit Maintenance Item'}
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <div style={fieldStyle}>
            <label htmlFor="item-name" style={labelStyle}>
              Name
            </label>
            <input
              id="item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Oil Change"
              data-testid="input-name"
            />
            {errors.name && (
              <span style={errorStyle} data-testid="error-name">
                {errors.name}
              </span>
            )}
          </div>

          {/* Interval Months */}
          <div style={fieldStyle}>
            <label htmlFor="item-interval-months" style={labelStyle}>
              Interval (months)
            </label>
            <input
              id="item-interval-months"
              type="number"
              value={intervalMonths}
              onChange={(e) => setIntervalMonths(e.target.value)}
              style={inputStyle}
              placeholder="e.g. 6"
              min={1}
              data-testid="input-interval-months"
            />
            {errors.interval_months && (
              <span style={errorStyle} data-testid="error-interval-months">
                {errors.interval_months}
              </span>
            )}
          </div>

          {/* Interval km */}
          <div style={fieldStyle}>
            <label htmlFor="item-interval-km" style={labelStyle}>
              Interval (km)
            </label>
            <input
              id="item-interval-km"
              type="number"
              value={intervalKm}
              onChange={(e) => setIntervalKm(e.target.value)}
              style={inputStyle}
              placeholder="e.g. 5000"
              min={1}
              data-testid="input-interval-km"
            />
            {errors.interval_km && (
              <span style={errorStyle} data-testid="error-interval-km">
                {errors.interval_km}
              </span>
            )}
          </div>

          {/* Interval error (both empty) */}
          {errors.intervals && (
            <div
              style={{ ...errorStyle, marginBottom: '0.75rem' }}
              data-testid="error-intervals"
            >
              {errors.intervals}
            </div>
          )}

          {/* Notes */}
          <div style={fieldStyle}>
            <label htmlFor="item-notes" style={labelStyle}>
              Notes (optional)
            </label>
            <textarea
              id="item-notes"
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
              disabled={submitting}
              data-testid="btn-submit"
            >
              {submitting && <Spinner />}
              {mode === 'add' ? 'Add Item' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
