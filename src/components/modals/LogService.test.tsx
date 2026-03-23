import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LogService } from './LogService';
import { commands } from '../../lib/commands';
import type { MaintenanceItem, Vehicle } from '../../lib/commands';

vi.mock('../../lib/commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/commands')>();
  return {
    ...actual,
    commands: {
      ...actual.commands,
      logService: vi.fn(),
    },
  };
});

const mockVehicle: Vehicle = {
  id: 1,
  name: 'Honda Civic',
  year: 2020,
  type: 'Car',
  current_odometer: 45000,
  odometer_updated_at: '2024-01-01T00:00:00Z',
  archived: false,
  archived_at: null,
  created_at: '2020-01-01T00:00:00Z',
};

const mockItem: MaintenanceItem = {
  id: 1,
  vehicle_id: 1,
  name: 'Oil Change',
  interval_months: 6,
  interval_km: 5000,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  last_serviced_at: null,
  last_odometer_at_service: null,
  status: 'Ok',
};

function renderLogService(
  vehicleOverrides: Partial<Vehicle> = {},
  itemOverrides: Partial<MaintenanceItem> = {},
  handlers: { onSuccess?: () => void; onClose?: () => void } = {}
) {
  return render(
    <LogService
      item={{ ...mockItem, ...itemOverrides }}
      vehicle={{ ...mockVehicle, ...vehicleOverrides }}
      onSuccess={handlers.onSuccess ?? vi.fn()}
      onClose={handlers.onClose ?? vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LogService', () => {
  it('pre-fills odometer with vehicle.current_odometer', () => {
    renderLogService({ current_odometer: 45000 });
    expect(screen.getByTestId('input-odometer')).toHaveValue(45000);
  });

  it('shows below-current advisory when odometer is below current (non-blocking)', async () => {
    vi.mocked(commands.logService).mockResolvedValue({
      type: 'BelowCurrentAdvisory',
      record: {
        id: 1,
        maintenance_item_id: 1,
        serviced_at: '2024-01-01',
        odometer_at_service: 40000,
        cost: null,
        shop: null,
        notes: null,
      },
    });

    const onSuccess = vi.fn();
    const onClose = vi.fn();
    renderLogService({ current_odometer: 45000 }, {}, { onSuccess, onClose });

    // Enter odometer below current
    fireEvent.change(screen.getByTestId('input-odometer'), {
      target: { value: '40000' },
    });

    // Advisory should appear inline
    expect(screen.getByTestId('advisory-below-current')).toBeInTheDocument();
    expect(screen.getByTestId('advisory-below-current')).toHaveTextContent(
      "This is below your current odometer — the reading won't be updated."
    );

    // Submit button should NOT be blocked
    expect(screen.getByTestId('btn-submit')).not.toBeDisabled();

    // Submit should succeed
    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(commands.logService).toHaveBeenCalledWith(
        expect.objectContaining({ odometer_at_service: 40000, force: false })
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows large jump soft warning and blocks submit', () => {
    renderLogService({ current_odometer: 45000 });

    // Enter an odometer more than 10,000 km above current
    fireEvent.change(screen.getByTestId('input-odometer'), {
      target: { value: '60000' },
    });

    // Try to submit
    fireEvent.click(screen.getByTestId('btn-submit'));

    // Warning should appear
    expect(screen.getByTestId('warning-large-jump')).toBeInTheDocument();
    expect(screen.getByTestId('warning-large-jump')).toHaveTextContent(
      /15.?000 km more than your current reading/
    );

    // Submit should be blocked
    expect(screen.getByTestId('btn-submit')).toBeDisabled();

    // logService should NOT have been called yet
    expect(commands.logService).not.toHaveBeenCalled();
  });

  it('confirming large jump warning submits with force=true', async () => {
    vi.mocked(commands.logService).mockResolvedValue({
      type: 'Logged',
      record: {
        id: 2,
        maintenance_item_id: 1,
        serviced_at: '2024-01-01',
        odometer_at_service: 60000,
        cost: null,
        shop: null,
        notes: null,
      },
    });

    const onSuccess = vi.fn();
    const onClose = vi.fn();
    renderLogService({ current_odometer: 45000 }, {}, { onSuccess, onClose });

    fireEvent.change(screen.getByTestId('input-odometer'), {
      target: { value: '60000' },
    });

    // Trigger warning
    fireEvent.click(screen.getByTestId('btn-submit'));
    expect(screen.getByTestId('warning-large-jump')).toBeInTheDocument();

    // Confirm the warning
    fireEvent.click(screen.getByTestId('btn-confirm-warning'));

    // Warning should be gone; submit should be re-enabled
    expect(screen.queryByTestId('warning-large-jump')).not.toBeInTheDocument();

    // Now submit
    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(commands.logService).toHaveBeenCalledWith(
        expect.objectContaining({ odometer_at_service: 60000, force: true })
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('successful submit calls onSuccess and onClose', async () => {
    vi.mocked(commands.logService).mockResolvedValue({
      type: 'Logged',
      record: {
        id: 3,
        maintenance_item_id: 1,
        serviced_at: '2024-01-01',
        odometer_at_service: 45000,
        cost: null,
        shop: null,
        notes: null,
      },
    });

    const onSuccess = vi.fn();
    const onClose = vi.fn();
    renderLogService({}, {}, { onSuccess, onClose });

    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it('cancelling large jump warning hides warning and re-enables submit', () => {
    renderLogService({ current_odometer: 45000 });

    fireEvent.change(screen.getByTestId('input-odometer'), {
      target: { value: '60000' },
    });

    fireEvent.click(screen.getByTestId('btn-submit'));
    expect(screen.getByTestId('warning-large-jump')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('btn-cancel-warning'));
    expect(screen.queryByTestId('warning-large-jump')).not.toBeInTheDocument();
    expect(screen.getByTestId('btn-submit')).not.toBeDisabled();
  });

  it('does not show advisory when odometer equals current', () => {
    renderLogService({ current_odometer: 45000 });

    fireEvent.change(screen.getByTestId('input-odometer'), {
      target: { value: '45000' },
    });

    expect(screen.queryByTestId('advisory-below-current')).not.toBeInTheDocument();
  });

  it('does not show large jump warning when odometer is within 10,000 km', async () => {
    vi.mocked(commands.logService).mockResolvedValue({
      type: 'Logged',
      record: {
        id: 4,
        maintenance_item_id: 1,
        serviced_at: '2024-01-01',
        odometer_at_service: 55000,
        cost: null,
        shop: null,
        notes: null,
      },
    });

    renderLogService({ current_odometer: 45000 });

    fireEvent.change(screen.getByTestId('input-odometer'), {
      target: { value: '55000' },
    });

    fireEvent.click(screen.getByTestId('btn-submit'));

    // No warning — should submit directly
    expect(screen.queryByTestId('warning-large-jump')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(commands.logService).toHaveBeenCalledWith(
        expect.objectContaining({ odometer_at_service: 55000, force: false })
      );
    });
  });
});
