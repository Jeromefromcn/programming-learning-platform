import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ChangePasswordModal from './ChangePasswordModal';

vi.mock('../api/userApi', () => ({
  userApi: { changePassword: vi.fn() },
}));

async function getApi() {
  const { userApi } = await import('../api/userApi');
  return userApi;
}

test('shows error when new passwords do not match', async () => {
  render(<ChangePasswordModal onClose={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('Current Password'), 'oldpass123');
  await userEvent.type(screen.getByLabelText('New Password'), 'newpass123');
  await userEvent.type(screen.getByLabelText('Confirm New Password'), 'different');
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
  expect(screen.getByRole('alert')).toHaveTextContent('do not match');
});

test('shows error on WRONG_CURRENT_PASSWORD', async () => {
  const api = await getApi();
  api.changePassword.mockRejectedValue({
    response: { data: { error: { code: 'WRONG_CURRENT_PASSWORD' } } },
  });
  render(<ChangePasswordModal onClose={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('Current Password'), 'wrongpass');
  await userEvent.type(screen.getByLabelText('New Password'), 'newpass123');
  await userEvent.type(screen.getByLabelText('Confirm New Password'), 'newpass123');
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('incorrect'));
});

test('calls onClose on success', async () => {
  const api = await getApi();
  api.changePassword.mockResolvedValue({});
  const onClose = vi.fn();
  render(<ChangePasswordModal onClose={onClose} />);
  await userEvent.type(screen.getByLabelText('Current Password'), 'correctpass');
  await userEvent.type(screen.getByLabelText('New Password'), 'newpass123');
  await userEvent.type(screen.getByLabelText('Confirm New Password'), 'newpass123');
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});
