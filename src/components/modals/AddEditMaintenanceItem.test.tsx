import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddEditMaintenanceItem } from './AddEditMaintenanceItem';
import { commands } from '../../lib/commands';
import type { MaintenanceItem } from '../../lib/commands';

vi.mock('../../lib/commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/commands')>();
  return {
    ...actual,
    commands: {
      ...actual.commands,
      createMaintenanceItem: vi.fn(),
      updateMaintenanceItem: vi.fn(),
    },
  };
});

function makeItem(overrides: Partial<MaintenanceItem> = {}): MaintenanceItem {
  return {
    id: 1,
    vehicle_id: 1,
    name: 'Oil Change',
    interval_months: 6,
    interval_km: 5000,
    notes: 'Check oil level',
    created_at: '2024-01-01T00:00:00Z',
    last_serviced_at: null,
    last_odometer_at_service: null,
    status: 'Ok',
    ...overrides,
  };
}

const mockItem: MaintenanceItem = makeItem();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AddEditMaintenanceItem', () => {
  it('add mode: submits valid data and calls createMaintenanceItem', async () => {
    const createdItem = makeItem({ id: 2, name: 'Tyre Rotation', interval_months: 12, interval_km: null, notes: null });
    vi.mocked(commands.createMaintenanceItem).mockResolvedValue(createdItem);

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AddEditMaintenanceItem
        mode="add"
        vehicleId={1}
        onSuccess={onSuccess}
        onClose={onClose}
      />
    );

    fireEvent.change(screen.getByTestId('input-name'), {
      target: { value: 'Tyre Rotation' },
    });
    fireEvent.change(screen.getByTestId('input-interval-months'), {
      target: { value: '12' },
    });
    // Leave interval-km empty

    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(commands.createMaintenanceItem).toHaveBeenCalledWith({
        vehicle_id: 1,
        name: 'Tyre Rotation',
        interval_months: 12,
        interval_km: null,
        notes: null,
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(createdItem);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error when both interval fields are empty on submit', async () => {
    render(
      <AddEditMaintenanceItem
        mode="add"
        vehicleId={1}
        onSuccess={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('input-name'), {
      target: { value: 'Brake Check' },
    });
    // Leave both intervals empty

    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('error-intervals')).toBeInTheDocument();
    });

    expect(screen.getByTestId('error-intervals')).toHaveTextContent(
      'At least one interval (months or km) is required.'
    );
    expect(commands.createMaintenanceItem).not.toHaveBeenCalled();
  });

  it('edit mode: pre-fills existing values and calls updateMaintenanceItem', async () => {
    const updatedItem = makeItem({ name: 'Oil Change Updated', interval_months: 3, interval_km: 3000 });
    vi.mocked(commands.updateMaintenanceItem).mockResolvedValue(updatedItem);

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AddEditMaintenanceItem
        mode="edit"
        vehicleId={1}
        item={mockItem}
        onSuccess={onSuccess}
        onClose={onClose}
      />
    );

    // Check pre-filled values
    expect(screen.getByTestId('input-name')).toHaveValue('Oil Change');
    expect(screen.getByTestId('input-interval-months')).toHaveValue(6);
    expect(screen.getByTestId('input-interval-km')).toHaveValue(5000);
    expect(screen.getByTestId('input-notes')).toHaveValue('Check oil level');

    // Update name
    fireEvent.change(screen.getByTestId('input-name'), {
      target: { value: 'Oil Change Updated' },
    });
    fireEvent.change(screen.getByTestId('input-interval-months'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByTestId('input-interval-km'), {
      target: { value: '3000' },
    });

    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(commands.updateMaintenanceItem).toHaveBeenCalledWith({
        id: 1,
        name: 'Oil Change Updated',
        interval_months: 3,
        interval_km: 3000,
        notes: 'Check oil level',
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(updatedItem);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error when name is empty', async () => {
    render(
      <AddEditMaintenanceItem
        mode="add"
        vehicleId={1}
        onSuccess={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Set an interval so only name error fires
    fireEvent.change(screen.getByTestId('input-interval-months'), {
      target: { value: '6' },
    });

    fireEvent.click(screen.getByTestId('btn-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('error-name')).toBeInTheDocument();
    });
    expect(screen.getByTestId('error-name')).toHaveTextContent('Name is required.');
    expect(commands.createMaintenanceItem).not.toHaveBeenCalled();
  });

  it('calls onClose when Cancel button clicked', () => {
    const onClose = vi.fn();

    render(
      <AddEditMaintenanceItem
        mode="add"
        vehicleId={1}
        onSuccess={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByTestId('btn-cancel'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders correct title for add mode', () => {
    render(
      <AddEditMaintenanceItem
        mode="add"
        vehicleId={1}
        onSuccess={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Add Maintenance Item')).toBeInTheDocument();
  });

  it('renders correct title for edit mode', () => {
    render(
      <AddEditMaintenanceItem
        mode="edit"
        vehicleId={1}
        item={mockItem}
        onSuccess={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Edit Maintenance Item')).toBeInTheDocument();
  });
});
