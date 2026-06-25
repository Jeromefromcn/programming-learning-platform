import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ConfirmReauthDialog from './ConfirmReauthDialog';

const mockOnConfirmLogin = vi.fn();
const mockOnConfirmCancel = vi.fn();
let mockConfirmVisible = true;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    confirmVisible: mockConfirmVisible,
    onConfirmLogin: mockOnConfirmLogin,
    onConfirmCancel: mockOnConfirmCancel,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockConfirmVisible = true;
});

describe('ConfirmReauthDialog', () => {
  it('renders when confirmVisible is true', () => {
    render(<ConfirmReauthDialog />);
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('does not render when confirmVisible is false', () => {
    mockConfirmVisible = false;
    render(<ConfirmReauthDialog />);
    expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument();
  });

  it('calls onConfirmLogin when Log in is clicked', async () => {
    render(<ConfirmReauthDialog />);
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(mockOnConfirmLogin).toHaveBeenCalledOnce();
  });

  it('calls onConfirmCancel when Cancel is clicked', async () => {
    render(<ConfirmReauthDialog />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockOnConfirmCancel).toHaveBeenCalledOnce();
  });
});
