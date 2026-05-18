import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { userApi } from '../../api/userApi';
import CreateUserModal from '../../components/admin/CreateUserModal';
import ImportUsersModal from '../../components/admin/ImportUsersModal';
import Pagination from '../../components/Pagination';

const ROLE_BADGE = { STUDENT: '#1976d2', TUTOR: '#388e3c', SUPER_ADMIN: '#7b1fa2' };
const STATUS_BADGE = { ACTIVE: '#2e7d32', DISABLED: '#c62828' };

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [resettingId, setResettingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await userApi.list({
        page, size: 20,
        ...(roleFilter && { role: roleFilter }),
        ...(statusFilter && { status: statusFilter }),
      });
      setUsers(data.content);
      setTotalPages(data.totalPages);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, roleFilter, statusFilter]);

  async function handleRoleChange(id, role) {
    await userApi.updateRole(id, role);
    load();
  }

  async function handleStatusToggle(u) {
    const newStatus = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (newStatus === 'DISABLED' && !confirm(`Disable ${u.username}? All active sessions will be invalidated.`)) return;
    await userApi.updateStatus(u.id, newStatus);
    load();
  }

  async function handleResetPassword(u) {
    if (!confirm(`Reset ${u.username}'s password to 12345678?`)) return;
    setResettingId(u.id);
    try {
      await userApi.resetPassword(u.id);
      setToast(`${u.username}'s password has been reset`);
      setTimeout(() => setToast(''), 4000);
    } catch {
      setToast('Failed to reset password — please try again');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setResettingId(null);
    }
  }

  return (
    <div style={{ padding: 32 }}>
      {toast && (
        <div role="status" style={{ marginBottom: 16, padding: 12, background: '#e8f5e9', borderRadius: 4, color: '#2e7d32' }}>
          {toast}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>User Management</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowImport(true)}
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
            Import Users
          </button>
          <button onClick={() => setShowCreate(true)}
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
            + New User
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0); }}
          style={{ padding: 8 }}>
          <option value="">All Roles</option>
          {['STUDENT', 'TUTOR', 'SUPER_ADMIN'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          style={{ padding: 8 }}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
        </select>
      </div>

      {loading ? <p>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Username</th>
              <th style={{ padding: 8 }}>Display Name</th>
              <th style={{ padding: 8 }}>Role</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{u.username}</td>
                <td style={{ padding: 8 }}>{u.displayName}</td>
                <td style={{ padding: 8 }}>
                  <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}
                    disabled={u.id === currentUser?.id}
                    style={{ padding: 4, color: ROLE_BADGE[u.role] }}>
                    {['STUDENT', 'TUTOR', 'SUPER_ADMIN'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={{ padding: 8 }}>
                  <span style={{ color: STATUS_BADGE[u.status], fontWeight: 600 }}>{u.status}</span>
                </td>
                <td style={{ padding: 8 }}>
                  {u.id !== currentUser?.id && (
                    <>
                      <button onClick={() => handleStatusToggle(u)}
                        style={{ padding: '4px 10px', cursor: 'pointer' }}>
                        {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => handleResetPassword(u)}
                        disabled={resettingId === u.id}
                        style={{ marginLeft: 8, padding: '4px 10px', cursor: 'pointer', background: '#ef6c00', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12 }}>
                        {resettingId === u.id ? 'Resetting…' : 'Reset Password'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={(p) => setPage(p)} />

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }} />
      )}
      {showImport && (
        <ImportUsersModal
          onClose={() => setShowImport(false)}
          onImported={(count) => {
            setShowImport(false);
            setToast(`${count} user${count !== 1 ? 's' : ''} imported successfully`);
            setTimeout(() => setToast(''), 4000);
            load();
          }} />
      )}
    </div>
  );
}
