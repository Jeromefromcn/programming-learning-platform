import { Link } from 'react-router-dom';

export default function TutorPage() {
  return (
    <div style={{ padding: 32 }}>
      <h1>Tutor Dashboard</h1>
      <nav style={{ display: 'flex', gap: 16, marginTop: 24 }}>
        <Link to="/tutor/categories">Category Management</Link>
        <Link to="/tutor/courses">Course Management</Link>
      </nav>
    </div>
  );
}
