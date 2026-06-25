import React, { useState, useEffect, useCallback } from 'react';
import { getInward, updatePrice } from '../api/api';
import { formatNum } from '../utils/helpers';

export default function PriceEntry() {
  const [entries, setEntries] = useState([]);
  const [search,  setSearch]  = useState('');
  const [prices,  setPrices]  = useState({});
  const [saved,   setSaved]   = useState({});

  const load = useCallback(async () => {
    const data = await getInward();
    setEntries(data);
    const init = {};
    data.forEach(e => { init[e._id] = e.price ?? 0; });
    setPrices(init);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter(e =>
    !search ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.code||'').toLowerCase().includes(search.toLowerCase())
  );

  async function handleSave(id) {
    try {
      await updatePrice(id, prices[id] ?? 0);
      setSaved(s => ({ ...s, [id]: true }));
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
        <h3>Inward entries <span className="pill-count">{entries.length || 0}</span></h3>
        <div className="searchbar">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by material name or code…" />
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Vendor</th><th>Material</th><th>Code</th>
                <th className="num">Qty</th><th>UOM</th><th className="num">Unit price</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0,200).map(e => (
                <tr key={e._id}>
                  <td>{e.date}</td>
                  <td>{e.vendor || <span style={{color:'var(--text-3)'}}>—</span>}</td>
                  <td style={{fontWeight:500}}>{e.name}</td>
                  <td className="mono">{e.code}</td>
                  <td className="num">{formatNum(e.qty)}</td>
                  <td>{e.uom}</td>
                  <td className="num pricecell">
                    <input
                      type="number" min="0" step="any"
                      value={prices[e._id] ?? ''}
                      onChange={ev => setPrices(p => ({...p, [e._id]: parseFloat(ev.target.value)||0}))}
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
              ))}
            </tbody>
          </table>
        </div>
        {!entries.length && <div className="empty">No inward entries yet.<p>Add inward entries first to set prices.</p></div>}
      </div>
    </>
  );
}
