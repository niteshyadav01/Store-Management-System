const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User   = require('../models/User');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/users
router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const list = await User.find().select('-password').lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users — create or update
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password)
      return res.status(400).json({ error: 'name, username and password are required' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.findOneAndUpdate(
      { username: username.toLowerCase().trim() },
      { $set: { name: name.trim(), password: hash, role } },
      { upsert: true, new: true }
    );
    res.status(201).json({ name: user.name, username: user.username, role: user.role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/users/:username
router.delete('/:username', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    if (req.params.username === req.user.username)
      return res.status(400).json({ error: "Cannot delete your own account" });
    await User.findOneAndDelete({ username: req.params.username });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
