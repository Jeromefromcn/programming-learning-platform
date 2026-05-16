import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ImportUsersModal from './ImportUsersModal';

vi.mock('xlsx', () => ({
  read: vi.fn(() => ({ SheetNames: ['Users'], Sheets: { Users: {} } })),
  utils: {
    sheet_to_json: vi.fn(() => [
      ['username*', 'displayName*', 'password*', 'role*'],
      ['newuser1', 'New User', 'pass1234', 'STUDENT'],
    ]),
    aoa_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

vi.mock('../../api/userApi', () => ({
  userApi: { importUsers: vi.fn() },
}));

async function getApi() {
  const { userApi } = await import('../../api/userApi');
  return userApi;
}

test('renders download template button', () => {
  render(<ImportUsersModal onClose={vi.fn()} onImported={vi.fn()} />);
  expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument();
});

test('import button is disabled when no file selected', () => {
  render(<ImportUsersModal onClose={vi.fn()} onImported={vi.fn()} />);
  expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled();
});

test('shows row errors returned by backend', async () => {
  const api = await getApi();
  api.importUsers.mockRejectedValue({
    response: {
      data: {
        error: {
          code: 'IMPORT_VALIDATION_ERROR',
          rows: [{ row: 2, field: 'username', message: 'already taken' }],
        },
      },
    },
  });
  render(<ImportUsersModal onClose={vi.fn()} onImported={vi.fn()} />);
  const file = new File(['mock'], 'users.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await userEvent.upload(screen.getByLabelText('Select Excel File *'), file);
  await userEvent.click(screen.getByRole('button', { name: /^import$/i }));
  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('Row 2');
    expect(screen.getByRole('alert')).toHaveTextContent('already taken');
  });
});

test('calls onImported with count on success', async () => {
  const api = await getApi();
  api.importUsers.mockResolvedValue({ imported: 1 });
  const onImported = vi.fn();
  render(<ImportUsersModal onClose={vi.fn()} onImported={onImported} />);
  const file = new File(['mock'], 'users.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await userEvent.upload(screen.getByLabelText('Select Excel File *'), file);
  await userEvent.click(screen.getByRole('button', { name: /^import$/i }));
  await waitFor(() => expect(onImported).toHaveBeenCalledWith(1));
});
