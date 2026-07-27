import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  getMaster,
  getPurchaseRequests,
  createPurchaseRequest,
  updatePurchaseRequest,
  deletePurchaseRequest,
  setPurchaseRequestStatus,
  getInward,
  getOutward,
} from "../api/api";
import { useAuth } from "../context/AuthContext";
import { formatNum, todayStr } from "../utils/helpers";

const CREATOR_ROLES  = ["admin", "store", "store_manager"];
const APPROVER_ROLES = ["admin", "store_manager"];

const STATUS_LABEL = {
  pending: "Pending",
  approved: "Approved",
  partial: "Partially Ordered",
  rejected: "Rejected",
  ordered: "Ordered",
  received: "Received",
};
const STATUS_TABS = [
  "all", "pending", "approved", "partial", "ordered", "received", "rejected",
];

const emptyItem = () => ({
  _key: Math.random().toString(36).slice(2),
  name: "", type: "", code: "", category: "", uom: "", qty: "", projectName: "", remarks: "",
});

// ── Searchable select component (portal-based, never clipped) ─────────────────
function SearchSelect({ options, value, onChange, placeholder }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef();
  const panelRef = useRef();

  useEffect(() => {
    function handler(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < 220 ? rect.top - 220 : rect.bottom + 2;
      setPos({ top, left: rect.left, width: rect.width });
    }
  }, [open]);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  function select(val) {
    onChange(val);
    setSearch('');
    setOpen(false);
  }

  return (
    <>
      <input
        ref={inputRef}
        value={open ? search : (value || '')}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        placeholder={placeholder || '— Search —'}
        autoComplete="off"
        style={{
          width: '100%', padding: '6px 10px', fontSize: 13,
          border: '1.5px solid var(--line)', borderRadius: 'var(--radius)',
          fontFamily: 'Poppins, sans-serif', background: '#fff', color: 'var(--ink)',
        }}
      />
      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: pos.top, left: pos.left, width: pos.width,
            zIndex: 99999,
            background: '#fff', border: '1px solid var(--line)',
            borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.15)',
            maxHeight: 220, overflowY: 'auto',
          }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#8a8270' }}>No results</div>
          )}
          {filtered.map(o => (
            <div
              key={o}
              onMouseDown={() => select(o)}
              style={{
                padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                background: o === value ? 'var(--teal-light)' : '#fff',
                color: o === value ? 'var(--teal-dark)' : 'var(--ink)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-dim)'}
              onMouseLeave={e => e.currentTarget.style.background = o === value ? 'var(--teal-light)' : '#fff'}
            >
              {o}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

export default function PurchaseRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = CREATOR_ROLES.includes(user?.role);
  const canReview = APPROVER_ROLES.includes(user?.role);

  const [master, setMaster] = useState([]);
  const [requests, setRequests] = useState([]);

  const [date, setDate] = useState(todayStr());
  const [requestFrom, setRequestFrom] = useState("");
  const [projectName, setProjectName] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const [editingId, setEditingId] = useState(null);

  const [msg, setMsg] = useState({ text: "", ok: true });
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const [stockMap, setStockMap] = useState({});

  const load = useCallback(async () => {
    const [m, r, inw, out] = await Promise.all([
      getMaster(), getPurchaseRequests(), getInward(), getOutward(),
    ]);
    setMaster(m);
    setRequests(r);
    // Build balance map: inward - outward per material
    const inTotals = {}, outTotals = {};
    (Array.isArray(inw) ? inw : (inw?.entries ?? [])).forEach(e => {
      inTotals[e.name] = (inTotals[e.name] || 0) + (parseFloat(e.qty) || 0);
    });
    (Array.isArray(out) ? out : (out?.entries ?? [])).forEach(e => {
      outTotals[e.name] = (outTotals[e.name] || 0) + (parseFloat(e.qty) || 0);
    });
    const map = {};
    m.forEach(mat => { map[mat.name] = (inTotals[mat.name] || 0) - (outTotals[mat.name] || 0); });
    setStockMap(map);
  }, []);
  useEffect(() => { load(); }, [load]);

  const uniqueTypes = [...new Set(master.map(m => m.type).filter(Boolean))].sort();
  const uniqueCodes = [...new Set(master.map(m => m.code).filter(Boolean))].sort();
  const uniqueCategories = [...new Set(master.map(m => m.category).filter(Boolean))].sort();

  function resetForm() {
    setDate(todayStr());
    setRequestFrom("");
    setProjectName("");
    setItems([emptyItem()]);
    setEditingId(null);
  }

  function updateItem(key, patch) {
    setItems((list) => list.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  }

  function autofillItem(key, name) {
    const m = master.find((x) => x.name === name);
    updateItem(key, {
      name,
      type: m?.type || "",
      code: m?.code || "",
      category: m?.category || "",
      uom: m?.uom || "",
    });
  }

  function autofillFromType(key, type) {
    updateItem(key, { type, name: '', code: '', category: '', uom: '' });
  }

  function autofillFromCode(key, code) {
    const m = master.find(x => x.code === code);
    updateItem(key, { code, ...(m ? { name: m.name, type: m.type, category: m.category, uom: m.uom } : {}) });
  }

  function autofillFromCategory(key, category) {
    updateItem(key, { category, name: '', code: '', uom: '' });
  }

  function addItemRow() {
    setItems((list) => [...list, emptyItem()]);
  }

  function removeItemRow(key) {
    setItems((list) => list.length > 1 ? list.filter((it) => it._key !== key) : list);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: "", ok: true });
    const valid = items.filter((it) => it.name && parseFloat(it.qty) > 0);
    if (!valid.length) {
      setMsg({ text: "Add at least one item with a material and quantity.", ok: false });
      return;
    }
    setLoading(true);
    try {
      const uniqueProjectNames = [...new Set(valid.map((it) => it.projectName).filter(Boolean))];
      const payload = {
        date, requestFrom,
        projectName: projectName || uniqueProjectNames.join(", "),
        items: valid.map((it) => ({ ...it, qty: parseFloat(it.qty) })),
      };
      if (editingId) {
        await updatePurchaseRequest(editingId, payload);
        setMsg({ text: "Purchase request updated.", ok: true });
      } else {
        await createPurchaseRequest(payload);
        setMsg({ text: "Purchase request submitted.", ok: true });
      }
      resetForm();
      load();
      setTimeout(() => setMsg({ text: "", ok: true }), 4000);
    } catch (err) {
      setMsg({ text: "Error: " + err.message, ok: false });
    } finally {
      setLoading(false);
    }
  }

  function startEdit(pr) {
    setEditingId(pr._id);
    setDate(pr.date);
    setRequestFrom(pr.requestFrom || "");
    setProjectName(pr.projectName || "");
    setItems(
      pr.items.map((it) => ({
        ...it,
        _key: Math.random().toString(36).slice(2),
        qty: String(it.qty),
        projectName: it.projectName || pr.projectName || "",
      }))
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCancel(pr) {
    if (!window.confirm(`Cancel request ${pr.prNumber}? This cannot be undone.`)) return;
    try {
      await deletePurchaseRequest(pr._id);
      load();
    } catch (err) { alert(err.message); }
  }

  async function handleApprove(pr) {
    try {
      await setPurchaseRequestStatus(pr._id, { status: "approved" });
      load();
    } catch (err) { alert(err.message); }
  }

  async function handleReject(pr) {
    const note = window.prompt("Reason for rejecting this request (optional):", "");
    if (note === null) return;
    try {
      await setPurchaseRequestStatus(pr._id, { status: "rejected", note });
      load();
    } catch (err) { alert(err.message); }
  }

  async function handleReceive(pr) {
    if (!window.confirm(`Mark ${pr.prNumber} as received?`)) return;
    try {
      await setPurchaseRequestStatus(pr._id, { status: "received" });
      load();
    } catch (err) { alert(err.message); }
  }

  const visible =
    statusFilter === "all"
      ? requests
      : requests.filter((r) => r.status === statusFilter);

  return (
    <>
      {/* Responsive layout overrides — scoped to this page */}
      <style>{`
        .pr-formgrid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px 14px;
        }
        .pr-formgrid .field { min-width: 0; }
        .pr-formgrid .field input,
        .pr-formgrid .field select {
          width: 100%;
          box-sizing: border-box;
        }

        .tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

        .actionrow { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }

        @media (max-width: 900px) {
          .pr-formgrid { grid-template-columns: 1fr 1fr; }
        }

        @media (max-width: 600px) {
          .pagehead { flex-direction: column; align-items: flex-start; gap: 8px; }
          .card { padding: 12px; }
          .itemtable table { min-width: 1050px; }
          .actionrow { flex-direction: column; align-items: stretch; }
          .actionrow .btn { width: 100%; }
          .pr-formgrid { grid-template-columns: 1fr; }
        }

        @media (max-width: 420px) {
          .card h3 { font-size: 15px; }
          .pagehead-text h2 { font-size: 18px; }
        }
      `}</style>

      <div className="pagehead">
        <div className="pagehead-text">
          <h2>PR Requests</h2>
          <p>
            {canReview
              ? "Review requests raised by the store team and move them through to receiving."
              : "Raise a request for materials that need to be purchased."}
          </p>
        </div>
      </div>

      {canCreate && (
        <div className="card">
          <h3>{editingId ? "Edit request" : "New purchase request"}</h3>
          <form onSubmit={handleSubmit}>
            <div className="pr-formgrid">
              <div className="field">
                <label>Date</label>
                <input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Request From</label>
                <input
                  type="text" value={requestFrom}
                  onChange={(e) => setRequestFrom(e.target.value)}
                  placeholder="e.g. Civil Dept, Mr. Sharma"
                />
              </div>
              <div className="field">
                <label>Project Name</label>
                <input
                  type="text" value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Thailand - Damac & Stock"
                />
              </div>
            </div>

            <div className="tablewrap itemtable" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Material</th>
                    <th style={{ minWidth: 160 }}>Type</th>
                    <th style={{ minWidth: 180 }}>Code</th>
                    <th style={{ minWidth: 180 }}>Category</th>
                    <th>UOM</th>
                    <th style={{ width: 100 }}>Qty</th>
                    <th style={{ minWidth: 160 }}>Project Name</th>
                    <th style={{ minWidth: 160 }}>Item remarks</th>
                    <th style={{ minWidth: 100 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    // For each field, filter master by ALL OTHER selected fields
                    const byAll = master
                      .filter(m => (!it.type || m.type === it.type))
                      .filter(m => (!it.category || m.category === it.category))
                      .filter(m => (!it.code || m.code === it.code))
                      .filter(m => (!it.name || m.name === it.name));

                    // Name options — filter by type + category + code
                    const nameOptions = [...new Set(
                      master
                        .filter(m => (!it.type || m.type === it.type))
                        .filter(m => (!it.category || m.category === it.category))
                        .filter(m => (!it.code || m.code === it.code))
                        .map(m => m.name).filter(Boolean)
                    )].sort();

                    // Type options — filter by name + category + code
                    const typeOptions = [...new Set(
                      master
                        .filter(m => (!it.name || m.name === it.name))
                        .filter(m => (!it.category || m.category === it.category))
                        .filter(m => (!it.code || m.code === it.code))
                        .map(m => m.type).filter(Boolean)
                    )].sort();

                    // Category options — filter by name + type + code
                    const categoryOptions = [...new Set(
                      master
                        .filter(m => (!it.name || m.name === it.name))
                        .filter(m => (!it.type || m.type === it.type))
                        .filter(m => (!it.code || m.code === it.code))
                        .map(m => m.category).filter(Boolean)
                    )].sort();

                    // Code options — filter by name + type + category
                    const codeOptions = [...new Set(
                      master
                        .filter(m => (!it.name || m.name === it.name))
                        .filter(m => (!it.type || m.type === it.type))
                        .filter(m => (!it.category || m.category === it.category))
                        .map(m => m.code).filter(Boolean)
                    )].sort();

                    return (
                      <tr key={it._key}>
                        <td>
                          <SearchSelect
                            options={nameOptions}
                            value={it.name}
                            onChange={(val) => {
                              const m = master.find(x => x.name === val);
                              updateItem(it._key, {
                                name: val,
                                type: m?.type || '',
                                code: m?.code || '',
                                category: m?.category || '',
                                uom: m?.uom || '',
                              });
                            }}
                            placeholder="— Search material —"
                          />
                        </td>
                        <td>
                          <SearchSelect
                            options={typeOptions}
                            value={it.type}
                            onChange={(val) => {
                              updateItem(it._key, {
                                type: val,
                                // only clear fields not consistent with new type
                                name: it.name && master.find(m => m.name === it.name && m.type === val) ? it.name : '',
                                code: it.code && master.find(m => m.code === it.code && m.type === val) ? it.code : '',
                                category: it.category && master.find(m => m.category === it.category && m.type === val) ? it.category : '',
                                uom: '',
                              });
                            }}
                            placeholder="— Search type —"
                          />
                        </td>
                        <td>
                          <SearchSelect
                            options={codeOptions}
                            value={it.code}
                            onChange={(val) => {
                              const m = master.find(x => x.code === val);
                              updateItem(it._key, {
                                code: val,
                                name: m?.name || '',
                                type: m?.type || '',
                                category: m?.category || '',
                                uom: m?.uom || '',
                              });
                            }}
                            placeholder="— Search code —"
                          />
                        </td>
                        <td>
                          <SearchSelect
                            options={categoryOptions}
                            value={it.category}
                            onChange={(val) => {
                              updateItem(it._key, {
                                category: val,
                                // only clear fields not consistent with new category
                                name: it.name && master.find(m => m.name === it.name && m.category === val) ? it.name : '',
                                code: it.code && master.find(m => m.code === it.code && m.category === val) ? it.code : '',
                                type: it.type && master.find(m => m.type === it.type && m.category === val) ? it.type : '',
                                uom: '',
                              });
                            }}
                            placeholder="— Search category —"
                          />
                        </td>
                        <td>{it.uom || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                        <td>
                          <input
                            type="number" min="0" step="any"
                            value={it.qty}
                            onChange={(e) => updateItem(it._key, { qty: e.target.value })}
                            placeholder="0"
                          />
                        </td>
                        <td>
                          <input
                            value={it.projectName}
                            onChange={(e) => updateItem(it._key, { projectName: e.target.value })}
                            placeholder="e.g. Site A, Phase 2"
                          />
                        </td>
                        <td>
                          <input
                            value={it.remarks}
                            onChange={(e) => updateItem(it._key, { remarks: e.target.value })}
                            placeholder="Optional"
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="Clear filters for this row"
                              onClick={() => updateItem(it._key, {
                                name: '', type: '', code: '', category: '', uom: ''
                              })}
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              className="btn-del btn-sm itemtable-row-remove"
                              onClick={() => removeItemRow(it._key)}
                              disabled={items.length === 1}
                            >✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="actionrow">
              <button type="button" className="btn btn-ghost" onClick={addItemRow}>
                + Add item
              </button>
            </div>

            <div className="actionrow" style={{ marginTop: 16 }}>
              <button className="btn btn-in" type="submit" disabled={loading}>
                {loading ? "Saving…" : editingId ? "Update request" : "Submit request"}
              </button>
              {editingId && (
                <button type="button" className="btn btn-ghost" onClick={resetForm}>
                  Cancel edit
                </button>
              )}
              {msg.text && (
                <span className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</span>
              )}
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>
          {canReview ? "All requests" : "My requests"}{" "}
          <span className="pill-count">{visible.length}</span>
        </h3>

        <div style={{ marginTop: -6, marginBottom: 14, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", paddingBottom: 2 }}>
            {STATUS_TABS.map((s) => (
              <button
                key={s} type="button"
                className={`btn btn-sm ${statusFilter === s ? "btn-in" : "btn-ghost"}`}
                onClick={() => setStatusFilter(s)}
                style={{ flexShrink: 0 }}
              >
                {s === "all" ? "All" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>PR No</th>
                <th>Date</th>
                <th>Project Name</th>
                <th>Request From</th>
                <th>Requested by</th>
                <th>Items</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((pr) => {
                const isOwner = pr.requestedByUsername === user?.username;
                const canEditThis = isOwner || user?.role === "admin" || user?.role === "store_manager";
                return (
                  <React.Fragment key={pr._id}>
                    <tr
                      style={{ cursor: "pointer" }}
                      onClick={() => setExpanded((x) => (x === pr._id ? null : pr._id))}
                    >
                      <td className="mono" style={{ fontWeight: 600 }}>{pr.prNumber}</td>
                      <td>{pr.date}</td>
                      <td>{pr.projectName || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                      <td>{pr.requestFrom || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                      <td>{pr.requestedByName}</td>
                      <td>{pr.items.length}</td>
                      <td>
                        <span className={`tag ${pr.status}`}>{STATUS_LABEL[pr.status]}</span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {pr.status === "pending" && canEditThis && (
                            <>
                              <button className="btn btn-sm btn-ghost" onClick={() => startEdit(pr)}>Edit</button>
                              <button className="btn-del btn-sm" onClick={() => handleCancel(pr)}>Cancel</button>
                            </>
                          )}
                          {canReview && pr.status === "pending" && (
                            <>
                              <button className="btn btn-sm btn-in" onClick={() => handleApprove(pr)}>Approve</button>
                              <button className="btn-del btn-sm" onClick={() => handleReject(pr)}>Reject</button>
                            </>
                          )}
                          {canReview && (pr.status === "approved" || pr.status === "partial") && (user?.role === 'admin' || user?.role === 'purchase') && (
                            <button className="btn btn-sm btn-in" onClick={() => navigate("/purchase-orders")}>Create PO</button>
                          )}
                          {canReview && pr.status === "ordered" && (
                            <button className="btn btn-sm btn-in" onClick={() => handleReceive(pr)}>Mark received</button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expanded === pr._id && (
                      <tr>
                        <td colSpan={8} style={{ background: "var(--paper-dim)" }}>
                          <div style={{ padding: "14px 6px" }}>
                            <div className="tablewrap" style={{ marginBottom: 12 }}>
                              <table>
                                <thead>
                                  <tr>
                                    <th>Material</th>
                                    <th>Code</th>
                                    <th>Category</th>
                                    <th>UOM</th>
                                    <th className="num">Requested Qty</th>
                                    <th className="num">Current Stock</th>
                                    <th>Project Name</th>
                                    <th>Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pr.items.map((it, i) => {
                                    const stock = stockMap[it.name] ?? null;
                                    const isLow = stock !== null && stock < it.qty;
                                    return (
                                      <tr key={i}>
                                        <td>{it.name}</td>
                                        <td className="mono">{it.code || "—"}</td>
                                        <td>{it.category || "—"}</td>
                                        <td>{it.uom || "—"}</td>
                                        <td className="num">{formatNum(it.qty)}</td>
                                        <td className="num">
                                          {stock !== null ? (
                                            <strong style={{ color: stock <= 0 ? 'var(--red)' : isLow ? 'var(--amber)' : 'var(--teal-dark)' }}>
                                              {formatNum(stock)}
                                            </strong>
                                          ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                                        </td>
                                        <td>{it.projectName || pr.projectName || "—"}</td>
                                        <td>{it.remarks || "—"}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {pr.requestFrom && (
                              <p style={{ fontSize: 12.5, marginBottom: 8 }}>
                                <strong>Request From:</strong> {pr.requestFrom}
                              </p>
                            )}
                            {pr.status === "rejected" && pr.rejectReason && (
                              <p style={{ fontSize: 12.5, marginBottom: 8, color: "var(--red)" }}>
                                <strong>Rejection reason:</strong> {pr.rejectReason}
                              </p>
                            )}
                            {(pr.poNumber || pr.vendor) && (
                              <p style={{ fontSize: 12.5, marginBottom: 8 }}>
                                <strong>PO number:</strong> {pr.poNumber || "—"}&nbsp;&nbsp;
                                <strong>Vendor:</strong> {pr.vendor || "—"}
                              </p>
                            )}
                            <div style={{ fontSize: 11.5, color: "#8a8270", lineHeight: 1.7 }}>
                              {pr.history.map((h, i) => (
                                <div key={i}>
                                  • {STATUS_LABEL[h.status]} by {h.byName} — {new Date(h.at).toLocaleString("en-IN")}
                                  {h.note ? ` — ${h.note}` : ""}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {!visible.length && (
          <div className="empty">
            No purchase requests{statusFilter !== "all" ? ` with status "${STATUS_LABEL[statusFilter]}"` : ""}.
            {canCreate && <p>Use the form above to raise your first request.</p>}
          </div>
        )}
      </div>
    </>
  );
}