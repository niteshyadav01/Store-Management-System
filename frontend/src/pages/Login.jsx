import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as apiLogin } from '../api/api';

export default function Login() {
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const [form, setForm]     = useState({ username:'', password:'' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiLogin(form.username, form.password);
      login(data.user, data.token);
      const role = data.user.role;
const path = role === 'inward' ? '/inward' : role === 'outward' ? '/outward' : '/stock';
navigate(path, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
      {/* Logo */}
<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #eee' }}>
  <img 
    src="https://www.profile-solution.com/wp-content/uploads/PS-Logo-1-e1771321686738.png" 
    alt="Profile Solutions Logo"
    height="36"
    style={{ objectFit: 'contain', flexShrink: 0 }}
  />
  <div style={{ borderLeft: '1px solid #ddd', paddingLeft: 10 }}>
    <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: '#1a1a1a' }}>
      Stock Management System
    </div>
    {/* <div style={{ fontWeight: 400, fontSize: 11, letterSpacing: 0.5, color: '#888', textTransform: 'uppercase' }}>
      Material Ledger System
    </div> */}
  </div>
</div>
        <h1>Welcome back</h1>
        <p className="sub">Sign in to your account</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Username</label>
            <input
              type="text" autoComplete="username" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="Enter username"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password" autoComplete="current-password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Enter password"
            />
          </div>

          {error && (
            <div className="alert err" style={{ marginBottom: 14 }}>
              <span>⚠</span> {error}
            </div>
          )}

          <button className="btn-login" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* <div className="login-hint">
          First time setup: sign in with username <strong>admin</strong> and password <strong>admin123</strong>, then update your credentials in Users.
        </div> */}
      </div>
    </div>
  );
}
