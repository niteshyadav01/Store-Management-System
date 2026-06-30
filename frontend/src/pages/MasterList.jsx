import React, { useState, useEffect, useCallback } from 'react';
import { getMaster, addMaterial, updateMaterial, bulkMaster, deleteMaterial } from '../api/api';
import { readSheetFile, pickCol, exportXlsx } from '../utils/helpers';

const EMPTY = { name:'', type:'', code:'', category:'', uom:'', minStock:'' };

export default function MasterList() {
  const [list,      setList]      = useState([]);
  const [search,    setSearch]    = useState('');
  const [form,      setForm]      = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [msg,       setMsg]       = useState({ text:'', ok:true });
  const [uploadMsg, setUploadMsg] = useState({ text:'', ok:true });

  const load = useCallback(async () => {
    try { setList(await getMaster()); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = list.filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.code||'').toLowerCase().includes(search.toLowerCase())
  );

  async function handleAdd(e) {
    e.preventDefault();
    setMsg({ text:'', ok:true });
    if (!form.name.trim()) { setMsg({ text:'Material name is required.', ok:false }); return; }
    const payload = { ...form, minStock: form.minStock === '' ? 0 : parseFloat(form.minStock) || 0 };
    try {
      if (editingId) {
        await updateMaterial(editingId, payload);
        setMsg({ text: `"${form.name}" updated successfully.`, ok:true });
        setEditingId(null);
      } else {
        await addMaterial(payload);
        setMsg({ text: `"${form.name}" added successfully.`, ok:true });
      }
      setForm(EMPTY);
      load();
      setTimeout(() => setMsg({ text:'', ok:true }), 4000);
    } catch (err) { setMsg({ text: err.message, ok:false }); }
  }

  function handleEdit(m) {
    setEditingId(m._id);
    setForm({
      name: m.name || '', type: m.type || '', code: m.code || '',
      category: m.category || '', uom: m.uom || '',
      minStock: m.minStock ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setMsg({ text:'', ok:true });
  }

  async function handleDelete(m) {
    if (!window.confirm(`Remove "${m.name}" from the master list?`)) return;
    try { await deleteMaterial(m._id); load(); }
    catch (err) { alert(err.message); }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadMsg({ text:'Reading file…', ok:true });
    try {
      const rows = await readSheetFile(file);
      if (!rows.length) { setUploadMsg({ text:'Sheet is empty.', ok:false }); return; }
      const materials = rows.map(row => ({
        name:     String(pickCol(row,['materialname','name','material'])||'').trim(),
        type:     String(pickCol(row,['materialtype','type'])||'').trim(),
        code:     String(pickCol(row,['materialscode','materialcode','code'])||'').trim(),
        category: String(pickCol(row,['category'])||'').trim(),
        uom:      String(pickCol(row,['uom','unit','unitofmeasure'])||'').trim(),
        minStock: parseFloat(pickCol(row,['minimumstock','minstock','minqty','minimumquantity','reorderlevel'])) || 0,
      })).filter(m => m.name);
      if (!materials.length) { setUploadMsg({ text:'Could not find a Material Name column.', ok:false }); return; }
      const res = await bulkMaster(materials);
      setUploadMsg({ text:`✓ ${res.added} materials loaded.${res.skipped ? ` ${res.skipped} skipped.` : ''}`, ok:true });
      load();
    } catch (err) { setUploadMsg({ text:'Error: '+err.message, ok:false }); }
    e.target.value = '';
  }

  return (
    <>
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Master Material List</h2>
          <p>Manage your material library. These details auto-fill every inward and outward entry.</p>
        </div>
      </div>

      {/* Upload */}
      <div className="card">
        <h3>Upload sheet</h3>
        <div className="uploadbox">
          <label htmlFor="masterfile">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Choose file (.xlsx, .xls, .csv)
          </label>
          <input type="file" id="masterfile" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
          <div className="hint">Expected columns: <strong>Material Name, Material Type, Materials Code, Category, UOM, Minimum Stock</strong> — column order doesn't matter</div>
          {uploadMsg.text && <div className={`alert ${uploadMsg.ok?'ok':'err'}`} style={{marginTop:14,textAlign:'left'}}>{uploadMsg.text}</div>}
        </div>
      </div>

      {/* Manual add */}
      <div className="card">
        <h3>{editingId ? 'Edit material' : 'Add material manually'}</h3>
        <form onSubmit={handleAdd}>
          <div className="formgrid">
            <div className="field full">
              <label>Material name <span style={{color:'var(--red)'}}>*</span></label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. MS Pipe 50mm" />
            </div>
            <div className="field">
              <label>Material type</label>
              <input value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} placeholder="e.g. Raw Material" />
            </div>
            <div className="field code">
              <label>Material code</label>
              <input value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value}))} placeholder="e.g. MS-PIPE-050" />
            </div>
            <div className="field">
              <label>Category</label>
              <input value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} placeholder="e.g. Pipes" />
            </div>
            <div className="field">
              <label>UOM</label>
              <input value={form.uom} onChange={e=>setForm(f=>({...f,uom:e.target.value}))} placeholder="e.g. Nos / Kg / Mtr" />
            </div>
            <div className="field">
              <label>Minimum stock</label>
              <input
                type="number" min="0" step="any"
                value={form.minStock}
                onChange={e=>setForm(f=>({...f,minStock:e.target.value}))}
                placeholder="e.g. 10"
              />
            </div>
          </div>
          <div className="actionrow">
            <button className="btn btn-in" type="submit">{editingId ? 'Update material' : 'Add to master list'}</button>
            {editingId && <button type="button" className="btn btn-ghost" onClick={handleCancelEdit}>Cancel</button>}
            {msg.text && <span className={`msg ${msg.ok?'ok':'err'}`}>{msg.text}</span>}
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="card">
        <h3>Materials <span className="pill-count">{list.length || 0}</span></h3>
        <div className="searchbar">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or code…" />
        </div>
        <div className="tablewrap" style={{ overflowX: 'scroll', overflowY: 'scroll', maxHeight: '70vh' }}>
          <table style={{ minWidth: '900px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--paper-dim)' }}>
              <tr>
                <th>Material name</th><th>Type</th><th>Code</th><th>Category</th><th>UOM</th><th className="num">Minimum stock</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m._id} style={editingId === m._id ? { background: 'var(--teal-light, #eef7f6)' } : undefined}>
                  <td style={{fontWeight:500}}>{m.name}</td>
                  <td>{m.type}</td>
                  <td className="mono">{m.code}</td>
                  <td>{m.category}</td>
                  <td>{m.uom}</td>
                  <td className="num">{m.minStock ?? 0}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm btn-ghost" onClick={()=>handleEdit(m)} style={{ marginRight: 6 }}>Edit</button>
                    <button className="btn-del btn-sm" onClick={()=>handleDelete(m)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && <div className="empty">No materials yet.<p>Upload a sheet above or add materials manually.</p></div>}
      </div>
    </>
  );
}