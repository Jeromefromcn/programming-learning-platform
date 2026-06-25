import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ReauthModal from './ReauthModal';

const mockOnReauthSuccess = vi.fn();
const mockOnReauthCancel = vi.fn();
let mockReauthVisible = true;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    reauthVisible: mockReauthVisible,
    onReauthSuccess: mockOnReauthSuccess,
    onReauthCancel: mockOnReauthCancel,
  }),
}));

vi.mock('../api/authApi', () => ({
  authApi: {
    login: vi.fn(),
  },
}));

import { authApi } from '../api/authApi';

beforeEach(() => {
  vi.clearAllMocks();
  mockReauthVisible = true;
});

describe('ReauthModal', () => {
  it('renders when reauthVisible is true', () => {
    render(<ReauthModal />);
    expect(screen.getByText('Session Expired')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('does not render when reauthVisible is false', () => {
    mockReauthVisible = false;
    render(<ReauthModal />);
    expect(screen.queryByText('Session Expired')).not.toBeInTheDocument();
  });

  it('calls onReauthSuccess with token and user on successful login', async () => {
    vi.mocked(authApi.login).mockResolvedValueOnce({
      accessToken: 'new-tok',
      user: { username: 'alice', role: 'STUDENT', id: 1 },
    });
    render(<ReauthModal />);
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() =>
      expect(mockOnReauthSuccess).toHaveBeenCalledWith('new-tok', { username: 'alice', role: 'STUDENT', id: 1 })
    );
  });

  it('shows error message on invalid credentials', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: { data: { error: { code: 'INVALID_CREDENTIALS' } } },
    });
    render(<ReauthModal />);
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid username or password')
    );
  });

  it('shows account-disabled error', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: { data: { error: { code: 'ACCOUNT_DISABLED' } } },
    });
    render(<ReauthModal />);
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Account disabled')
    );
  });

  it('calls onReauthCancel when Cancel is clicked', async () => {
    render(<ReauthModal />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockOnReauthCancel).toHaveBeenCalledOnce();
  });
});
