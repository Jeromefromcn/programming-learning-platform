import { applyTrashcanStyles } from './blocklyTrashcan';

function makeContainer(hasTrash = true) {
  const container = document.createElement('div');
  if (hasTrash) {
    const trash = document.createElement('div');
    trash.className = 'blocklyTrash';
    container.appendChild(trash);
  }
  return container;
}

test('applies orange background to .blocklyTrash', () => {
  const container = makeContainer();
  applyTrashcanStyles(container);
  const trash = container.querySelector('.blocklyTrash');
  expect(trash.style.background).toBe('rgb(255, 243, 224)');
});

test('applies dashed orange border to .blocklyTrash', () => {
  const container = makeContainer();
  applyTrashcanStyles(container);
  const trash = container.querySelector('.blocklyTrash');
  expect(trash.style.border).toBe('2px dashed rgb(255, 152, 0)');
});

test('sets width and height to 48px on .blocklyTrash', () => {
  const container = makeContainer();
  applyTrashcanStyles(container);
  const trash = container.querySelector('.blocklyTrash');
  expect(trash.style.width).toBe('48px');
  expect(trash.style.height).toBe('48px');
});

test('inserts a "Drop to delete" label after .blocklyTrash', () => {
  const container = makeContainer();
  applyTrashcanStyles(container);
  const label = container.querySelector('.blockly-trash-label');
  expect(label).not.toBeNull();
  expect(label.textContent).toBe('Drop to delete');
});

test('does not insert duplicate labels on repeated calls', () => {
  const container = makeContainer();
  applyTrashcanStyles(container);
  applyTrashcanStyles(container);
  expect(container.querySelectorAll('.blockly-trash-label')).toHaveLength(1);
});

test('does nothing when .blocklyTrash is absent', () => {
  const container = makeContainer(false);
  expect(() => applyTrashcanStyles(container)).not.toThrow();
});
