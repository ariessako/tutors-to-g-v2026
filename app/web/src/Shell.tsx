import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import type { Me } from '../../shared/types';
import { api } from './api';
import { ROLE_LABEL } from './labels';
import { Avatar, Icon, useTheme } from './ui';

interface NavItem { to: string; label: string; icon: string; end?: boolean }

const LAB: NavItem = { to: '/lab', label: 'How matching works', icon: 'chart-scatter' };

export function navFor(me: Me): NavItem[] {
  if (me.role === 'student')
    return [
      { to: '/home', label: 'Home', icon: 'house' },
      { to: '/matches', label: 'Matches', icon: 'sparkle' },
      { to: '/sessions', label: 'Sessions', icon: 'calendar-check' },
      { to: '/groups', label: 'Groups', icon: 'users-three' },
      LAB,
    ];
  if (me.role === 'teacher')
    return me.tutor?.appStatus === 'approved'
      ? [
          { to: '/tutor', label: 'Dashboard', icon: 'squares-four', end: true },
          { to: '/tutor/sessions', label: 'Sessions', icon: 'calendar-check' },
          { to: '/tutor/schedule', label: 'Schedule', icon: 'clock' },
          { to: '/tutor/reviews', label: 'Reviews', icon: 'star' },
          { to: '/groups', label: 'Groups', icon: 'users-three' },
          LAB,
        ]
      : [{ to: '/tutor', label: 'Application', icon: 'identification-card', end: true }, LAB];
  if (me.role === 'parent') return [{ to: '/progress', label: 'Progress', icon: 'chart-line-up' }, LAB];
  return [
    { to: '/admin', label: 'Overview', icon: 'squares-four', end: true },
    { to: '/admin/applications', label: 'Applications', icon: 'identification-card' },
    { to: '/admin/tutors', label: 'Tutors', icon: 'database' },
    { to: '/admin/accounts', label: 'Accounts', icon: 'users' },
    { to: '/admin/payments', label: 'Payments', icon: 'receipt' },
    { to: '/admin/feedback', label: 'Feedback', icon: 'chat-circle-text' },
    { ...LAB, label: 'K-means lab' },
  ];
}

export const homePath = (me: Me) => ({ student: '/home', teacher: '/tutor', parent: '/progress', admin: '/admin' })[me.role];

export function Brand({ size = 32, to = '/' }: { size?: number; to?: string }) {
  return (
    <Link to={to} className="brand" aria-label="Tutors To Go home">
      <span className="brand-mark" style={{ width: size, height: size, fontSize: size * 0.56 }}>
        <Icon name="graduation-cap" />
      </span>
      <span className="brand-name" style={{ fontSize: size * 0.6 }}>Tutors To Go</span>
    </Link>
  );
}

export function Shell({ me }: { me: Me }) {
  const theme = useTheme();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener('click', close);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    window.location.assign('/');
  }

  const hasProfile = me.role === 'student' || me.role === 'teacher';
  const items = navFor(me);
  return (
    <>
      <a href="#main" className="visually-hidden">Skip to content</a>
      <header className={`app-header${items.length > 6 ? ' compact' : ''}`}>
        <div className="app-header-inner">
          <Brand to={homePath(me)} />
          <nav className="nav" aria-label="Main">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <Icon name={n.icon} />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <button className="icon-btn" onClick={theme.toggle} title={theme.label} aria-label={theme.label}>
            <Icon name={theme.icon} />
          </button>
          <div style={{ position: 'relative', flex: 'none' }}>
            <button
              className="menu-btn"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={(e) => {
                e.stopPropagation();
                setMenu(!menu);
              }}
            >
              <Avatar name={me.name} size={32} />
              <span className="who" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{me.name}</span>
                <span className="muted" style={{ fontSize: 11 }}>{ROLE_LABEL[me.role]}</span>
              </span>
              <Icon name="caret-down" className="muted" />
            </button>
            {menu && (
              <div className="menu" role="menu" onClick={(e) => e.stopPropagation()}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700 }}>{me.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{me.email}</div>
                </div>
                {hasProfile && (
                  <Link to="/profile" className="menu-item" role="menuitem">
                    <Icon name="user-circle" />
                    My profile
                  </Link>
                )}
                <button className="menu-item" role="menuitem" onClick={theme.toggle}>
                  <Icon name={theme.icon} />
                  {theme.label}
                </button>
                <button className="menu-item bad" role="menuitem" onClick={logout}>
                  <Icon name="sign-out" />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="main">
        <Outlet />
      </main>
    </>
  );
}
