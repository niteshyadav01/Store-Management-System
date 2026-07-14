import React, { useState, useEffect, useCallback } from 'react';
import { getMaster, getOutward, addOutward, bulkOutward } from '../api/api';
import { formatNum, todayStr, readSheetFile, pickCol, parseExcelDate, exportXlsx } from '../utils/helpers';

const EMPTY_HEADER = {
  date: todayStr(), project: '', custpo: '', slip: '', dept: '', recby: '', by: ''
};

const EMPTY_ITEM = { name: '', type: '', code: '', category: '', uom: '', qty: '' };

export default function OutwardEntry() {
  const [master,  setMaster]  = useState([]);
  const [entries, setEntries] = useState([]);
  const [header,  setHeader]  = useState(EMPTY_HEADER);
  const [items,   setItems]   = useState([{ ...EMPTY_ITEM }]);
  const [msg,     setMsg]     = useState({ text: '', ok: true });
  const [bulkMsg, setBulkMsg] = useState({ text: '', ok: true });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [m, e] = await Promise.all([getMaster(), getOutward()]);
    setMaster(m); setEntries(e);
  }, []);
  useEffect(() => { load(); }, [load]);

  function autofillItem(idx, name) {
    const m = master.find(x => x.name === name);
    setItems(list => list.map((it, i) => i === idx
      ? { ...it, name, type: m?.type || '', code: m?.code || '', category: m?.category || '', uom: m?.uom || '' }
      : it
    ));
  }

  function updateItemQty(idx, qty) {
    setItems(list => list.map((it, i) => i === idx ? { ...it, qty } : it));
  }

  function addManualRow() {
    setItems(list => [...list, { ...EMPTY_ITEM }]);
  }

  function removeItemRow(idx) {
    setItems(list => list.length === 1 ? list : list.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: '', ok: true });
    if (!header.project.trim()) { setMsg({ text: 'Please enter a project name.', ok: false }); return; }
    if (!header.custpo.trim() && !header.slip.trim()) { setMsg({ text: 'Enter either Customer PO details or Issue slip no.', ok: false }); return; }
    if (!header.dept.trim()) { setMsg({ text: 'Please enter a department.', ok: false }); return; }
    if (!header.recby.trim()) { setMsg({ text: 'Please enter who received the material.', ok: false }); return; }
    if (!header.by.trim()) { setMsg({ text: 'Please enter who issued the material.', ok: false }); return; }

    const cleanItems = items.filter(it => it.name || it.qty);
    if (!cleanItems.length) { setMsg({ text: 'Please add at least one material.', ok: false }); return; }
    for (const it of cleanItems) {
      if (!it.name) { setMsg({ text: 'Please select a material for every row.', ok: false }); return; }
      if (!it.qty || parseFloat(it.qty) <= 0) { setMsg({ text: `Enter a valid quantity for ${it.name}.`, ok: false }); return; }
    }

    setLoading(true);
    try {
      if (cleanItems.length === 1) {
        await addOutward({ ...header, ...cleanItems[0], qty: parseFloat(cleanItems[0].qty) });
      } else {
        const batch = cleanItems.map(it => ({ ...header, ...it, qty: parseFloat(it.qty) }));
        await bulkOutward(batch);
      }
      setMsg({ text: `Outward entr${cleanItems.length === 1 ? 'y' : 'ies'} saved successfully.`, ok: true });
      setHeader({ ...EMPTY_HEADER, date: todayStr() });
      setItems([{ ...EMPTY_ITEM }]);
      load();
      setTimeout(() => setMsg({ text: '', ok: true }), 4000);
    } catch (err) {
      setMsg({ text: 'Error: ' + err.message, ok: false });
    } finally { setLoading(false); }
  }

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
        const qty = parseFloat(pickCol(row, ['qty', 'quantity', 'issuedqty', 'issuedquantity']));
        if (!qty || qty <= 0) { skipped++; continue; }
        const project = pickCol(row, ['projectname', 'project']);
        if (!project) { skipped++; continue; }
        const custpo = pickCol(row, ['customerpodetails', 'customerpo', 'custpo']);
        const slip   = pickCol(row, ['issueslipno', 'slipno', 'slip']);
        if (!custpo && !slip) { skipped++; continue; }
        const dept  = pickCol(row, ['department', 'dept']);
        const recby = pickCol(row, ['materialreceivedby', 'receivedby', 'recby']);
        const by    = pickCol(row, ['materialissuedby', 'issuedby', 'by']);
        if (!dept || !recby || !by) { skipped++; continue; }
        batch.push({
          date: parseExcelDate(pickCol(row, ['date', 'entrydate', 'issuedate'])) || today,
          project, custpo, slip, dept, recby, by,
          name: m.name, type: m.type, code: m.code, category: m.category, uom: m.uom,
          qty,
        });
      }
      if (!batch.length) { setBulkMsg({ text: `No valid rows found. ${skipped} row(s) skipped.`, ok: false }); return; }
      const res = await bulkOutward(batch);
      setBulkMsg({ text: `✓ ${res.inserted} entr${res.inserted === 1 ? 'y' : 'ies'} imported.${skipped ? ` ${skipped} skipped.` : ''}`, ok: true });
      load();
    } catch (err) {
      setBulkMsg({ text: 'Error: ' + err.message, ok: false });
    }
    e.target.value = '';
  }

  function downloadTemplate() {
    exportXlsx(
      ['Date', 'Project Name', 'Customer PO Details', 'Issue Slip No', 'Department', 'Received By', 'Issued By', 'Material Name', 'Qty'],
      [[todayStr(), 'Project Alpha', 'CPO-3001', 'ISS-0010', 'Production', 'Site Engineer', 'Store Keeper', '[Material Name from master]', '5']],
      'Outward Template', 'Stockyard_Outward_Template.xlsx'
    );
  }

  return (
    <>
      {/* Compact form layout overrides — scoped to this page */}
      <style>{`
        .compact-form .formgrid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px 14px;
        }
        .compact-form .field.full { grid-column: 1 / -1; }
        .compact-form .field { min-width: 0; }
        .compact-form .field label {
          font-size: 12px;
          margin-bottom: 3px;
          display: block;
        }
        .compact-form .field input,
        .compact-form .field select {
          padding: 6px 8px;
          font-size: 13px;
          height: 32px;
          width: 100%;
          box-sizing: border-box;
        }
        .compact-form .readonly-row {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px 14px;
        }
        .compact-form .actionrow {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
        }

        /* Item rows */
        .item-rows { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; margin-top: 4px; }
        .item-rows .btn-ghost.btn-sm { width: auto; align-self: flex-start; }
        .item-row {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr 0.8fr 0.7fr auto;
          gap: 10px;
          align-items: end;
          padding: 10px;
          border: 1px solid var(--line, #e2e2e2);
          border-radius: 8px;
        }
        .item-row .field { min-width: 0; }
        .item-row .field label { font-size: 11px; margin-bottom: 3px; display: block; }
        .item-row .field input,
        .item-row .field select { padding: 6px 8px; font-size: 13px; height: 32px; width: 100%; box-sizing: border-box; }
        .item-row-remove {
          height: 32px; width: 32px; border-radius: 6px; border: 1px solid var(--line, #e2e2e2);
          background: transparent; cursor: pointer; color: var(--red, #c0392b); font-size: 16px; line-height: 1;
          flex-shrink: 0;
        }
        .item-row-remove:disabled { opacity: 0.35; cursor: not-allowed; }

        /* Recent outward entries — taller rows, taller section */
        .entries-section .tablewrap { max-height: 82vh !important; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .entries-section table td,
        .entries-section table th { padding: 16px 14px; }

        /* ---------- Responsive breakpoints ---------- */
        @media (max-width: 1100px) {
          .compact-form .formgrid { grid-template-columns: repeat(3, 1fr); }
          .compact-form .readonly-row { grid-template-columns: repeat(4, 1fr); }
        }

        @media (max-width: 900px) {
          .compact-form .formgrid { grid-template-columns: repeat(2, 1fr); }
          .compact-form .readonly-row { grid-template-columns: repeat(2, 1fr); }
          .item-row { grid-template-columns: repeat(2, 1fr); position: relative; padding-bottom: 40px; }
          .item-row-remove { position: absolute; bottom: 8px; right: 10px; }
        }

        @media (max-width: 600px) {
          .pagehead { flex-direction: column; align-items: flex-start; gap: 8px; }
          .card { padding: 12px; }
          .compact-form .formgrid { grid-template-columns: 1fr; }
          .compact-form .readonly-row { grid-template-columns: repeat(2, 1fr); }
          .item-row { grid-template-columns: 1fr; padding-bottom: 44px; }
          .item-row-remove { bottom: 8px; right: 8px; }
          .actionrow { flex-direction: column; align-items: stretch; }
          .actionrow .btn { width: 100%; }
          .entries-section table { min-width: 900px; }
          .uploadbox { flex-direction: column; align-items: flex-start; }
        }

        @media (max-width: 420px) {
          .compact-form h3, .card h3 { font-size: 15px; }
          .pagehead-text h2 { font-size: 18px; }
        }
      `}</style>

      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Outward Entry</h2>
          <p>Record materials issued out of stock. Details auto-fill from the master list.</p>
        </div>
      </div>

      {/* Bulk upload */}
      <div className="card">
        <h3>Bulk upload</h3>
        <div className="uploadbox">
          <label htmlFor="outward-bulk">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Choose sheet (.xlsx, .xls, .csv)
          </label>
          <input type="file" id="outward-bulk" accept=".xlsx,.xls,.csv" onChange={handleBulk} />
          <div className="hint">
            Required columns: <strong>Project Name, Material Name, Qty, Department, Received By, Issued By</strong>, plus <strong>either</strong> Customer PO Details <strong>or</strong> Issue Slip No — Optional: Date<br />
            Material Name must exactly match an entry in the master list.{' '}
            <button onClick={downloadTemplate}>Download template</button>
          </div>
          {bulkMsg.text && (
            <div className={`alert ${bulkMsg.ok ? 'ok' : 'err'}`} style={{ marginTop: 14, textAlign: 'left' }}>
              {bulkMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* Manual entry form */}
      <div className="card compact-form">
        <h3>New outward entry</h3>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '-6px 0 12px' }}>
          <span style={{ color: 'var(--red)' }}>*</span> required &nbsp;·&nbsp;
          <span style={{ color: 'var(--red)' }}>*†</span> at least one of these two is required
        </p>
        <form onSubmit={handleSubmit}>
          <div className="formgrid">
            <div className="field">
              <label>Issue date</label>
              <input type="date" value={header.date} onChange={e => setHeader(h => ({ ...h, date: e.target.value }))} />
            </div>
            <div className="field">
              <label>Project name <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                required
                value={header.project}
                onChange={e => setHeader(h => ({ ...h, project: e.target.value }))}
                placeholder="e.g. Project Alpha"
              />
            </div>
            <div className="field">
              <label>Customer PO details <span style={{ color: 'var(--red)' }}>*†</span></label>
              <input value={header.custpo} onChange={e => setHeader(h => ({ ...h, custpo: e.target.value }))} placeholder="e.g. CPO-2291" />
            </div>
            <div className="field">
              <label>Issue slip no <span style={{ color: 'var(--red)' }}>*†</span></label>
              <input value={header.slip} onChange={e => setHeader(h => ({ ...h, slip: e.target.value }))} placeholder="e.g. ISS-0087" />
            </div>

            <div className="field">
              <label>Department <span style={{ color: 'var(--red)' }}>*</span></label>
              <input required value={header.dept} onChange={e => setHeader(h => ({ ...h, dept: e.target.value }))} placeholder="e.g. Production" />
            </div>
            <div className="field">
              <label>Material received by <span style={{ color: 'var(--red)' }}>*</span></label>
              <input required value={header.recby} onChange={e => setHeader(h => ({ ...h, recby: e.target.value }))} placeholder="Receiver's name" />
            </div>
            <div className="field">
              <label>Issued by (store) <span style={{ color: 'var(--red)' }}>*</span></label>
              <input required value={header.by} onChange={e => setHeader(h => ({ ...h, by: e.target.value }))} placeholder="Store keeper's name" />
            </div>

            {/* Item rows */}
            <div className="item-rows">
              {items.map((it, idx) => (
                <div className="item-row" key={idx}>
                  <div className="field">
                    <label>Material description <span style={{ color: 'var(--red)' }}>*</span></label>
                    <select value={it.name} onChange={e => autofillItem(idx, e.target.value)}>
                      <option value="">— Select material —</option>
                      {master.map(m => <option key={m._id} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Type</label>
                    <input readOnly value={it.type} placeholder="Auto-filled" />
                  </div>
                  <div className="field">
                    <label>Code</label>
                    <input readOnly value={it.code} placeholder="Auto-filled" />
                  </div>
                  <div className="field">
                    <label>Category</label>
                    <input readOnly value={it.category} placeholder="Auto-filled" />
                  </div>
                  <div className="field">
                    <label>UOM</label>
                    <input readOnly value={it.uom} placeholder="Auto-filled" />
                  </div>
                  <div className="field">
                    <label>Qty <span style={{ color: 'var(--red)' }}>*</span></label>
                    <input
                      type="number" min="0" step="any"
                      value={it.qty}
                      onChange={e => updateItemQty(idx, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <button
                    type="button"
                    className="item-row-remove"
                    onClick={() => removeItemRow(idx)}
                    disabled={items.length === 1}
                    title="Remove item"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={addManualRow} style={{ marginBottom: 8 }}>
                + Add item
              </button>
            </div>
          </div>

          <div className="actionrow">
            <button className="btn btn-out" type="submit" disabled={loading}>
              {loading ? 'Saving…' : `Save outward entr${items.filter(it => it.name || it.qty).length === 1 ? 'y' : 'ies'}`}
            </button>
            {msg.text && <span className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</span>}
          </div>
        </form>
      </div>

      {/* Recent entries table */}
      <div className="card entries-section">
        <h3>Recent outward entries <span className="pill-count">{entries.length || 0}</span></h3>
        <div className="tablewrap" style={{ overflowX: 'scroll', overflowY: 'scroll', maxHeight: '82vh' }}>
          <table style={{ minWidth: '1300px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--paper-dim)' }}>
              <tr>
                <th>Date</th><th>Project</th><th>Customer PO</th><th>Slip no</th>
                <th>Department</th><th>Received by</th><th>Issued by</th>
                <th>Material</th><th>Type</th><th>Code</th>
                <th>Category</th><th>UOM</th><th className="num">Qty</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 100).map(e => (
                <tr key={e._id}>
                  <td>{e.date}</td>
                  <td>{e.project || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td>{e.custpo  || '—'}</td>
                  <td>{e.slip   || '—'}</td>
                  <td>{e.dept   || '—'}</td>
                  <td>{e.recby  || '—'}</td>
                  <td>{e.by     || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{e.name}</td>
                  <td>{e.type}</td>
                  <td className="mono">{e.code}</td>
                  <td>{e.category}</td>
                  <td>{e.uom}</td>
                  <td className="num">{formatNum(e.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!entries.length && (
          <div className="empty">
            No outward entries yet.
            <p>Use the form above to record your first issue.</p>
          </div>
        )}
      </div>
    </>
  );
}