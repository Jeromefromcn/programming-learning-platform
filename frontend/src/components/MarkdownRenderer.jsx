import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COMPONENTS = {
  h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 700, margin: '12px 0 8px' }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: 17, fontWeight: 700, margin: '10px 0 6px' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 700, margin: '8px 0 4px' }}>{children}</h3>,
  ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '6px 0' }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: '6px 0' }}>{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: '3px solid #ccc', paddingLeft: 12, margin: '8px 0', color: '#555' }}>
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflowX: 'auto', margin: '8px 0', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}>
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    if (className) {
      return <code className={className} style={{ fontFamily: 'monospace', fontSize: 13 }}>{children}</code>;
    }
    return (
      <code style={{ fontFamily: 'monospace', fontSize: '0.9em', background: '#f0f0f0', padding: '1px 4px', borderRadius: 3 }}>
        {children}
      </code>
    );
  },
};

export default function MarkdownRenderer({ content }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {content || ''}
    </ReactMarkdown>
  );
}
