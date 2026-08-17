import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { todayStr } from '../utils/helpers';

// ── API helpers ───────────────────────────────────────────────────────────────
const API = '/api';
async function apiGet(path) {
  const token = localStorage.getItem('sy_token');
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}
async function apiPost(path, body) {
  const token = localStorage.getItem('sy_token');
  const res = await fetch(`${API}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}
async function apiPatch(path, body) {
  const token = localStorage.getItem('sy_token');
  const res = await fetch(`${API}${path}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}

// ── Vendor list ───────────────────────────────────────────────────────────────
const VENDORS = [
  { name: 'Navdurga Electroplating',                address: 'Gala No-17, Classical Ind-Estate-02, Khair Pada, Chaudhari Compound-B, Waliv, Vasai(E), Palghar - 401208' },
  { name: 'Aarti Electroplating',                   address: 'Gala No Q/12, Sector No.46, Sagar IND.EST. Near Quality Hardware, Dhumal Nagar, Waliv village, Vasai road(E)' },
  { name: 'RN Electroplating',                      address: 'Shop no.7 Sr.no. 106, Maniccha pada, Vasai, Richard compund, Vasai East - 401208' },
  { name: 'C - Tech Electronics',                   address: 'Shop No 09, Krushi Plaza, Plot no 15, Sector - 19 Apmc, Vashi, Navi Mumbai - 400705' },
  { name: 'Quest Enterprises Pvt Ltd',              address: 'G/140-A, Ansa Industrial Estate, Sakinaka Mumbai 400072' },
  { name: 'Fusion Metal Architects And Innovators', address: 'Plot No R - 398 MIDC TTC Ind Area, Rabale Navi Mumbai - 400701' },
  { name: 'G.K Powder Coating',                     address: 'Gala No.09/10 Ground Floor, Indian Corporation Bldg No 200, Gundwawali Road, Bhiwandi, Thane - 421302' },
];

const emptyItem = () => ({
  _key:        Math.random().toString(36).slice(2),
  description: '',
  size:        '',
  qty:         '',
  unit:        'NOS',
  boxNo:       '',
  remark:      '',
});

const LOCATIONS = ['Factory', 'Wada', 'Site'];
const UNITS     = ['NOS', 'MTR', 'KG', 'SET', 'PKT', 'BOX', 'LTR'];

// ── Print styles ──────────────────────────────────────────────────────────────
const PRINT_STYLE = `
  @media print {
    body * { visibility: hidden !important; }
    #job-order-print, #job-order-print * { visibility: visible !important; }
    #job-order-print {
      position: fixed !important;
      top: 0 !important; left: 0 !important;
      width: 100% !important;
      background: #fff !important;
      z-index: 99999 !important;
      padding: 20px !important;
    }
    @page { size: A4 portrait; margin: 10mm; }
  }
`;

// ── Delivery Challan Print Template ───────────────────────────────────────────
function PrintChallan({ order }) {
  function handlePrint() { window.print(); }
  const items = order.items || [];

  return (
    <>
      <style>{PRINT_STYLE}</style>
      <div id="job-order-print" style={{
        fontFamily: 'Arial, sans-serif', fontSize: 12, color: '#000',
        background: '#fff', padding: 20, maxWidth: 800, margin: '0 auto',
      }}>
        {/* Header */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
          <tbody>
            <tr>
              <td style={{ width: '35%', border: '1px solid #000', padding: 10, verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img
                    src="https://www.profile-solution.com/wp-content/uploads/2023/10/favicon-removebg-preview.png"
                    alt="Logo" style={{ width: 50, height: 50, objectFit: 'contain' }}
                  />
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: 1 }}>PROFILE</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>SOLUTION</div>
                    <div style={{ fontSize: 9, color: '#444' }}>DATA CENTER INFRASTRUCTURE EXPERTS</div>
                    <div style={{ fontSize: 9, color: '#444' }}>www.profile-solution.com</div>
                  </div>
                </div>
              </td>
              <td style={{ border: '1px solid #000', padding: 10, verticalAlign: 'top', fontSize: 11 }}>
                <strong>Principal Place of Business:</strong><br />
                Office No. 1701, Friends Business Bay, LT Road, Near Veer Savarkar Garden, Borivali (W), Mumbai : 400092<br /><br />
                <strong>Additional Places of Business: Factory</strong><br />
                Profile Data Centre Solutions Pvt. Ltd. Kutal, Dist. Palghar, 4014<br />
                (GST No. 27AALCP0046M1Z5)
              </td>
            </tr>
          </tbody>
        </table>

        {/* Title + meta */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td colSpan={2} style={{ border: '1px solid #000', textAlign: 'center', padding: '6px', fontWeight: 700, fontSize: 15, letterSpacing: 2 }}>
                DELIVERY CHALLAN
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '8px 12px', width: '50%', verticalAlign: 'top' }}>
                <strong>Address Of Delivery:</strong><br />
                <div style={{ minHeight: 40, marginTop: 4 }}>{order.deliveryAddress || '—'}</div>
              </td>
              <td style={{ border: '1px solid #000', padding: '8px 12px', verticalAlign: 'top', fontSize: 12 }}>
                <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ paddingBottom: 4 }}><strong>SR. N :</strong></td>
                      <td style={{ paddingBottom: 4, fontWeight: 700, fontSize: 16 }}>{order.srNo || '—'}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingBottom: 4 }}><strong>DATE :</strong></td>
                      <td style={{ paddingBottom: 4 }}>{order.date ? order.date.split('-').reverse().join('/') : '—'}</td>
                    </tr>
                    <tr>
                      <td><strong>VEHICLE NO :</strong></td>
                      <td>{order.vehicleNo || '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              {['Sr No.', 'Description of Goods', 'Size', 'Qty', 'Unit', 'Box No.', 'Remark'].map(h => (
                <th key={h} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'center', width: 40 }}>{i + 1}</td>
                <td style={{ border: '1px solid #000', padding: '5px 8px' }}>{it.description}</td>
                <td style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'center' }}>{it.size || '—'}</td>
                <td style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'center' }}>{it.qty}</td>
                <td style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'center' }}>{it.unit}</td>
                <td style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'center' }}>{it.boxNo || '—'}</td>
                <td style={{ border: '1px solid #000', padding: '5px 8px' }}>{it.remark || '—'}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 5 - items.length) }).map((_, i) => (
              <tr key={`empty-${i}`}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} style={{ border: '1px solid #000', padding: '12px 8px' }}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #000', padding: '10px 12px', width: '60%', verticalAlign: 'top' }}>
                <div style={{ marginBottom: 8 }}><strong>Received Person Name :</strong> {order.receivedBy || ' ___________________'}</div>
                <div style={{ marginBottom: 8 }}><strong>Received Person Sign :</strong> ___________________</div>
                <div><strong>Mobile No :</strong> ___________________</div>
              </td>
              <td style={{ border: '1px solid #000', padding: '10px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                <div style={{ fontWeight: 700, marginBottom: 30 }}>FOR PROFILE SOLUTION</div>
                <div style={{ marginTop: 30, borderTop: '1px solid #000', paddingTop: 6, fontSize: 11 }}>Authorized Signatory</div>
              </td>
            </tr>
          </tbody>
        </table>

        {order.remarks && (
          <div style={{ marginTop: 8, padding: '6px 10px', border: '1px solid #000', fontSize: 11 }}>
            <strong>Note:</strong> {order.remarks}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 20 }} className="no-print">
        <button onClick={handlePrint} style={{
          background: 'var(--teal)', color: '#fff', border: 'none',
          padding: '10px 28px', borderRadius: 8, fontWeight: 700,
          fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
        }}>
          🖨 Print Delivery Challan
        </button>
      </div>
    </>
  );
}

// ── View Details Modal ────────────────────────────────────────────────────────
function ViewModal({ order, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28,26,22,0.6)',
      backdropFilter: 'blur(4px)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
        width: '100%', maxWidth: 900, maxHeight: '95vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Job Order #{order.srNo}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8a8270' }}>
              {order.date} · {order.vendorName} · {order.vehicleNo || '—'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#8a8270', padding: '4px 8px' }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'SR No',            value: order.srNo },
              { label: 'Date',             value: order.date },
              { label: 'Vendor Name',      value: order.vendorName },
              { label: 'Vehicle No',       value: order.vehicleNo || '—' },
              { label: 'Issued By',        value: order.issuedBy || '—' },
              { label: 'Delivery Address', value: order.deliveryAddress || '—' },
              { label: 'Status',           value: order.status || 'issued' },
              { label: 'Received At',      value: order.receivedAt || '—' },
              { label: 'Received By',      value: order.receivedBy || '—' },
            ].map(f => (
              <div key={f.label} style={{ background: 'var(--paper-dim)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8270', marginBottom: 4 }}>{f.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{f.value}</div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#8a8270', marginBottom: 10 }}>Items</h3>
          <div className="tablewrap" style={{ marginBottom: 20 }}>
            <table>
              <thead>
                <tr>
                  <th>Sr No</th><th>Description</th><th>Size</th>
                  <th className="num">Qty</th><th>Unit</th><th>Box No</th><th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((it, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{it.description}</td>
                    <td>{it.size || '—'}</td>
                    <td className="num">{it.qty}</td>
                    <td>{it.unit}</td>
                    <td>{it.boxNo || '—'}</td>
                    <td>{it.remark || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {order.history?.length > 0 && (
            <>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#8a8270', marginBottom: 10 }}>Transaction History</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {order.history.map((h, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'var(--paper-dim)', borderRadius: 8, fontSize: 12 }}>
                    <span style={{
                      fontWeight: 700, fontSize: 10, padding: '2px 8px', borderRadius: 10,
                      background: h.action === 'issued' ? '#e6f2f0' : h.action === 'received' ? '#eef2ff' : '#f8ede7',
                      color: h.action === 'issued' ? 'var(--teal-dark)' : h.action === 'received' ? '#3730a3' : 'var(--rust-dark)',
                      textTransform: 'uppercase',
                    }}>{h.action}</span>
                    <span style={{ color: 'var(--ink)' }}>{h.note || '—'}</span>
                    <span style={{ marginLeft: 'auto', color: '#8a8270' }}>{h.by} · {new Date(h.at).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#8a8270', marginBottom: 10 }}>Delivery Challan</h3>
          <PrintChallan order={order} />
        </div>
      </div>
    </div>
  );
}

// ── Receive Modal ─────────────────────────────────────────────────────────────
function ReceiveModal({ order, onSave, onClose }) {
  const { user } = useAuth();
  const [location,   setLocation]   = useState('Factory');
  const [receivedBy, setReceivedBy] = useState(user?.name || '');
  const [note,       setNote]       = useState('');
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState('');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    if (!receivedBy.trim()) { setErr('Please enter who received the goods.'); return; }
    setSaving(true);
    try { await onSave({ location, receivedBy, note }); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,22,0.6)', backdropFilter: 'blur(4px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Mark as Received — #{order.srNo}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#8a8270' }}>✕</button>
        </div>
        <form onSubmit={handleSave}>
          <div style={{ padding: '20px 24px' }}>
            <div className="formgrid">
              <div className="field full">
                <label>Received at location <span style={{ color: 'var(--red)' }}>*</span></label>
                <select value={location} onChange={e => setLocation(e.target.value)}>
                  {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="field full">
                <label>Received by <span style={{ color: 'var(--red)' }}>*</span></label>
                <input value={receivedBy} onChange={e => setReceivedBy(e.target.value)} placeholder="Name of person receiving" />
              </div>
              <div className="field full">
                <label>Note (optional)</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Any condition, remarks, etc." />
              </div>
            </div>
            {err && <div className="alert err" style={{ marginTop: 12 }}>{err}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--line)', background: 'var(--paper-dim)' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-in" disabled={saving}>{saving ? 'Saving…' : 'Confirm received'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function JobOrder() {
  const { user } = useAuth();

  const [orders,       setOrders]       = useState([]);
  const [showForm,     setShowForm]     = useState(false);
  const [viewOrder,    setViewOrder]    = useState(null);
  const [receiveOrder, setReceiveOrder] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState({ text: '', ok: true });
  const [statusFilter, setStatusFilter] = useState('all');

  // Form state
  const [srNo,            setSrNo]            = useState('');
  const [date,            setDate]            = useState(todayStr());
  const [vendorName,      setVendorName]      = useState('');
  const [vendorCustom,    setVendorCustom]    = useState(false);
  const [vehicleNo,       setVehicleNo]       = useState('');
  const [issuedBy,        setIssuedBy]        = useState(user?.name || '');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [remarks,         setRemarks]         = useState('');
  const [items,           setItems]           = useState([emptyItem()]);

  const load = useCallback(async () => {
    try {
      const data = await apiGet('/job-orders');
      setOrders(Array.isArray(data) ? data : []);
    } catch { setOrders([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setSrNo(''); setDate(todayStr()); setVendorName('');
    setVendorCustom(false); setVehicleNo('');
    setIssuedBy(user?.name || ''); setDeliveryAddress('');
    setRemarks(''); setItems([emptyItem()]);
    setShowForm(false);
    setMsg({ text: '', ok: true });
  }

  function updateItem(key, patch) {
    setItems(list => list.map(it => it._key === key ? { ...it, ...patch } : it));
  }
  function addItem()        { setItems(list => [...list, emptyItem()]); }
  function removeItem(key)  { setItems(list => list.length > 1 ? list.filter(it => it._key !== key) : list); }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: '', ok: true });
    if (!srNo.trim())       { setMsg({ text: 'SR No is required.', ok: false }); return; }
    if (!vendorName.trim()) { setMsg({ text: 'Vendor name is required.', ok: false }); return; }
    const validItems = items.filter(it => it.description.trim() && it.qty);
    if (!validItems.length) { setMsg({ text: 'Add at least one item with description and qty.', ok: false }); return; }

    setSaving(true);
    try {
      await apiPost('/job-orders', {
        srNo, date, vendorName, vehicleNo, issuedBy,
        deliveryAddress, remarks,
        items: validItems.map(it => ({ ...it, qty: parseFloat(it.qty) || 0 })),
        status: 'issued',
        history: [{ action: 'issued', by: user?.name || user?.username, at: new Date().toISOString(), note: `Issued to ${vendorName}` }],
      });
      setMsg({ text: `✓ Job order ${srNo} created successfully.`, ok: true });
      resetForm();
      load();
      setTimeout(() => setMsg({ text: '', ok: true }), 4000);
    } catch (err) {
      setMsg({ text: 'Error: ' + err.message, ok: false });
    } finally { setSaving(false); }
  }

  async function handleReceive({ location, receivedBy, note }) {
    const order = receiveOrder;
    await apiPatch(`/job-orders/${order._id}/receive`, {
      status: 'received',
      receivedAt: location,
      receivedBy,
      historyEntry: {
        action: 'received',
        by: user?.name || user?.username,
        at: new Date().toISOString(),
        note: `Received at ${location}${note ? ' — ' + note : ''}`,
      },
    });
    setReceiveOrder(null);
    load();
  }

  const STATUS_COLORS = {
    issued:   { bg: '#e6f2f0', color: 'var(--teal-dark)' },
    received: { bg: '#eef2ff', color: '#3730a3' },
  };

  const visible = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter);

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } }
        .jo-item-row {
          display: grid;
          grid-template-columns: 2.5fr 1fr 0.8fr 0.8fr 0.8fr 1.2fr 32px;
          gap: 8px; align-items: end;
          padding: 10px; border: 1px solid var(--line);
          border-radius: 8px; margin-bottom: 8px;
        }
        .jo-item-row .field label { font-size: 11px; margin-bottom: 3px; display: block; color: var(--text-3); font-weight: 600; }
        .jo-item-row .field input, .jo-item-row .field select { padding: 6px 8px; font-size: 13px; height: 32px; width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 6px; }
        @media (max-width: 900px) { .jo-item-row { grid-template-columns: 1fr 1fr 0.8fr 0.8fr; } }
        @media (max-width: 600px) { .jo-item-row { grid-template-columns: 1fr 1fr; } }
      `}</style>

      {viewOrder    && <ViewModal    order={viewOrder}    onClose={() => setViewOrder(null)} />}
      {receiveOrder && <ReceiveModal order={receiveOrder} onSave={handleReceive} onClose={() => setReceiveOrder(null)} />}

      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Job Orders / Delivery Challan</h2>
          <p>Create and track delivery challans for goods sent out for work and received back.</p>
        </div>
        <div className="no-print">
          {!showForm && (
            <button className="btn btn-in" onClick={() => setShowForm(true)}>+ New Job Order</button>
          )}
        </div>
      </div>

      {/* ── Create form ── */}
      {showForm && (
        <div className="card no-print">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0 }}>New Job Order / Delivery Challan</h3>
            <button className="btn btn-ghost btn-sm" onClick={resetForm}>✕ Cancel</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="formgrid" style={{ marginBottom: 20 }}>
              <div className="field">
                <label>SR No <span style={{ color: 'var(--red)' }}>*</span></label>
                <input value={srNo} onChange={e => setSrNo(e.target.value)} placeholder="e.g. 2136" />
              </div>
              <div className="field">
                <label>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>

              {/* Vendor dropdown with custom option */}
              <div className="field">
                <label>Vendor Name <span style={{ color: 'var(--red)' }}>*</span></label>
                {vendorCustom ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={vendorName}
                      onChange={e => setVendorName(e.target.value)}
                      placeholder="Enter vendor name"
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ whiteSpace: 'nowrap' }}
                      onClick={() => { setVendorCustom(false); setVendorName(''); setDeliveryAddress(''); }}
                    >
                      ← Back
                    </button>
                  </div>
                ) : (
                  <select
                    value={vendorName}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setVendorCustom(true);
                        setVendorName('');
                        setDeliveryAddress('');
                      } else {
                        setVendorName(e.target.value);
                        const found = VENDORS.find(v => v.name === e.target.value);
                        if (found) setDeliveryAddress(found.address);
                        else setDeliveryAddress('');
                      }
                    }}
                  >
                    <option value="">— Select vendor —</option>
                    {VENDORS.map(v => (
                      <option key={v.name} value={v.name}>{v.name}</option>
                    ))}
                    <option value="__custom__">✎ Add own vendor…</option>
                  </select>
                )}
              </div>

              <div className="field">
                <label>Vehicle No</label>
                <input value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} placeholder="e.g. MH04 GU47" />
              </div>
              <div className="field">
                <label>Issued By</label>
                <input value={issuedBy} onChange={e => setIssuedBy(e.target.value)} placeholder="Your name" />
              </div>
              <div className="field full">
                <label>Address of Delivery</label>
                <input
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  placeholder="Auto-filled from vendor, or enter manually"
                />
              </div>
            </div>

            {/* Items header */}
            <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#8a8270' }}>Items</h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 0.8fr 0.8fr 0.8fr 1.2fr 32px', gap: 8, padding: '4px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8a8270' }}>
              <span>Description of Goods</span>
              <span>Size</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Box No</span>
              <span>Remark</span>
              <span></span>
            </div>

            {items.map((it, idx) => (
              <div key={it._key} className="jo-item-row">
                <div className="field">
                  <input value={it.description} onChange={e => updateItem(it._key, { description: e.target.value })} placeholder={`Item ${idx + 1} description`} />
                </div>
                <div className="field">
                  <input value={it.size} onChange={e => updateItem(it._key, { size: e.target.value })} placeholder="e.g. 4000" />
                </div>
                <div className="field">
                  <input type="number" min="0" step="any" value={it.qty} onChange={e => updateItem(it._key, { qty: e.target.value })} placeholder="0" />
                </div>
                <div className="field">
                  <select value={it.unit} onChange={e => updateItem(it._key, { unit: e.target.value })}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="field">
                  <input value={it.boxNo} onChange={e => updateItem(it._key, { boxNo: e.target.value })} placeholder="Box no" />
                </div>
                <div className="field">
                  <input value={it.remark} onChange={e => updateItem(it._key, { remark: e.target.value })} placeholder="NTT, NAV DC-3…" />
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it._key)}
                  disabled={items.length === 1}
                  style={{ height: 32, width: 32, borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', cursor: 'pointer', color: 'var(--red)', fontSize: 14, alignSelf: 'end' }}
                >✕</button>
              </div>
            ))}

            <button type="button" className="btn btn-ghost btn-sm" onClick={addItem} style={{ marginBottom: 16 }}>
              + Add item
            </button>

            <div className="field full" style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>Overall Remarks</label>
              <input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes for this challan" />
            </div>

            <div className="actionrow">
              <button className="btn btn-in" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create Job Order'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetForm}>Cancel</button>
              {msg.text && <span className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</span>}
            </div>
          </form>
        </div>
      )}

      {/* ── Orders list ── */}
      <div className="card no-print">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>
            All Job Orders <span className="pill-count">{visible.length}</span>
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'issued', 'received'].map(s => (
              <button
                key={s}
                className={`btn btn-sm ${statusFilter === s ? 'btn-in' : 'btn-ghost'}`}
                onClick={() => setStatusFilter(s)}
                style={{ textTransform: 'capitalize' }}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading…</p>
        ) : (
          <div className="tablewrap" style={{ overflowX: 'scroll' }}>
            <table style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>SR No</th>
                  <th>Date</th>
                  <th>Vendor Name</th>
                  <th>Vehicle No</th>
                  <th>Issued By</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Received At</th>
                  <th>Received By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(order => {
                  const sc = STATUS_COLORS[order.status] || STATUS_COLORS.issued;
                  return (
                    <tr key={order._id}>
                      <td className="mono" style={{ fontWeight: 700 }}>{order.srNo}</td>
                      <td>{order.date}</td>
                      <td style={{ fontWeight: 500 }}>{order.vendorName}</td>
                      <td>{order.vehicleNo  || '—'}</td>
                      <td>{order.issuedBy   || '—'}</td>
                      <td>{order.items?.length || 0}</td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
                          {order.status || 'issued'}
                        </span>
                      </td>
                      <td>{order.receivedAt || '—'}</td>
                      <td>{order.receivedBy || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setViewOrder(order)}>
                            👁 View
                          </button>
                          {order.status !== 'received' && (
                            <button className="btn btn-sm btn-in" onClick={() => setReceiveOrder(order)}>
                              ✓ Received
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !visible.length && (
          <div className="empty">
            No job orders yet.
            <p>Click <strong>+ New Job Order</strong> above to create your first delivery challan.</p>
          </div>
        )}
      </div>
    </>
  );
}