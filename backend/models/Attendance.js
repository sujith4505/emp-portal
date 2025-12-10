const mongoose = require('mongoose');
const AttendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  date: { type: Date, required: true },
  checkIn: Date,
  checkOut: Date,
  totalHours: Number,
  note: String
}, { timestamps: true });
AttendanceSchema.index({ employee:1, date:1 }, { unique: true });
module.exports = mongoose.model('Attendance', AttendanceSchema);
