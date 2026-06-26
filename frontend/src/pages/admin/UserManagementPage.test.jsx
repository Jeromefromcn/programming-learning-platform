import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import UserManagementPage from './UserManagementPage';
import userEvent from '@testing-library/user-event';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 1, role: 'SUPER_ADMIN' } })),
}));

vi.mock('../../api/userApi', () => ({
  userApi: {
    list: vi.fn(),
    updateRole: vi.fn(),
    updateStatus: vi.fn(),
    updateExpiration: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function getApi() {
  const { userApi } = await import('../../api/userApi');
  return userApi;
}

test('renders page title and action buttons', async () => {
  const api = await getApi();
  api.list.mockResolvedValue({ content: [], totalPages: 0 });
  render(<UserManagementPage />);
  expect(screen.getByText('User Management')).toBeInTheDocument();
  expect(screen.getByText('Import Users')).toBeInTheDocument();
  expect(screen.getByText('+ New User')).toBeInTheDocument();
});

test('displays users from API', async () => {
  const api = await getApi();
  api.list.mockResolvedValue({
    content: [
      { id: 2, username: 'alice', displayName: 'Alice', role: 'STUDENT', status: 'ACTIVE', expirationDate: null },
      { id: 3, username: 'bob', displayName: 'Bob', role: 'TUTOR', status: 'ACTIVE', expirationDate: null },
    ],
    totalPages: 1,
  });
  render(<UserManagementPage />);
  await waitFor(() => {
    expect(screen.getByText('alice')).toBeInTheDocument();
  });
  expect(screen.getByText('bob')).toBeInTheDocument();
});

test('date inputs have min attribute set to today', async () => {
  const api = await getApi();
  api.list.mockResolvedValue({
    content: [
      { id: 2, username: 'alice', displayName: 'Alice', role: 'STUDENT', status: 'ACTIVE', expirationDate: null },
    ],
    totalPages: 1,
  });
  const { container } = render(<UserManagementPage />);
  await waitFor(() => {
    expect(screen.getByText('alice')).toBeInTheDocument();
  });
  const today = new Date().toISOString().split('T')[0];
  const dateInput = container.querySelector('input[type="date"]');
  expect(dateInput).toHaveAttribute('min', today);
});

test('renders Last Login column header', async () => {
  const api = await getApi();
  api.list.mockResolvedValue({ content: [], totalPages: 0 });
  render(<UserManagementPage />);
  await waitFor(() => {
    expect(screen.getByText('Last Login')).toBeInTheDocument();
  });
});

test('displays formatted last login time when present', async () => {
  const api = await getApi();
  api.list.mockResolvedValue({
    content: [
      {
        id: 2,
        username: 'alice',
        displayName: 'Alice',
        role: 'STUDENT',
        status: 'ACTIVE',
        expirationDate: null,
        lastLoginAt: '2026-06-25T14:30:00',
      },
    ],
    totalPages: 1,
  });
  render(<UserManagementPage />);
  await waitFor(() => {
    expect(screen.getByText('alice')).toBeInTheDocument();
  });
  // The formatted value should appear somewhere in the row
  // zh-CN locale formats vary by environment; just check it's not "—"
  const cells = screen.getAllByRole('cell');
  const lastLoginCell = cells.find(c => c.textContent && c.textContent !== '—' && c.textContent.includes('2026'));
  expect(lastLoginCell).toBeDefined();
});

test('displays — when lastLoginAt is null', async () => {
  const api = await getApi();
  api.list.mockResolvedValue({
    content: [
      {
        id: 2,
        username: 'alice',
        displayName: 'Alice',
        role: 'STUDENT',
        status: 'ACTIVE',
        expirationDate: null,
        lastLoginAt: null,
      },
    ],
    totalPages: 1,
  });
  render(<UserManagementPage />);
  await waitFor(() => {
    expect(screen.getByText('alice')).toBeInTheDocument();
  });
  expect(screen.getByText('—')).toBeInTheDocument();
});

test('name filter input calls API with name param', async () => {
  const api = await getApi();
  api.list.mockResolvedValue({ content: [], totalPages: 0 });
  render(<UserManagementPage />);
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));

  const input = screen.getByPlaceholderText('Search by username or name');
  await userEvent.type(input, 'alice');

  await waitFor(() => {
    const calls = api.list.mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.name).toBe('alice');
  });
});
