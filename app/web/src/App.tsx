import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import type { Me, Role } from '../../shared/types';
import { useMe } from './api';
import { homePath, Shell } from './Shell';
import { Landing } from './screens/Landing';
import { Matches, StudentHome, StudentSessions, TutorProfile } from './screens/Student';
import { Group, Groups, ParentProgress, Profile } from './screens/Common';
import { TutorHome, TutorReviews, TutorSchedule, TutorSessions } from './screens/Tutor';

// Admin screens and the lab load on demand; most users never open them.
const admin = () => import('./screens/Admin');
const AdminOverview = lazy(() => admin().then((m) => ({ default: m.AdminOverview })));
const AdminApplications = lazy(() => admin().then((m) => ({ default: m.AdminApplications })));
const AdminTutors = lazy(() => admin().then((m) => ({ default: m.AdminTutors })));
const AdminAccounts = lazy(() => admin().then((m) => ({ default: m.AdminAccounts })));
const AdminPayments = lazy(() => admin().then((m) => ({ default: m.AdminPayments })));
const AdminFeedback = lazy(() => admin().then((m) => ({ default: m.AdminFeedback })));
const Lab = lazy(() => import('./screens/Lab').then((m) => ({ default: m.Lab })));
import { Loading } from './ui';

/** Renders the signed-in app, the landing page, or a redirect home when a role can't open a page. */
function Authed({ roles, approvedTutor, children }: { roles?: Role[]; approvedTutor?: boolean; children: (me: Me) => ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (!me) return <Navigate to="/" replace />;
  const blocked = (roles && !roles.includes(me.role)) || (approvedTutor && me.role === 'teacher' && me.tutor?.appStatus !== 'approved');
  if (blocked) return <Navigate to={homePath(me)} replace />;
  return <Suspense fallback={<Loading />}>{children(me)}</Suspense>;
}

function Root() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (!me) return <Landing />;
  return <Navigate to={homePath(me)} replace />;
}

function Layout() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (!me) return <Navigate to="/" replace />;
  return <Shell me={me} />;
}

const page = (roles: Role[] | undefined, render: (me: Me) => ReactNode, approvedTutor = false) => (
  <Authed roles={roles} approvedTutor={approvedTutor}>{render}</Authed>
);

const router = createBrowserRouter([
  { path: '/', element: <Root /> },
  {
    element: <Layout />,
    children: [
      { path: '/home', element: page(['student'], (me) => <StudentHome me={me} />) },
      { path: '/matches', element: page(['student'], () => <Matches />) },
      { path: '/sessions', element: page(['student'], () => <StudentSessions />) },
      { path: '/tutors/:id', element: page(undefined, (me) => <TutorProfile me={me} />) },
      { path: '/profile', element: page(['student', 'teacher'], (me) => <Profile me={me} />) },
      { path: '/groups', element: page(['student', 'teacher'], () => <Groups />, true) },
      { path: '/groups/:id', element: page(['student', 'teacher'], () => <Group />, true) },
      { path: '/lab', element: page(undefined, (me) => <Lab me={me} />) },
      { path: '/tutor', element: page(['teacher'], (me) => <TutorHome me={me} />) },
      { path: '/tutor/sessions', element: page(['teacher'], () => <TutorSessions />, true) },
      { path: '/tutor/schedule', element: page(['teacher'], (me) => <TutorSchedule me={me} />, true) },
      { path: '/tutor/reviews', element: page(['teacher'], () => <TutorReviews />, true) },
      { path: '/progress', element: page(['parent'], () => <ParentProgress />) },
      { path: '/admin', element: page(['admin'], () => <AdminOverview />) },
      { path: '/admin/applications', element: page(['admin'], () => <AdminApplications />) },
      { path: '/admin/tutors', element: page(['admin'], () => <AdminTutors />) },
      { path: '/admin/accounts', element: page(['admin'], () => <AdminAccounts />) },
      { path: '/admin/payments', element: page(['admin'], () => <AdminPayments />) },
      { path: '/admin/feedback', element: page(['admin'], () => <AdminFeedback />) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

