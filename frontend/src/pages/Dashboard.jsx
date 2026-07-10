import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPurchaseRequests, getPurchaseOrders } from '../api/api';
import { useAuth } from '../context/AuthContext';

const STATUS_LABEL = {
  pending: 'Pending', approved: 'Approved', partial: 'Partially Ordered',
  rejected: 'Rejected', ordered: 'Ordered', received: 'Received',
};

export default function Dashboard() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [requests, setRequests] = useState([]);
  const [pos,      setPos]      = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([getPurchaseRequests(), getPurchaseOrders()]);
      setRequests(r);
      setPos(p);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const counts = requests.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  // For partially ordered PRs — compute total remaining items to be ordered
  // by summing PR items and subtracting already-ordered qty from all POs
  const posByPrId = pos.reduce((acc, po) => {
    const key = String(po.prId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(po);
    return acc;
  }, {});

  let remainingItemsCount = 0;
  for (const pr of requests) {
    if (pr.status !== 'partial' && pr.status !== 'approved') continue;
    const prPos = posByPrId[String(pr._id)] || [];
    const alreadyOrdered = {};
    for (const po of prPos) {
      for (const it of (po.items || [])) {
        alreadyOrdered[it.name] = (alreadyOrdered[it.name] || 0) + it.orderedQty;
      }
    }
    for (const it of pr.items) {
      const already   = alreadyOrdered[it.name] || 0;
      const remaining = it.qty - already;
      if (remaining > 0.00001) remainingItemsCount++;
    }
  }

  const recentPRs = requests.slice(0, 8);
  const recentPOs = pos.slice(0, 8);

  return (
    <>
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Dashboard</h2>
          <p>Overview of purchase requests and purchase orders.</p>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="statrow">
        <div className="stat" style={{ cursor: 'pointer' }} onClick={() => navigate('/purchase-requests')}>
          <div className="label">Pending PRs</div>
          <div className="value" style={{ color: (counts.pending || 0) > 0 ? 'var(--red)' : 'inherit' }}>
            {counts.pending || 0}
          </div>
        </div>
        <div className="stat teal" style={{ cursor: 'pointer' }} onClick={() => navigate('/purchase-requests')}>
          <div className="label">Approved — awaiting PO</div>
          <div className="value">{counts.approved || 0}</div>
        </div>
        <div className="stat rust" style={{ cursor: 'pointer' }} onClick={() => navigate('/purchase-requests')}>
          <div className="label">Partially Ordered</div>
          <div className="value">{counts.partial || 0}</div>
        </div>
        <div className="stat" style={{ cursor: 'pointer' }} onClick={() => navigate('/purchase-requests')}>
          <div className="label">Items Still to Order</div>
          <div className="value" style={{ color: remainingItemsCount > 0 ? 'var(--red)' : 'inherit' }}>
            {remainingItemsCount}
          </div>
        </div>
        <div className="stat" style={{ cursor: 'pointer' }} onClick={() => navigate('/purchase-requests')}>
          <div className="label">Fully Ordered</div>
          <div className="value">{counts.ordered || 0}</div>
        </div>
        <div className="stat" style={{ cursor: 'pointer' }} onClick={() => navigate('/purchase-requests')}>
          <div className="label">Received</div>
          <div className="value">{counts.received || 0}</div>
        </div>
      </div>

      {/* ── Recent Purchase Requests ────────────────────────────────────────── */}
      <div className="card">
        <h3>
          Recent purchase requests
          <span className="pill-count">{requests.length}</span>
        </h3>

        {err && <p className="msg err">Error: {err}</p>}

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>PR No</th><th>Date</th><th>Project Name</th><th>Request From</th>
                <th>Requested by</th><th>Total Items</th><th>Items to Order</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentPRs.map(pr => {
                // Compute remaining items for this PR
                const prPos = posByPrId[String(pr._id)] || [];
                const alreadyOrdered = {};
                for (const po of prPos) {
                  for (const it of (po.items || [])) {
                    alreadyOrdered[it.name] = (alreadyOrdered[it.name] || 0) + it.orderedQty;
                  }
                }
                const itemsToOrder = pr.items.filter(it => {
                  const already = alreadyOrdered[it.name] || 0;
                  return it.qty - already > 0.00001;
                }).length;

                return (
                  <tr key={pr._id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{pr.prNumber}</td>
                    <td>{pr.date}</td>
                    <td>{pr.projectName || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                    <td>{pr.requestFrom || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                    <td>{pr.requestedByName}</td>
                    <td>{pr.items.length}</td>
                    <td>
                      {['approved', 'partial'].includes(pr.status) ? (
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

        {!loading && !recentPRs.length && (
          <div className="empty">No purchase requests yet.</div>
        )}

        <div className="actionrow" style={{ marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/purchase-requests')}>
            View all purchase requests →
          </button>
        </div>
      </div>

      {/* ── Recent Purchase Orders ──────────────────────────────────────────── */}
      <div className="card">
        <h3>
          Recent purchase orders
          <span className="pill-count">{pos.length}</span>
        </h3>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>PO No</th><th>PO Date</th><th>PR No</th>
                <th>Vendor</th><th>Items Ordered</th><th>Created by</th>
              </tr>
            </thead>
            <tbody>
              {recentPOs.map(po => (
                <tr key={po._id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{po.poNumber}</td>
                  <td>{po.poDate}</td>
                  <td className="mono">{po.prNumber}</td>
                  <td>{po.vendorName}</td>
                  <td>{po.items?.length || 0}</td>
                  <td>{po.createdByName}</td>
                </tr>
              ))}
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
