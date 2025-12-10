// backend/models/Employee.js
const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: { type: String, unique: true, required: true },
  phone: String,
  department: String,
  role: String,
  dateOfJoining: Date,
  salary: {
    basic: { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 }
  },
  photo: String,
  status: { type: String, enum: ['active','inactive'], default: 'active' },
  // NEW: total leave allocation (days per year or per policy)
  leaveAllocation: { type: Number, default: 12 } 
}, { timestamps: true });

module.exports = mongoose.model('Employee', EmployeeSchema);
