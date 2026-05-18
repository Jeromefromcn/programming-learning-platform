import MarkdownRenderer from './MarkdownRenderer';

export default function MarkdownEditor({ value, onChange, rows = 8, required = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Markdown
        </div>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          required={required}
          style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
        />
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Preview
        </div>
        <div style={{ padding: 8, border: '1px solid #eee', borderRadius: 4, background: '#fafafa', minHeight: `${rows * 1.5}em`, overflowY: 'auto' }}>
          {value
            ? <MarkdownRenderer content={value} />
            : <span style={{ color: '#bbb', fontSize: 13 }}>Nothing to preview</span>
          }
        </div>
      </div>
    </div>
  );
}
