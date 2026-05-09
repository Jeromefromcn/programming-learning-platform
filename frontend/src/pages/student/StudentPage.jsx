import { Link, Outlet } from 'react-router-dom';

export default function StudentPage() {
  return (
    <div>
      <nav style={{ background: '#1976d2', padding: '0 32px', display: 'flex', gap: 24, alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, padding: '14px 0' }}>Student Portal</span>
        <Link to="/student/exercises"
          style={{ color: '#fff', textDecoration: 'none', padding: '14px 0', opacity: 0.9 }}>
          Exercises
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}
