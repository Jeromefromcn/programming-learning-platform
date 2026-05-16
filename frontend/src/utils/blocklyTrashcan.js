export function applyTrashcanStyles(container) {
  const trash = container.querySelector('.blocklyTrash');
  if (!trash) return;

  Object.assign(trash.style, {
    background: '#fff3e0',
    border: '2px dashed #ff9800',
    borderRadius: '6px',
    width: '48px',
    height: '48px',
  });

  if (!container.querySelector('.blockly-trash-label')) {
    const label = document.createElement('div');
    label.className = 'blockly-trash-label';
    Object.assign(label.style, {
      fontSize: '10px',
      color: '#e65100',
      fontWeight: '600',
      textAlign: 'center',
      marginTop: '2px',
    });
    label.textContent = 'Drop to delete';
    trash.insertAdjacentElement('afterend', label);
  }
}
