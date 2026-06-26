import React, { useState, useEffect, useCallback } from 'react';
import { getMaster, getInward, getOutward } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { formatNum, formatINR, formatInt } from '../utils/helpers';

export default function StockOverview() {
  const { user } = useAuth();
  const canSeePrice = user?.role === 'admin' || user?.role === 'purchase';

  const [master,  setMaster]  = useState([]);
  const [inward,  setInward]  = useState([]);
  const [outward, setOutward] = useState([]);
  const [search,  setSearch]  = useState('');

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

  const rows = master.map(m => {
    const inQty    = inTotals[m.name]  || 0;
    const outQty   = outTotals[m.name] || 0;
    const stock    = inQty - outQty;
    const avgPrice = inQty > 0 ? (inValTotals[m.name]||0) / inQty : 0;
    const totalVal = avgPrice * Math.max(stock, 0);
    return { ...m, inQty, outQty, stock, avgPrice, totalVal };
  }).filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || (r.code||'').toLowerCase().includes(search.toLowerCase()));

  const totalIn  = Object.values(inTotals).reduce((a,b)=>a+b,0);
  const totalOut = Object.values(outTotals).reduce((a,b)=>a+b,0);
  const totalVal = rows.reduce((s,r)=>s+r.totalVal,0);
  const lowCount = master.filter(m=>((inTotals[m.name]||0)-(outTotals[m.name]||0))<=0).length;

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
        <div className="stat">
          <div className="label">Low / zero stock</div>
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
        <h3>Current balance by material</h3>
        <div className="searchbar">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or code…" />
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Material name</th><th>Type</th><th>Category</th><th>Code</th>
                <th className="num">Inward</th><th className="num">Outward</th>
                <th className="num">Balance</th><th>UOM</th>
                {canSeePrice && <><th className="num">Avg price</th><th className="num">Stock value</th></>}
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
      </div>
    </>
  );
}
