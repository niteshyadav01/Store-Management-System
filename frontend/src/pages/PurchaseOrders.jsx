import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getPurchaseRequests,
  getPurchaseOrdersByPR,
  createPurchaseOrder,
  getPurchaseOrders,
} from "../api/api";
import { useAuth } from "../context/AuthContext";
import { todayStr } from "../utils/helpers";

const STATUS_LABEL = {
  pending: "Pending",
  approved: "Approved",
  partial: "Partially Ordered",
  rejected: "Rejected",
  ordered: "Ordered",
  received: "Received",
};

export default function PurchaseOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [requests, setRequests] = useState([]);
  const [poList, setPoList] = useState([]);

  // ── Form visibility ───────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [selectedPrId, setSelectedPrId] = useState("");
  const [selectedPr, setSelectedPr] = useState(null);
  const [poNumber, setPoNumber] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [poDate, setPoDate] = useState(todayStr());
  const [poExpectedDate, setPoExpectedDate] = useState("");
  const [poItems, setPoItems] = useState([]);
  const [initLoading, setInitLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: true });

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [reqs, pos] = await Promise.all([
      getPurchaseRequests(),
      getPurchaseOrders(),
    ]);
    setRequests(reqs);
    setPoList(pos);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // PRs eligible for PO creation
  const eligiblePRs = requests.filter((r) =>
    ["approved", "partial"].includes(r.status),
  );

  // ── When PR dropdown changes, load items ─────────────────────────────────
  async function handlePrChange(prId) {
    setSelectedPrId(prId);
    setPoItems([]);
    setMsg({ text: "", ok: true });
    if (!prId) {
      setSelectedPr(null);
      return;
    }

    const pr = requests.find((r) => r._id === prId);
    setSelectedPr(pr);
    setInitLoading(true);
    try {
      const existingPOs = await getPurchaseOrdersByPR(prId);

      const alreadyOrdered = {};
      for (const po of existingPOs || [])
        for (const it of po.items || [])
          alreadyOrdered[it.name] =
            (alreadyOrdered[it.name] || 0) + (it.orderedQty || 0);

      const rows = [];
      for (const it of pr.items) {
        const already = alreadyOrdered[it.name] || 0;
        const remaining = Math.max(
          0,
          parseFloat((it.qty - already).toFixed(6)),
        );
        if (remaining <= 0) continue;
        rows.push({
          _key: Math.random().toString(36).slice(2),
          name: it.name,
          code: it.code || "",
          category: it.category || "",
          uom: it.uom || "",
          remarks: it.remarks || "",
          orderedQty: String(remaining),
          price: "",
          maxQty: remaining,
          prQty: it.qty,
          alreadyOrdered: already,
        });
      }
      setPoItems(rows);
    } catch (err) {
      setMsg({ text: "Failed to load PR data: " + err.message, ok: false });
    } finally {
      setInitLoading(false);
    }
  }

  function updatePoItem(key, patch) {
    setPoItems((list) =>
      list.map((it) => (it._key === key ? { ...it, ...patch } : it)),
    );
  }
  function removePoItem(key) {
    setPoItems((list) => list.filter((it) => it._key !== key));
  }

  function resetForm() {
    setShowForm(false);
    setSelectedPrId("");
    setSelectedPr(null);
    setPoNumber("");
    setVendorName("");
    setPoDate(todayStr());
    setPoExpectedDate("");
    setPoItems([]);
    setMsg({ text: "", ok: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (initLoading) return;
    if (!selectedPr) {
      setMsg({ text: "Please select a PR.", ok: false });
      return;
    }
    if (!poNumber.trim()) {
      setMsg({ text: "PO number is required.", ok: false });
      return;
    }
    if (!vendorName.trim()) {
      setMsg({ text: "Vendor name is required.", ok: false });
      return;
    }
    if (!poDate) {
      setMsg({ text: "PO date is required.", ok: false });
      return;
    }
    if (!poItems.length) {
      setMsg({ text: "At least one item is required.", ok: false });
      return;
    }

    for (const it of poItems) {
      const qty = parseFloat(it.orderedQty);
      if (!qty || qty <= 0) {
        setMsg({ text: `"${it.name}": qty must be > 0.`, ok: false });
        return;
      }
      if (qty > it.maxQty + 0.00001) {
        setMsg({
          text: `"${it.name}": qty exceeds remaining (${it.maxQty}).`,
          ok: false,
        });
        return;
      }
    }

    setFormLoading(true);
    try {
      await createPurchaseOrder({
        poNumber: poNumber.trim(),
        prNumber: selectedPr.prNumber,
        prId: selectedPr._id,
        vendorName: vendorName.trim(),
        poDate,
        poExpectedDate,
        items: poItems.map((it) => ({
          name: it.name,
          code: it.code,
          category: it.category,
          uom: it.uom,
          remarks: it.remarks,
          orderedQty: parseFloat(it.orderedQty),
          price: parseFloat(it.price) || 0,
        })),
      });
      setMsg({ text: `✓ ${poNumber} created successfully.`, ok: true });
      await load();
      setTimeout(resetForm, 1500);
    } catch (err) {
      setMsg({ text: "Error: " + err.message, ok: false });
    } finally {
      setFormLoading(false);
    }
  }

  // ── PO list helpers ───────────────────────────────────────────────────────
  const prMap = Object.fromEntries(requests.map((r) => [r.prNumber, r]));

  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Purchase Orders</h2>
          <p>
            Create and manage purchase orders against approved purchase
            requests.
          </p>
        </div>
        {!showForm && (
          <button className="btn btn-in" onClick={() => setShowForm(true)}>
            + Create PO
          </button>
        )}
      </div>

      {/* ── Create PO form ────────────────────────────────────────────────── */}
      {showForm && (
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <h3 style={{ margin: 0 }}>Create Purchase Order</h3>
            <button className="btn btn-ghost btn-sm" onClick={resetForm}>
              ✕ Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* ── Row 1: PR selector + PO number ── */}
            <div
              className="formgrid"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 14,
                marginBottom: 4,
              }}
            >
              <div className="field" style={{ gridColumn: "1 / 3" }}>
                <label>
                  Select Purchase Request{" "}
                  <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <select
                  value={selectedPrId}
                  onChange={(e) => handlePrChange(e.target.value)}
                >
                  <option value="">— Select PR —</option>
                  {eligiblePRs.map((pr) => (
                    <option key={pr._id} value={pr._id}>
                      {pr.prNumber} — {pr.date}
                      {pr.projectName ? ` · ${pr.projectName}` : ""}
                      {pr.requestFrom ? ` · From: ${pr.requestFrom}` : ""} (
                      {pr.items.length} item{pr.items.length !== 1 ? "s" : ""}){" "}
                      [{STATUS_LABEL[pr.status]}]
                    </option>
                  ))}
                </select>
                {eligiblePRs.length === 0 && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--red)",
                      margin: "4px 0 0",
                    }}
                  >
                    No approved or partially ordered PRs available.
                  </p>
                )}
              </div>

              <div className="field">
                <label>
                  PO Number <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="Enter PO number"
                  style={{ fontWeight: 700 }}
                />
              </div>

              <div className="field">
                <label>
                  Vendor Name <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="e.g. ABC Suppliers Pvt. Ltd."
                />
              </div>

              <div className="field">
                <label>
                  PO Date <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <input
                  type="date"
                  value={poDate}
                  min={todayStr()}
                  onChange={(e) => setPoDate(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Expected Delivery Date</label>
                <input
                  type="date"
                  value={poExpectedDate}
                  min={poDate || todayStr()}
                  onChange={(e) => setPoExpectedDate(e.target.value)}
                />
              </div>
            </div>

            {/* ── Items table ── */}
            {selectedPr && (
              <>
                <div
                  style={{
                    marginTop: 18,
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <strong style={{ fontSize: 13 }}>
                    Materials from {selectedPr.prNumber}
                  </strong>
                  {selectedPr.projectName && (
                    <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                      Project: {selectedPr.projectName}
                    </span>
                  )}
                  {selectedPr.requestFrom && (
                    <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                      From: {selectedPr.requestFrom}
                    </span>
                  )}
                </div>

                {initLoading ? (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--text-3)",
                      margin: "10px 0",
                    }}
                  >
                    Loading items…
                  </p>
                ) : poItems.length === 0 ? (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--red)",
                      margin: "10px 0",
                    }}
                  >
                    All items in this PR have already been fully ordered.
                  </p>
                ) : (
                  <div style={{ overflowX: "auto", marginBottom: 10 }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 13,
                      }}
                    >
                      <thead>
                        <tr style={{ background: "var(--paper-dim)" }}>
                          {[
                            "Material",
                            "Code",
                            "UOM",
                            "PR Qty",
                            "Already Ordered",
                            "Remaining",
                            "PO Qty *",
                            "Unit Price",
                            "",
                          ].map((h, i) => (
                            <th
                              key={i}
                              style={{
                                padding: "8px 10px",
                                textAlign: i >= 3 && i <= 7 ? "right" : "left",
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: "0.04em",
                                borderBottom: "2px solid var(--line)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {poItems.map((it) => (
                          <tr
                            key={it._key}
                            style={{ borderBottom: "1px solid var(--line)" }}
                          >
                            <td
                              style={{ padding: "7px 10px", fontWeight: 500 }}
                            >
                              {it.name}
                            </td>
                            <td
                              style={{
                                padding: "7px 10px",
                                fontFamily: "monospace",
                                fontSize: 12,
                              }}
                            >
                              {it.code || "—"}
                            </td>
                            <td style={{ padding: "7px 10px" }}>
                              {it.uom || "—"}
                            </td>
                            <td
                              style={{
                                padding: "7px 10px",
                                textAlign: "right",
                                color: "var(--text-3)",
                              }}
                            >
                              {it.prQty}
                            </td>
                            <td
                              style={{
                                padding: "7px 10px",
                                textAlign: "right",
                                color:
                                  it.alreadyOrdered > 0
                                    ? "#2a9d8f"
                                    : "var(--text-3)",
                              }}
                            >
                              {it.alreadyOrdered > 0 ? it.alreadyOrdered : "—"}
                            </td>
                            <td
                              style={{
                                padding: "7px 10px",
                                textAlign: "right",
                                fontWeight: 600,
                              }}
                            >
                              {it.maxQty}
                            </td>
                            <td style={{ padding: "7px 10px" }}>
                              <input
                                type="number"
                                min="0.0001"
                                step="any"
                                max={it.maxQty}
                                value={it.orderedQty}
                                onChange={(e) =>
                                  updatePoItem(it._key, {
                                    orderedQty: e.target.value,
                                  })
                                }
                                style={{ width: 80, textAlign: "right" }}
                              />
                            </td>
                            <td style={{ padding: "7px 10px" }}>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={it.price}
                                onChange={(e) =>
                                  updatePoItem(it._key, {
                                    price: e.target.value,
                                  })
                                }
                                placeholder="0.00"
                                style={{ width: 90, textAlign: "right" }}
                              />
                            </td>
                            <td style={{ padding: "7px 10px" }}>
                              <button
                                type="button"
                                className="btn-del btn-sm"
                                onClick={() => removePoItem(it._key)}
                                title="Skip in this PO"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-3)",
                        marginTop: 6,
                      }}
                    >
                      ✕ skips an item from <em>this PO only</em> — it can be
                      ordered in the next PO.
                    </p>
                  </div>
                )}
              </>
            )}

            {msg.text && (
              <p
                style={{
                  fontSize: 13,
                  color: msg.ok ? "#2a9d8f" : "var(--red)",
                  margin: "10px 0",
                }}
              >
                {msg.text}
              </p>
            )}

            <div className="actionrow" style={{ marginTop: 16 }}>
              <button
                className="btn btn-in"
                type="submit"
                disabled={
                  formLoading ||
                  initLoading ||
                  !selectedPr ||
                  poItems.length === 0
                }
              >
                {formLoading ? "Saving…" : "Save PO"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetForm}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── All POs list ──────────────────────────────────────────────────── */}
      <div className="card">
        <h3>
          All purchase orders{" "}
          <span className="pill-count">{poList.length}</span>
        </h3>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>PO No</th>
                <th>PO Date</th>
                <th>Expected Date</th>
                <th>PR No</th>
                <th>Vendor</th>
                <th>Project</th>
                <th>Items</th>
                <th className="num">Total Value</th>
                <th>Created by</th>
              </tr>
            </thead>
            <tbody>
              {poList.map((po) => {
                const totalValue = (po.items || []).reduce(
                  (s, i) => s + i.orderedQty * (i.price || 0),
                  0,
                );
                const pr = prMap[po.prNumber];
                return (
                  <tr key={po._id}>
                    <td className="mono" style={{ fontWeight: 700 }}>
                      {po.poNumber}
                    </td>
                    <td>{po.poDate}</td>
                    <td>
                      {po.poExpectedDate || (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </td>
                    <td className="mono">{po.prNumber}</td>
                    <td>{po.vendorName}</td>
                    <td>
                      {pr?.projectName || (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </td>
                    <td>{po.items?.length || 0}</td>
                    <td className="num">
                      {totalValue > 0
                        ? totalValue.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })
                        : "—"}
                    </td>
                    <td>{po.createdByName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!poList.length && (
          <div className="empty">
            No purchase orders yet.
            <p>
              Click <strong>+ Create PO</strong> above to raise your first
              order.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
