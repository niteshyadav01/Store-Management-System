import axios from 'axios';

// ── Base URL logic ────────────────────────────────────────────────────────────
// Local dev:   VITE_API_URL is empty → use '/api' so Vite proxy forwards to :5000
// Production:  VITE_API_URL is full URL → use it directly (e.g. https://api.domain.com/api)
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — always attach JWT if present ────────────────────────
client.interceptors.request.use(
  cfg => {
    const token = localStorage.getItem('sy_token');
    if (token) {
      cfg.headers = cfg.headers || {};
      cfg.headers['Authorization'] = `Bearer ${token}`;
    }
    return cfg;
  },
  err => Promise.reject(err)
);

// ── Response interceptor — unwrap data, handle 401 globally ──────────────────
client.interceptors.response.use(
  res => res.data,
  err => {
    const status  = err.response?.status;
    const message = err.response?.data?.error || err.message;

    // Token expired or invalid → clear storage and reload to login
    if (status === 401) {
      localStorage.removeItem('sy_token');
      localStorage.removeItem('sy_user');
      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(new Error(message));
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (username, password) =>
  client.post('/auth/login', { username, password });

// ── Master list ───────────────────────────────────────────────────────────────
export const getMaster      = ()          => client.get('/master');
export const addMaterial    = (data)      => client.post('/master', data);
export const bulkMaster     = (materials) => client.post('/master/bulk', { materials });
export const deleteMaterial = (id)        => client.delete(`/master/${id}`);

// ── Inward ────────────────────────────────────────────────────────────────────
export const getInward      = ()          => client.get('/inward');
export const addInward      = (data)      => client.post('/inward', data);
export const bulkInward     = (entries)   => client.post('/inward/bulk', { entries });
export const updatePrice    = (id, price) => client.patch(`/inward/${id}`, { price });
export const updateInward   = (id, data)  => client.put(`/inward/${id}`, data);
export const deleteInward   = (id)        => client.delete(`/inward/${id}`);

// ── Outward ───────────────────────────────────────────────────────────────────
export const getOutward  = ()        => client.get('/outward');
export const addOutward  = (data)    => client.post('/outward', data);
export const bulkOutward = (entries) => client.post('/outward/bulk', { entries });

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUsers   = ()         => client.get('/users');
export const saveUser   = (data)     => client.post('/users', data);
export const deleteUser = (username) => client.delete(`/users/${username}`);
