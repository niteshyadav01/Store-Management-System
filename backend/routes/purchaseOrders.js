const router          = require('express').Router();
const PurchaseOrder   = require('../models/PurchaseOrder');
const PurchaseRequest = require('../models/PurchaseRequest');
const Inward          = require('../models/Inward');
const { Counter, nextSeq } = require('../models/Counter');
const { authMiddleware, requireRole } = require('../middleware/auth');

const ALLOWED_ROLES = ['admin', 'purchase'];

// ── Shared helpers ────────────────────────────────────────────────────────────

// Sum ordered qty per item name across all POs linked to a PR
async function orderedQtyMap(prId) {
  const pos = await PurchaseOrder.find({ prId }).lean();
  const map = {};
  for (const po of pos)
    for (const it of (po.items || []))
      map[it.name] = (map[it.name] || 0) + (it.orderedQty || 0);
  return map;
}

// Sum inwarded qty per `${poNumber}||${itemName}` key for a set of PO numbers
async function inwardedQtyMap(poNumbers) {
  if (!poNumbers.length) return {};
  const docs = await Inward.find({ po: { $in: poNumbers } }).lean();
  const map = {};
  for (const doc of docs) {
    if (!doc.po) continue;
    const key = `${doc.po}||${doc.name}`;
    map[key] = (map[key] || 0) + (doc.qty || 0);
  }
  return map;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/purchase-orders/next-number
router.get('/next-number', authMiddleware, async (req, res) => {
  try {
    const counter    = await Counter.findOne({ _id: 'purchaseOrder' });
    const nextSeqNum = (counter?.seq ?? 0) + 1;
    res.json({ poNumber: `PO-${String(nextSeqNum).padStart(5, '0')}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/purchase-orders/by-number/:poNumber
router.get('/by-number/:poNumber', authMiddleware, async (req, res) => {
  try {
    const po = await PurchaseOrder.findOne({ poNumber: req.params.poNumber }).lean();
    if (!po) return res.status(404).json({ error: 'PO not found.' });
    res.json(po);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/purchase-orders/po-matching
// All POs with per-item ordered vs received breakdown.
router.get('/po-matching', authMiddleware, async (req, res) => {
  try {
    const allPos   = await PurchaseOrder.find().sort({ createdAt: -1 }).lean();
    const inwarded = await inwardedQtyMap(allPos.map(p => p.poNumber));

    const result = allPos.map(po => {
      const items = (po.items || []).map(it => {
        const receivedQty = inwarded[`${po.poNumber}||${it.name}`] || 0;
        const pendingQty  = Math.max(0, it.orderedQty - receivedQty);
        return { name: it.name, code: it.code || '', uom: it.uom || '',
          orderedQty: it.orderedQty, receivedQty, pendingQty, price: it.price || 0 };
      });
      const fullyReceived    = items.every(it => it.pendingQty  <= 0.00001);
      const partiallyReceived = !fullyReceived && items.some(it => it.receivedQty > 0);
      return {
        _id: po._id, poNumber: po.poNumber, poDate: po.poDate,
        poExpectedDate: po.poExpectedDate || '', prNumber: po.prNumber,
        vendorName: po.vendorName, createdByName: po.createdByName, items,
        status: fullyReceived ? 'received' : partiallyReceived ? 'partial' : 'pending',
      };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/purchase-orders/pending-inward
// POs with at least one item not yet fully received (for Inward Entry dropdown).
router.get('/pending-inward', authMiddleware, async (req, res) => {
  try {
    const allPos   = await PurchaseOrder.find().sort({ createdAt: -1 }).lean();
    const inwarded = await inwardedQtyMap(allPos.map(p => p.poNumber));

    const result = allPos
      .map(po => {
        const remainingItems = (po.items || []).filter(it => {
          const received = inwarded[`${po.poNumber}||${it.name}`] || 0;
          return received < it.orderedQty - 0.00001;
        }).length;
        return { ...po, remainingItems };
      })
      .filter(po => po.remainingItems > 0);

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/purchase-orders
router.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = req.query.prId ? { prId: req.query.prId } : {};
    const list   = await PurchaseOrder.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/purchase-orders — create a new PO
router.post('/', authMiddleware, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const { prNumber, prId, vendorName, poDate, poExpectedDate, items } = req.body;

    if (!prNumber)                           return res.status(400).json({ error: 'PR number is required.' });
    if (!prId)                               return res.status(400).json({ error: 'PR reference id is required.' });
    if (!vendorName)                         return res.status(400).json({ error: 'Vendor name is required.' });
    if (!poDate)                             return res.status(400).json({ error: 'PO date is required.' });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'At least one item is required.' });

    const pr = await PurchaseRequest.findById(prId);
    if (!pr) return res.status(404).json({ error: 'Purchase request not found.' });
    if (!['approved', 'partial', 'ordered'].includes(pr.status))
      return res.status(400).json({ error: `Cannot create a PO for a PR with status "${pr.status}".` });

    const prQtyMap      = Object.fromEntries(pr.items.map(it => [it.name, it.qty]));
    const alreadyOrdered = await orderedQtyMap(prId);

    const cleanItems = [];
    for (const it of items) {
      const name       = String(it.name || '').trim();
      const orderedQty = parseFloat(it.orderedQty);
      if (!name || !orderedQty || orderedQty <= 0) continue;

      const remaining = (prQtyMap[name] ?? 0) - (alreadyOrdered[name] ?? 0);
      if (orderedQty > remaining + 0.00001)
        return res.status(400).json({ error: `"${name}": qty (${orderedQty}) exceeds remaining (${remaining}).` });

      cleanItems.push({
        name, code: it.code || '', category: it.category || '', uom: it.uom || '',
        orderedQty, price: parseFloat(it.price) || 0, remarks: it.remarks || '',
      });
    }
    if (!cleanItems.length)
      return res.status(400).json({ error: 'At least one valid item with qty is required.' });

    const seq      = await nextSeq('purchaseOrder');
    const poNumber = `PO-${String(seq).padStart(5, '0')}`;

    const po = await PurchaseOrder.create({
      poNumber, prNumber, prId,
      vendorName: vendorName.trim(), poDate,
      poExpectedDate: poExpectedDate || '',
      items: cleanItems,
      createdByName: req.user.name, createdByUsername: req.user.username,
    });

    // Advance PR status based on coverage
    const updatedOrdered = await orderedQtyMap(prId);
    const fullyCovered   = pr.items.every(it => (updatedOrdered[it.name] ?? 0) >= it.qty - 0.00001);

    if (fullyCovered) {
      pr.status = 'ordered'; pr.poNumber = poNumber;
      pr.vendor = vendorName.trim(); pr.orderedAt = new Date();
      pr.history.push({ status: 'ordered', byName: req.user.name, byUsername: req.user.username,
        note: `Fully covered. Last PO: ${poNumber}`, at: new Date() });
    } else {
      pr.status = 'partial';
      pr.history.push({ status: 'partial', byName: req.user.name, byUsername: req.user.username,
        note: `Partial PO created: ${poNumber}`, at: new Date() });
    }
    await pr.save();

    res.status(201).json(po);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'PO number collision — please retry.' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
