import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MaintenanceRow } from './MaintenanceRow';
import type { MaintenanceItem } from '../lib/commands';

function makeItem(overrides: Partial<MaintenanceItem> = {}): MaintenanceItem {
  return {
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
    ...overrides,
  };
}

function renderRow(item: MaintenanceItem, handlers: {
  onLogService?: () => void;
  onHistory?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
} = {}) {
  const props = {
    item,
    onLogService: handlers.onLogService ?? vi.fn(),
    onHistory: handlers.onHistory ?? vi.fn(),
    onEdit: handlers.onEdit ?? vi.fn(),
    onDelete: handlers.onDelete ?? vi.fn(),
  };
  return render(<MaintenanceRow {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MaintenanceRow', () => {
  it('renders item name and status label', () => {
    renderRow(makeItem({ name: 'Tyre Rotation', status: 'Ok' }));
    expect(screen.getByTestId('row-name')).toHaveTextContent('Tyre Rotation');
    expect(screen.getByTestId('row-status')).toHaveTextContent('OK');
  });

  it('renders correct border color for Overdue status', () => {
    renderRow(makeItem({ status: 'Overdue' }));
    const row = screen.getByTestId('maintenance-row');
    expect(row).toHaveStyle({ borderLeft: '4px solid #ef4444' });
  });

  it('renders correct border color for DueSoon status', () => {
    renderRow(makeItem({ status: 'DueSoon' }));
    const row = screen.getByTestId('maintenance-row');
    expect(row).toHaveStyle({ borderLeft: '4px solid #f59e0b' });
  });

  it('renders correct border color for Ok status', () => {
    renderRow(makeItem({ status: 'Ok' }));
    const row = screen.getByTestId('maintenance-row');
    expect(row).toHaveStyle({ borderLeft: '4px solid #22c55e' });
  });

  it('renders correct border color for Unknown status', () => {
    renderRow(makeItem({ status: 'Unknown' }));
    const row = screen.getByTestId('maintenance-row');
    expect(row).toHaveStyle({ borderLeft: '4px solid #9ca3af' });
  });

  it('renders interval description with both months and km', () => {
    renderRow(makeItem({ interval_months: 6, interval_km: 5000 }));
    // locale may format 5000 as "5,000" or "5 000"; match loosely
    expect(screen.getByText(/Every 6 months\s*\/\s*5.?000 km/)).toBeInTheDocument();
  });

  it('renders interval description with months only', () => {
    renderRow(makeItem({ interval_months: 3, interval_km: null }));
    expect(screen.getByText('Every 3 months')).toBeInTheDocument();
  });

  it('renders interval description with km only', () => {
    renderRow(makeItem({ interval_months: null, interval_km: 10000 }));
    expect(screen.getByText(/10.?000 km/)).toBeInTheDocument();
  });

  it('shows "Never" when last_serviced_at is null', () => {
    renderRow(makeItem({ last_serviced_at: null }));
    expect(screen.getByText(/Never/)).toBeInTheDocument();
  });

  it('shows last serviced date with odometer when available', () => {
    renderRow(makeItem({
      last_serviced_at: '2024-06-15T00:00:00Z',
      last_odometer_at_service: 25000,
    }));
    // locale may format 25000 as "25,000" or "25 000"
    expect(screen.getByText(/25.?000 km/)).toBeInTheDocument();
  });

  it('calls onLogService when Log Service button clicked', () => {
    const onLogService = vi.fn();
    renderRow(makeItem(), { onLogService });
    fireEvent.click(screen.getByTestId('log-service-btn'));
    expect(onLogService).toHaveBeenCalledOnce();
  });

  it('calls onHistory when History button clicked', () => {
    const onHistory = vi.fn();
    renderRow(makeItem(), { onHistory });
    fireEvent.click(screen.getByTestId('history-btn'));
    expect(onHistory).toHaveBeenCalledOnce();
  });

  it('opens overflow menu and calls onEdit when Edit clicked', () => {
    const onEdit = vi.fn();
    renderRow(makeItem(), { onEdit });
    fireEvent.click(screen.getByTestId('row-overflow-btn'));
    expect(screen.getByTestId('row-overflow-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('opens overflow menu and calls onDelete when Delete clicked', () => {
    const onDelete = vi.fn();
    renderRow(makeItem(), { onDelete });
    fireEvent.click(screen.getByTestId('row-overflow-btn'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
