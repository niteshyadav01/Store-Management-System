import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getMaster, getInward, getOutward } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { formatNum, formatINR, formatInt } from '../utils/helpers';

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

  const unique = [...new Set(values.filter(Boolean))];

  // Detect numeric columns (strip currency symbols, commas, % etc. before parsing)
  const toNum = v => {
    const cleaned = String(v).replace(/[^0-9.\-]/g, '');
    return cleaned === '' || cleaned === '-' ? NaN : parseFloat(cleaned);
  };
  const isNumericCol = unique.every(v => !isNaN(toNum(v)));

  unique.sort((a, b) => isNumericCol
    ? toNum(a) - toNum(b)                 // ascending numeric order
    : String(a).localeCompare(String(b))  // alphabetical for text columns
  );

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

export default function StockOverview() {
  const { user } = useAuth();
  const canSeePrice = user?.role === 'admin' || user?.role === 'purchase';

  const [master,  setMaster]  = useState([]);
  const [inward,  setInward]  = useState([]);
  const [outward, setOutward] = useState([]);
  const [search,  setSearch]  = useState('');

  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Column filters
  const [cf, setCf] = useState({
    name: [], type: [], category: [], code: [],
    inQty: [], outQty: [], stock: [], minStock: [], uom: [],
    avgPrice: [], totalVal: [],
  });

  const load = useCallback(async () => {
    const [m,i,o] = await Promise.all([getMaster(), getInward(), getOutward()]);
    setMaster(m); setInward(i); setOutward(o);
  }, []);
  useEffect(() => { load(); }, [load]);

  const inTotals = {}, outTotals = {}, inValTotals = {};
  inward.forEach(e => {
    inTotals[e.name]    = (inTotals[e.name]    || 0) + (parseFloat(e.qty)  || 0);
    inValTotals[e.name] = (inValTotals[e.name] || 0) + ((parseFloat(e.qty)||0)*(parseFloat(e.price)||0));
  });
  outward.forEach(e => { outTotals[e.name] = (outTotals[e.name] || 0) + (parseFloat(e.qty)||0); });

  const allRows = master.map(m => {
    const inQty    = inTotals[m.name]  || 0;
    const outQty   = outTotals[m.name] || 0;
    const stock    = inQty - outQty;
    const avgPrice = inQty > 0 ? (inValTotals[m.name]||0) / inQty : 0;
    const totalVal = avgPrice * Math.max(stock, 0);
    const minStock = parseFloat(m.minStock) || 0;
    return { ...m, inQty, outQty, stock, minStock, avgPrice, totalVal };
  });

  const searched = allRows.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || (r.code||'').toLowerCase().includes(search.toLowerCase()));

  const rows = searched.filter(r =>
    (!lowStockOnly || r.stock < r.minStock) &&
    (!cf.name.length     || cf.name.includes(r.name)) &&
    (!cf.type.length     || cf.type.includes(r.type)) &&
    (!cf.category.length || cf.category.includes(r.category)) &&
    (!cf.code.length      || cf.code.includes(r.code)) &&
    (!cf.inQty.length     || cf.inQty.includes(String(formatNum(r.inQty)))) &&
    (!cf.outQty.length    || cf.outQty.includes(String(formatNum(r.outQty)))) &&
    (!cf.stock.length     || cf.stock.includes(String(formatNum(r.stock)))) &&
    (!cf.minStock.length  || cf.minStock.includes(String(formatNum(r.minStock)))) &&
    (!cf.uom.length       || cf.uom.includes(r.uom)) &&
    (!cf.avgPrice.length  || cf.avgPrice.includes(String(formatINR(r.avgPrice)))) &&
    (!cf.totalVal.length  || cf.totalVal.includes(String(formatINR(r.totalVal))))
  );

  const totalIn  = Object.values(inTotals).reduce((a,b)=>a+b,0);
  const totalOut = Object.values(outTotals).reduce((a,b)=>a+b,0);
  const totalVal = rows.reduce((s,r)=>s+r.totalVal,0);
  // Low stock = current balance below the material's configured minimum stock
  const lowStockItems = allRows.filter(r => r.stock < r.minStock);
  const lowCount = lowStockItems.length;

  return (
    <>
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Stock Overview</h2>
          <p>Real-time balance per material — inward minus outward quantities.</p>
        </div>
      </div>

      <div className="statrow">
        <div className="stat">
          <div className="label">Materials tracked</div>
          <div className="value">{master.length}</div>
        </div>
        <div className="stat teal">
          <div className="label">Total inward qty</div>
          <div className="value">{formatNum(totalIn)}</div>
        </div>
        <div className="stat rust">
          <div className="label">Total outward qty</div>
          <div className="value">{formatInt(totalOut)}</div>
        </div>
        <div
          className="stat"
          onClick={() => lowCount > 0 && setLowStockOnly(s => !s)}
          style={{
            cursor: lowCount > 0 ? 'pointer' : 'default',
            outline: lowStockOnly ? '2px solid var(--red)' : 'none',
          }}
          title={lowCount > 0 ? 'Click to show only low stock items in the table below' : undefined}
        >
          <div className="label">Low stock</div>
          <div className="value" style={{color: lowCount > 0 ? 'var(--red)' : 'inherit'}}>{lowCount}</div>
        </div>
      </div>

      {canSeePrice && (
        <div className="statrow" style={{gridTemplateColumns:'1fr', marginBottom:24}}>
          <div className="stat teal">
            <div className="label">Total stock value (avg price × stock qty)</div>
            <div className="value">{'₹' + Math.round(totalVal).toLocaleString('en-IN')}</div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>
          Current balance by material <span className="pill-count">{rows.length || 0}</span>
          {lowStockOnly && (
            <span style={{
              marginLeft: 10, fontSize: 12, fontWeight: 500, color: 'var(--red)',
              background: 'var(--red-light)', padding: '3px 9px', borderRadius: 12,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              ⚠ Low stock only
              <button
                onClick={() => setLowStockOnly(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, lineHeight: 1 }}
              >✕</button>
            </span>
          )}
        </h3>
        <div className="searchbar">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or code…" />
        </div>
        <div className="tablewrap" style={{ overflowX: 'scroll', overflowY: 'scroll', maxHeight: '70vh' }}>
          <table style={{ minWidth: '1300px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--paper-dim)' }}>
              <tr>
                <th>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                    Material name <ColFilter values={searched.map(r=>r.name)} selected={cf.name} onChange={v=>setCf(f=>({...f,name:v}))} />
                  </span>
                </th>
                <th>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                    Type <ColFilter values={searched.map(r=>r.type)} selected={cf.type} onChange={v=>setCf(f=>({...f,type:v}))} />
                  </span>
                </th>
                <th>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                    Category <ColFilter values={searched.map(r=>r.category)} selected={cf.category} onChange={v=>setCf(f=>({...f,category:v}))} />
                  </span>
                </th>
                <th>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                    Code <ColFilter values={searched.map(r=>r.code)} selected={cf.code} onChange={v=>setCf(f=>({...f,code:v}))} />
                  </span>
                </th>
                <th className="num">
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                    Inward <ColFilter values={searched.map(r=>formatNum(r.inQty))} selected={cf.inQty} onChange={v=>setCf(f=>({...f,inQty:v}))} />
                  </span>
                </th>
                <th className="num">
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                    Outward <ColFilter values={searched.map(r=>formatNum(r.outQty))} selected={cf.outQty} onChange={v=>setCf(f=>({...f,outQty:v}))} />
                  </span>
                </th>
                <th className="num">
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                    Balance <ColFilter values={searched.map(r=>formatNum(r.stock))} selected={cf.stock} onChange={v=>setCf(f=>({...f,stock:v}))} />
                  </span>
                </th>
                <th className="num">
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                    Minimum stock <ColFilter values={searched.map(r=>formatNum(r.minStock))} selected={cf.minStock} onChange={v=>setCf(f=>({...f,minStock:v}))} />
                  </span>
                </th>
                <th>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                    UOM <ColFilter values={searched.map(r=>r.uom)} selected={cf.uom} onChange={v=>setCf(f=>({...f,uom:v}))} />
                  </span>
                </th>
                {canSeePrice && (
                  <>
                    <th className="num">
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                        Avg price <ColFilter values={searched.map(r=>formatINR(r.avgPrice))} selected={cf.avgPrice} onChange={v=>setCf(f=>({...f,avgPrice:v}))} />
                      </span>
                    </th>
                    <th className="num">
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                        Stock value <ColFilter values={searched.map(r=>formatINR(r.totalVal))} selected={cf.totalVal} onChange={v=>setCf(f=>({...f,totalVal:v}))} />
                      </span>
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r._id}>
                  <td style={{fontWeight:500}}>{r.name}</td>
                  <td>{r.type}</td><td>{r.category}</td>
                  <td className="mono">{r.code}</td>
                  <td className="num">{formatNum(r.inQty)}</td>
                  <td className="num">{formatNum(r.outQty)}</td>
                  <td className="num">
                    <strong style={{color: r.stock <= 0 ? 'var(--red)' : r.stock < 10 ? 'var(--amber)' : 'var(--teal-dark)'}}>
                      {formatNum(r.stock)}
                    </strong>
                  </td>
                  <td className="num">
                    <span style={{color: r.stock < r.minStock ? 'var(--red)' : 'inherit'}}>
                      {formatNum(r.minStock)}
                    </span>
                  </td>
                  <td>{r.uom}</td>
                  {canSeePrice && (
                    <><td className="num">{formatINR(r.avgPrice)}</td><td className="num">{formatINR(r.totalVal)}</td></>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!master.length && <div className="empty">No materials yet.<p>Add materials to the master list to see stock balances.</p></div>}
        {master.length > 0 && !rows.length && <div className="empty">No materials match your filters.</div>}
      </div>
    </>
  );
}