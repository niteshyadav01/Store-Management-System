import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../utils/helpers';

const NAV_ITEMS = [
  { num:'01', label:'Master list',    path:'/master',  roles:['admin'] },
  { num:'02', label:'Inward entry',   path:'/inward',  roles:['admin','inward'] },
  { num:'03', label:'Outward entry',  path:'/outward', roles:['admin','outward'] },
  { num:'04', label:'Price entry',    path:'/price',   roles:['admin','purchase'] },
  { num:'05', label:'Stock overview', path:'/stock',   roles:['admin','purchase','inward','outward','viewer'] },
  { num:'06', label:'Users',          path:'/users',   roles:['admin'] },
  { num:'07', label:'Reports',        path:'/reports', roles:['admin','purchase'] },
];

const BoxIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  function handleHomeClick() {
    const role = user?.role;
    const path = role === 'inward' ? '/inward' : role === 'outward' ? '/outward' : '/stock';
    navigate(path);
  }

  const visibleItems = NAV_ITEMS.filter(i => i.roles.includes(user?.role));
  const currentPage  = visibleItems.find(i => i.path === location.pathname)?.label || 'Stock Management System';
  const initials     = (user?.name || user?.username || 'U').slice(0,2).toUpperCase();

  return (
    <>
      {/* Mobile topbar */}
      <div className="topbar">
        <button className="nav-toggle" onClick={() => setOpen(v => !v)} aria-label="Open menu">
          {open ? '✕' : '☰'}
        </button>
        <span className="topbar-title">{currentPage}</span>
        <span className="topbar-user">{user?.name || user?.username}</span>
      </div>

      <div className={`nav-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      <div className="shell">
        <nav className={`nav${open ? ' open' : ''}`}>
          {/* Brand */}
          <div className="brand">
            <div className="brand-text">
              <div
                className="brand-logo-row"
                onClick={handleHomeClick}
                style={{ cursor: 'pointer' }}
                title="Go to home"
              >
                <div className="brand-icon" style={{ background: 'none', boxShadow: 'none' }}>
                  <img
                    src="https://www.profile-solution.com/wp-content/uploads/2023/10/favicon-removebg-preview.png"
                    alt="Logo"
                    width="30"
                    height="30"
                    style={{ objectFit: 'contain' }}
                  />
                </div>
                <span className="brand-name">MATERIAL LEDGER</span>
              </div>
            </div>
            <button className="nav-toggle" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>

          {/* Nav links */}
          <ul className="navlist">
            {visibleItems.map(item => (
              <li key={item.path}>
                <NavLink to={item.path} className={({ isActive }) => isActive ? 'active' : undefined}>
                  <span className="num">{item.num}</span>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* User bar */}
          <div className="userbar">
            <div className="userbar-inner">
              <div className="userbar-avatar">{initials}</div>
              <div>
                <span className="uname">{user?.name || user?.username}</span>
                <span className="urole">{ROLE_LABELS[user?.role] || user?.role}</span>
              </div>
            </div>
            <button className="logout" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </nav>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </>
  );
}