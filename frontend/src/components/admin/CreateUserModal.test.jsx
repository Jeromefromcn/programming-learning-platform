import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import CreateUserModal from './CreateUserModal';

vi.mock('../../api/userApi', () => ({
  userApi: { create: vi.fn() },
}));

async function getApi() {
  const { userApi } = await import('../../api/userApi');
  return userApi;
}

test('renders all form fields', () => {
  render(<CreateUserModal onClose={vi.fn()} onCreated={vi.fn()} />);
  expect(screen.getByLabelText('Username')).toBeInTheDocument();
  expect(screen.getByLabelText('Display Name')).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toBeInTheDocument();
  expect(screen.getByLabelText('Role')).toBeInTheDocument();
  expect(screen.getByLabelText('Expiration Date (optional)')).toBeInTheDocument();
});

test('calls onClose when cancel is clicked', async () => {
  const onClose = vi.fn();
  render(<CreateUserModal onClose={onClose} onCreated={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
  expect(onClose).toHaveBeenCalled();
});

test('creates user and calls onCreated', async () => {
  const api = await getApi();
  api.create.mockResolvedValue({ username: 'newuser' });
  const onCreated = vi.fn();
  render(<CreateUserModal onClose={vi.fn()} onCreated={onCreated} />);

  await userEvent.type(screen.getByLabelText('Username'), 'newuser');
  await userEvent.type(screen.getByLabelText('Display Name'), 'New User');
  await userEvent.type(screen.getByLabelText('Password'), 'secret123');
  await userEvent.click(screen.getByRole('button', { name: /create/i }));

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ username: 'newuser' }));
});

test('shows error on failure', async () => {
  const api = await getApi();
  api.create.mockRejectedValue({
    response: { data: { error: { code: 'USERNAME_TAKEN' } } },
  });
  render(<CreateUserModal onClose={vi.fn()} onCreated={vi.fn()} />);

  await userEvent.type(screen.getByLabelText('Username'), 'takenuser');
  await userEvent.type(screen.getByLabelText('Display Name'), 'Taken');
  await userEvent.type(screen.getByLabelText('Password'), 'secret123');
  await userEvent.click(screen.getByRole('button', { name: /create/i }));

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('Username already taken');
  });
});

test('sends expirationDate as ISO string when set', async () => {
  const api = await getApi();
  api.create.mockResolvedValue({ username: 'expiringuser' });
  render(<CreateUserModal onClose={vi.fn()} onCreated={vi.fn()} />);

  await userEvent.type(screen.getByLabelText('Username'), 'expiringuser');
  await userEvent.type(screen.getByLabelText('Display Name'), 'Expiring');
  await userEvent.type(screen.getByLabelText('Password'), 'secret123');
  await userEvent.type(screen.getByLabelText('Expiration Date (optional)'), '2027-06-01');
  await userEvent.click(screen.getByRole('button', { name: /create/i }));

  await waitFor(() => {
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ expirationDate: expect.stringContaining('2027') })
    );
  });
});
