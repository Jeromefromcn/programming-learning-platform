import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Breadcrumb from './Breadcrumb';

function wrap(items) {
  return render(
    <MemoryRouter>
      <Breadcrumb items={items} />
    </MemoryRouter>
  );
}

test('renders all item labels', () => {
  wrap([{ label: 'Courses', to: '/tutor/courses' }, { label: 'Algorithm Basics' }]);
  expect(screen.getByText('Courses')).toBeInTheDocument();
  expect(screen.getByText('Algorithm Basics')).toBeInTheDocument();
});

test('items with `to` are rendered as links', () => {
  wrap([{ label: 'Courses', to: '/tutor/courses' }, { label: 'Detail' }]);
  expect(screen.getByRole('link', { name: 'Courses' })).toBeInTheDocument();
});

test('last item (no `to`) is not a link', () => {
  wrap([{ label: 'Courses', to: '/tutor/courses' }, { label: 'Detail' }]);
  expect(screen.queryByRole('link', { name: 'Detail' })).not.toBeInTheDocument();
  expect(screen.getByText('Detail')).toBeInTheDocument();
});

test('renders separator between items', () => {
  wrap([{ label: 'A', to: '/' }, { label: 'B' }]);
  expect(screen.getByText('›')).toBeInTheDocument();
});
