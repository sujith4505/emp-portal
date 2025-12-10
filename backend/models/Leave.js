const mongoose = require('mongoose');
const LeaveSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  type: String,
  startDate: Date,
  endDate: Date,
  days: Number,
  reason: String,
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
module.exports = mongoose.model('Leave', LeaveSchema);
