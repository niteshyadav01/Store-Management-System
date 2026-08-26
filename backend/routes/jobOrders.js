const router   = require('express').Router();
const JobOrder = require('../models/JobOrder');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Matches ROLE_ACCESS.jobOrders in App.jsx
const ALLOWED_ROLES = ['admin', 'store_manager', 'store','purchase'];

// Coerce possibly-string numeric fields safely.
const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ── GET /api/job-orders ───────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const list = await JobOrder.find().sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    console.error('[job-orders GET /] ', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/job-orders/:id ───────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await JobOrder.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Job order not found.' });
    res.json(order);
  } catch (err) {
    console.error('[job-orders GET /:id] ', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/job-orders — create ─────────────────────────────────────────────
router.post('/', authMiddleware, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const { srNo, date, vendorName, vehicleNo, issuedBy, deliveryAddress, remarks, items } = req.body;

    if (!srNo || !String(srNo).trim())         return res.status(400).json({ error: 'SR No is required.' });
    if (!vendorName || !vendorName.trim())     return res.status(400).json({ error: 'Vendor name is required.' });
    if (!issuedBy || !issuedBy.trim())         return res.status(400).json({ error: 'Issued By is required.' });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'At least one item is required.' });

    const cleanItems = [];
    for (const it of items) {
      const description = String(it.description || '').trim();
      const projectName = String(it.projectName || '').trim();
      const qty = parseFloat(it.qty);
      if (!description || !qty || qty <= 0 || !projectName) continue;
      cleanItems.push({
        description, size: it.size || '', qty,
        unit: it.unit || 'NOS', projectName, ralCode: it.ralCode || '', remark: it.remark || '',
      });
    }
    if (!cleanItems.length)
      return res.status(400).json({ error: 'At least one valid item with description, qty, and project name is required.' });

    const existing = await JobOrder.findOne({ srNo: String(srNo).trim() }).lean();
    if (existing) return res.status(409).json({ error: `SR No "${srNo}" already exists.` });

    const order = await JobOrder.create({
      srNo: String(srNo).trim(),
      date: date || new Date().toISOString().slice(0, 10),
      vendorName: vendorName.trim(),
      vehicleNo: vehicleNo || '',
      issuedBy: issuedBy.trim(),
      deliveryAddress: deliveryAddress || '',
      remarks: remarks || '',
      items: cleanItems,
      status: 'issued',
      history: [{ action: 'issued', by: req.user.name || req.user.username,
        note: `Issued to ${vendorName.trim()}`, at: new Date() }],
      createdByName: req.user.name, createdByUsername: req.user.username,
    });

    res.status(201).json(order);
  } catch (err) {
    console.error('[job-orders POST /] ', err);
    if (err.code === 11000) return res.status(409).json({ error: 'SR No collision — please retry.' });
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/job-orders/:id/receive — mark received (supports partial) ──────
// items[] is positional and MUST align with order.items — the frontend builds
// it by iterating order.items in order, so this holds as long as nothing
// reorders order.items between fetch and submit.
//
// Partial receiving: for each item, `receiving` only needs to be <= remaining
// (qty - receivedQty so far) — it does NOT have to equal the full remaining
// amount. Whatever isn't received now just stays pending; status becomes
// 'partial' until every item's receivedQty reaches its qty, at which point
// status flips to 'received'.
router.patch('/:id/receive', authMiddleware, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const { items, receivedBy, challanNo, note } = req.body;
    console.log('[job-orders PATCH /:id/receive] incoming', req.params.id, JSON.stringify(req.body));

    const order = await JobOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Job order not found.' });

    if (!Array.isArray(items) || items.length !== order.items.length) {
      console.error('[job-orders PATCH /:id/receive] length mismatch', {
        payloadLength: Array.isArray(items) ? items.length : typeof items,
        orderItemsLength: order.items.length,
      });
      return res.status(400).json({ error: 'Items payload must align with order items.' });
    }

    const receivedLines = [];
    let anyReceived = false;

    for (let i = 0; i < order.items.length; i++) {
      const it    = order.items[i];
      const entry = items[i] || {};
      const receiving = num(entry.receiving);
      if (receiving <= 0) continue; // this item is being left pending — fine, that's partial receiving

      const remaining = Math.max(0, num(it.qty) - num(it.receivedQty));
      if (receiving > remaining + 0.0001)
        return res.status(400).json({ error: `"${it.description}": can't receive ${receiving}, only ${remaining} pending.` });
      if (!entry.location || !String(entry.location).trim())
        return res.status(400).json({ error: `Location is required for "${it.description}".` });

      it.receipts.push({
        qty: receiving,
        location: entry.location,
        receivedBy: receivedBy || req.user.name || req.user.username,
        note: note || '',
        at: new Date(),
      });
      it.receivedQty = Math.min(num(it.qty), num(it.receivedQty) + receiving);
      anyReceived = true;
      receivedLines.push(`${it.description}: ${receiving} ${it.unit} @ ${entry.location}`);
    }

    if (!anyReceived)
      return res.status(400).json({ error: 'Enter a received quantity for at least one item.' });

    // Status derived from actual item quantities, not trusted from the client.
    // If any item still has qty - receivedQty > 0, this stays 'partial' — that's
    // what lets the same order be received again later for the remaining qty.
    const allReceived = order.items.every(it => num(it.receivedQty) >= num(it.qty) - 0.0001);
    order.status = allReceived ? 'received' : 'partial';

    // Order-level summary fields — kept for quick display / backward compatibility.
    // Item-level `receipts` remain the source of truth for exact location breakdown.
    const distinctLocations = [...new Set(order.items.flatMap(it => it.receipts.map(r => r.location)))];
    if (distinctLocations.length === 1) order.receivedAt = distinctLocations[0];
    else if (distinctLocations.length > 1) order.receivedAt = 'Multiple locations';
    order.receivedBy = receivedBy || order.receivedBy;
    if (challanNo && String(challanNo).trim()) order.challanNo = String(challanNo).trim();

    order.history.push({
      action: allReceived ? 'received' : 'partial-received',
      by: receivedBy || req.user.name || req.user.username,
      note: receivedLines.join('; ') + (challanNo ? ` — Challan No: ${challanNo}` : '') + (note ? ` — ${note}` : ''),
      at: new Date(),
    });

    // markModified is a safety net: Mongoose usually tracks nested subdocument
    // array mutations (push, direct field assignment) automatically, but if
    // this .save() ever silently doesn't persist item-level changes, this
    // guarantees the whole items array is written.
    order.markModified('items');
    await order.save();

    console.log('[job-orders PATCH /:id/receive] saved', order._id.toString(), 'status:', order.status);
    res.json(order);
  } catch (err) {
    console.error('[job-orders PATCH /:id/receive] ', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;