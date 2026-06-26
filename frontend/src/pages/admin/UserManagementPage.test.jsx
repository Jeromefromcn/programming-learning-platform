import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import UserManagementPage from './UserManagementPage';
import { userApi } from '../../api/userApi';
import { AuthContext } from '../../contexts/AuthContext';

vi.mock('../../api/userApi');
vi.mock('../../api/axiosInstance', () => ({ isReauthCancelled: () => false }));

const emptyPage = { content: [], totalPages: 0 };
const wrapper = ({ children }) => (
  <AuthContext.Provider value={{ user: { id: 99 } }}>
    {children}
  </AuthContext.Provider>
);

beforeEach(() => {
  userApi.list = vi.fn().mockResolvedValue(emptyPage);
  userApi.updateRole = vi.fn();
  userApi.updateStatus = vi.fn();
  userApi.updateExpiration = vi.fn();
  userApi.resetPassword = vi.fn();
});

test('renders page title and action buttons', async () => {
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(1));
  expect(screen.getByText('User Management')).toBeInTheDocument();
  expect(screen.getByText('Import Users')).toBeInTheDocument();
  expect(screen.getByText('+ New User')).toBeInTheDocument();
});

test('displays users from API', async () => {
  userApi.list.mockResolvedValue({
    content: [
      { id: 2, username: 'alice', displayName: 'Alice', role: 'STUDENT', status: 'ACTIVE', expirationDate: null },
      { id: 3, username: 'bob', displayName: 'Bob', role: 'TUTOR', status: 'ACTIVE', expirationDate: null },
    ],
    totalPages: 1,
  });
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText('alice')).toBeInTheDocument();
  });
  expect(screen.getByText('bob')).toBeInTheDocument();
});

test('date inputs have min attribute set to today', async () => {
  userApi.list.mockResolvedValue({
    content: [
      { id: 2, username: 'alice', displayName: 'Alice', role: 'STUDENT', status: 'ACTIVE', expirationDate: null },
    ],
    totalPages: 1,
  });
  const { container } = render(<UserManagementPage />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText('alice')).toBeInTheDocument();
  });
  const today = new Date().toISOString().split('T')[0];
  const dateInput = container.querySelector('input[type="date"]');
  expect(dateInput).toHaveAttribute('min', today);
});

test('renders Last Login column header', async () => {
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText('Last Login')).toBeInTheDocument();
  });
});

test('displays formatted last login time when present', async () => {
  userApi.list.mockResolvedValue({
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
  render(<UserManagementPage />, { wrapper });
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
  userApi.list.mockResolvedValue({
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
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText('alice')).toBeInTheDocument();
  });
  expect(screen.getByText('—')).toBeInTheDocument();
});

it('does not call userApi.list again when name input changes without clicking Search', async () => {
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/search by username/i), {
    target: { value: 'alice' },
  });

  // Still only 1 call (the initial mount call)
  expect(userApi.list).toHaveBeenCalledTimes(1);
});

it('calls userApi.list with name filter after clicking Search', async () => {
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/search by username/i), {
    target: { value: 'alice' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(2));
  expect(userApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'alice', page: 0 }));
});

it('calls userApi.list with name filter after pressing Enter in text input', async () => {
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(1));

  const input = screen.getByPlaceholderText(/search by username/i);
  fireEvent.change(input, { target: { value: 'bob' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(2));
  expect(userApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'bob', page: 0 }));
});

it('does not call userApi.list when dropdown changes without clicking Search', async () => {
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByDisplayValue('All Roles'), {
    target: { value: 'TUTOR' },
  });

  expect(userApi.list).toHaveBeenCalledTimes(1);
});
