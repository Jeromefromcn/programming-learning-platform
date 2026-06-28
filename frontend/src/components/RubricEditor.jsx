export default function RubricEditor({ dimensions, onChange }) {
  const sum = dimensions.reduce((acc, d) => acc + (parseFloat(d.weight) || 0), 0);
  const sumValid = Math.abs(sum - 1) < 1e-6;

  function updateDim(index, field, value) {
    const next = dimensions.map((d, i) =>
      i === index ? { ...d, [field]: value } : d
    );
    onChange(next);
  }

  function addDim() {
    onChange([...dimensions, { name: '', weight: '' }]);
  }

  function removeDim(index) {
    onChange(dimensions.filter((_, i) => i !== index));
  }

  return (
    <div style={{ marginTop: 12 }}>
      <h4 style={{ marginBottom: 8 }}>Scoring Dimensions</h4>
      {dimensions.map((d, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input
            placeholder="Dimension name"
            value={d.name}
            onChange={e => updateDim(i, 'name', e.target.value)}
            style={{ flex: 2, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }}
          />
          <input
            type="number"
            placeholder="Weight (0–1)"
            min="0"
            max="1"
            step="0.01"
            value={d.weight}
            onChange={e => updateDim(i, 'weight', e.target.value)}
            style={{ width: 120, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }}
          />
          <button
            type="button"
            onClick={() => removeDim(i)}
            style={{
              padding: '4px 10px', color: '#c62828', background: 'none',
              border: '1px solid #c62828', borderRadius: 4, cursor: 'pointer', fontSize: 12,
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addDim}
        style={{
          padding: '5px 14px', background: '#fff', border: '1px solid #1976d2',
          color: '#1976d2', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginTop: 4,
        }}
      >
        + Add Dimension
      </button>
      <div style={{
        marginTop: 8, fontSize: 13,
        color: sumValid ? '#2e7d32' : '#c62828',
        fontWeight: 600,
      }}>
        Total weight: {sum.toFixed(4)}
        {!sumValid && dimensions.length > 0 && ' — must equal exactly 1.0'}
      </div>
    </div>
  );
}
