import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { UpdateOdometer } from './UpdateOdometer';
import type { Vehicle } from '../../lib/commands';

const mockInvoke = vi.mocked(invoke);

const mockVehicle: Vehicle = {
  id: 1,
  name: 'My Car',
  year: 2020,
  type: 'car',
  current_odometer: 50000,
  odometer_updated_at: '2024-01-01T00:00:00Z',
  archived: false,
  archived_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UpdateOdometer', () => {
  it('shows current odometer pre-filled in the reading input', () => {
    render(
      <UpdateOdometer vehicle={mockVehicle} onSuccess={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.getByTestId('input-reading')).toHaveValue(mockVehicle.current_odometer);
  });

  it('shows inline error when new reading is less than current odometer', async () => {
    render(
      <UpdateOdometer vehicle={mockVehicle} onSuccess={vi.fn()} onClose={vi.fn()} />
    );

    fireEvent.change(screen.getByTestId('input-reading'), {
      target: { value: '40000' },
    });
    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('error-reading')).toHaveTextContent(
        'Odometer cannot go backwards.'
      );
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shows soft warning message when jump exceeds 10,000 km', async () => {
    render(
      <UpdateOdometer vehicle={mockVehicle} onSuccess={vi.fn()} onClose={vi.fn()} />
    );

    // 50000 + 15000 = 65000, which is 15000 above current
    fireEvent.change(screen.getByTestId('input-reading'), {
      target: { value: '65000' },
    });
    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('large-jump-warning')).toBeInTheDocument();
    });

    expect(screen.getByTestId('large-jump-warning')).toHaveTextContent(
      /15.?000 km more than your current reading/
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('valid submit calls updateOdometer with force=false', async () => {
    const updatedVehicle: Vehicle = { ...mockVehicle, current_odometer: 52000 };
    mockInvoke.mockResolvedValueOnce({ type: 'Updated', vehicle: updatedVehicle });

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <UpdateOdometer vehicle={mockVehicle} onSuccess={onSuccess} onClose={onClose} />
    );

    // Set a reading within range (50000 + 2000 = 52000, diff = 2000 <= 10000)
    fireEvent.change(screen.getByTestId('input-reading'), {
      target: { value: '52000' },
    });
    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('update_odometer', {
        vehicle_id: mockVehicle.id,
        new_reading: 52000,
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        force: false,
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(updatedVehicle);
    expect(onClose).toHaveBeenCalled();
  });

  it('confirming soft warning calls updateOdometer with force=true', async () => {
    const updatedVehicle: Vehicle = { ...mockVehicle, current_odometer: 65000 };
    mockInvoke.mockResolvedValueOnce({ type: 'Updated', vehicle: updatedVehicle });

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <UpdateOdometer vehicle={mockVehicle} onSuccess={onSuccess} onClose={onClose} />
    );

    // Large jump: 50000 + 15000 = 65000
    fireEvent.change(screen.getByTestId('input-reading'), {
      target: { value: '65000' },
    });
    fireEvent.click(screen.getByTestId('btn-submit'));

    // Wait for warning to appear
    await waitFor(() => {
      expect(screen.getByTestId('large-jump-warning')).toBeInTheDocument();
    });

    // Click Confirm in the warning
    fireEvent.click(screen.getByTestId('btn-confirm-warning'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('update_odometer', {
        vehicle_id: mockVehicle.id,
        new_reading: 65000,
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        force: true,
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(updatedVehicle);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(
      <UpdateOdometer vehicle={mockVehicle} onSuccess={vi.fn()} onClose={onClose} />
    );

    fireEvent.click(screen.getByTestId('btn-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('dismisses warning when Cancel in warning is clicked', async () => {
    render(
      <UpdateOdometer vehicle={mockVehicle} onSuccess={vi.fn()} onClose={vi.fn()} />
    );

    fireEvent.change(screen.getByTestId('input-reading'), {
      target: { value: '65000' },
    });
    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('large-jump-warning')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-cancel-warning'));

    expect(screen.queryByTestId('large-jump-warning')).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
