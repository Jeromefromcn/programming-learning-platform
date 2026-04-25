import { Link } from 'react-router-dom';

export default function AdminDashboardPage() {
  return (
    <div style={{ padding: 32 }}>
      <h1>Admin Dashboard</h1>
      <nav style={{ display: 'flex', gap: 16, marginTop: 24 }}>
        <Link to="/admin/users">User Management</Link>
        <Link to="/admin/settings">Global Settings</Link>
        <Link to="/admin/categories">Category Management</Link>
      </nav>
    </div>
  );
}
