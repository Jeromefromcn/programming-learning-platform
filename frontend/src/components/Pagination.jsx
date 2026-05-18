export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages < 1) return null;
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', alignItems: 'center' }}>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        style={{ padding: '4px 12px', cursor: page === 0 ? 'default' : 'pointer' }}
      >
        ← Prev
      </button>
      <span style={{ padding: '4px 8px' }}>Page {page + 1} of {totalPages}</span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages - 1}
        style={{ padding: '4px 12px', cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}
      >
        Next →
      </button>
    </div>
  );
}
