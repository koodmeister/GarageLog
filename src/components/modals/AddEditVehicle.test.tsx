import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { AddEditVehicle } from './AddEditVehicle';
import type { Vehicle } from '../../lib/commands';

const mockInvoke = vi.mocked(invoke);

const mockVehicle: Vehicle = {
  id: 1,
  name: 'My Car',
  year: 2020,
  type: 'car',
  current_odometer: 45000,
  odometer_updated_at: '2024-01-01T00:00:00Z',
  archived: false,
  archived_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AddEditVehicle – add mode', () => {
  it('submits with valid data and calls createVehicle', async () => {
    const createdVehicle: Vehicle = { ...mockVehicle, id: 99 };
    mockInvoke.mockResolvedValueOnce(createdVehicle);

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AddEditVehicle mode="add" onSuccess={onSuccess} onClose={onClose} />
    );

    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Test Car' } });
    fireEvent.change(screen.getByTestId('input-year'), { target: { value: '2021' } });
    fireEvent.change(screen.getByTestId('input-type'), { target: { value: 'truck' } });
    fireEvent.change(screen.getByTestId('input-odometer'), { target: { value: '15000' } });

    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('create_vehicle', {
        name: 'Test Car',
        year: 2021,
        vehicle_type: 'truck',
        initial_odometer: 15000,
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(createdVehicle);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows inline errors for empty name, invalid year, and negative odometer', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AddEditVehicle mode="add" onSuccess={onSuccess} onClose={onClose} />
    );

    // Clear name field
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: '' } });
    // Set invalid year
    fireEvent.change(screen.getByTestId('input-year'), { target: { value: 'abc' } });
    // Set negative odometer
    fireEvent.change(screen.getByTestId('input-odometer'), { target: { value: '-5' } });

    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('error-name')).toBeInTheDocument();
      expect(screen.getByTestId('error-year')).toBeInTheDocument();
      expect(screen.getByTestId('error-odometer')).toBeInTheDocument();
    });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows year error when year is out of range', async () => {
    render(
      <AddEditVehicle mode="add" onSuccess={vi.fn()} onClose={vi.fn()} />
    );

    fireEvent.change(screen.getByTestId('input-year'), { target: { value: '1800' } });
    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('error-year')).toBeInTheDocument();
    });
  });

  it('shows odometer error when odometer exceeds maximum', async () => {
    render(
      <AddEditVehicle mode="add" onSuccess={vi.fn()} onClose={vi.fn()} />
    );

    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Car' } });
    fireEvent.change(screen.getByTestId('input-year'), { target: { value: '2020' } });
    fireEvent.change(screen.getByTestId('input-odometer'), { target: { value: '99999999' } });

    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('error-odometer')).toBeInTheDocument();
    });
  });
});

describe('AddEditVehicle – edit mode', () => {
  it('does not show odometer field', () => {
    render(
      <AddEditVehicle mode="edit" vehicle={mockVehicle} onSuccess={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.queryByTestId('input-odometer')).not.toBeInTheDocument();
  });

  it('submits and calls updateVehicle with vehicle id', async () => {
    const updatedVehicle: Vehicle = { ...mockVehicle, name: 'Updated Car' };
    mockInvoke.mockResolvedValueOnce(updatedVehicle);

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AddEditVehicle mode="edit" vehicle={mockVehicle} onSuccess={onSuccess} onClose={onClose} />
    );

    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Updated Car' } });
    fireEvent.change(screen.getByTestId('input-year'), { target: { value: '2021' } });
    fireEvent.change(screen.getByTestId('input-type'), { target: { value: 'motorcycle' } });

    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('update_vehicle', {
        id: mockVehicle.id,
        name: 'Updated Car',
        year: 2021,
        vehicle_type: 'motorcycle',
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(updatedVehicle);
    expect(onClose).toHaveBeenCalled();
  });

  it('pre-fills fields with existing vehicle data', () => {
    render(
      <AddEditVehicle mode="edit" vehicle={mockVehicle} onSuccess={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.getByTestId('input-name')).toHaveValue(mockVehicle.name);
    expect(screen.getByTestId('input-year')).toHaveValue(mockVehicle.year.toString());
    expect(screen.getByTestId('input-type')).toHaveValue(mockVehicle.type.toLowerCase());
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();

    render(
      <AddEditVehicle mode="edit" vehicle={mockVehicle} onSuccess={vi.fn()} onClose={onClose} />
    );

    fireEvent.click(screen.getByTestId('btn-cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
