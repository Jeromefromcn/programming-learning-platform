import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

function LocationDisplay() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname}</span>;
}

function wrap(props) {
  return render(
    <MemoryRouter initialEntries={['/tutor/exercises']}>
      <Sidebar {...props} />
      <LocationDisplay />
    </MemoryRouter>
  );
}

const tutorProps = { section: 'exercises', role: 'TUTOR', collapsed: false };

test('renders sidebar items when expanded', () => {
  wrap(tutorProps);
  expect(screen.getByText('All Exercises')).toBeInTheDocument();
  expect(screen.getByText('+ New Exercise')).toBeInTheDocument();
});

test('does not render labels when collapsed', () => {
  wrap({ ...tutorProps, collapsed: true });
  expect(screen.queryByText('All Exercises')).not.toBeInTheDocument();
  expect(screen.queryByText('+ New Exercise')).not.toBeInTheDocument();
});

test('clicking an item navigates within MemoryRouter', async () => {
  wrap(tutorProps);
  await userEvent.click(screen.getByText('+ New Exercise'));
  expect(screen.getByTestId('loc')).toHaveTextContent('/tutor/exercises/new');
});

test('STUDENT exercises sidebar has no create link', () => {
  wrap({ section: 'exercises', role: 'STUDENT', collapsed: false });
  expect(screen.queryByText('+ New Exercise')).not.toBeInTheDocument();
  expect(screen.getByText('All Exercises')).toBeInTheDocument();
});
