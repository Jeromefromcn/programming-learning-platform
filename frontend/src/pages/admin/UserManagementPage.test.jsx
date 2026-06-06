import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import UserManagementPage from './UserManagementPage';

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
