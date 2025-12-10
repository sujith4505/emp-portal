const mongoose = require('mongoose');
const AuditSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: String,
  entity: String,
  entityId: String,
  details: Object
}, { timestamps: true });
module.exports = mongoose.model('Audit', AuditSchema);
