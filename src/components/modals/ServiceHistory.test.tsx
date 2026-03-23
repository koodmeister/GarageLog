import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ServiceHistory } from './ServiceHistory';
import { commands } from '../../lib/commands';
import type { MaintenanceItem, ServiceRecord } from '../../lib/commands';

vi.mock('../../lib/commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/commands')>();
  return {
    ...actual,
    commands: {
      ...actual.commands,
      getServiceHistory: vi.fn(),
    },
  };
});

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

function makeRecord(overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    id: 1,
    maintenance_item_id: 1,
    serviced_at: '2024-06-15T00:00:00Z',
    odometer_at_service: 45000,
    cost: 59.99,
    shop: 'Quick Lube',
    notes: 'Used synthetic oil',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ServiceHistory', () => {
  it('shows loading state while fetching', async () => {
    // Return a promise that never resolves to keep loading state
    let resolve!: (value: ServiceRecord[]) => void;
    vi.mocked(commands.getServiceHistory).mockReturnValue(
      new Promise<ServiceRecord[]>((r) => { resolve = r; })
    );

    render(<ServiceHistory item={mockItem} onClose={vi.fn()} />);

    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    expect(screen.getByTestId('loading-state')).toHaveTextContent('Loading...');

    // Resolve to avoid unhandled promise warnings
    resolve([]);
  });

  it('shows empty state when no records', async () => {
    vi.mocked(commands.getServiceHistory).mockResolvedValue([]);

    render(<ServiceHistory item={mockItem} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'No service history yet. Use Log Service to record the first entry.'
    );
  });

  it('shows records after fetch', async () => {
    const records: ServiceRecord[] = [
      makeRecord({ id: 1, serviced_at: '2024-06-15T00:00:00Z', odometer_at_service: 45000, cost: 59.99, shop: 'Quick Lube', notes: 'Used synthetic oil' }),
      makeRecord({ id: 2, serviced_at: '2023-12-10T00:00:00Z', odometer_at_service: 40000, cost: null, shop: null, notes: null }),
    ];

    vi.mocked(commands.getServiceHistory).mockResolvedValue(records);

    render(<ServiceHistory item={mockItem} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('records-list')).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId('service-record');
    expect(rows).toHaveLength(2);

    // Should show odometer, cost, shop, notes for first record
    expect(screen.getAllByTestId('record-odometer')[0]).toHaveTextContent(/45.?000 km/);
    expect(screen.getAllByTestId('record-cost')[0]).toHaveTextContent('$59.99');
    expect(screen.getAllByTestId('record-shop')[0]).toHaveTextContent('Quick Lube');
    expect(screen.getAllByTestId('record-notes')[0]).toHaveTextContent('Used synthetic oil');
  });

  it('records are sorted newest first', async () => {
    // Use records with distinct cost values so we can identify their rendering order
    const records: ServiceRecord[] = [
      makeRecord({ id: 1, serviced_at: '2023-01-01T00:00:00Z', cost: 10 }),
      makeRecord({ id: 2, serviced_at: '2024-06-15T00:00:00Z', cost: 20 }),
      makeRecord({ id: 3, serviced_at: '2022-03-20T00:00:00Z', cost: 30 }),
    ];

    vi.mocked(commands.getServiceHistory).mockResolvedValue(records);

    render(<ServiceHistory item={mockItem} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('service-record')).toHaveLength(3);
    });

    // Newest (2024-06-15, cost $20.00) should be first; oldest (2022-03-20, cost $30.00) last
    const costEls = screen.getAllByTestId('record-cost');
    expect(costEls[0]).toHaveTextContent('$20.00');
    expect(costEls[1]).toHaveTextContent('$10.00');
    expect(costEls[2]).toHaveTextContent('$30.00');
  });

  it('does not show optional fields when they are null', async () => {
    const records: ServiceRecord[] = [
      makeRecord({ id: 1, odometer_at_service: null, cost: null, shop: null, notes: null }),
    ];

    vi.mocked(commands.getServiceHistory).mockResolvedValue(records);

    render(<ServiceHistory item={mockItem} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('service-record')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('record-odometer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('record-cost')).not.toBeInTheDocument();
    expect(screen.queryByTestId('record-shop')).not.toBeInTheDocument();
    expect(screen.queryByTestId('record-notes')).not.toBeInTheDocument();
  });

  it('fetches history for the given item id on mount', async () => {
    vi.mocked(commands.getServiceHistory).mockResolvedValue([]);

    render(<ServiceHistory item={{ ...mockItem, id: 42 }} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(commands.getServiceHistory).toHaveBeenCalledWith(42);
    });
  });
});
