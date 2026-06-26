import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import MasterList from './pages/MasterList';
import InwardEntry from './pages/InwardEntry';
import OutwardEntry from './pages/OutwardEntry';
import PriceEntry from './pages/PriceEntry';
import StockOverview from './pages/StockOverview';
import Users from './pages/Users';
import Reports from './pages/Reports';

const ROLE_ACCESS = {
  master:  ['admin'],
  inward:  ['admin','inward','manager'],
  outward: ['admin','outward','manager'],
  price:   ['admin','purchase'],
  stock:   ['admin','purchase','inward','outward','manager','viewer'],
  users:   ['admin'],
  reports: ['admin','purchase'],
};

function getDefaultPath(role) {
  if (role === 'inward')   return '/inward';
  if (role === 'outward')  return '/outward';
  if (role === 'manager')  return '/inward';
  if (role === 'purchase') return '/stock';
  if (role === 'viewer')   return '/stock';
  return '/stock';
}

function ProtectedRoute({ page, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const allowed = ROLE_ACCESS[page] || [];
  if (!allowed.includes(user.role)) {
    const first = Object.entries(ROLE_ACCESS).find(([pg, roles]) => roles.includes(user.role) && pg !== page);
    return <Navigate to={first ? `/${first[0]}` : '/login'} replace />;
  }
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  const defaultPath = user ? getDefaultPath(user.role) : '/login';
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={defaultPath} replace /> : <Login />} />
      <Route element={<Layout />}>
        <Route path="/master"  element={<ProtectedRoute page="master"><MasterList /></ProtectedRoute>} />
        <Route path="/inward"  element={<ProtectedRoute page="inward"><InwardEntry /></ProtectedRoute>} />
        <Route path="/outward" element={<ProtectedRoute page="outward"><OutwardEntry /></ProtectedRoute>} />
        <Route path="/price"   element={<ProtectedRoute page="price"><PriceEntry /></ProtectedRoute>} />
        <Route path="/stock"   element={<ProtectedRoute page="stock"><StockOverview /></ProtectedRoute>} />
        <Route path="/users"   element={<ProtectedRoute page="users"><Users /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute page="reports"><Reports /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}