import { useState } from 'react';
import { commands, Vehicle } from '../../lib/commands';
import { Spinner } from '../Spinner';

export interface AddEditVehicleProps {
  mode: 'add' | 'edit';
  vehicle?: Vehicle;
  onSuccess: (vehicle: Vehicle) => void;
  onClose: () => void;
}

const VEHICLE_TYPES = ['car', 'motorcycle', 'truck', 'other'] as const;

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

export function AddEditVehicle({ mode, vehicle, onSuccess, onClose }: AddEditVehicleProps) {
  const currentYear = new Date().getFullYear();

  const [name, setName] = useState(vehicle?.name ?? '');
  const [year, setYear] = useState(vehicle?.year?.toString() ?? '');
  const [type, setType] = useState(vehicle?.type?.toLowerCase() ?? 'car');
  const [odometer, setOdometer] = useState('0');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};

    if (!name.trim()) {
      errs.name = 'Name is required.';
    }

    const yearNum = parseInt(year, 10);
    if (!year.trim() || isNaN(yearNum) || !/^\d{4}$/.test(year.trim())) {
      errs.year = 'Year must be a 4-digit number.';
    } else if (yearNum < 1900 || yearNum > currentYear + 1) {
      errs.year = `Year must be between 1900 and ${currentYear + 1}.`;
    }

    if (!type) {
      errs.type = 'Type is required.';
    }

    if (mode === 'add') {
      const odomNum = parseInt(odometer, 10);
      if (odometer.trim() === '' || isNaN(odomNum) || !Number.isInteger(odomNum)) {
        errs.odometer = 'Initial odometer is required.';
      } else if (odomNum < 0) {
        errs.odometer = 'Odometer must be 0 or greater.';
      } else if (odomNum > 10_000_000) {
        errs.odometer = 'Odometer must not exceed 10,000,000.';
      }
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
      let result: Vehicle;
      if (mode === 'add') {
        result = await commands.createVehicle({
          name: name.trim(),
          year: parseInt(year, 10),
          vehicle_type: type,
          initial_odometer: parseInt(odometer, 10),
        });
      } else {
        result = await commands.updateVehicle({
          id: vehicle!.id,
          name: name.trim(),
          year: parseInt(year, 10),
          vehicle_type: type,
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
      <div style={boxStyle} data-testid="add-edit-vehicle-modal">
        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          {mode === 'add' ? 'Add Vehicle' : 'Edit Vehicle'}
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <div style={fieldStyle}>
            <label htmlFor="vehicle-name" style={labelStyle}>Name</label>
            <input
              id="vehicle-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="e.g. My Car"
              data-testid="input-name"
            />
            {errors.name && <span style={errorStyle} data-testid="error-name">{errors.name}</span>}
          </div>

          {/* Year */}
          <div style={fieldStyle}>
            <label htmlFor="vehicle-year" style={labelStyle}>Year</label>
            <input
              id="vehicle-year"
              type="text"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={inputStyle}
              placeholder="e.g. 2020"
              data-testid="input-year"
            />
            {errors.year && <span style={errorStyle} data-testid="error-year">{errors.year}</span>}
          </div>

          {/* Type */}
          <div style={fieldStyle}>
            <label htmlFor="vehicle-type" style={labelStyle}>Type</label>
            <select
              id="vehicle-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={inputStyle}
              data-testid="input-type"
            >
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            {errors.type && <span style={errorStyle} data-testid="error-type">{errors.type}</span>}
          </div>

          {/* Odometer (add mode only) */}
          {mode === 'add' && (
            <div style={fieldStyle}>
              <label htmlFor="vehicle-odometer" style={labelStyle}>Initial Odometer (km)</label>
              <input
                id="vehicle-odometer"
                type="number"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                style={inputStyle}
                min={0}
                max={10000000}
                data-testid="input-odometer"
              />
              {errors.odometer && (
                <span style={errorStyle} data-testid="error-odometer">{errors.odometer}</span>
              )}
            </div>
          )}

          {errors.submit && (
            <div style={{ ...errorStyle, marginBottom: '0.75rem' }} data-testid="error-submit">
              {errors.submit}
            </div>
          )}

          <div style={buttonRowStyle}>
            <button type="button" style={cancelBtnStyle} onClick={onClose} data-testid="btn-cancel">
              Cancel
            </button>
            <button
              type="submit"
              style={submitBtnStyle}
              disabled={submitting}
              data-testid="btn-submit"
            >
              {submitting && <Spinner />}
              {mode === 'add' ? 'Add Vehicle' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
