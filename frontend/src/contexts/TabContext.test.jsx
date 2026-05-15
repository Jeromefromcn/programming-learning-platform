import { render, screen, fireEvent } from '@testing-library/react';
import { TabProvider, useTab } from './TabContext';

function Inspector() {
  const { tabs, activeTabId, openTab, closeTab, switchTab } = useTab();
  return (
    <div>
      <span data-testid="count">{tabs.length}</span>
      <span data-testid="active">{activeTabId ?? 'none'}</span>
      <span data-testid="sections">{tabs.map(t => t.section).join(',')}</span>
      <button onClick={() => openTab('courses')}>open-courses</button>
      <button onClick={() => openTab('exercises')}>open-exercises</button>
      <button onClick={() => tabs[0] && closeTab(tabs[0].id)}>close-first</button>
      <button onClick={() => tabs[0] && switchTab(tabs[0].id)}>switch-first</button>
    </div>
  );
}

function wrap(initialSection) {
  return render(
    <TabProvider initialSection={initialSection}>
      <Inspector />
    </TabProvider>
  );
}

test('starts empty when no initialSection', () => {
  wrap(null);
  expect(screen.getByTestId('count')).toHaveTextContent('0');
  expect(screen.getByTestId('active')).toHaveTextContent('none');
});

test('initialSection opens one tab and makes it active', () => {
  wrap('exercises');
  expect(screen.getByTestId('count')).toHaveTextContent('1');
  expect(screen.getByTestId('sections')).toHaveTextContent('exercises');
  expect(screen.getByTestId('active')).not.toHaveTextContent('none');
});

test('openTab adds a tab and activates it', () => {
  wrap(null);
  fireEvent.click(screen.getByText('open-courses'));
  expect(screen.getByTestId('count')).toHaveTextContent('1');
  expect(screen.getByTestId('sections')).toHaveTextContent('courses');
});

test('openTab on already-open section does not duplicate', () => {
  wrap('exercises');
  fireEvent.click(screen.getByText('open-exercises'));
  expect(screen.getByTestId('count')).toHaveTextContent('1');
});

test('openTab on new section adds it and switches to it', () => {
  wrap('exercises');
  fireEvent.click(screen.getByText('open-courses'));
  expect(screen.getByTestId('count')).toHaveTextContent('2');
  expect(screen.getByTestId('sections')).toHaveTextContent('exercises,courses');
});

test('closeTab removes the tab', () => {
  wrap('exercises');
  fireEvent.click(screen.getByText('open-courses'));
  fireEvent.click(screen.getByText('close-first'));
  expect(screen.getByTestId('count')).toHaveTextContent('1');
  expect(screen.getByTestId('sections')).toHaveTextContent('courses');
});

test('closing active tab switches to the adjacent tab', () => {
  wrap('exercises');
  fireEvent.click(screen.getByText('open-courses'));
  fireEvent.click(screen.getByText('close-first'));
  const active = screen.getByTestId('active').textContent;
  expect(active).not.toBe('none');
  expect(screen.getByTestId('sections')).toHaveTextContent('courses');
});

test('switchTab changes the active tab', () => {
  wrap('exercises');
  fireEvent.click(screen.getByText('open-courses'));
  const activeBefore = screen.getByTestId('active').textContent;
  fireEvent.click(screen.getByText('switch-first'));
  expect(screen.getByTestId('active').textContent).not.toBe(activeBefore);
});
