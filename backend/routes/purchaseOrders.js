const router          = require('express').Router();
const PurchaseOrder   = require('../models/PurchaseOrder');
const PurchaseRequest = require('../models/PurchaseRequest');
const { Counter, nextSeq } = require('../models/Counter');
const { authMiddleware, requireRole } = require('../middleware/auth');

const ALLOWED_ROLES = ['admin', 'purchase'];

// ── Helper: sum qty already ordered across all POs for a PR, per item name ──
async function orderedQtyMap(prId) {
  const pos = await PurchaseOrder.find({ prId }).lean();
  const map = {};
  for (const po of pos) {
    for (const it of (po.items || [])) {
      map[it.name] = (map[it.name] || 0) + (it.orderedQty || 0);
    }
  }
  return map;
}

// GET /api/purchase-orders/next-number
// Returns the next PO number without consuming it (preview for the form).
router.get('/next-number', authMiddleware, async (req, res) => {
  try {
    const counter = await Counter.findOne({ _id: 'purchaseOrder' });
    const nextSeqNum = (counter?.seq ?? 0) + 1;
    const poNumber = `PO-${String(nextSeqNum).padStart(5, '0')}`;
    res.json({ poNumber });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/purchase-orders?prId=<id>
// List POs for a specific PR, or all POs if no prId given.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = req.query.prId ? { prId: req.query.prId } : {};
    const list = await PurchaseOrder.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/purchase-orders
// Create a new PO with line items. Validates each item qty does not exceed
// (PR qty - already ordered qty). After saving, auto-advances PR to "ordered"
// if every PR item is now fully covered.
router.post('/', authMiddleware, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const { prNumber, prId, vendorName, poDate, items } = req.body;

    console.log('[PO CREATE] body:', JSON.stringify({ prNumber, prId, vendorName, poDate, itemsCount: Array.isArray(items) ? items.length : 'NOT_ARRAY', items }));

    if (!prNumber)              return res.status(400).json({ error: 'PR number is required.' });
    if (!prId)                  return res.status(400).json({ error: 'PR reference id is required.' });
    if (!vendorName)            return res.status(400).json({ error: 'Vendor name is required.' });
    if (!poDate)                return res.status(400).json({ error: 'PO date is required.' });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'At least one item is required.' });

    // Load the PR to validate qtys
    const pr = await PurchaseRequest.findById(prId);
    if (!pr) return res.status(404).json({ error: 'Purchase request not found.' });
    if (!['approved', 'partial', 'ordered'].includes(pr.status))
      return res.status(400).json({ error: `Cannot create a PO for a PR that is "${pr.status}".` });

    // Build a map of PR qty per item name
    const prQtyMap = {};
    for (const it of pr.items) prQtyMap[it.name] = it.qty;

    // Build a map of already-ordered qty per item name
    const alreadyOrdered = await orderedQtyMap(prId);

    // Validate and clean each PO item
    const cleanItems = [];
    for (const it of items) {
      if (!it.name || !String(it.name).trim()) continue;
      const orderedQty = parseFloat(it.orderedQty);
      if (!orderedQty || orderedQty <= 0) continue;

      const prQty   = prQtyMap[it.name] ?? 0;
      const already = alreadyOrdered[it.name] ?? 0;
      const remaining = prQty - already;

      if (orderedQty > remaining + 0.00001) {
        return res.status(400).json({
          error: `"${it.name}": ordered qty (${orderedQty}) exceeds remaining PR qty (${remaining}).`,
        });
      }

      cleanItems.push({
        name:       String(it.name).trim(),
        code:       it.code || '',
        category:   it.category || '',
        uom:        it.uom || '',
        orderedQty,
        remarks:    it.remarks || '',
      });
    }

    if (!cleanItems.length)
      return res.status(400).json({ error: 'At least one valid item with qty is required.' });

    // Create the PO
    const seq      = await nextSeq('purchaseOrder');
    const poNumber = `PO-${String(seq).padStart(5, '0')}`;

    const po = await PurchaseOrder.create({
      poNumber,
      prNumber,
      prId,
      vendorName: vendorName.trim(),
      poDate,
      items: cleanItems,
      createdByName:     req.user.name,
      createdByUsername: req.user.username,
    });

    // Check if the PR is now fully covered — advance to "ordered" if so
    const updatedOrdered = await orderedQtyMap(prId);
    const fullyCovered = pr.items.every(it => {
      return (updatedOrdered[it.name] ?? 0) >= it.qty - 0.00001;
    });

    if (fullyCovered) {
      pr.status    = 'ordered';
      pr.poNumber  = poNumber;
      pr.vendor    = vendorName.trim();
      pr.orderedAt = new Date();
      pr.history.push({
        status: 'ordered', byName: req.user.name, byUsername: req.user.username,
        note: `Fully covered by POs. Last PO: ${poNumber}`, at: new Date(),
      });
    } else {
      // Partially ordered — set partial status
      pr.status = 'partial';
      pr.history.push({
        status: 'partial', byName: req.user.name, byUsername: req.user.username,
        note: `Partial PO created: ${poNumber}`, at: new Date(),
      });
    }
    await pr.save();

    res.status(201).json(po);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'PO number collision — please retry.' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
