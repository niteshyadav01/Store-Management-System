import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMaster,
  getPurchaseRequests,
  createPurchaseRequest,
  updatePurchaseRequest,
  deletePurchaseRequest,
  setPurchaseRequestStatus,
} from "../api/api";
import { useAuth } from "../context/AuthContext";
import { formatNum, todayStr } from "../utils/helpers";

const CREATOR_ROLES = ["admin", "inward", "outward", "manager"];
const APPROVER_ROLES = ["admin", "purchase"];

const STATUS_LABEL = {
  pending: "Pending",
  approved: "Approved",
  partial: "Partially Ordered",
  rejected: "Rejected",
  ordered: "Ordered",
  received: "Received",
};
const STATUS_TABS = [
  "all",
  "pending",
  "approved",
  "partial",
  "ordered",
  "received",
  "rejected",
];

const emptyItem = () => ({
  _key: Math.random().toString(36).slice(2),
  name: "",
  type: "",
  code: "",
  category: "",
  uom: "",
  qty: "",
  remarks: "",
});

export default function PurchaseRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = CREATOR_ROLES.includes(user?.role);
  const canReview = APPROVER_ROLES.includes(user?.role);

  const [master, setMaster] = useState([]);
  const [requests, setRequests] = useState([]);

  const [date, setDate] = useState(todayStr());
  const [projectName, setProjectName] = useState("");
  const [requestFrom, setRequestFrom] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const [remarks, setRemarks] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [msg, setMsg] = useState({ text: "", ok: true });
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    const [m, r] = await Promise.all([getMaster(), getPurchaseRequests()]);
    setMaster(m);
    setRequests(r);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setDate(todayStr());
    setProjectName("");
    setRequestFrom("");
    setItems([emptyItem()]);
    setRemarks("");
    setEditingId(null);
  }

  function updateItem(key, patch) {
    setItems((list) =>
      list.map((it) => (it._key === key ? { ...it, ...patch } : it)),
    );
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
  function addItemRow() {
    setItems((list) => [...list, emptyItem()]);
  }
  function removeItemRow(key) {
    setItems((list) =>
      list.length > 1 ? list.filter((it) => it._key !== key) : list,
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: "", ok: true });
    const valid = items.filter((it) => it.name && parseFloat(it.qty) > 0);
    if (!valid.length) {
      setMsg({
        text: "Add at least one item with a material and quantity.",
        ok: false,
      });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        date,
        projectName,
        requestFrom,
        remarks,
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
    setProjectName(pr.projectName || "");
    setRequestFrom(pr.requestFrom || "");
    setRemarks(pr.remarks || "");
    setItems(
      pr.items.map((it) => ({
        ...it,
        _key: Math.random().toString(36).slice(2),
        qty: String(it.qty),
      })),
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCancel(pr) {
    if (
      !window.confirm(`Cancel request ${pr.prNumber}? This cannot be undone.`)
    )
      return;
    try {
      await deletePurchaseRequest(pr._id);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleApprove(pr) {
    try {
      await setPurchaseRequestStatus(pr._id, { status: "approved" });
      load();
    } catch (err) {
      alert(err.message);
    }
  }
  async function handleReject(pr) {
    const note = window.prompt(
      "Reason for rejecting this request (optional):",
      "",
    );
    if (note === null) return;
    try {
      await setPurchaseRequestStatus(pr._id, { status: "rejected", note });
      load();
    } catch (err) {
      alert(err.message);
    }
  }
  async function handleReceive(pr) {
    if (!window.confirm(`Mark ${pr.prNumber} as received?`)) return;
    try {
      await setPurchaseRequestStatus(pr._id, { status: "received" });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  const visible =
    statusFilter === "all"
      ? requests
      : requests.filter((r) => r.status === statusFilter);

  return (
    <>
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Purchase Requests</h2>
          <p>
            {canReview
              ? "Review requests raised by the store team and move them through to receiving."
              : "Raise a request for materials that need to be purchased."}
          </p>
        </div>
      </div>

      {canCreate && (
        <div className="card">
          <h3>{editingId ? `Edit request` : "New purchase request"}</h3>
          <form onSubmit={handleSubmit}>
            <div className="formgrid">
              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Site A, Phase 2"
                />
              </div>
              <div className="field">
                <label>Request From</label>
                <input
                  type="text"
                  value={requestFrom}
                  onChange={(e) => setRequestFrom(e.target.value)}
                  placeholder="e.g. Civil Dept, Mr. Sharma"
                />
              </div>
            </div>

            <div className="tablewrap itemtable" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>Material</th>
                    <th>Type</th>
                    <th>Code</th>
                    <th>Category</th>
                    <th>UOM</th>
                    <th style={{ width: 100 }}>Qty</th>
                    <th style={{ minWidth: 160 }}>Item remarks</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it._key}>
                      <td>
                        <select
                          value={it.name}
                          onChange={(e) =>
                            autofillItem(it._key, e.target.value)
                          }
                        >
                          <option value="">— Select material —</option>
                          {master.map((m) => (
                            <option key={m._id} value={m.name}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {it.type || (
                          <span style={{ color: "var(--text-3)" }}>—</span>
                        )}
                      </td>
                      <td className="mono">{it.code || "—"}</td>
                      <td>{it.category || "—"}</td>
                      <td>{it.uom || "—"}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={it.qty}
                          onChange={(e) =>
                            updateItem(it._key, { qty: e.target.value })
                          }
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <input
                          value={it.remarks}
                          onChange={(e) =>
                            updateItem(it._key, { remarks: e.target.value })
                          }
                          placeholder="Optional"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-del btn-sm itemtable-row-remove"
                          onClick={() => removeItemRow(it._key)}
                          disabled={items.length === 1}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="actionrow">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={addItemRow}
              >
                + Add item
              </button>
            </div>

            <div className="field full" style={{ marginTop: 16 }}>
              <label>Overall remarks</label>
              <textarea
                rows="2"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Reason for this request, project, urgency, etc."
              />
            </div>

            <div className="actionrow">
              <button className="btn btn-in" type="submit" disabled={loading}>
                {loading
                  ? "Saving…"
                  : editingId
                    ? "Update request"
                    : "Submit request"}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={resetForm}
                >
                  Cancel edit
                </button>
              )}
              {msg.text && (
                <span className={`msg ${msg.ok ? "ok" : "err"}`}>
                  {msg.text}
                </span>
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

        <div
          style={{
            marginTop: -6,
            marginBottom: 14,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "nowrap",
              paddingBottom: 2,
            }}
          >
            {STATUS_TABS.map((s) => (
              <button
                key={s}
                type="button"
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
                return (
                  <React.Fragment key={pr._id}>
                    <tr
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        setExpanded((x) => (x === pr._id ? null : pr._id))
                      }
                    >
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {pr.prNumber}
                      </td>
                      <td>{pr.date}</td>
                      <td>
                        {pr.projectName || (
                          <span style={{ color: "var(--text-3)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {pr.requestFrom || (
                          <span style={{ color: "var(--text-3)" }}>—</span>
                        )}
                      </td>
                      <td>{pr.requestedByName}</td>
                      <td>{pr.items.length}</td>
                      <td>
                        <span className={`tag ${pr.status}`}>
                          {STATUS_LABEL[pr.status]}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div
                          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                        >
                          {pr.status === "pending" &&
                            (isOwner || user?.role === "admin") && (
                              <>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  onClick={() => startEdit(pr)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn-del btn-sm"
                                  onClick={() => handleCancel(pr)}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          {canReview && pr.status === "pending" && (
                            <>
                              <button
                                className="btn btn-sm btn-in"
                                onClick={() => handleApprove(pr)}
                              >
                                Approve
                              </button>
                              <button
                                className="btn-del btn-sm"
                                onClick={() => handleReject(pr)}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {canReview &&
                            (pr.status === "approved" ||
                              pr.status === "partial") && (
                              <button
                                className="btn btn-sm btn-in"
                                onClick={() => navigate(`/purchase-orders`)}
                              >
                                Create PO
                              </button>
                            )}
                          {canReview && pr.status === "ordered" && (
                            <button
                              className="btn btn-sm btn-in"
                              onClick={() => handleReceive(pr)}
                            >
                              Mark received
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expanded === pr._id && (
                      <tr>
                        <td
                          colSpan={8}
                          style={{ background: "var(--paper-dim)" }}
                        >
                          <div style={{ padding: "14px 6px" }}>
                            <div
                              className="tablewrap"
                              style={{ marginBottom: 12 }}
                            >
                              <table>
                                <thead>
                                  <tr>
                                    <th>Material</th>
                                    <th>Code</th>
                                    <th>Category</th>
                                    <th>UOM</th>
                                    <th className="num">Qty</th>
                                    <th>Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pr.items.map((it, i) => (
                                    <tr key={i}>
                                      <td>{it.name}</td>
                                      <td className="mono">{it.code || "—"}</td>
                                      <td>{it.category || "—"}</td>
                                      <td>{it.uom || "—"}</td>
                                      <td className="num">
                                        {formatNum(it.qty)}
                                      </td>
                                      <td>{it.remarks || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {pr.remarks && (
                              <p style={{ fontSize: 12.5, marginBottom: 8 }}>
                                <strong>Remarks:</strong> {pr.remarks}
                              </p>
                            )}
                            {(pr.projectName || pr.requestFrom) && (
                              <p style={{ fontSize: 12.5, marginBottom: 8 }}>
                                {pr.projectName && (
                                  <>
                                    <strong>Project Name:</strong>{" "}
                                    {pr.projectName}&nbsp;&nbsp;
                                  </>
                                )}
                                {pr.requestFrom && (
                                  <>
                                    <strong>Request From:</strong>{" "}
                                    {pr.requestFrom}
                                  </>
                                )}
                              </p>
                            )}
                            {pr.status === "rejected" && pr.rejectReason && (
                              <p
                                style={{
                                  fontSize: 12.5,
                                  marginBottom: 8,
                                  color: "var(--red)",
                                }}
                              >
                                <strong>Rejection reason:</strong>{" "}
                                {pr.rejectReason}
                              </p>
                            )}
                            {(pr.poNumber || pr.vendor) && (
                              <p style={{ fontSize: 12.5, marginBottom: 8 }}>
                                <strong>PO number:</strong> {pr.poNumber || "—"}{" "}
                                &nbsp;&nbsp;
                                <strong>Vendor:</strong> {pr.vendor || "—"}
                              </p>
                            )}

                            <div
                              style={{
                                fontSize: 11.5,
                                color: "#8a8270",
                                lineHeight: 1.7,
                              }}
                            >
                              {pr.history.map((h, i) => (
                                <div key={i}>
                                  • {STATUS_LABEL[h.status]} by {h.byName} —{" "}
                                  {new Date(h.at).toLocaleString("en-IN")}
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
            No purchase requests
            {statusFilter !== "all"
              ? ` with status "${STATUS_LABEL[statusFilter]}"`
              : ""}
            .
            {canCreate && (
              <p>Use the form above to raise your first request.</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
