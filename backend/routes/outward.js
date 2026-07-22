const router  = require('express').Router();
const Outward = require('../models/Outward');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/outward
router.get('/', authMiddleware, async (req, res) => {
  try {
    const entries = await Outward.find().sort({ createdAt: -1 }).lean();
    res.json(entries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/outward — single
router.post('/', authMiddleware, requireRole('admin','store','store_manager'), async (req, res) => {
  try {
    const entry = await Outward.create(req.body);
    res.status(201).json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/outward/bulk
router.post('/bulk', authMiddleware, requireRole('admin','store','store_manager'), async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || !entries.length)
      return res.status(400).json({ error: 'No entries provided' });
    const docs = await Outward.insertMany(entries, { ordered: false });
    res.status(201).json({ inserted: docs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/outward/:id — full edit (admin + store team)
router.put('/:id', authMiddleware, requireRole('admin','store','store_manager'), async (req, res) => {
  try {
    const doc = await Outward.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/outward/:id (admin + store team)
router.delete('/:id', authMiddleware, requireRole('admin','store','store_manager'), async (req, res) => {
  try {
    const doc = await Outward.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
