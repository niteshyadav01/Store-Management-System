import React, { useState, useEffect, useCallback } from 'react';
import { getPurchaseRequests, getPurchaseOrders, getMaster, getInward, getOutward } from '../api/api';
import { useAuth } from '../context/AuthContext';

const STATUS_LABEL = {
  pending: 'Pending', approved: 'Approved', partial: 'Partially Ordered',
  rejected: 'Rejected', ordered: 'Ordered', received: 'Received',
};

// null means "all PRs", a string means filtered by that status
// 'items-to-order' is a special filter for remaining items
const CARD_FILTERS = {
  pending:        'pending',
  approved:       'approved',
  partial:        'partial',
  itemsToOrder:   'items-to-order',
  ordered:        'ordered',
  received:       'received',
};

export default function Dashboard() {
  const { user } = useAuth();

  const [requests, setRequests] = useState([]);
  const [pos,      setPos]      = useState([]);
  const [master,   setMaster]   = useState([]);
  const [inward,   setInward]   = useState([]);
  const [outward,  setOutward]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');
  const [activeFilter, setActiveFilter] = useState(null); // null = show all

  const load = useCallback(async () => {
    try {
      const [r, p, m, i, o] = await Promise.all([
        getPurchaseRequests(),
        getPurchaseOrders(),
        getMaster(),
        getInward(),
        getOutward(),
      ]);
      setRequests(r);
      setPos(p);
      setMaster(Array.isArray(m) ? m : []);
      setInward(Array.isArray(i) ? i : []);
      setOutward(Array.isArray(o) ? o : []);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── Computed values ────────────────────────────────────────────────────────
  const counts = requests.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const posByPrId = pos.reduce((acc, po) => {
    const key = String(po.prId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(po);
    return acc;
  }, {});

  function itemsToOrderCount(pr) {
    const prPos = posByPrId[String(pr._id)] || [];
    const ordered = {};
    for (const po of prPos)
      for (const it of (po.items || []))
        ordered[it.name] = (ordered[it.name] || 0) + (it.orderedQty || 0);
    return pr.items.filter(it => (it.qty - (ordered[it.name] || 0)) > 0.00001).length;
  }

  const remainingItemsCount = requests
    .filter(r => r.status === 'partial' || r.status === 'approved')
    .reduce((sum, pr) => sum + itemsToOrderCount(pr), 0);

  const inTotals = {};
  const outTotals = {};
  inward.forEach(e => {
    inTotals[e.name] = (inTotals[e.name] || 0) + (parseFloat(e.qty) || 0);
  });
  outward.forEach(e => {
    outTotals[e.name] = (outTotals[e.name] || 0) + (parseFloat(e.qty) || 0);
  });

  const lowStockItems = master.map(m => {
    const inQty = inTotals[m.name] || 0;
    const outQty = outTotals[m.name] || 0;
    const stock = inQty - outQty;
    const minStock = parseFloat(m.minStock) || 0;
    return { ...m, inQty, outQty, stock, minStock };
  }).filter(m => m.stock < m.minStock);
  const lowStockCount = lowStockItems.length;

  // ── Filter PRs based on active card ───────────────────────────────────────
  function getFilteredPRs() {
    if (!activeFilter || activeFilter === 'low-stock') return requests;
    if (activeFilter === 'items-to-order')
      return requests.filter(r => ['approved','partial'].includes(r.status) && itemsToOrderCount(r) > 0);
    return requests.filter(r => r.status === activeFilter);
  }

  function handleCardClick(filterKey) {
    setActiveFilter(prev => prev === filterKey ? null : filterKey);
  }

  const filteredPRs = getFilteredPRs();
  const recentPOs   = pos.slice(0, 8);

  const filterLabel = activeFilter
    ? activeFilter === 'items-to-order' ? 'Items Still to Order'
    : activeFilter === 'low-stock' ? 'Low Stock Items'
    : STATUS_LABEL[activeFilter] || activeFilter
    : null;

  return (
    <>
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Dashboard</h2>
          <p>Overview of purchase requests and purchase orders.</p>
        </div>
        {activeFilter && (
          <button className="btn btn-ghost btn-sm" onClick={() => setActiveFilter(null)}>
            ✕ Clear filter
          </button>
        )}
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="statrow">

        {[
          { key: 'pending',       label: 'Pending PRs',           value: counts.pending || 0,    color: (counts.pending || 0) > 0 ? 'var(--red)' : undefined, cls: '' },
          { key: 'approved',      label: 'INPROCESS',value: counts.approved || 0,   color: undefined, cls: 'teal' },
          { key: 'partial',       label: 'Partially Ordered',     value: counts.partial || 0,    color: undefined, cls: 'rust' },
          { key: 'items-to-order',label: 'Items Still to Order',  value: remainingItemsCount,    color: remainingItemsCount > 0 ? 'var(--red)' : undefined, cls: '' },
          { key: 'low-stock',     label: 'Low Stock',              value: lowStockCount,         color: lowStockCount > 0 ? 'var(--red)' : undefined, cls: 'rust' },
          { key: 'ordered',       label: 'Fully Ordered',         value: counts.ordered || 0,    color: undefined, cls: 'teal' },
          { key: 'received',      label: 'Received',              value: counts.received || 0,   color: 'var(--teal-dark)', cls: 'teal' },
        ].map(card => (
          <div
            key={card.key}
            className={`stat ${card.cls}`}
            style={{
              cursor: 'pointer',
              outline: activeFilter === card.key ? '2px solid var(--teal)' : undefined,
              outlineOffset: 2,
            }}
            onClick={() => handleCardClick(card.key)}
            title={activeFilter === card.key ? 'Click to clear filter' : `Click to filter by ${card.label}`}
          >
            <div className="label">{card.label}</div>
            <div className="value" style={{ color: card.color || 'inherit' }}>{card.value}</div>
            {activeFilter === card.key && (
              <div style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 600, marginTop: 4, letterSpacing: '0.5px' }}>
                FILTERED ✓
              </div>
            )}
          </div>
        ))}

      </div>

      {/* ── Purchase Requests (filterable) / Low Stock items ─────────────── */}
      {activeFilter === 'low-stock' ? (
        <div className="card">
          <h3>
            Low Stock Items
            <span className="pill-count">{lowStockItems.length}</span>
          </h3>

          {err && <p className="msg err">Error: {err}</p>}

          <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--teal)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Showing: <strong>Low Stock Items</strong></span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 10px', fontSize: 11 }}
              onClick={() => setActiveFilter(null)}
            >
              Clear
            </button>
          </div>

          {lowStockItems.length ? (
            <div className="tablewrap">
              <table style={{ minWidth: '700px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '38%' }}>Material</th>
                    <th style={{ width: '18%' }}>Code</th>
                    <th className="table-center" style={{ width: '120px', textAlign: 'center' }}>Current Stock</th>
                    <th className="table-center" style={{ width: '120px', textAlign: 'center' }}>Min Stock</th>
                    <th style={{ width: '8%' }}>UOM</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map(item => (
                    <tr key={item._id || item.name}>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{item.name}</td>
                      <td className="mono" style={{ color: 'var(--text-2)' }}>{item.code || '—'}</td>
                      <td className="num table-center" style={{ color: 'var(--red)', fontWeight: 700, width: '120px', textAlign: 'center' }}>{item.stock}</td>
                      <td className="num table-center" style={{ color: 'var(--amber)', fontWeight: 600, width: '120px', textAlign: 'center' }}>{item.minStock}</td>
                      <td style={{ color: 'var(--text-2)' }}>{item.uom || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No materials are currently below minimum stock.</div>
          )}
        </div>
      ) : (
        <div className="card">
          <h3>
            {filterLabel ? `${filterLabel} — Purchase Requests` : 'Recent Purchase Requests'}
            <span className="pill-count">{filteredPRs.length}</span>
          </h3>

          {err && <p className="msg err">Error: {err}</p>}

          {activeFilter && (
            <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--teal)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Showing: <strong>{filterLabel}</strong></span>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '2px 10px', fontSize: 11 }}
                onClick={() => setActiveFilter(null)}
              >
                Clear
              </button>
            </div>
          )}

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>PR No</th><th>Date</th><th>Project Name</th><th>Request From</th>
                  <th>Requested by</th><th>Total Items</th><th>Items to Order</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPRs.map(pr => {
                  const itemsToOrder = ['approved','partial'].includes(pr.status)
                    ? itemsToOrderCount(pr) : null;
                  return (
                    <tr key={pr._id}>
                      <td className="mono" style={{ fontWeight: 600 }}>{pr.prNumber}</td>
                      <td>{pr.date}</td>
                      <td>{pr.projectName || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td>{pr.requestFrom || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td>{pr.requestedByName}</td>
                      <td>{pr.items.length}</td>
                      <td>
                        {itemsToOrder !== null ? (
                          <span style={{ fontWeight: 600, color: itemsToOrder > 0 ? 'var(--red)' : 'inherit' }}>
                            {itemsToOrder}
                          </span>
                        ) : '—'}
                      </td>
                      <td><span className={`tag ${pr.status}`}>{STATUS_LABEL[pr.status] || pr.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loading && !filteredPRs.length && (
            <div className="empty">
              {activeFilter
                ? `No purchase requests with status "${filterLabel}".`
                : 'No purchase requests yet.'}
            </div>
          )}
        </div>
      )}

      {/* ── Recent Purchase Orders ──────────────────────────────────────────── */}
      <div className="card">
        <h3>
          Recent Purchase Orders
          <span className="pill-count">{pos.length}</span>
        </h3>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>PO No</th><th>PO Date</th><th>Expected Date</th><th>PR No</th>
                <th>Vendor</th><th>Items Ordered</th><th>Total Value</th><th>Created by</th>
              </tr>
            </thead>
            <tbody>
              {recentPOs.map(po => {
                const totalValue = (po.items || []).reduce((s, i) => s + (i.orderedQty * (i.price || 0)), 0);
                return (
                  <tr key={po._id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{po.poNumber}</td>
                    <td>{po.poDate}</td>
                    <td>{po.poExpectedDate || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                    <td className="mono">{po.prNumber}</td>
                    <td>{po.vendorName}</td>
                    <td>{po.items?.length || 0}</td>
                    <td className="num">
                      {totalValue > 0
                        ? totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '—'}
                    </td>
                    <td>{po.createdByName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && !recentPOs.length && (
          <div className="empty">No purchase orders created yet.</div>
        )}
      </div>
    </>
  );
}
