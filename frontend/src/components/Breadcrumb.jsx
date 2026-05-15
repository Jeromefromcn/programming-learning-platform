import { Link } from 'react-router-dom';

export default function Breadcrumb({ items }) {
  return (
    <div style={{
      padding: '8px 20px', background: '#f8f9fa',
      borderBottom: '1px solid #e0e0e0', fontSize: 13, color: '#666',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ color: '#bbb' }}>›</span>}
          {item.to ? (
            <Link to={item.to} style={{ color: '#1976d2', textDecoration: 'none' }}>
              {item.label}
            </Link>
          ) : (
            <span style={{ color: '#333' }}>{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
