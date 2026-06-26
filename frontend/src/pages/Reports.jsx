import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getMaster, getInward, getOutward } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { formatNum, formatINR, exportXlsx, todayStr } from '../utils/helpers';

// ── Excel-style dropdown filter component ─────────────────────────────────────
function ColFilter({ values, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef();

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unique = [...new Set(values.filter(Boolean))].sort();
  const filtered = unique.filter(v => v.toLowerCase().includes(search.toLowerCase()));
  const allSelected = selected.length === 0;

  function toggle(val) {
    if (selected.includes(val)) onChange(selected.filter(s => s !== val));
    else onChange([...selected, val]);
  }

  function clearAll() { onChange([]); setOpen(false); }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: selected.length > 0 ? 'var(--teal)' : 'none',
          border: 'none', cursor: 'pointer', padding: '2px 4px',
          borderRadius: 3, fontSize: 10, color: selected.length > 0 ? '#fff' : '#8a8270',
          lineHeight: 1,
        }}
        title="Filter"
      >▼</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 999,
          background: '#fff', border: '1px solid var(--line)',
          borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)',
          minWidth: 200, maxWidth: 280, padding: '8px 0',
        }}>
          <div style={{ padding: '6px 10px' }}>
            <input
              autoFocus
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '5px 8px', fontSize: 12,
                border: '1px solid var(--line)', borderRadius: 4,
                fontFamily: 'Poppins, sans-serif',
              }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', borderTop: '1px solid var(--line)' }}>
            <label style={itemStyle}>
              <input type="checkbox" checked={allSelected} onChange={clearAll} style={{ marginRight: 7 }} />
              <span style={{ fontStyle: 'italic', color: '#8a8270' }}>(Select all)</span>
            </label>
            {filtered.map(v => (
              <label key={v} style={itemStyle}>
                <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} style={{ marginRight: 7 }} />
                {v}
              </label>
            ))}
            {!filtered.length && <div style={{ padding: '8px 12px', fontSize: 12, color: '#8a8270' }}>No results</div>}
          </div>
          <div style={{ padding: '6px 10px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={clearAll} style={{
              fontSize: 11, padding: '4px 10px', border: '1px solid var(--line)',
              borderRadius: 4, cursor: 'pointer', background: 'none', fontFamily: 'Poppins, sans-serif',
            }}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

const itemStyle = {
  display: 'flex', alignItems: 'center', padding: '6px 12px',
  fontSize: 12, cursor: 'pointer', userSelect: 'none',
  transition: 'background .1s',
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function Reports() {
  const { user } = useAuth();
  const canSeePrice = user?.role === 'admin' || user?.role === 'purchase';

  const [master,  setMaster]  = useState([]);
  const [inward,  setInward]  = useState([]);
  const [outward, setOutward] = useState([]);

  const [repType,  setRepType]  = useState('inward');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [category, setCategory] = useState('');
  const [vendor,   setVendor]   = useState('');
  const [material, setMaterial] = useState('');
  const [rows,     setRows]     = useState(null);
  const [repMsg,   setRepMsg]   = useState('');

  // Column filters — arrays of selected values (empty = all)
  const [cf, setCf] = useState({ name:[], type:[], category:[], code:[], uom:[] });

  const load = useCallback(async () => {
    const [m, i, o] = await Promise.all([getMaster(), getInward(), getOutward()]);
    setMaster(m);
    setInward(Array.isArray(i) ? i : (i?.entries ?? []));
    setOutward(Array.isArray(o) ? o : (o?.entries ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const categories = [...new Set(master.map(m => m.category).filter(Boolean))].sort();
  const vendors    = [...new Set(inward.map(e => e.vendor).filter(Boolean))].sort();
  const materials  = [...new Set(master.map(m => m.name).filter(Boolean))].sort();

  function filterEntries(entries) {
    return entries.filter(e => {
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo   && e.date > dateTo)   return false;
      if (category && e.category !== category) return false;
      if (vendor   && e.vendor   !== vendor)   return false;
      if (material && e.name     !== material) return false;
      return true;
    });
  }

  function runReport() {
    setCf({ name:[], type:[], category:[], code:[], uom:[] });
    if (repType === 'both') {
      const filteredIn  = filterEntries(inward);
      const filteredOut = filterEntries(outward);

      const inQtyMap = {}, inValMap = {}, outQtyMap = {};
      filteredIn.forEach(e => {
        inQtyMap[e.name] = (inQtyMap[e.name] || 0) + (parseFloat(e.qty) || 0);
        inValMap[e.name] = (inValMap[e.name]  || 0) + ((parseFloat(e.qty)||0)*(parseFloat(e.price)||0));
      });
      filteredOut.forEach(e => {
        outQtyMap[e.name] = (outQtyMap[e.name] || 0) + (parseFloat(e.qty) || 0);
      });

      const names = [...new Set([
        ...filteredIn.map(e => e.name),
        ...filteredOut.map(e => e.name),
      ])];

      const result = names.map(name => {
        const mat      = master.find(m => m.name === name) || {};
        const inQty    = inQtyMap[name]  || 0;
        const outQty   = outQtyMap[name] || 0;
        const balance  = inQty - outQty;
        const avgPrice = inQty > 0 ? (inValMap[name] || 0) / inQty : 0;
        const stockVal = avgPrice * Math.max(balance, 0);
        return {
          name, type: mat.type||'', category: mat.category||'',
          code: mat.code||'', uom: mat.uom||'',
          inQty, outQty, balance, avgPrice, stockVal,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      setRows(result);
      setRepMsg(result.length ? `${result.length} material(s) found.` : 'No records match the selected filters.');
    } else {
      const src    = repType === 'inward' ? inward : outward;
      const result = filterEntries(src).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
      setRows(result);
      setRepMsg(result.length ? `${result.length} record(s) found.` : 'No records match the selected filters.');
    }
  }

  function exportReport() {
    if (!rows?.length) return;
    if (repType === 'both') {
      const headers = ['Material Name','Type','Category','Code','UOM','Inward Qty','Outward Qty','Balance'];
      if (canSeePrice) headers.push('Avg Price','Stock Value');
      const dataRows = filteredRows.map(r => {
        const row = [r.name, r.type, r.category, r.code, r.uom, r.inQty, r.outQty, r.balance];
        if (canSeePrice) row.push(r.avgPrice, r.stockVal);
        return row;
      });
      exportXlsx(headers, dataRows, 'Stock Summary', `Stockyard_Combined_Report_${todayStr()}.xlsx`);
    } else {
      const headers = ['Date','Material Name','Category','Type','Code','UOM','Qty'];
      if (repType !== 'outward') headers.push('Vendor');
      if (repType !== 'outward' && canSeePrice) headers.push('Price','Value');
      if (repType !== 'inward')  headers.push('Project');
      const dataRows = rows.map(r => {
        const row = [r.date, r.name, r.category, r.type, r.code, r.uom, parseFloat(r.qty)||0];
        if (repType !== 'outward') row.push(r.vendor||'');
        if (repType !== 'outward' && canSeePrice) {
          const v = (parseFloat(r.qty)||0)*(parseFloat(r.price)||0);
          row.push(parseFloat(r.price)||0, v);
        }
        if (repType !== 'inward') row.push(r.project||'');
        return row;
      });
      const label = repType.charAt(0).toUpperCase() + repType.slice(1);
      exportXlsx(headers, dataRows, label, `Stockyard_${label}_Report_${todayStr()}.xlsx`);
    }
  }

  // ── Apply column filters ───────────────────────────────────────────────────
  const filteredRows = (rows || []).filter(r =>
    (!cf.name.length     || cf.name.includes(r.name)) &&
    (!cf.type.length     || cf.type.includes(r.type)) &&
    (!cf.category.length || cf.category.includes(r.category)) &&
    (!cf.code.length     || cf.code.includes(r.code)) &&
    (!cf.uom.length      || cf.uom.includes(r.uom))
  );

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalIn = repType === 'both'
    ? rows?.reduce((s,r) => s + r.inQty, 0) || 0
    : rows?.reduce((s,r) => s + (parseFloat(r.qty)||0), 0) || 0;

  const totalOut = repType === 'both'
    ? rows?.reduce((s,r) => s + r.outQty, 0) || 0
    : rows?.reduce((s,r) => s + (parseFloat(r.qty)||0), 0) || 0;

  const totalStockVal = repType === 'both'
    ? rows?.reduce((s,r) => s + r.stockVal, 0) || 0
    : 0;

  const inwardVal = repType === 'inward'
    ? rows?.reduce((s,r) => s + ((parseFloat(r.qty)||0)*(parseFloat(r.price)||0)), 0) || 0
    : 0;

  const uniqueMats = repType === 'both'
    ? rows?.length || 0
    : rows ? [...new Set(rows.map(r => r.name))].length : 0;

  return (
    <>
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Reports</h2>
          <p>Filter and export records. "Both (combined)" shows a stock-overview style balance per material.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <h3>Filters</h3>
        <div className="formgrid">
          <div className="field">
            <label>Report type</label>
            <select value={repType} onChange={e => { setRepType(e.target.value); setRows(null); setCf({ name:[], type:[], category:[], code:[], uom:[] }); }}>
              <option value="inward">Inward entries</option>
              <option value="outward">Outward entries</option>
              <option value="both">Both (combined) — stock summary</option>
            </select>
          </div>
          <div className="field">
            <label>Category</label>
            <select value={category} onChange={e=>setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Date from</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>Date to</label>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
          </div>
          {repType !== 'outward' && (
            <div className="field">
              <label>Vendor</label>
              <select value={vendor} onChange={e=>setVendor(e.target.value)}>
                <option value="">All vendors</option>
                {vendors.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Material</label>
            <select value={material} onChange={e=>setMaterial(e.target.value)}>
              <option value="">All materials</option>
              {materials.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="actionrow" style={{marginTop:20}}>
          <button className="btn btn-in" onClick={runReport}>Generate report</button>
          {rows?.length > 0 && <button className="btn btn-out" onClick={exportReport}>Export to Excel</button>}
          {repMsg && <span className={`msg ${rows?.length ? 'ok' : 'err'}`}>{repMsg}</span>}
        </div>
      </div>

      {/* Summary stats */}
      {rows !== null && rows.length > 0 && (
        <>
          {repType === 'both' ? (
            <>
              <div className="statrow">
                <div className="stat">
                  <div className="label">Materials tracked</div>
                  <div className="value">{uniqueMats}</div>
                </div>
                <div className="stat teal">
                  <div className="label">Total inward qty</div>
                  <div className="value">{formatNum(Math.round(totalIn))}</div>
                </div>
                <div className="stat rust">
                  <div className="label">Total outward qty</div>
                  <div className="value">{formatNum(Math.round(totalOut))}</div>
                </div>
                <div className="stat teal">
                  <div className="label">Total balance stock</div>
                  <div className="value" style={{color: (totalIn - totalOut) <= 0 ? 'var(--red)' : 'var(--teal-dark)'}}>
                    {formatNum(Math.round(totalIn - totalOut))}
                  </div>
                </div>
              </div>
              {canSeePrice && (
                <div className="statrow" style={{gridTemplateColumns:'1fr', marginBottom:20}}>
                  <div className="stat teal">
                    <div className="label">Total stock value (avg price × balance qty)</div>
                    <div className="value">{formatINR(Math.round(totalStockVal))}</div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="statrow">
              <div className="stat">
                <div className="label">Records</div>
                <div className="value">{rows.length}</div>
              </div>
              <div className="stat">
                <div className="label">Unique materials</div>
                <div className="value">{uniqueMats}</div>
              </div>
              {repType === 'inward' && (
                <div className="stat teal">
                  <div className="label">Total inward qty</div>
                  <div className="value">{formatNum(totalIn)}</div>
                </div>
              )}
              {repType === 'outward' && (
                <div className="stat rust">
                  <div className="label">Total outward qty</div>
                  <div className="value">{formatNum(totalOut)}</div>
                </div>
              )}
              {canSeePrice && repType === 'inward' && (
                <div className="stat teal">
                  <div className="label">Total inward value</div>
                  <div className="value">{formatINR(inwardVal)}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Results table */}
      {rows !== null && (
        <div className="card">
          <h3>
            {repType === 'both' ? 'Stock balance by material' : repType === 'inward' ? 'Inward entries' : 'Outward entries'}
            <span className="pill-count">{filteredRows.length || 0}</span>
          </h3>
          <div className="tablewrap" style={{ overflowX: 'scroll', overflowY: 'scroll', maxHeight: '60vh' }}>
            <table style={{ minWidth: '1100px' }}>
              {repType === 'both' ? (
                <>
                  <thead style={{position:'sticky', top:0, zIndex:2, background:'var(--paper-dim)'}}>
                    <tr>
                      <th>Material name <ColFilter values={(rows||[]).map(r=>r.name)} selected={cf.name} onChange={v=>setCf(f=>({...f,name:v}))} /></th>
                      <th>Type <ColFilter values={(rows||[]).map(r=>r.type)} selected={cf.type} onChange={v=>setCf(f=>({...f,type:v}))} /></th>
                      <th>Category <ColFilter values={(rows||[]).map(r=>r.category)} selected={cf.category} onChange={v=>setCf(f=>({...f,category:v}))} /></th>
                      <th>Code <ColFilter values={(rows||[]).map(r=>r.code)} selected={cf.code} onChange={v=>setCf(f=>({...f,code:v}))} /></th>
                      <th>UOM <ColFilter values={(rows||[]).map(r=>r.uom)} selected={cf.uom} onChange={v=>setCf(f=>({...f,uom:v}))} /></th>
                      <th className="num">Inward qty</th>
                      <th className="num">Outward qty</th>
                      <th className="num">Balance</th>
                      {canSeePrice && <><th className="num">Avg price</th><th className="num">Stock value</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r,i) => (
                      <tr key={i}>
                        <td style={{fontWeight:500}}>{r.name}</td>
                        <td>{r.type}</td>
                        <td>{r.category}</td>
                        <td className="mono">{r.code}</td>
                        <td>{r.uom}</td>
                        <td className="num">{formatNum(r.inQty)}</td>
                        <td className="num">{formatNum(r.outQty)}</td>
                        <td className="num">
                          <strong style={{color: r.balance <= 0 ? 'var(--red)' : r.balance < 10 ? 'var(--amber)' : 'var(--teal-dark)'}}>
                            {formatNum(r.balance)}
                          </strong>
                        </td>
                        {canSeePrice && (
                          <><td className="num">{formatINR(r.avgPrice)}</td><td className="num">{formatINR(r.stockVal)}</td></>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead style={{position:'sticky', top:0, zIndex:2}}>
                    <tr>
                      <th>Date</th><th>Material</th><th>Category</th><th>Code</th><th>UOM</th>
                      <th className="num">Qty</th>
                      {repType !== 'outward' && <th>Vendor</th>}
                      {repType !== 'outward' && canSeePrice && <><th className="num">Price</th><th className="num">Value</th></>}
                      {repType !== 'inward'  && <th>Project</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r,i) => (
                      <tr key={i}>
                        <td>{r.date}</td>
                        <td style={{fontWeight:500}}>{r.name}</td>
                        <td>{r.category}</td>
                        <td className="mono">{r.code}</td>
                        <td>{r.uom}</td>
                        <td className="num">{formatNum(r.qty)}</td>
                        {repType !== 'outward' && <td>{r.vendor||'—'}</td>}
                        {repType !== 'outward' && canSeePrice && (
                          <><td className="num">{formatINR(r.price)}</td>
                          <td className="num">{formatINR((parseFloat(r.qty)||0)*(parseFloat(r.price)||0))}</td></>
                        )}
                        {repType !== 'inward' && <td>{r.project||'—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </div>
          {!filteredRows.length && <div className="empty">No records match the selected filters.</div>}
        </div>
      )}
    </>
  );
}