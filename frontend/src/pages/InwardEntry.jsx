import React, { useState, useEffect, useCallback } from 'react';
import { getMaster, getInward, addInward, bulkInward, updateInward, deleteInward, getPendingInwardPOs, getPurchaseOrderByNumber } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { formatNum, todayStr, readSheetFile, pickCol, parseExcelDate, exportXlsx } from '../utils/helpers';

const EMPTY = {
  date: todayStr(), invdate: '', challan: '', po: '', vendor: '',
  name: '', type: '', code: '', category: '', uom: '',
  qty: '', by: '', location: '', remarks: '', price: ''
};

/* ── Inline Edit Modal ───────────────────────────────────────────────── */
function EditModal({ entry, master, canSeePrice, onSave, onClose }) {
  const [form, setForm] = useState({
    date: entry.date || '',
    invdate: entry.invdate || '',
    challan: entry.challan || '',
    po: entry.po || '',
    vendor: entry.vendor || '',
    name: entry.name || '',
    type: entry.type || '',
    code: entry.code || '',
    category: entry.category || '',
    uom: entry.uom || '',
    qty: entry.qty || '',
    by: entry.by || '',
    location: entry.location || '',
    remarks: entry.remarks || '',
    price: entry.price || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function autofill(name) {
    const m = master.find(x => x.name === name);
    setForm(f => ({ ...f, name, type: m?.type || '', code: m?.code || '', category: m?.category || '', uom: m?.uom || '' }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr('');
    if (!form.name) { setErr('Please select a material.'); return; }
    if (!form.qty || parseFloat(form.qty) <= 0) { setErr('Enter a valid quantity.'); return; }
    setSaving(true);
    try {
      await onSave(entry._id, { ...form, qty: parseFloat(form.qty), price: parseFloat(form.price) || 0 });
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>

        {/* Header — fixed */}
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Edit Inward Entry</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={styles.modalBody}>
            <div className="formgrid">
              <div className="field">
                <label>Entry date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="field">
                <label>Invoice date</label>
                <input type="date" value={form.invdate} onChange={e => setForm(f => ({ ...f, invdate: e.target.value }))} />
              </div>
              <div className="field">
                <label>Challan / Invoice no</label>
                <input value={form.challan} onChange={e => setForm(f => ({ ...f, challan: e.target.value }))} placeholder="e.g. INV-1023" />
              </div>
              <div className="field">
                <label>PO no</label>
                <input value={form.po} onChange={e => setForm(f => ({ ...f, po: e.target.value }))} placeholder="e.g. PO-4456" />
              </div>
              <div className="field full">
                <label>Vendor name</label>
                <input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="e.g. ABC Vendors Pvt. Ltd." />
              </div>
              <div className="field full">
                <label>Material description <span style={{ color: 'var(--red)' }}>*</span></label>
                <select value={form.name} onChange={e => autofill(e.target.value)}>
                  <option value="">— Select material —</option>
                  {master.map(m => <option key={m._id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div className="field code"><label>Material type</label><input readOnly value={form.type} /></div>
              <div className="field code"><label>Material code</label><input readOnly value={form.code} /></div>
              <div className="field"><label>Category</label><input readOnly value={form.category} /></div>
              <div className="field"><label>UOM</label><input readOnly value={form.uom} /></div>
              <div className="field">
                <label>Received qty <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="number" min="0" step="any" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="0" />
              </div>
              <div className="field">
                <label>Received by</label>
                <input value={form.by} onChange={e => setForm(f => ({ ...f, by: e.target.value }))} placeholder="Your name" />
              </div>
              <div className="field">
                <label>Storage location</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Warehouse A / Rack 3" />
              </div>
              <div className="field">
                <label>Remarks</label>
                <input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional notes" />
              </div>
              {canSeePrice && (
                <div className="field full" style={{ borderTop: '1px dashed var(--line)', paddingTop: 14, marginTop: 4 }}>
                  <label>Unit price <span style={{ fontWeight: 400, color: '#8a8270', marginLeft: 6 }}>(purchase team only)</span></label>
                  <input type="number" min="0" step="any" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
                </div>
              )}
            </div>
            {err && <div className="alert err" style={{ marginTop: 14 }}>{err}</div>}
          </div>

          {/* Footer — fixed */}
          <div style={styles.modalFooter}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-in" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

/* ── Modal styles ────────────────────────────────────────────────────── */
const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(28,26,22,0.55)',
    backdropFilter: 'blur(3px)',
    zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
    overflowY: 'auto',          // overlay itself scrolls on very small screens
  },
  modal: {
    background: 'var(--card)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    width: '100%',
    maxWidth: '760px',
    height: 'min(90vh, 700px)',  // fixed height — body scrolls inside this
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',          // clip children; body handles its own scroll
    flexShrink: 0,               // prevent overlay flexbox from squishing it
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 28px',
    borderBottom: '1px solid var(--line)',
    flexShrink: 0,               // never compress header
  },
  modalTitle: { fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 18, color: '#8a8270', padding: '4px 8px',
    borderRadius: '4px', lineHeight: 1,
  },
  modalBody: {
    padding: '24px 28px',
    overflowY: 'auto',           // THIS is the only scrolling element
    flex: 1,
    minHeight: 0,                // critical — lets flex child shrink and scroll
  },
  modalFooter: {
    display: 'flex', gap: 10, justifyContent: 'flex-end',
    padding: '16px 28px',
    borderTop: '1px solid var(--line)',
    flexShrink: 0,               // never compress footer
    background: 'var(--paper-dim)',
  },
};

/* ── Main component ──────────────────────────────────────────────────── */
export default function InwardEntry() {
  const { user } = useAuth();
  const canSeePrice  = user?.role === 'admin' || user?.role === 'purchase';
  const canEditDelete = user?.role === 'admin' || user?.role === 'inward';

  const [master,    setMaster]    = useState([]);
  const [entries,   setEntries]   = useState([]);
  const [poList,    setPoList]    = useState([]);
  const [form,      setForm]      = useState(EMPTY);
  const [msg,       setMsg]       = useState({ text: '', ok: true });
  const [bulkMsg,   setBulkMsg]   = useState({ text: '', ok: true });
  const [loading,   setLoading]   = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [poManual, setPoManual] = useState(false); // true when user chose "Enter manually"
  const [poRows,    setPoRows]    = useState([]);
  const [poLoading, setPoLoading] = useState(false);

  const load = useCallback(async () => {
    const [m, e, pos] = await Promise.all([getMaster(), getInward(), getPendingInwardPOs()]);
    setMaster(m); setEntries(e); setPoList(pos);
  }, []);
  useEffect(() => { load(); }, [load]);

  // When PO is selected, fetch it and build per-item rows
  async function handlePoSelect(poNumber) {
    setForm(f => ({ ...f, po: poNumber, vendor: '' }));
    setPoRows([]);
    setPoManual(false);
    if (!poNumber) return;
    setPoLoading(true);
    try {
      const po = await getPurchaseOrderByNumber(poNumber);
      setForm(f => ({ ...f, vendor: po.vendorName || '' }));
      const rows = (po.items || []).map(it => {
        const mat = master.find(m => m.name === it.name || m.code === it.code);
        return {
          _key:     Math.random().toString(36).slice(2),
          name:     it.name,
          type:     mat?.type     || '',
          code:     it.code       || mat?.code     || '',
          category: it.category   || mat?.category || '',
          uom:      it.uom        || mat?.uom      || '',
          poQty:    it.orderedQty,
          price:    it.price      || 0,
          qty:      String(it.orderedQty),
          location: '',
          remarks:  '',
        };
      });
      setPoRows(rows);
    } catch (err) {
      // PO not found in system — allow manual entry with this PO number
      setPoRows([]);
    } finally { setPoLoading(false); }
  }

  function updatePoRow(key, patch) {
    setPoRows(list => list.map(r => r._key === key ? { ...r, ...patch } : r));
  }

  function autofill(name) {
    const m = master.find(x => x.name === name);
    setForm(f => ({ ...f, name, type: m?.type || '', code: m?.code || '', category: m?.category || '', uom: m?.uom || '' }));
  }

  /* ── Add new entry ─── */
  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: '', ok: true });

    if (form.po && poRows.length > 0) {
      // PO mode — save one inward entry per row
      const invalid = poRows.find(r => !r.qty || parseFloat(r.qty) <= 0);
      if (invalid) { setMsg({ text: `"${invalid.name}": enter a valid received qty.`, ok: false }); return; }
      setLoading(true);
      try {
        const batch = poRows.map(r => ({
          date: form.date, invdate: form.invdate, challan: form.challan,
          po: form.po, vendor: form.vendor,
          name: r.name, type: r.type, code: r.code, category: r.category, uom: r.uom,
          qty: parseFloat(r.qty),
          by: form.by, location: r.location, remarks: r.remarks,
          price: canSeePrice ? (parseFloat(r.price) || 0) : 0,
        }));
        await bulkInward(batch);
        setMsg({ text: `✓ ${batch.length} inward entr${batch.length === 1 ? 'y' : 'ies'} saved from ${form.po}.`, ok: true });
        setForm({ ...EMPTY, date: form.date });
        setPoRows([]);
        load();
        setTimeout(() => setMsg({ text: '', ok: true }), 5000);
      } catch (err) { setMsg({ text: 'Error: ' + err.message, ok: false }); }
      finally { setLoading(false); }
    } else {
      // Manual mode
      if (!form.name) { setMsg({ text: 'Please select a material.', ok: false }); return; }
      if (!form.qty || parseFloat(form.qty) <= 0) { setMsg({ text: 'Enter a valid received quantity.', ok: false }); return; }
      setLoading(true);
      try {
        await addInward({ ...form, qty: parseFloat(form.qty), price: parseFloat(form.price) || 0 });
        setMsg({ text: 'Inward entry saved successfully.', ok: true });
        setForm({ ...EMPTY, date: todayStr() });
        load();
        setTimeout(() => setMsg({ text: '', ok: true }), 4000);
      } catch (err) { setMsg({ text: 'Error: ' + err.message, ok: false }); }
      finally { setLoading(false); }
    }
  }

  /* ── Save edited entry ─── */
  async function handleEditSave(id, data) {
    await updateInward(id, data);
    setEditEntry(null);
    load();
  }

  /* ── Delete entry ─── */
  async function handleDelete(e) {
    if (!window.confirm(`Delete this inward entry for "${e.name}" (Qty: ${e.qty})?\n\nThis will affect the stock balance.`)) return;
    try {
      await deleteInward(e._id);
      load();
    } catch (err) { alert('Error: ' + err.message); }
  }

  /* ── Bulk upload ─── */
  async function handleBulk(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBulkMsg({ text: 'Reading file…', ok: true });
    try {
      const rows = await readSheetFile(file);
      if (!rows.length) { setBulkMsg({ text: 'Sheet is empty.', ok: false }); return; }
      const today = todayStr();
      const batch = []; let skipped = 0;
      for (const row of rows) {
        const matName = pickCol(row, ['materialname', 'material', 'name', 'materialdescription', 'description']);
        if (!matName) { skipped++; continue; }
        const m = master.find(x => x.name.toLowerCase() === matName.toLowerCase());
        if (!m) { skipped++; continue; }
        const qty = parseFloat(pickCol(row, ['qty', 'quantity', 'receivedqty', 'receivedquantity']));
        if (!qty || qty <= 0) { skipped++; continue; }
        batch.push({
          date: parseExcelDate(pickCol(row, ['date', 'entrydate'])) || today,
          invdate: parseExcelDate(pickCol(row, ['invoicedate', 'invdate'])),
          challan: pickCol(row, ['challanno', 'invoiceno', 'challan', 'invoice']),
          po: pickCol(row, ['pono', 'po']),
          vendor: pickCol(row, ['vendorname', 'vendor', 'supplier']),
          name: m.name, type: m.type, code: m.code, category: m.category, uom: m.uom,
          qty,
          by: pickCol(row, ['receivedby', 'by']),
          location: pickCol(row, ['location', 'rack', 'warehouse']),
          remarks: pickCol(row, ['remarks', 'notes']),
          price: canSeePrice ? (parseFloat(pickCol(row, ['price', 'rate', 'unitprice'])) || 0) : 0,
        });
      }
      if (!batch.length) { setBulkMsg({ text: `No valid rows found. ${skipped} row(s) skipped.`, ok: false }); return; }
      const res = await bulkInward(batch);
      setBulkMsg({ text: `✓ ${res.inserted} entr${res.inserted === 1 ? 'y' : 'ies'} imported.${skipped ? ` ${skipped} skipped.` : ''}`, ok: true });
      load();
    } catch (err) {
      setBulkMsg({ text: 'Error: ' + err.message, ok: false });
    }
    e.target.value = '';
  }

  function downloadTemplate() {
    exportXlsx(
      ['Date', 'Invoice Date', 'Challan No', 'PO No', 'Vendor Name', 'Material Name', 'Qty', 'Received By', 'Location', 'Remarks', 'Price'],
      [[todayStr(), '', 'INV-1001', 'PO-2001', 'ABC Suppliers', '[Material Name from master]', '10', 'Store Keeper', 'Rack A', '', '500']],
      'Inward Template', 'Stockyard_Inward_Template.xlsx'
    );
  }

  return (
    <>
      {/* Edit modal */}
      {editEntry && (
        <EditModal
          entry={editEntry}
          master={master}
          canSeePrice={canSeePrice}
          onSave={handleEditSave}
          onClose={() => setEditEntry(null)}
        />
      )}

      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Inward Entry</h2>
          <p>Record materials received into stock. Details auto-fill from the master list.</p>
        </div>
      </div>

      {/* Bulk upload */}
      <div className="card">
        <h3>Bulk upload</h3>
        <div className="uploadbox">
          <label htmlFor="inward-bulk">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Choose sheet (.xlsx, .xls, .csv)
          </label>
          <input type="file" id="inward-bulk" accept=".xlsx,.xls,.csv" onChange={handleBulk} />
          <div className="hint">
            Required: <strong>Material Name, Qty</strong> — Optional: Date, Invoice Date, Challan No, PO No, Vendor Name, Received By, Location, Remarks{canSeePrice ? ', Price' : ''}<br />
            <button onClick={downloadTemplate}>Download template</button>
          </div>
          {bulkMsg.text && <div className={`alert ${bulkMsg.ok ? 'ok' : 'err'}`} style={{ marginTop: 14, textAlign: 'left' }}>{bulkMsg.text}</div>}
        </div>
      </div>

      {/* New entry form */}
      <div className="card">
        <h3>New inward entry</h3>
        <form onSubmit={handleSubmit}>
          <div className="formgrid">
            <div className="field"><label>Entry date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="field"><label>Invoice date</label><input type="date" value={form.invdate} onChange={e => setForm(f => ({ ...f, invdate: e.target.value }))} /></div>
            <div className="field"><label>Challan / Invoice no</label><input value={form.challan} onChange={e => setForm(f => ({ ...f, challan: e.target.value }))} placeholder="e.g. INV-1023" /></div>

            {/* PO Number — dropdown with fallback to manual text */}
            <div className="field">
              <label>PO Number</label>
              {poManual ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={form.po}
                    onChange={e => setForm(f => ({ ...f, po: e.target.value }))}
                    placeholder="Enter PO number manually"
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={() => { setPoManual(false); setForm(f => ({ ...f, po: '' })); setPoRows([]); }}
                  >
                    ← Back
                  </button>
                </div>
              ) : (
                <select
                  value={form.po}
                  onChange={e => {
                    if (e.target.value === '__manual__') {
                      setPoManual(true);
                      setForm(f => ({ ...f, po: '' }));
                      setPoRows([]);
                    } else {
                      handlePoSelect(e.target.value);
                    }
                  }}
                >
                  <option value="">— Select PO (optional) —</option>
                  {poList.map(po => (
                    <option key={po._id} value={po.poNumber}>
                      {po.poNumber} — {po.vendorName} ({po.remainingItems ?? po.items?.length ?? 0} items pending)
                    </option>
                  ))}
                  <option value="__manual__">✎ Enter PO number manually…</option>
                </select>
              )}
            </div>

            <div className="field full">
              <label>Vendor name</label>
              <input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Auto-filled from PO, or enter manually" />
            </div>
            <div className="field">
              <label>Received by</label>
              <input value={form.by} onChange={e => setForm(f => ({ ...f, by: e.target.value }))} placeholder="Your name" />
            </div>
          </div>

          {/* PO loading indicator */}
          {poLoading && <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '12px 0' }}>Loading PO items…</p>}

          {/* PO Mode — editable items table */}
          {form.po && poRows.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                Materials from {form.po}
                <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 12 }}>
                  Edit received qty, location and remarks per item
                </span>
              </div>
              <div className="tablewrap">
                <table style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th>Material</th><th>Code</th>
                      <th>Category</th><th>UOM</th>
                      <th className="num">PO Qty</th>
                      <th className="num" style={{ minWidth: 90 }}>Recv Qty *</th>
                      {canSeePrice && <th className="num" style={{ minWidth: 90 }}>Unit Price</th>}
                      <th style={{ minWidth: 130 }}>Location</th>
                      <th style={{ minWidth: 130 }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poRows.map(r => (
                      <tr key={r._key}>
                        <td style={{ fontWeight: 500 }}>{r.name}</td>
                        <td className="mono">{r.code || '—'}</td>
                        <td>{r.category || '—'}</td>
                        <td>{r.uom || '—'}</td>
                        <td className="num" style={{ color: 'var(--text-3)' }}>{r.poQty}</td>
                        <td style={tdS}>
                          <input type="number" min="0.0001" step="any" value={r.qty}
                            onChange={e => updatePoRow(r._key, { qty: e.target.value })}
                            style={{ width: 80, textAlign: 'right' }} />
                        </td>
                        {canSeePrice && (
                          <td style={tdS}>
                            <input type="number" min="0" step="any" value={r.price}
                              onChange={e => updatePoRow(r._key, { price: e.target.value })}
                              style={{ width: 80, textAlign: 'right' }} />
                          </td>
                        )}
                        <td style={tdS}>
                          <input value={r.location} onChange={e => updatePoRow(r._key, { location: e.target.value })}
                            placeholder="e.g. Rack A" style={{ width: '100%' }} />
                        </td>
                        <td style={tdS}>
                          <input value={r.remarks} onChange={e => updatePoRow(r._key, { remarks: e.target.value })}
                            placeholder="Optional" style={{ width: '100%' }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Manual Mode — single material row: shown when no PO selected, or PO has no items */}
          {(!form.po || poManual || (!poLoading && poRows.length === 0)) && (
            <div className="formgrid" style={{ marginTop: 8 }}>
              <div className="field full">
                <label>Material description <span style={{ color: 'var(--red)' }}>*</span></label>
                <select value={form.name} onChange={e => autofill(e.target.value)}>
                  <option value="">— Select material —</option>
                  {master.map(m => <option key={m._id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div className="field code"><label>Material type</label><input readOnly value={form.type} placeholder="Auto-filled" /></div>
              <div className="field code"><label>Material code</label><input readOnly value={form.code} placeholder="Auto-filled" /></div>
              <div className="field"><label>Category</label><input readOnly value={form.category} placeholder="Auto-filled" /></div>
              <div className="field"><label>UOM</label><input readOnly value={form.uom} placeholder="Auto-filled" /></div>
              <div className="field">
                <label>Received qty <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="number" min="0" step="any" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="0" />
              </div>
              <div className="field"><label>Storage location</label><input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Warehouse A / Rack 3" /></div>
              <div className="field"><label>Remarks</label><input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional notes" /></div>
              {canSeePrice && (
                <>
                  <hr className="price-divider" />
                  <div className="field full">
                    <label>Unit price <span style={{ fontWeight: 400, color: '#8a8270', marginLeft: 6 }}>(purchase team only)</span></label>
                    <input type="number" min="0" step="any" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
                  </div>
                </>
              )}
            </div>
          )}

          <div className="actionrow" style={{ marginTop: 16 }}>
            <button className="btn btn-in" type="submit" disabled={loading || poLoading}>
              {loading ? 'Saving…' : (form.po && poRows.length > 0)
                ? `Save ${poRows.length} inward entr${poRows.length === 1 ? 'y' : 'ies'}`
                : 'Save inward entry'}
            </button>
            {form.po && (
              <button type="button" className="btn btn-ghost" onClick={() => { handlePoSelect(''); }}>
                Clear PO
              </button>
            )}
            {msg.text && <span className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</span>}
          </div>
        </form>
      </div>

      {/* Entries table */}
      <div className="card">
        <h3>Recent inward entries <span className="pill-count">{entries.length || 0}</span></h3>
        <div className="tablewrap" style={{ overflowX: 'scroll', overflowY: 'scroll', maxHeight: '70vh' }}>
          <table style={{ minWidth: '1700px' }}>
            <thead>
              <tr>
                <th>Date</th><th>Inv date</th><th>Challan / Inv no</th><th>PO no</th>
                <th>Vendor</th><th>Material</th><th>Type</th><th>Code</th>
                <th>Category</th><th>UOM</th><th className="num">Qty</th>
                <th>Received by</th><th>Location</th><th>Remarks</th>
                {canSeePrice && <th className="num">Price</th>}
                {canEditDelete && <th style={{ minWidth: 100 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 100).map(e => (
                <tr key={e._id}>
                  <td>{e.date}</td>
                  <td>{e.invdate || '—'}</td>
                  <td>{e.challan || '—'}</td>
                  <td>{e.po || '—'}</td>
                  <td>{e.vendor || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{e.name}</td>
                  <td>{e.type}</td>
                  <td className="mono">{e.code}</td>
                  <td>{e.category}</td>
                  <td>{e.uom}</td>
                  <td className="num">{formatNum(e.qty)}</td>
                  <td>{e.by || '—'}</td>
                  <td>{e.location || '—'}</td>
                  <td>{e.remarks || '—'}</td>
                  {canSeePrice && <td className="num">{formatNum(e.price)}</td>}
                  {canEditDelete && (
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditEntry(e)}
                          title="Edit this entry"
                        >
                          ✏ Edit
                        </button>
                        <button
                          className="btn-del btn-sm"
                          onClick={() => handleDelete(e)}
                          title="Delete this entry"
                        >
                          🗑 Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!entries.length && <div className="empty">No inward entries yet.<p>Use the form above to record your first receipt.</p></div>}
      </div>
    </>
  );
}

// ── Inline table styles for PO items grid ─────────────────────────────────────
const thS = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11.5, letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: '2px solid var(--line)' };
const tdS = { padding: '7px 10px', verticalAlign: 'middle' };
