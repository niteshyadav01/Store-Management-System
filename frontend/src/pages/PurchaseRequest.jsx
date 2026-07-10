import React, { useState, useEffect, useCallback } from 'react';
import {
  getMaster, getPurchaseRequests, createPurchaseRequest,
  updatePurchaseRequest, deletePurchaseRequest, setPurchaseRequestStatus,
  getPONextNumber, createPurchaseOrder, getPurchaseOrdersByPR,
} from '../api/api';
import { useAuth } from '../context/AuthContext';
import { formatNum, todayStr } from '../utils/helpers';

const CREATOR_ROLES  = ['admin', 'inward', 'outward', 'manager'];
const APPROVER_ROLES = ['admin', 'purchase'];

const STATUS_LABEL = {
  pending: 'Pending', approved: 'Approved', partial: 'Partially Ordered',
  rejected: 'Rejected', ordered: 'Ordered', received: 'Received',
};
const STATUS_TABS = ['all', 'pending', 'approved', 'partial', 'ordered', 'received', 'rejected'];

const emptyItem = () => ({
  _key: Math.random().toString(36).slice(2),
  name: '', type: '', code: '', category: '', uom: '', qty: '', remarks: '',
});

export default function PurchaseRequest() {
  const { user } = useAuth();
  const canCreate = CREATOR_ROLES.includes(user?.role);
  const canReview = APPROVER_ROLES.includes(user?.role);

  const [master,   setMaster]   = useState([]);
  const [requests, setRequests] = useState([]);

  const [date,        setDate]        = useState(todayStr());
  const [projectName, setProjectName] = useState('');
  const [requestFrom, setRequestFrom] = useState('');
  const [items,       setItems]       = useState([emptyItem()]);
  const [remarks,     setRemarks]     = useState('');
  const [editingId,   setEditingId]   = useState(null);

  const [msg, setMsg] = useState({ text: '', ok: true });
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  // ── Create PO modal state ─────────────────────────────────────────────────
  const [poModal, setPoModal]       = useState(null);   // PR object or null
  const [poNumber, setPoNumber]     = useState('');
  const [vendorName, setVendorName] = useState('');
  const [poDate, setPoDate]         = useState('');
  const [poLoading, setPoLoading]   = useState(false);
  const [poInitLoading, setPoInitLoading] = useState(false); // loading while fetching existing POs
  const [poMsg, setPoMsg]           = useState({ text: '', ok: true });
  // editable line items for the PO — each has: name,code,category,uom,remarks,orderedQty,maxQty
  const [poItems, setPoItems]       = useState([]);

  const load = useCallback(async () => {
    const [m, r] = await Promise.all([getMaster(), getPurchaseRequests()]);
    setMaster(m); setRequests(r);
  }, []);
  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setDate(todayStr());
    setProjectName('');
    setRequestFrom('');
    setItems([emptyItem()]);
    setRemarks('');
    setEditingId(null);
  }

  function updateItem(key, patch) {
    setItems(list => list.map(it => (it._key === key ? { ...it, ...patch } : it)));
  }
  function autofillItem(key, name) {
    const m = master.find(x => x.name === name);
    updateItem(key, { name, type: m?.type || '', code: m?.code || '', category: m?.category || '', uom: m?.uom || '' });
  }
  function addItemRow()          { setItems(list => [...list, emptyItem()]); }
  function removeItemRow(key)    { setItems(list => (list.length > 1 ? list.filter(it => it._key !== key) : list)); }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: '', ok: true });
    const valid = items.filter(it => it.name && parseFloat(it.qty) > 0);
    if (!valid.length) { setMsg({ text: 'Add at least one item with a material and quantity.', ok: false }); return; }

    setLoading(true);
    try {
      const payload = { date, projectName, requestFrom, remarks, items: valid.map(it => ({ ...it, qty: parseFloat(it.qty) })) };
      if (editingId) {
        await updatePurchaseRequest(editingId, payload);
        setMsg({ text: 'Purchase request updated.', ok: true });
      } else {
        await createPurchaseRequest(payload);
        setMsg({ text: 'Purchase request submitted.', ok: true });
      }
      resetForm();
      load();
      setTimeout(() => setMsg({ text: '', ok: true }), 4000);
    } catch (err) {
      setMsg({ text: 'Error: ' + err.message, ok: false });
    } finally { setLoading(false); }
  }

  function startEdit(pr) {
    setEditingId(pr._id);
    setDate(pr.date);
    setProjectName(pr.projectName || '');
    setRequestFrom(pr.requestFrom || '');
    setRemarks(pr.remarks || '');
    setItems(pr.items.map(it => ({ ...it, _key: Math.random().toString(36).slice(2), qty: String(it.qty) })));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleCancel(pr) {
    if (!window.confirm(`Cancel request ${pr.prNumber}? This cannot be undone.`)) return;
    try { await deletePurchaseRequest(pr._id); load(); }
    catch (err) { alert(err.message); }
  }

  async function handleApprove(pr) {
    try { await setPurchaseRequestStatus(pr._id, { status: 'approved' }); load(); }
    catch (err) { alert(err.message); }
  }
  async function handleReject(pr) {
    const note = window.prompt('Reason for rejecting this request (optional):', '');
    if (note === null) return;
    try { await setPurchaseRequestStatus(pr._id, { status: 'rejected', note }); load(); }
    catch (err) { alert(err.message); }
  }
  async function handleOrder(pr) {
    const poNumber = window.prompt('PO number (optional):', '');
    if (poNumber === null) return;
    const vendor = window.prompt('Vendor name (optional):', '');
    try { await setPurchaseRequestStatus(pr._id, { status: 'ordered', poNumber, vendor }); load(); }
    catch (err) { alert(err.message); }
  }
  async function handleReceive(pr) {
    if (!window.confirm(`Mark ${pr.prNumber} as received?`)) return;
    try { await setPurchaseRequestStatus(pr._id, { status: 'received' }); load(); }
    catch (err) { alert(err.message); }
  }

  async function openPoModal(pr) {
    setPoMsg({ text: '', ok: true });
    setVendorName('');
    setPoDate(todayStr());
    setPoNumber('');
    setPoItems([]);
    setPoInitLoading(true);
    setPoModal(pr);
    try {
      // Fetch next PO number and any existing POs for this PR in parallel
      const [nextNumRes, existingPOs] = await Promise.all([
        getPONextNumber(),
        getPurchaseOrdersByPR(pr._id),
      ]);
      setPoNumber(nextNumRes.poNumber);

      // Sum already-ordered qty per item name across all existing POs for this PR
      const alreadyOrdered = {};
      if (Array.isArray(existingPOs)) {
        for (const po of existingPOs) {
          for (const it of (po.items || [])) {
            alreadyOrdered[it.name] = (alreadyOrdered[it.name] || 0) + (it.orderedQty || 0);
          }
        }
      }

      // Build editable rows for ALL PR items, showing remaining qty
      // Items fully ordered (remaining <= 0) are excluded
      const rows = [];
      for (const it of pr.items) {
        const already   = alreadyOrdered[it.name] || 0;
        const remaining = Math.max(0, parseFloat((it.qty - already).toFixed(6)));
        if (remaining <= 0) continue; // already fully ordered — skip
        rows.push({
          _key:       Math.random().toString(36).slice(2),
          name:       it.name,
          code:       it.code || '',
          category:   it.category || '',
          uom:        it.uom || '',
          remarks:    it.remarks || '',
          orderedQty: String(remaining),  // default = full remaining
          maxQty:     remaining,
          prQty:      it.qty,
          alreadyOrdered: already,
        });
      }

      setPoItems(rows);
    } catch (err) {
      setPoMsg({ text: 'Failed to load PO data: ' + err.message, ok: false });
    } finally {
      setPoInitLoading(false);
    }
  }

  function closePoModal() {
    setPoModal(null);
    setPoNumber('');
    setVendorName('');
    setPoDate('');
    setPoItems([]);
    setPoInitLoading(false);
    setPoMsg({ text: '', ok: true });
  }

  function updatePoItem(key, orderedQty) {
    setPoItems(list => list.map(it => it._key === key ? { ...it, orderedQty } : it));
  }

  function removePoItem(key) {
    setPoItems(list => list.filter(it => it._key !== key));
  }

  async function handlePoSubmit(e) {
    e.preventDefault();
    if (poInitLoading) return; // guard: don't submit while items are still loading
    if (!vendorName.trim()) { setPoMsg({ text: 'Vendor name is required.', ok: false }); return; }
    if (!poDate)            { setPoMsg({ text: 'PO date is required.', ok: false }); return; }
    if (!poItems.length)    { setPoMsg({ text: 'At least one item is required.', ok: false }); return; }

    // Validate each qty
    for (const it of poItems) {
      const qty = parseFloat(it.orderedQty);
      if (!qty || qty <= 0) {
        setPoMsg({ text: `"${it.name}": qty must be greater than 0.`, ok: false }); return;
      }
      if (qty > it.maxQty + 0.00001) {
        setPoMsg({ text: `"${it.name}": qty (${qty}) exceeds remaining (${it.maxQty}).`, ok: false }); return;
      }
    }

    console.log('[PO SUBMIT] sending items:', poItems.length, poItems.map(i => i.name));

    setPoLoading(true);
    try {
      await createPurchaseOrder({
        prNumber:   poModal.prNumber,
        prId:       poModal._id,
        vendorName: vendorName.trim(),
        poDate,
        items: poItems.map(it => ({
          name:       it.name,
          code:       it.code,
          category:   it.category,
          uom:        it.uom,
          remarks:    it.remarks,
          orderedQty: parseFloat(it.orderedQty),
        })),
      });
      load();
      closePoModal();
    } catch (err) {
      setPoMsg({ text: 'Error: ' + err.message, ok: false });
    } finally { setPoLoading(false); }
  }

  const visible = statusFilter === 'all' ? requests : requests.filter(r => r.status === statusFilter);

  return (
    <>
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Purchase Requests</h2>
          <p>{canReview
            ? 'Review requests raised by the store team and move them through to receiving.'
            : 'Raise a request for materials that need to be purchased.'}</p>
        </div>
      </div>

      {canCreate && (
        <div className="card">
          <h3>{editingId ? `Edit request` : 'New purchase request'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="formgrid">
              <div className="field">
                <label>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Project Name</label>
                <input
                  type="text" value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="e.g. Site A, Phase 2"
                />
              </div>
              <div className="field">
                <label>Request From</label>
                <input
                  type="text" value={requestFrom}
                  onChange={e => setRequestFrom(e.target.value)}
                  placeholder="e.g. Civil Dept, Mr. Sharma"
                />
              </div>
            </div>

            <div className="tablewrap itemtable" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>Material</th>
                    <th>Type</th><th>Code</th><th>Category</th><th>UOM</th>
                    <th style={{ width: 100 }}>Qty</th>
                    <th style={{ minWidth: 160 }}>Item remarks</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it._key}>
                      <td>
                        <select value={it.name} onChange={e => autofillItem(it._key, e.target.value)}>
                          <option value="">— Select material —</option>
                          {master.map(m => <option key={m._id} value={m.name}>{m.name}</option>)}
                        </select>
                      </td>
                      <td>{it.type || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td className="mono">{it.code || '—'}</td>
                      <td>{it.category || '—'}</td>
                      <td>{it.uom || '—'}</td>
                      <td>
                        <input
                          type="number" min="0" step="any"
                          value={it.qty}
                          onChange={e => updateItem(it._key, { qty: e.target.value })}
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <input
                          value={it.remarks}
                          onChange={e => updateItem(it._key, { remarks: e.target.value })}
                          placeholder="Optional"
                        />
                      </td>
                      <td>
                        <button type="button" className="btn-del btn-sm itemtable-row-remove"
                          onClick={() => removeItemRow(it._key)} disabled={items.length === 1}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="actionrow">
              <button type="button" className="btn btn-ghost" onClick={addItemRow}>+ Add item</button>
            </div>

            <div className="field full" style={{ marginTop: 16 }}>
              <label>Overall remarks</label>
              <textarea
                rows="2" value={remarks} onChange={e => setRemarks(e.target.value)}
                placeholder="Reason for this request, project, urgency, etc."
              />
            </div>

            <div className="actionrow">
              <button className="btn btn-in" type="submit" disabled={loading}>
                {loading ? 'Saving…' : editingId ? 'Update request' : 'Submit request'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-ghost" onClick={resetForm}>Cancel edit</button>
              )}
              {msg.text && <span className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</span>}
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>
          {canReview ? 'All requests' : 'My requests'} <span className="pill-count">{visible.length}</span>
        </h3>

        <div className="actionrow" style={{ marginTop: -6, marginBottom: 14 }}>
          {STATUS_TABS.map(s => (
            <button
              key={s} type="button"
              className={`btn btn-sm ${statusFilter === s ? 'btn-in' : 'btn-ghost'}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>PR No</th><th>Date</th><th>Project Name</th><th>Request From</th><th>Requested by</th><th>Items</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(pr => {
                const isOwner = pr.requestedByUsername === user?.username;
                return (
                  <React.Fragment key={pr._id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(x => (x === pr._id ? null : pr._id))}>
                      <td className="mono" style={{ fontWeight: 600 }}>{pr.prNumber}</td>
                      <td>{pr.date}</td>
                      <td>{pr.projectName || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td>{pr.requestFrom || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td>{pr.requestedByName}</td>
                      <td>{pr.items.length}</td>
                      <td><span className={`tag ${pr.status}`}>{STATUS_LABEL[pr.status]}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {pr.status === 'pending' && (isOwner || user?.role === 'admin') && (
                            <>
                              <button className="btn btn-sm btn-ghost" onClick={() => startEdit(pr)}>Edit</button>
                              <button className="btn-del btn-sm" onClick={() => handleCancel(pr)}>Cancel</button>
                            </>
                          )}
                          {canReview && pr.status === 'pending' && (
                            <>
                              <button className="btn btn-sm btn-in" onClick={() => handleApprove(pr)}>Approve</button>
                              <button className="btn-del btn-sm" onClick={() => handleReject(pr)}>Reject</button>
                            </>
                          )}
                          {canReview && (pr.status === 'approved' || pr.status === 'partial') && (
                            <button className="btn btn-sm btn-in" onClick={() => openPoModal(pr)}>Create PO</button>
                          )}
                          {canReview && pr.status === 'ordered' && (
                            <button className="btn btn-sm btn-in" onClick={() => handleReceive(pr)}>Mark received</button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expanded === pr._id && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--paper-dim)' }}>
                          <div style={{ padding: '14px 6px' }}>
                            <div className="tablewrap" style={{ marginBottom: 12 }}>
                              <table>
                                <thead>
                                  <tr>
                                    <th>Material</th><th>Code</th><th>Category</th><th>UOM</th>
                                    <th className="num">Qty</th><th>Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pr.items.map((it, i) => (
                                    <tr key={i}>
                                      <td>{it.name}</td>
                                      <td className="mono">{it.code || '—'}</td>
                                      <td>{it.category || '—'}</td>
                                      <td>{it.uom || '—'}</td>
                                      <td className="num">{formatNum(it.qty)}</td>
                                      <td>{it.remarks || '—'}</td>
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
                                {pr.projectName && <><strong>Project Name:</strong> {pr.projectName}&nbsp;&nbsp;</>}
                                {pr.requestFrom && <><strong>Request From:</strong> {pr.requestFrom}</>}
                              </p>
                            )}
                            {pr.status === 'rejected' && pr.rejectReason && (
                              <p style={{ fontSize: 12.5, marginBottom: 8, color: 'var(--red)' }}>
                                <strong>Rejection reason:</strong> {pr.rejectReason}
                              </p>
                            )}
                            {(pr.poNumber || pr.vendor) && (
                              <p style={{ fontSize: 12.5, marginBottom: 8 }}>
                                <strong>PO number:</strong> {pr.poNumber || '—'} &nbsp;&nbsp;
                                <strong>Vendor:</strong> {pr.vendor || '—'}
                              </p>
                            )}

                            <div style={{ fontSize: 11.5, color: '#8a8270', lineHeight: 1.7 }}>
                              {pr.history.map((h, i) => (
                                <div key={i}>
                                  • {STATUS_LABEL[h.status]} by {h.byName} — {new Date(h.at).toLocaleString('en-IN')}
                                  {h.note ? ` — ${h.note}` : ''}
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
            No purchase requests{statusFilter !== 'all' ? ` with status "${STATUS_LABEL[statusFilter]}"` : ''}.
            {canCreate && <p>Use the form above to raise your first request.</p>}
          </div>
        )}
      </div>

      {/* ── Create PO Modal ───────────────────────────────────────────────── */}
      {poModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={closePoModal}
        >
          <div
            style={{
              background: 'var(--paper)', borderRadius: 10, padding: '28px 32px',
              minWidth: 360, maxWidth: 620, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              maxHeight: '90vh', overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 20 }}>Create Purchase Order</h3>
            <form onSubmit={handlePoSubmit}>
              <div className="formgrid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                <div className="field">
                  <label>PR Number</label>
                  <input type="text" value={poModal.prNumber} readOnly
                    style={{ background: 'var(--paper-dim)', cursor: 'not-allowed' }} />
                </div>

                <div className="field">
                  <label>PO Number</label>
                  <input type="text" value={poNumber} readOnly
                    style={{ background: 'var(--paper-dim)', cursor: 'not-allowed', fontWeight: 600 }} />
                </div>

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Vendor Name <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input
                    type="text" value={vendorName}
                    onChange={e => setVendorName(e.target.value)}
                    placeholder="e.g. ABC Suppliers Pvt. Ltd."
                    autoFocus
                  />
                </div>

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>PO Date <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input type="date" value={poDate} onChange={e => setPoDate(e.target.value)} />
                </div>

              </div>

              {/* Editable items from the linked PR */}
              <div style={{ marginTop: 18, marginBottom: 6, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <strong style={{ fontSize: 13 }}>Materials from {poModal.prNumber}</strong>
                {poModal.projectName && (
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    Project: {poModal.projectName}
                  </span>
                )}
              </div>

              {poInitLoading ? (
                <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 10 }}>Loading items…</p>
              ) : poItems.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 10 }}>
                  All items in this PR have already been fully ordered.
                </p>
              ) : (
                <div className="tablewrap" style={{ marginBottom: 10 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Material</th><th>Code</th><th>UOM</th>
                        <th className="num">PR Qty</th>
                        <th className="num">Already Ordered</th>
                        <th className="num">Remaining</th>
                        <th className="num" style={{ minWidth: 90 }}>PO Qty <span style={{ color: 'var(--red)' }}>*</span></th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {poItems.map(it => (
                        <tr key={it._key}>
                          <td>{it.name}</td>
                          <td className="mono">{it.code || '—'}</td>
                          <td>{it.uom || '—'}</td>
                          <td className="num">{it.prQty}</td>
                          <td className="num" style={{ color: it.alreadyOrdered > 0 ? 'var(--teal, #2a9d8f)' : 'var(--text-3)' }}>
                            {it.alreadyOrdered > 0 ? it.alreadyOrdered : '—'}
                          </td>
                          <td className="num" style={{ fontWeight: 600 }}>{it.maxQty}</td>
                          <td>
                            <input
                              type="number" min="0.0001" step="any"
                              max={it.maxQty}
                              value={it.orderedQty}
                              onChange={e => updatePoItem(it._key, e.target.value)}
                              style={{ width: 80, textAlign: 'right' }}
                            />
                          </td>
                          <td>
                            <button
                              type="button" className="btn-del btn-sm"
                              onClick={() => removePoItem(it._key)}
                              title="Skip this item in this PO"
                            >✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
                    ✕ removes an item from <em>this PO only</em> — it can be ordered in the next PO.
                  </p>
                </div>
              )}

              {poMsg.text && (
                <p style={{ fontSize: 13, color: poMsg.ok ? 'var(--green)' : 'var(--red)', margin: '10px 0 0' }}>
                  {poMsg.text}
                </p>
              )}

              <div className="actionrow" style={{ marginTop: 20 }}>
                <button className="btn btn-in" type="submit" disabled={poLoading || poInitLoading || poItems.length === 0}>
                  {poLoading ? 'Saving…' : 'Save PO'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={closePoModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
