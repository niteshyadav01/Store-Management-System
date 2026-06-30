import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getInward, updatePrice } from '../api/api';
import { formatNum } from '../utils/helpers';

function ColFilter({ values, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef();
  const panelRef = useRef();

  useEffect(() => {
    function handler(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const panelHeight = 320;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < panelHeight ? rect.top - panelHeight : rect.bottom + 4;
      setPos({ top, left: rect.left });
    }
  }, [open]);

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
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        style={{
          background: selected.length > 0 ? 'var(--teal)' : 'none',
          border: 'none', cursor: 'pointer', padding: '2px 4px',
          borderRadius: 3, fontSize: 10, color: selected.length > 0 ? '#fff' : '#8a8270',
          lineHeight: 1,
        }}
        title="Filter"
      >▼</button>
      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: pos.top, left: pos.left, zIndex: 99999,
            background: '#fff', border: '1px solid var(--line)',
            borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.18)',
            minWidth: 200, maxWidth: 280, padding: '8px 0',
          }}
        >
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
        </div>,
        document.body
      )}
    </>
  );
}

const itemStyle = {
  display: 'flex', alignItems: 'center', padding: '6px 12px',
  fontSize: 12, cursor: 'pointer', userSelect: 'none',
  transition: 'background .1s',
};

export default function PriceEntry() {
  const [entries, setEntries] = useState([]);
  const [search,  setSearch]  = useState('');
  const [prices,  setPrices]  = useState({});
  const [saved,   setSaved]   = useState({});

  const [cf, setCf] = useState({ date:[], vendor:[], name:[], code:[], qty:[], uom:[], price:[] });

  const load = useCallback(async () => {
    const data = await getInward();
    setEntries(data);
    const init = {};
    data.forEach(e => { init[e._id] = e.price ?? 0; });
    setPrices(init);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = entries
    .filter(e =>
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.code||'').toLowerCase().includes(search.toLowerCase())
    )
    .filter(e =>
      (!cf.date.length   || cf.date.includes(e.date)) &&
      (!cf.vendor.length || cf.vendor.includes(e.vendor)) &&
      (!cf.name.length   || cf.name.includes(e.name)) &&
      (!cf.code.length   || cf.code.includes(e.code)) &&
      (!cf.qty.length    || cf.qty.includes(String(e.qty))) &&
      (!cf.uom.length    || cf.uom.includes(e.uom)) &&
      (!cf.price.length  || cf.price.includes(String(e.price ?? 0)))
    )
    .sort((a, b) => {
      const aZero = (a.price ?? 0) === 0 ? 0 : 1;
      const bZero = (b.price ?? 0) === 0 ? 0 : 1;
      return aZero - bZero;
    });

  function handleFocus(id) {
    // If the current value is 0, clear it so user can type a fresh number
    if (prices[id] === 0 || prices[id] === '0') {
      setPrices(p => ({ ...p, [id]: '' }));
    }
  }

  async function handleSave(id) {
    try {
      await updatePrice(id, prices[id] === '' ? 0 : (prices[id] ?? 0));
      setSaved(s => ({ ...s, [id]: true }));
      await load();
      setTimeout(() => setSaved(s => ({ ...s, [id]: false })), 1800);
    } catch (err) { alert(err.message); }
  }

  return (
    <>
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Price Entry</h2>
          <p>Enter or update unit prices for inward entries. Visible to Admin and Purchase team only.</p>
        </div>
      </div>

      <div className="card">
        <h3>Inward entries <span className="pill-count">{filtered.length || 0}</span></h3>
        <div className="searchbar">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by material name or code…" />
        </div>
        <div className="tablewrap" style={{ overflowX: 'scroll', overflowY: 'scroll', maxHeight: '70vh' }}>
          <table style={{ minWidth: '1200px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr style={{ background: 'var(--paper-dim)' }}>
                <th>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Date <ColFilter values={entries.map(e=>e.date)} selected={cf.date} onChange={v=>setCf(f=>({...f,date:v}))} />
                  </span>
                </th>
                <th>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Vendor <ColFilter values={entries.map(e=>e.vendor)} selected={cf.vendor} onChange={v=>setCf(f=>({...f,vendor:v}))} />
                  </span>
                </th>
                <th>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Material <ColFilter values={entries.map(e=>e.name)} selected={cf.name} onChange={v=>setCf(f=>({...f,name:v}))} />
                  </span>
                </th>
                <th>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Code <ColFilter values={entries.map(e=>e.code)} selected={cf.code} onChange={v=>setCf(f=>({...f,code:v}))} />
                  </span>
                </th>
                <th className="num">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Qty <ColFilter values={entries.map(e=>String(e.qty))} selected={cf.qty} onChange={v=>setCf(f=>({...f,qty:v}))} />
                  </span>
                </th>
                <th>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    UOM <ColFilter values={entries.map(e=>e.uom)} selected={cf.uom} onChange={v=>setCf(f=>({...f,uom:v}))} />
                  </span>
                </th>
                <th className="num">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Unit price <ColFilter values={entries.map(e=>String(e.price ?? 0))} selected={cf.price} onChange={v=>setCf(f=>({...f,price:v}))} />
                  </span>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const isZero = (e.price ?? 0) === 0;
                return (
                  <tr key={e._id} style={isZero ? { background: 'var(--red-light)' } : undefined}>
                    <td>{e.date}</td>
                    <td>{e.vendor || <span style={{color:'var(--text-3)'}}>—</span>}</td>
                    <td style={{fontWeight:500}}>{e.name}</td>
                    <td className="mono">{e.code}</td>
                    <td className="num">{formatNum(e.qty)}</td>
                    <td>{e.uom}</td>
                    <td className="num pricecell">
                      <input
                        type="number" min="0" step="any"
                        value={prices[e._id] ?? 0}
                        onFocus={() => handleFocus(e._id)}
                        onChange={ev => setPrices(p => ({...p, [e._id]: ev.target.value === '' ? '' : parseFloat(ev.target.value)}))}
                        placeholder="0.00"
                      />
                    </td>
                    <td>
                      <button
                        className={`btn btn-sm ${saved[e._id] ? 'btn-ghost' : 'btn-in'}`}
                        onClick={() => handleSave(e._id)}
                      >
                        {saved[e._id] ? '✓ Saved' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!entries.length && <div className="empty">No inward entries yet.<p>Add inward entries first to set prices.</p></div>}
        {entries.length > 0 && !filtered.length && <div className="empty">No entries match your filter.</div>}
      </div>
    </>
  );
}