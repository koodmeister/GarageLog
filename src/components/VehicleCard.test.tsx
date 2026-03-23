import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VehicleCard, AddVehicleCard } from './VehicleCard';
import type { Vehicle } from '../lib/commands';

const mockVehicle: Vehicle = {
  id: 1,
  name: 'My Car',
  year: 2020,
  type: 'Car',
  current_odometer: 45000,
  odometer_updated_at: '2024-01-01T00:00:00Z',
  archived: false,
  archived_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

const archivedVehicle: Vehicle = {
  ...mockVehicle,
  id: 2,
  archived: true,
  archived_at: '2024-06-01T00:00:00Z',
};

describe('VehicleCard', () => {
  it('renders vehicle name, year, and odometer', () => {
    render(
      <VehicleCard
        vehicle={mockVehicle}
        worstStatus={null}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('My Car')).toBeInTheDocument();
    expect(screen.getByText('2020')).toBeInTheDocument();
    expect(screen.getByText(/45[\s,.]?000/)).toBeInTheDocument();
  });

  it('shows Overdue badge in red', () => {
    render(
      <VehicleCard vehicle={mockVehicle} worstStatus="Overdue" onClick={vi.fn()} />
    );
    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('Overdue');
    expect(badge).toHaveStyle({ backgroundColor: '#dc2626' });
  });

  it('shows Due Soon badge for DueSoon', () => {
    render(
      <VehicleCard vehicle={mockVehicle} worstStatus="DueSoon" onClick={vi.fn()} />
    );
    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('Due Soon');
    expect(badge).toHaveStyle({ backgroundColor: '#d97706' });
  });

  it('shows All Good badge for Ok', () => {
    render(
      <VehicleCard vehicle={mockVehicle} worstStatus="Ok" onClick={vi.fn()} />
    );
    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('All Good');
    expect(badge).toHaveStyle({ backgroundColor: '#16a34a' });
  });

  it('shows gray badge for Unknown', () => {
    render(
      <VehicleCard vehicle={mockVehicle} worstStatus="Unknown" onClick={vi.fn()} />
    );
    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('Unknown');
    expect(badge).toHaveStyle({ backgroundColor: '#6b7280' });
  });

  it('renders no status badge when worstStatus is null', () => {
    render(
      <VehicleCard vehicle={mockVehicle} worstStatus={null} onClick={vi.fn()} />
    );
    expect(screen.queryByTestId('status-badge')).not.toBeInTheDocument();
  });

  it('calls onClick when card is clicked', () => {
    const handleClick = vi.fn();
    render(<VehicleCard vehicle={mockVehicle} worstStatus={null} onClick={handleClick} />);
    fireEvent.click(screen.getByTestId('vehicle-card'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows Edit and Archive in overflow menu for active vehicle', () => {
    render(
      <VehicleCard
        vehicle={mockVehicle}
        worstStatus={null}
        onClick={vi.fn()}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('More options'));
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.queryByText('Restore')).not.toBeInTheDocument();
  });

  it('shows Restore in overflow menu for archived vehicle', () => {
    render(
      <VehicleCard
        vehicle={archivedVehicle}
        worstStatus={null}
        onClick={vi.fn()}
        onRestore={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('More options'));
    expect(screen.getByText('Restore')).toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Archive')).not.toBeInTheDocument();
  });

  it('calls onEdit when Edit is clicked', () => {
    const handleEdit = vi.fn();
    render(
      <VehicleCard
        vehicle={mockVehicle}
        worstStatus={null}
        onClick={vi.fn()}
        onEdit={handleEdit}
        onArchive={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('More options'));
    fireEvent.click(screen.getByText('Edit'));
    expect(handleEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onArchive when Archive is clicked', () => {
    const handleArchive = vi.fn();
    render(
      <VehicleCard
        vehicle={mockVehicle}
        worstStatus={null}
        onClick={vi.fn()}
        onEdit={vi.fn()}
        onArchive={handleArchive}
      />
    );
    fireEvent.click(screen.getByLabelText('More options'));
    fireEvent.click(screen.getByText('Archive'));
    expect(handleArchive).toHaveBeenCalledTimes(1);
  });

  it('calls onRestore when Restore is clicked', () => {
    const handleRestore = vi.fn();
    render(
      <VehicleCard
        vehicle={archivedVehicle}
        worstStatus={null}
        onClick={vi.fn()}
        onRestore={handleRestore}
      />
    );
    fireEvent.click(screen.getByLabelText('More options'));
    fireEvent.click(screen.getByText('Restore'));
    expect(handleRestore).toHaveBeenCalledTimes(1);
  });

  it('archived card has lower opacity', () => {
    render(
      <VehicleCard vehicle={archivedVehicle} worstStatus={null} onClick={vi.fn()} />
    );
    const card = screen.getByTestId('vehicle-card');
    expect(card).toHaveStyle({ opacity: 0.65 });
  });
});

describe('AddVehicleCard', () => {
  it('renders the add vehicle card', () => {
    render(<AddVehicleCard onClick={vi.fn()} />);
    expect(screen.getByTestId('add-vehicle-card')).toBeInTheDocument();
    expect(screen.getByText('Add Vehicle')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<AddVehicleCard onClick={handleClick} />);
    fireEvent.click(screen.getByTestId('add-vehicle-card'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
