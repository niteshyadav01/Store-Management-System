const router          = require('express').Router();
const PurchaseOrder   = require('../models/PurchaseOrder');
const PurchaseRequest = require('../models/PurchaseRequest');
const Inward          = require('../models/Inward');
const { Counter, nextSeq } = require('../models/Counter');
const { authMiddleware, requireRole } = require('../middleware/auth');

const ALLOWED_ROLES = ['admin', 'purchase'];

// ── Shared helpers ────────────────────────────────────────────────────────────

async function orderedQtyMap(prId) {
  const pos = await PurchaseOrder.find({ prId }).lean();
  const map = {};
  for (const po of pos)
    for (const it of (po.items || []))
      map[it.name] = (map[it.name] || 0) + (it.orderedQty || 0);
  return map;
}

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

async function syncPrStatus(prId, { note, byName, byUsername } = {}) {
  const pr = await PurchaseRequest.findById(prId);
  if (!pr) return null;

  const updatedOrdered = await orderedQtyMap(prId);
  const fullyCovered = pr.items.every(it => (updatedOrdered[it.name] ?? 0) >= it.qty - 0.00001);
  const anyOrdered   = pr.items.some(it => (updatedOrdered[it.name] ?? 0) > 0.00001);

  pr.status = fullyCovered ? 'ordered' : anyOrdered ? 'partial' : 'approved';
  if (note) {
    pr.history.push({
      status: pr.status, byName: byName || '', byUsername: byUsername || '', note, at: new Date(),
    });
  }
  await pr.save();
  return pr;
}

// Build a human-readable list of exactly what changed between the old PO
// and the incoming edit — used for the activity log description.
// ── Change-diff helper ────────────────────────────────────────────────────────

const FIELD_LABELS = {
  poNumber: 'PO Number',
  vendorName: 'Vendor',
  projectName: 'Project',
  poDate: 'PO Date',
  poExpectedDate: 'Expected Date',
};

const DATE_FIELDS = new Set(['poDate', 'poExpectedDate']);

// Stored as 'YYYY-MM-DD' → display as 'DD/MM/YYYY'
function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).split('-');
  if (!y || !m || !day) return String(d);
  return `${day}/${m}/${y}`;
}

function diffPOChanges(oldPo, newFields, newItems) {
  const changes = [];

  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const oldRaw = String(oldPo[key] ?? '').trim();
    const newRaw = String(newFields[key] ?? '').trim();
    if (oldRaw !== newRaw) {
      changes.push({
        field: label,
        from: DATE_FIELDS.has(key) ? fmtDate(oldRaw) : (oldRaw || '—'),
        to:   DATE_FIELDS.has(key) ? fmtDate(newRaw) : (newRaw || '—'),
      });
    }
  }

  const oldItemsByName = Object.fromEntries((oldPo.items || []).map(it => [it.name, it]));
  const newNames = new Set(newItems.map(it => it.name));

  for (const it of newItems) {
    const old = oldItemsByName[it.name];
    if (!old) {
      changes.push({ field: 'Item added', from: '—', to: `${it.name} (qty ${it.orderedQty}, price ${it.price})` });
      continue;
    }
    if (Number(old.orderedQty) !== Number(it.orderedQty))
      changes.push({ field: `${it.name} — Qty`, from: String(old.orderedQty), to: String(it.orderedQty) });
    if (Number(old.price || 0) !== Number(it.price || 0))
      changes.push({ field: `${it.name} — Price`, from: String(old.price || 0), to: String(it.price || 0) });
    if ((old.remarks || '') !== (it.remarks || ''))
      changes.push({ field: `${it.name} — Remarks`, from: old.remarks || '—', to: it.remarks || '—' });
    if ((old.projectName || '') !== (it.projectName || ''))
      changes.push({ field: `${it.name} — Project`, from: old.projectName || '—', to: it.projectName || '—' });
  }

  for (const old of (oldPo.items || [])) {
    if (!newNames.has(old.name)) changes.push({ field: 'Item removed', from: old.name, to: '—' });
  }

  return changes;
}
// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/next-number', authMiddleware, async (req, res) => {
  try {
    const counter    = await Counter.findOne({ _id: 'purchaseOrder' });
    const nextSeqNum = (counter?.seq ?? 0) + 1;
    res.json({ poNumber: `PO-${String(nextSeqNum).padStart(5, '0')}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/by-number/:poNumber', authMiddleware, async (req, res) => {
  try {
    const po = await PurchaseOrder.findOne({ poNumber: req.params.poNumber }).lean();
    if (!po) return res.status(404).json({ error: 'PO not found.' });
    res.json(po);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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

router.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = req.query.prId ? { prId: req.query.prId } : {};
    const list   = await PurchaseOrder.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/purchase-orders/:id/activity — newest first
router.get('/:id/activity', authMiddleware, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id).lean();
    if (!po) return res.status(404).json({ error: 'PO not found.' });
    const list = [...(po.activity || [])].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/purchase-orders — create a new PO
router.post('/', authMiddleware, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const { poNumber, prNumber, prId, vendorName, projectName, poDate, poExpectedDate, items } = req.body;

    const cleanPoNumber = String(poNumber || '').trim();

    if (!cleanPoNumber)                      return res.status(400).json({ error: 'PO number is required.' });
    if (!prNumber)                           return res.status(400).json({ error: 'PR number is required.' });
    if (!prId)                               return res.status(400).json({ error: 'PR reference id is required.' });
    if (!vendorName)                         return res.status(400).json({ error: 'Vendor name is required.' });
    if (!poDate)                             return res.status(400).json({ error: 'PO date is required.' });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'At least one item is required.' });

    // const existing = await PurchaseOrder.findOne({ poNumber: cleanPoNumber }).lean();
    // if (existing)
    //   return res.status(409).json({ error: `PO number "${cleanPoNumber}" already exists.` });

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
        projectName: it.projectName || projectName || '',
        orderedQty, price: parseFloat(it.price) || 0, remarks: it.remarks || '',
      });
    }
    if (!cleanItems.length)
      return res.status(400).json({ error: 'At least one valid item with qty is required.' });

    const po = await PurchaseOrder.create({
      poNumber: cleanPoNumber, prNumber, prId,
      vendorName: vendorName.trim(),
      projectName: projectName || '',
      poDate,
      poExpectedDate: poExpectedDate || '',
      items: cleanItems,
      createdByName: req.user.name, createdByUsername: req.user.username,
      activity: [{
        action: 'created',
        description: `PO ${cleanPoNumber} created against PR ${prNumber}.`,
        performedByName: req.user.name,
        performedByRole: req.user.role,
      }],
    });

    const updatedOrdered = await orderedQtyMap(prId);
    const fullyCovered   = pr.items.every(it => (updatedOrdered[it.name] ?? 0) >= it.qty - 0.00001);

    if (fullyCovered) {
      pr.status = 'ordered'; pr.poNumber = cleanPoNumber;
      pr.vendor = vendorName.trim(); pr.orderedAt = new Date();
      pr.history.push({ status: 'ordered', byName: req.user.name, byUsername: req.user.username,
        note: `Fully covered. Last PO: ${cleanPoNumber}`, at: new Date() });
    } else {
      pr.status = 'partial';
      pr.history.push({ status: 'partial', byName: req.user.name, byUsername: req.user.username,
        note: `Partial PO created: ${cleanPoNumber}`, at: new Date() });
    }
    await pr.save();

    res.status(201).json(po);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'PO number collision — please retry.' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/purchase-orders/:id — full edit (fields + items), logs exactly what changed
// PATCH /api/purchase-orders/:id — full edit (fields + items), logs structured field-level diff
// PATCH /api/purchase-orders/:id — full edit (fields + items), logs structured field-level diff
router.patch('/:id', authMiddleware, requireRole(...ALLOWED_ROLES), async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) return res.status(404).json({ error: 'PO not found.' });

    const { poNumber, vendorName, projectName, poDate, poExpectedDate, items } = req.body;
    const cleanPoNumber = String(poNumber || '').trim();

    if (!cleanPoNumber)  return res.status(400).json({ error: 'PO number is required.' });
    if (!vendorName)     return res.status(400).json({ error: 'Vendor name is required.' });
    if (!poDate)         return res.status(400).json({ error: 'PO date is required.' });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'At least one item is required.' });

    // if (cleanPoNumber !== po.poNumber) {
    //   const clash = await PurchaseOrder.findOne({ poNumber: cleanPoNumber, _id: { $ne: po._id } }).lean();
    //   if (clash) return res.status(409).json({ error: `PO number "${cleanPoNumber}" already exists.` });
    // }

    const inwarded = await inwardedQtyMap([po.poNumber]);
    const cleanItems = [];
    for (const it of items) {
      const name       = String(it.name || '').trim();
      const orderedQty = parseFloat(it.orderedQty);
      const price      = parseFloat(it.price);

      if (!name)                          return res.status(400).json({ error: 'Item name is required.' });
      if (!orderedQty || orderedQty <= 0) return res.status(400).json({ error: `"${name}": qty must be > 0.` });
      if (!price || price <= 0)           return res.status(400).json({ error: `"${name}": unit price must be > 0.` });

      const received = inwarded[`${po.poNumber}||${name}`] || 0;
      if (orderedQty < received - 0.00001)
        return res.status(400).json({
          error: `"${name}": ordered qty (${orderedQty}) can't be less than already-received qty (${received}).`,
        });

      cleanItems.push({
        name, code: it.code || '', category: it.category || '', uom: it.uom || '',
        projectName: it.projectName || projectName || '',
        orderedQty, price, remarks: it.remarks || '',
      });
    }

    const oldPoSnapshot = po.toObject();
    const newFields = {
      poNumber: cleanPoNumber, vendorName: vendorName.trim(),
      projectName: projectName || '', poDate, poExpectedDate: poExpectedDate || '',
    };
    const changes = diffPOChanges(oldPoSnapshot, newFields, cleanItems);

    const oldNumber = po.poNumber;
    po.poNumber       = cleanPoNumber;
    po.vendorName     = vendorName.trim();
    po.projectName    = projectName || '';
    po.poDate          = poDate;
    po.poExpectedDate = poExpectedDate || '';
    po.items           = cleanItems;
    po.activity.push({
      action: 'updated',
      description: changes.length ? `${changes.length} field(s) changed` : 'No changes detected.',
      changes,
      performedByName: req.user.name,
      performedByRole: req.user.role,
    });
    await po.save();

    if (cleanPoNumber !== oldNumber) {
      await Inward.updateMany({ po: oldNumber }, { $set: { po: cleanPoNumber } });
      await PurchaseRequest.updateOne({ poNumber: oldNumber }, { $set: { poNumber: cleanPoNumber } });
    }

    await syncPrStatus(po.prId, {
      note: `PO updated: ${cleanPoNumber}`,
      byName: req.user.name,
      byUsername: req.user.username,
    });

    res.json(po);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'PO number collision — please retry.' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/purchase-orders/:id — admin only
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) return res.status(404).json({ error: 'PO not found.' });

    const inwarded = await inwardedQtyMap([po.poNumber]);
    const hasReceipts = Object.keys(inwarded).some(
      k => k.startsWith(`${po.poNumber}||`) && inwarded[k] > 0
    );
    if (hasReceipts)
      return res.status(400).json({ error: 'Cannot delete a PO that already has inward receipts against it.' });

    const prId = po.prId;
    const poNumber = po.poNumber;
    await PurchaseOrder.deleteOne({ _id: po._id });

    await syncPrStatus(prId, {
      note: `PO deleted: ${poNumber}`,
      byName: req.user.name,
      byUsername: req.user.username,
    });

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;