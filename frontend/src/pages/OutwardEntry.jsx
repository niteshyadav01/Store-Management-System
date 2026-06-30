import React, { useState, useEffect, useCallback } from 'react';
import { getMaster, getOutward, addOutward, bulkOutward } from '../api/api';
import { formatNum, todayStr, readSheetFile, pickCol, parseExcelDate, exportXlsx } from '../utils/helpers';

const EMPTY = {
  date: todayStr(), project: '', custpo: '', slip: '', dept: '',
  recby: '', by: '', name: '', type: '', code: '', category: '', uom: '', qty: ''
};

export default function OutwardEntry() {
  const [master,  setMaster]  = useState([]);
  const [entries, setEntries] = useState([]);
  const [form,    setForm]    = useState(EMPTY);
  const [msg,     setMsg]     = useState({ text: '', ok: true });
  const [bulkMsg, setBulkMsg] = useState({ text: '', ok: true });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [m, e] = await Promise.all([getMaster(), getOutward()]);
    setMaster(m); setEntries(e);
  }, []);
  useEffect(() => { load(); }, [load]);

  function autofill(name) {
    const m = master.find(x => x.name === name);
    setForm(f => ({ ...f, name, type: m?.type || '', code: m?.code || '', category: m?.category || '', uom: m?.uom || '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: '', ok: true });
    if (!form.name) { setMsg({ text: 'Please select a material.', ok: false }); return; }
    if (!form.qty || parseFloat(form.qty) <= 0) { setMsg({ text: 'Enter a valid quantity.', ok: false }); return; }
    setLoading(true);
    try {
      await addOutward({ ...form, qty: parseFloat(form.qty) });
      setMsg({ text: 'Outward entry saved successfully.', ok: true });
      setForm({ ...EMPTY, date: todayStr() });
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
        batch.push({
          date:    parseExcelDate(pickCol(row, ['date', 'entrydate', 'issuedate'])) || today,
          project: pickCol(row, ['projectname', 'project']),
          custpo:  pickCol(row, ['customerpodetails', 'customerpo', 'custpo']),
          slip:    pickCol(row, ['issueslipno', 'slipno', 'slip']),
          dept:    pickCol(row, ['department', 'dept']),
          recby:   pickCol(row, ['materialreceivedby', 'receivedby', 'recby']),
          by:      pickCol(row, ['materialissuedby', 'issuedby', 'by']),
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
            Required columns: <strong>Material Name, Qty</strong> — Optional: Date, Project Name, Customer PO Details, Issue Slip No, Department, Received By, Issued By<br />
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
      <div className="card">
        <h3>New outward entry</h3>
        <form onSubmit={handleSubmit}>
          <div className="formgrid">
            <div className="field">
              <label>Issue date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="field">
              <label>Project name</label>
              <input value={form.project} onChange={e => setForm(f => ({ ...f, project: e.target.value }))} placeholder="e.g. Project Alpha" />
            </div>

            <div className="field full">
              <label>Customer PO details</label>
              <input value={form.custpo} onChange={e => setForm(f => ({ ...f, custpo: e.target.value }))} placeholder="e.g. CPO-2291" />
            </div>

            <div className="field">
              <label>Issue slip no</label>
              <input value={form.slip} onChange={e => setForm(f => ({ ...f, slip: e.target.value }))} placeholder="e.g. ISS-0087" />
            </div>
            <div className="field">
              <label>Department</label>
              <input value={form.dept} onChange={e => setForm(f => ({ ...f, dept: e.target.value }))} placeholder="e.g. Production" />
            </div>
            <div className="field">
              <label>Material received by</label>
              <input value={form.recby} onChange={e => setForm(f => ({ ...f, recby: e.target.value }))} placeholder="Receiver's name" />
            </div>
            <div className="field">
              <label>Issued by (store)</label>
              <input value={form.by} onChange={e => setForm(f => ({ ...f, by: e.target.value }))} placeholder="Store keeper's name" />
            </div>

            <div className="field full">
              <label>Material description <span style={{ color: 'var(--red)' }}>*</span></label>
              <select value={form.name} onChange={e => autofill(e.target.value)}>
                <option value="">— Select material —</option>
                {master.map(m => <option key={m._id} value={m.name}>{m.name}</option>)}
              </select>
            </div>

            <div className="field code">
              <label>Material type</label>
              <input readOnly value={form.type} placeholder="Auto-filled" />
            </div>
            <div className="field code">
              <label>Material code</label>
              <input readOnly value={form.code} placeholder="Auto-filled" />
            </div>
            <div className="field">
              <label>Category</label>
              <input readOnly value={form.category} placeholder="Auto-filled" />
            </div>
            <div className="field">
              <label>UOM</label>
              <input readOnly value={form.uom} placeholder="Auto-filled" />
            </div>

            <div className="field">
              <label>Issued qty <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                type="number" min="0" step="any"
                value={form.qty}
                onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="actionrow">
            <button className="btn btn-out" type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save outward entry'}
            </button>
            {msg.text && <span className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</span>}
          </div>
        </form>
      </div>

      {/* Recent entries table */}
      <div className="card">
        <h3>Recent outward entries <span className="pill-count">{entries.length || 0}</span></h3>
        <div className="tablewrap" style={{ overflowX: 'scroll', overflowY: 'scroll', maxHeight: '70vh' }}>
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