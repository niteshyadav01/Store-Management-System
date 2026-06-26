import React, { useState, useEffect, useCallback } from 'react';
import { getUsers, saveUser, deleteUser } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../utils/helpers';

const EMPTY = { name:'', username:'', password:'', role:'viewer' };

const ROLE_COLORS = {
  admin:    { bg:'#e6f2f0', color:'var(--teal-dark)' },
  inward:   { bg:'#eef2ff', color:'#3730a3' },
  outward:  { bg:'#fef3c7', color:'#92400e' },
  purchase: { bg:'#f8ede7', color:'var(--rust-dark)' },
  manager:  { bg:'#f3e8ff', color:'#6b21a8' },
  viewer:   { bg:'var(--paper-dim)', color:'#5a5444' },
};

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [form,  setForm]  = useState(EMPTY);
  const [msg,   setMsg]   = useState({ text:'', ok:true });

  const load = useCallback(async () => {
    try { setUsers(await getUsers()); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text:'', ok:true });
    if (!form.name || !form.username || !form.password) {
      setMsg({ text:'Name, username and password are required.', ok:false }); return;
    }
    try {
      await saveUser(form);
      setMsg({ text:'User saved successfully.', ok:true });
      setForm(EMPTY);
      load();
      setTimeout(() => setMsg({ text:'', ok:true }), 4000);
    } catch (err) { setMsg({ text: err.message, ok:false }); }
  }

  async function handleDelete(username) {
    if (username === currentUser?.username) { alert("You can't remove your own account."); return; }
    if (!window.confirm(`Remove user "${username}"?`)) return;
    try { await deleteUser(username); load(); }
    catch (err) { alert(err.message); }
  }

  const roleStyle = (role) => ROLE_COLORS[role] || ROLE_COLORS.viewer;

  return (
    <>
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Users</h2>
          <p>Manage team access. Each role controls which pages and data a user can see.</p>
        </div>
      </div>

      <div className="card">
        <h3>Add / update user</h3>
        <form onSubmit={handleSubmit}>
          <div className="formgrid">
            <div className="field">
              <label>Display name</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Priya Shah" />
            </div>
            <div className="field">
              <label>Username</label>
              <input value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))} placeholder="e.g. priya" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Set a password" />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                <option value="admin">Admin — full access</option>
                <option value="inward">Inward team</option>
                <option value="outward">Outward team</option>
                <option value="purchase">Purchase team</option>
                <option value="manager">Manager — inward + outward</option>
                <option value="viewer">Viewer — read only</option>
              </select>
            </div>
          </div>
          <div className="actionrow">
            <button className="btn btn-in" type="submit">Save user</button>
            {msg.text && <span className={`msg ${msg.ok?'ok':'err'}`}>{msg.text}</span>}
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Team members <span className="pill-count">{users.length || 0}</span></h3>
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Display name</th><th>Username</th><th>Role</th><th></th></tr>
            </thead>
            <tbody>
              {users.map(u => {
                const rs = roleStyle(u.role);
                return (
                  <tr key={u.username}>
                    <td style={{fontWeight:500}}>{u.name}</td>
                    <td style={{fontFamily:'var(--mono)', fontSize:12.5}}>{u.username}</td>
                    <td>
                      <span className="role-pill" style={{background:rs.bg, color:rs.color, borderColor:'transparent'}}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td>
                      {u.username !== currentUser?.username && (
                        <button className="btn-del btn-sm" onClick={() => handleDelete(u.username)}>Remove</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!users.length && <div className="empty">No users found.</div>}
      </div>
    </>
  );
}