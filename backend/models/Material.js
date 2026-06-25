const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  name:     { type: String, required: true, unique: true, trim: true },
  type:     { type: String, default: '', trim: true },
  code:     { type: String, default: '', trim: true },
  category: { type: String, default: '', trim: true },
  uom:      { type: String, default: '', trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Material', materialSchema);
