import React, { useState, useEffect, useCallback } from 'react';
import { getMaster, getInward, getOutward } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { formatNum, formatINR, exportXlsx, todayStr } from '../utils/helpers';

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

  const load = useCallback(async () => {
    const [m,i,o] = await Promise.all([getMaster(), getInward(), getOutward()]);
    setMaster(m); setInward(i); setOutward(o);
  }, []);
  useEffect(() => { load(); }, [load]);

  const categories = [...new Set(master.map(m=>m.category).filter(Boolean))].sort();
  const vendors    = [...new Set(inward.map(e=>e.vendor).filter(Boolean))].sort();
  const materials  = [...new Set([...inward,...outward].map(e=>e.name).filter(Boolean))].sort();

  function filter(entries) {
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
    let result = [];
    if (repType==='inward'  || repType==='both') filter(inward).forEach(e  => result.push({_type:'IN',  ...e}));
    if (repType==='outward' || repType==='both') filter(outward).forEach(e => result.push({_type:'OUT', ...e}));
    result.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    setRows(result);
    setRepMsg(result.length ? `${result.length} record(s) found.` : 'No records match the selected filters.');
  }

  function exportReport() {
    if (!rows?.length) return;
    const showType = repType==='both';
    const headers = [];
    if (showType) headers.push('Entry Type');
    headers.push('Date','Material Name','Category','Type','Code','UOM','Qty');
    if (repType!=='outward') headers.push('Vendor');
    if (repType!=='outward' && canSeePrice) headers.push('Price','Value');
    if (repType!=='inward')  headers.push('Project');
    headers.push('Remarks');

    const dataRows = rows.map(r => {
      const row = [];
      if (showType) row.push(r._type==='IN' ? 'Inward' : 'Outward');
      row.push(r.date, r.name, r.category, r.type, r.code, r.uom, parseFloat(r.qty)||0);
      if (repType!=='outward') row.push(r.vendor||'');
      if (repType!=='outward' && canSeePrice) { const v=(parseFloat(r.qty)||0)*(parseFloat(r.price)||0); row.push(parseFloat(r.price)||0, v); }
      if (repType!=='inward')  row.push(r.project||'');
      row.push(r.remarks||'');
      return row;
    });
    const label = repType==='both' ? 'Combined' : repType.charAt(0).toUpperCase()+repType.slice(1);
    exportXlsx(headers, dataRows, 'Report', `Stockyard_${label}_Report_${todayStr()}.xlsx`);
  }

  const totalIn   = rows?.filter(r=>r._type==='IN').reduce((s,r)=>s+(parseFloat(r.qty)||0),0)||0;
  const totalOut  = rows?.filter(r=>r._type==='OUT').reduce((s,r)=>s+(parseFloat(r.qty)||0),0)||0;
  const uniqueMats = rows ? [...new Set(rows.map(r=>r.name))].length : 0;
  const showType   = repType==='both';

  // Total stock value based on FILTERED rows only:
  // For each material in filtered results, compute avg price from filtered IN rows,
  // then multiply by net filtered stock (filtered IN qty - filtered OUT qty).
  const stockVal = (() => {
    if (!canSeePrice || !rows?.length) return 0;

    const filteredIn  = rows.filter(r => r._type === 'IN');
    const filteredOut = rows.filter(r => r._type === 'OUT');

    // Per-material totals from filtered rows
    const inQtyMap = {}, inValMap = {}, outQtyMap = {};
    filteredIn.forEach(r => {
      inQtyMap[r.name] = (inQtyMap[r.name] || 0) + (parseFloat(r.qty)  || 0);
      inValMap[r.name] = (inValMap[r.name] || 0) + ((parseFloat(r.qty)||0) * (parseFloat(r.price)||0));
    });
    filteredOut.forEach(r => {
      outQtyMap[r.name] = (outQtyMap[r.name] || 0) + (parseFloat(r.qty) || 0);
    });

    // All material names that appear in filtered results
    const names = [...new Set(rows.map(r => r.name))];
    return names.reduce((sum, name) => {
      const inQty    = inQtyMap[name]  || 0;
      const outQty   = outQtyMap[name] || 0;
      const stock    = inQty - outQty;
      const avgPrice = inQty > 0 ? (inValMap[name] || 0) / inQty : 0;
      return sum + (avgPrice * Math.max(stock, 0));
    }, 0);
  })();

  // Inward value (for inward-only report)
  const inwardVal = rows?.filter(r=>r._type==='IN')
    .reduce((s,r) => s + ((parseFloat(r.qty)||0) * (parseFloat(r.price)||0)), 0) || 0;

  return (
    <>
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Reports</h2>
          <p>Filter, analyse and export inward/outward records by any combination of filters.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <h3>Filters</h3>
        <div className="formgrid">
          <div className="field">
            <label>Report type</label>
            <select value={repType} onChange={e=>setRepType(e.target.value)}>
              <option value="inward">Inward entries</option>
              <option value="outward">Outward entries</option>
              <option value="both">Both (combined)</option>
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
          <div className="field">
            <label>Vendor</label>
            <select value={vendor} onChange={e=>setVendor(e.target.value)}>
              <option value="">All vendors</option>
              {vendors.map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </div>
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
          {/* Row 1 — counts + qty stats */}
          <div className="statrow">
            <div className="stat">
              <div className="label">Records</div>
              <div className="value">{rows.length}</div>
            </div>
            <div className="stat">
              <div className="label">Unique materials</div>
              <div className="value">{uniqueMats}</div>
            </div>
            {repType !== 'outward' && (
              <div className="stat teal">
                <div className="label">Total inward qty</div>
                <div className="value">{formatNum(totalIn)}</div>
              </div>
            )}
            {repType !== 'inward' && (
              <div className="stat rust">
                <div className="label">Total outward qty</div>
                <div className="value">{formatNum(totalOut)}</div>
              </div>
            )}
          </div>

          {/* Row 2 — value stats (price-only, full width) */}
          {canSeePrice && repType === 'both' && (
            <div className="statrow" style={{ gridTemplateColumns: '1fr', marginBottom: 20 }}>
              <div className="stat teal">
                <div className="label">Total stock value — filtered results (avg price × net qty)</div>
                <div className="value">{formatINR(stockVal)}</div>
              </div>
            </div>
          )}
          {canSeePrice && repType === 'inward' && (
            <div className="statrow" style={{ gridTemplateColumns: '1fr', marginBottom: 20 }}>
              <div className="stat teal">
                <div className="label">Total inward value (qty × unit price)</div>
                <div className="value">{formatINR(inwardVal)}</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Results */}
      {rows !== null && (
        <div className="card">
          <h3>Results <span className="pill-count">{rows.length || 0}</span></h3>
          <div className="tablewrap" style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto'}}>
            <table>
              <thead style={{position:'sticky', top:0, zIndex:2}}>
                <tr>
                  {showType && <th>Type</th>}
                  <th>Date</th>
                  <th>Material</th>
                  <th>Category</th>
                  <th>Code</th>
                  <th>UOM</th>
                  <th className="num">Qty</th>
                  {repType!=='outward' && <th>Vendor</th>}
                  {repType!=='outward' && canSeePrice && <><th className="num">Price</th><th className="num">Value</th></>}
                  {repType!=='inward'  && <th>Project</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r,i) => (
                  <tr key={i}>
                    {showType && <td><span className={`tag ${r._type==='IN'?'in':'out'}`}>{r._type}</span></td>}
                    <td>{r.date}</td>
                    <td style={{fontWeight:500}}>{r.name}</td>
                    <td>{r.category}</td>
                    <td className="mono">{r.code}</td>
                    <td>{r.uom}</td>
                    <td className="num">{formatNum(r.qty)}</td>
                    {repType!=='outward' && <td>{r.vendor||'—'}</td>}
                    {repType!=='outward' && canSeePrice && (
                      <>
                        <td className="num">{formatINR(r.price)}</td>
                        <td className="num">{formatINR((parseFloat(r.qty)||0)*(parseFloat(r.price)||0))}</td>
                      </>
                    )}
                    {repType!=='inward' && <td>{r.project||'—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <div className="empty">No records match the selected filters.</div>}
        </div>
      )}
    </>
  );
}
