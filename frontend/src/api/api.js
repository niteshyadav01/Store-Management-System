import axios from "axios";

// ── Base URL logic ────────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/+$/, "")}/api`
  : "/api";

const client = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor — always attach JWT if present ────────────────────────
client.interceptors.request.use(
  (cfg) => {
    const token = localStorage.getItem("sy_token");
    if (token) {
      cfg.headers = cfg.headers || {};
      cfg.headers["Authorization"] = `Bearer ${token}`;
    }
    return cfg;
  },
  (err) => Promise.reject(err),
);

// ── Response interceptor — unwrap data, handle 401 globally ──────────────────
client.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status;
    const message = err.response?.data?.error || err.message;

    // Token expired or invalid → clear storage and reload to login
    if (status === 401) {
      localStorage.removeItem("sy_token");
      localStorage.removeItem("sy_user");
      // Only redirect if not already on login page
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(new Error(message));
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (username, password) =>
  client.post("/auth/login", { username, password });

// ── Master list ───────────────────────────────────────────────────────────────
// ── Master list ───────────────────────────────────────────────────────────────
export const getMaster = () => client.get("/master");
export const addMaterial = (data) => client.post("/master", data);
export const updateMaterial = (id, data) => client.put(`/master/${id}`, data);
export const bulkMaster = (materials) =>
  client.post("/master/bulk", { materials });
export const deleteMaterial = (id) => client.delete(`/master/${id}`);

// ── Inward ────────────────────────────────────────────────────────────────────
export const getInward = () => client.get("/inward");
export const addInward = (data) => client.post("/inward", data);
export const bulkInward = (entries) => client.post("/inward/bulk", { entries });
export const updatePrice = (id, price) =>
  client.patch(`/inward/${id}`, { price });
export const updateInward = (id, data) => client.put(`/inward/${id}`, data);
export const deleteInward = (id) => client.delete(`/inward/${id}`);

// ── Outward ───────────────────────────────────────────────────────────────────
export const getOutward = () => client.get("/outward");
export const addOutward = (data) => client.post("/outward", data);
export const bulkOutward = (entries) =>
  client.post("/outward/bulk", { entries });
export const updateOutward = (id, data) => client.put(`/outward/${id}`, data);
export const deleteOutward = (id) => client.delete(`/outward/${id}`);

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUsers = () => client.get("/users");
export const saveUser = (data) => client.post("/users", data);
export const deleteUser = (username) => client.delete(`/users/${username}`);
export const recordUserPassword = (username, plainPassword) =>
  client.patch(`/users/${username}/password`, { plainPassword });

// ── Purchase requests ────────────────────────────────────────────────────────
export const getPurchaseRequests = () => client.get("/purchase-requests");
export const createPurchaseRequest = (data) =>
  client.post("/purchase-requests", data);
export const updatePurchaseRequest = (id, data) =>
  client.put(`/purchase-requests/${id}`, data);
export const deletePurchaseRequest = (id) =>
  client.delete(`/purchase-requests/${id}`);
export const setPurchaseRequestStatus = (id, data) =>
  client.patch(`/purchase-requests/${id}/status`, data);
export const savePrItemPrices = (id, items) =>
  client.patch(`/purchase-requests/${id}/item-prices`, { items });

// ── Purchase orders ──────────────────────────────────────────────────────────
export const getPONextNumber = () => client.get("/purchase-orders/next-number");

export const getPurchaseOrders = () => client.get("/purchase-orders");

export const getPurchaseOrdersByPR = (prId) => client.get(`/purchase-orders?prId=${prId}`);

export const getPurchaseOrderByNumber = (poNumber) =>
  client.get(`/purchase-orders/by-number/${encodeURIComponent(poNumber)}`);

export const getPendingInwardPOs = () => client.get("/purchase-orders/pending-inward");

export const getPoMatching = () => client.get("/purchase-orders/po-matching");

export const createPurchaseOrder = (data) => client.post("/purchase-orders", data);

export const updatePurchaseOrder = (id, data) => client.patch(`/purchase-orders/${id}`, data);

export const deletePurchaseOrder = (id) => client.delete(`/purchase-orders/${id}`);

export const getPurchaseOrderActivity = (id) => client.get(`/purchase-orders/${id}/activity`);