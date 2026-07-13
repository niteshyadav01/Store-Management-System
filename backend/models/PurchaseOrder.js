const mongoose = require('mongoose');

const poItemSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  code:       { type: String, default: '' },
  category:   { type: String, default: '' },
  uom:        { type: String, default: '' },
  orderedQty: { type: Number, required: true, min: 0.0001 },
  price:      { type: Number, default: 0 },
  remarks:    { type: String, default: '' },
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
  poNumber:   { type: String, required: true, unique: true },
  prNumber:   { type: String, required: true },
  prId:       { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRequest', required: true },
  vendorName: { type: String, required: true, trim: true },
  poDate:           { type: String, required: true },
  poExpectedDate:   { type: String, default: '' },
  items:      { type: [poItemSchema], validate: v => Array.isArray(v) && v.length > 0 },
  createdByName:     { type: String, default: '' },
  createdByUsername: { type: String, default: '' },
}, { timestamps: true });

purchaseOrderSchema.index({ prId: 1 });
purchaseOrderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
