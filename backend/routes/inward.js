const router = require('express').Router();
const Inward = require('../models/Inward');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/inward
router.get('/', authMiddleware, async (req, res) => {
  try {
    const entries = await Inward.find().sort({ createdAt: -1 }).lean();
    res.json(entries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/inward — single
router.post('/', authMiddleware, requireRole('admin','inward','purchase'), async (req, res) => {
  try {
    const entry = await Inward.create(req.body);
    res.status(201).json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/inward/bulk
router.post('/bulk', authMiddleware, requireRole('admin','inward','purchase'), async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || !entries.length)
      return res.status(400).json({ error: 'No entries provided' });
    const docs = await Inward.insertMany(entries, { ordered: false });
    res.status(201).json({ inserted: docs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/inward/:id — update price (purchase team)
router.patch('/:id', authMiddleware, requireRole('admin','purchase'), async (req, res) => {
  try {
    const doc = await Inward.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/inward/:id — full edit (admin + inward team)
router.put('/:id', authMiddleware, requireRole('admin','inward'), async (req, res) => {
  try {
    const doc = await Inward.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/inward/:id — delete entry (admin + inward team)
router.delete('/:id', authMiddleware, requireRole('admin','inward'), async (req, res) => {
  try {
    const doc = await Inward.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
