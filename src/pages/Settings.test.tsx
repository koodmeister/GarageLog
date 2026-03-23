import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Settings } from './Settings';
import { commands } from '../lib/commands';
import type { ImportSummary } from '../lib/commands';
import { ToastProvider } from '../components/Toast';

vi.mock('../lib/commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/commands')>();
  return {
    ...actual,
    commands: {
      ...actual.commands,
      exportJson: vi.fn().mockResolvedValue(undefined),
      exportCsv: vi.fn().mockResolvedValue(undefined),
      importJson: vi.fn().mockResolvedValue(undefined),
      confirmImport: vi.fn().mockResolvedValue(undefined),
    },
  };
});

const mockCommands = vi.mocked(commands);

function renderSettings(onNavigate = vi.fn()) {
  return render(
    <ToastProvider>
      <Settings onNavigate={onNavigate} />
    </ToastProvider>
  );
}

const mockSummaryNoConflicts: ImportSummary = {
  vehicle_count: 2,
  maintenance_item_count: 5,
  service_record_count: 10,
  conflicts: [],
  import_data: '{"vehicles":[]}',
};

const mockSummaryWithConflicts: ImportSummary = {
  vehicle_count: 3,
  maintenance_item_count: 8,
  service_record_count: 12,
  conflicts: [
    {
      imported_vehicle_name: 'Toyota Camry',
      imported_vehicle_year: 2021,
      existing_vehicle_id: 1,
    },
    {
      imported_vehicle_name: 'Honda Civic',
      imported_vehicle_year: 2019,
      existing_vehicle_id: 2,
    },
  ],
  import_data: '{"vehicles":[]}',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Settings', () => {
  it('Export JSON button calls commands.exportJson', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Export JSON/i }));
    await waitFor(() => {
      expect(mockCommands.exportJson).toHaveBeenCalledTimes(1);
    });
  });

  it('Export CSV button calls commands.exportCsv', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    await waitFor(() => {
      expect(mockCommands.exportCsv).toHaveBeenCalledTimes(1);
    });
  });

  it('shows import summary after importJson resolves (no conflicts)', async () => {
    mockCommands.importJson.mockResolvedValue(mockSummaryNoConflicts);
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Import JSON/i }));
    await waitFor(() => {
      expect(screen.getByTestId('import-summary')).toBeInTheDocument();
    });
    expect(screen.getByTestId('import-summary')).toHaveTextContent(
      '2 vehicles, 5 maintenance items, 10 service records found'
    );
    // No conflict table since no conflicts
    expect(screen.queryByTestId('conflict-table')).not.toBeInTheDocument();
    // Confirm Import button is visible
    expect(screen.getByRole('button', { name: /Confirm Import/i })).toBeInTheDocument();
  });

  it('shows conflict resolution table when conflicts exist', async () => {
    mockCommands.importJson.mockResolvedValue(mockSummaryWithConflicts);
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Import JSON/i }));
    await waitFor(() => {
      expect(screen.getByTestId('conflict-table')).toBeInTheDocument();
    });
    // Two conflict rows
    expect(screen.getByText('Toyota Camry (2021)')).toBeInTheDocument();
    expect(screen.getByText('Honda Civic (2019)')).toBeInTheDocument();
    // Default action is Merge (primary style) for each
    expect(screen.getByTestId('merge-btn-0')).toBeInTheDocument();
    expect(screen.getByTestId('skip-btn-0')).toBeInTheDocument();
    // Confirm Import button present
    expect(screen.getByRole('button', { name: /Confirm Import/i })).toBeInTheDocument();
  });

  it('handles non-JSON file error via toast when importJson rejects', async () => {
    mockCommands.importJson.mockRejectedValue(new Error('Not a JSON file'));
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Import JSON/i }));
    await waitFor(() => {
      // Toast error message should appear
      expect(screen.getByText('Error: Not a JSON file')).toBeInTheDocument();
    });
    // Still in idle state — Import JSON button should still be present
    expect(screen.getByRole('button', { name: /Import JSON/i })).toBeInTheDocument();
  });

  it('shows import complete message after confirmImport succeeds', async () => {
    mockCommands.importJson.mockResolvedValue(mockSummaryNoConflicts);
    mockCommands.confirmImport.mockResolvedValue(undefined);
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Import JSON/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm Import/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Import/i }));
    await waitFor(() => {
      expect(screen.getByTestId('import-complete')).toBeInTheDocument();
    });
    expect(screen.getByTestId('import-complete')).toHaveTextContent('Import complete');
  });

  it('notification toggle persists to localStorage', () => {
    renderSettings();
    const toggle = screen.getByTestId('notifications-toggle') as HTMLInputElement;
    // Default should be checked (enabled)
    expect(toggle.checked).toBe(true);
    expect(localStorage.getItem('notifications_enabled')).toBe('true');

    // Uncheck it
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(localStorage.getItem('notifications_enabled')).toBe('false');

    // Re-check it
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(localStorage.getItem('notifications_enabled')).toBe('true');
  });

  it('notification toggle reads initial value from localStorage', () => {
    localStorage.setItem('notifications_enabled', 'false');
    renderSettings();
    const toggle = screen.getByTestId('notifications-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });
});
