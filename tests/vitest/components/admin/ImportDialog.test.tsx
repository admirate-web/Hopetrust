import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportDialog from '@/components/admin/newsletter/ImportDialog';
import { UnauthorizedError } from '@/lib/newsletter-admin';

const mocks = vi.hoisted(() => ({ readSpreadsheet: vi.fn(), importSubscribers: vi.fn(), syncUntilDone: vi.fn() }));

vi.mock('@/lib/newsletter/read-spreadsheet', () => ({ readSpreadsheet: mocks.readSpreadsheet }));
vi.mock('@/lib/newsletter-admin', () => {
  class UnauthorizedError extends Error {}
  return { UnauthorizedError, importSubscribers: mocks.importSubscribers, syncUntilDone: mocks.syncUntilDone };
});

const GRID = [
  ['Name', 'E-mail'],
  ['Asha', 'asha@example.com'],
  ['Ravi', 'RAVI@example.com'],
  ['Bad', 'nope'],
  ['Asha again', 'Asha@Example.com'],
];
const MANY = [['Email'], ...Array.from({ length: 450 }, (_, i) => [`p${i}@example.com`])];
const SYNCED = { unsubscribedInResend: 0, removedFromSegment: 0, pushed: 450, failed: 0, remaining: 0, errors: [] };

beforeEach(() => {
  mocks.readSpreadsheet.mockReset();
  mocks.importSubscribers.mockReset();
  mocks.syncUntilDone.mockReset();
  mocks.importSubscribers.mockImplementation(async (_token: string, chunk: { rows: unknown[] }) => ({
    inserted: chunk.rows.length, skipped_existing: 0, skipped_erased: 0, invalid: 0, duplicates: 0,
  }));
  mocks.syncUntilDone.mockResolvedValue(SYNCED);
});

function setup() {
  const props = { token: 't', onClose: vi.fn(), onFinished: vi.fn(), onUnauthorized: vi.fn() };
  render(<ImportDialog {...props} />);
  return props;
}

async function upload(grid: unknown[][]) {
  mocks.readSpreadsheet.mockResolvedValue(grid);
  await userEvent.upload(screen.getByLabelText('Spreadsheet file'), new File(['x'], 'list.csv', { type: 'text/csv' }));
}

async function agree() {
  await userEvent.type(
    screen.getByLabelText('Where and when did these people agree?'),
    'Clients who ticked the box on the intake form, 2025–26',
  );
  await userEvent.click(screen.getByLabelText('Everyone on this list agreed to receive the Hope Trust newsletter.'));
}

describe('ImportDialog', () => {
  it('previews the file and guesses the columns', async () => {
    setup();
    await upload(GRID);
    expect(await screen.findByTestId('import-preview')).toHaveTextContent(
      '2 addresses to import · 1 not valid · 1 repeated in the file',
    );
    expect(screen.getByLabelText('Email column')).toHaveValue('1');
    expect(screen.getByLabelText('Name column')).toHaveValue('0');
  });

  it('needs the statement and the tick before it imports', async () => {
    setup();
    await upload(GRID);
    const button = await screen.findByRole('button', { name: 'Import 2 addresses' });
    expect(button).toBeDisabled();
    await agree();
    expect(button).toBeEnabled();
  });

  it('imports in chunks of 200 under one batch id, then sends them to Resend', async () => {
    const props = setup();
    await upload(MANY);
    await agree();
    await userEvent.click(screen.getByRole('button', { name: 'Import 450 addresses' }));

    expect(await screen.findByText('Import finished')).toBeInTheDocument();
    const chunks = mocks.importSubscribers.mock.calls.map(([, chunk]) => chunk);
    expect(chunks.map((c) => c.rows.length)).toEqual([200, 200, 50]);
    expect(new Set(chunks.map((c) => c.batch_id)).size).toBe(1);
    expect(chunks[0]).toMatchObject({ attested: true, statement: 'Clients who ticked the box on the intake form, 2025–26' });
    expect(screen.getByText('Added').nextElementSibling).toHaveTextContent('450');
    expect(mocks.syncUntilDone).toHaveBeenCalled();
    expect(props.onFinished).toHaveBeenCalled();
  });

  it('shows what got in when a chunk fails', async () => {
    mocks.importSubscribers
      .mockImplementationOnce(async () => ({ inserted: 200, skipped_existing: 0, skipped_erased: 0, invalid: 0, duplicates: 0 }))
      .mockRejectedValueOnce(new Error('Something went wrong. Please try again.'));
    setup();
    await upload(MANY);
    await agree();
    await userEvent.click(screen.getByRole('button', { name: 'Import 450 addresses' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByText('Added').nextElementSibling).toHaveTextContent('200');
    expect(mocks.syncUntilDone).not.toHaveBeenCalled();
  });

  it('sends an expired session back to the login', async () => {
    mocks.importSubscribers.mockRejectedValue(new UnauthorizedError());
    const props = setup();
    await upload(GRID);
    await agree();
    await userEvent.click(screen.getByRole('button', { name: 'Import 2 addresses' }));
    await vi.waitFor(() => expect(props.onUnauthorized).toHaveBeenCalled());
  });

  it('says when the file cannot be read', async () => {
    mocks.readSpreadsheet.mockRejectedValue(new Error('Choose a .csv or .xlsx file.'));
    setup();
    await userEvent.upload(screen.getByLabelText('Spreadsheet file'), new File(['x'], 'list.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a .csv or .xlsx file.');
  });
});
