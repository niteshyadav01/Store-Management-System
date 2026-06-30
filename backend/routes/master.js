const router   = require('express').Router();
const Material = require('../models/Material');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/master
router.get('/', authMiddleware, async (req, res) => {
  try {
    const list = await Material.find().sort({ name: 1 }).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/master  — single
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { name, type, code, category, uom, minStock } = req.body;
    if (!name) return res.status(400).json({ error: 'Material name is required' });
    const mat = await Material.create({
      name: name.trim(), type, code, category, uom,
      minStock: parseFloat(minStock) || 0,
    });
    res.status(201).json(mat);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Material name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/master/:id  — edit existing material
router.put('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { name, type, code, category, uom, minStock } = req.body;
    if (!name) return res.status(400).json({ error: 'Material name is required' });
    const mat = await Material.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          name: name.trim(), type, code, category, uom,
          minStock: parseFloat(minStock) || 0,
        },
      },
      { new: true, runValidators: true }
    );
    if (!mat) return res.status(404).json({ error: 'Material not found' });
    res.json(mat);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Material name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/master/bulk
router.post('/bulk', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { materials } = req.body;
    if (!Array.isArray(materials) || !materials.length)
      return res.status(400).json({ error: 'No materials provided' });
    let added = 0, skipped = 0;
    for (const m of materials) {
      if (!m.name) { skipped++; continue; }
      await Material.findOneAndUpdate(
        { name: m.name.trim() },
        { $set: {
            type: m.type||'', code: m.code||'', category: m.category||'', uom: m.uom||'',
            minStock: parseFloat(m.minStock) || 0,
          } },
        { upsert: true }
      );
      added++;
    }
    res.json({ added, skipped });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/master/:id
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    await Material.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;