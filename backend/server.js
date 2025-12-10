require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const User = require('./models/User');
const Employee = require('./models/Employee');
const Attendance = require('./models/Attendance');
const Leave = require('./models/Leave');
const Audit = require('./models/Audit');

const app = express();
app.use(cors());
app.use(express.json());
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if(!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g,'_'))
});
const upload = multer({ storage });

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emp_portal';
const JWT_SECRET = process.env.JWT_SECRET || 'secret_change_me';

mongoose.connect(MONGODB_URI).then(()=> console.log('Mongo connected')).catch(e=>{console.error(e); process.exit(1)});
// ===== AUTO CREATE ADMIN USER: sujith@gmail.com / 4505 =====
import bcrypt from "bcrypt"; // or const bcrypt = require("bcrypt"); based on your setup
import User from "./models/User.js"; // <-- adjust path if needed

async function ensureDefaultAdmin() {
  try {
    const existing = await User.findOne({ email: "sujith@gmail.com" });
    if (existing) {
      console.log("✔ Default admin already exists:", existing.email);
      return;
    }

    const hashed = await bcrypt.hash("4505", 10);

    const user = await User.create({
      name: "Sujith",
      email: "sujith@gmail.com",
      passwordHash: hashed,
      role: "admin"
    });

    console.log("✔ Default admin created:", user.email);
  } catch (err) {
    console.error("❌ Failed to create default admin:", err);
  }
}

ensureDefaultAdmin();
// ===== END AUTO ADMIN SCRIPT =====

// Auth helpers
function authMiddleware(req,res,next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({error:'No token'});
  const token = auth.split(' ')[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch(err){ return res.status(401).json({error:'Invalid token'})}
}

function role(required){
  return (req,res,next) => {
    if(!req.user) return res.status(401).json({error:'No user'});
    if(required.includes(req.user.role)) return next();
    return res.status(403).json({error:'Forbidden'});
  }
}

// Seed admin on start if not exists (password: adminpass)
(async ()=>{
  const admin = await User.findOne({ email: 'admin@emp.com' });
  if(!admin){
    const hash = await bcrypt.hash('adminpass', 10);
    await User.create({ name: 'Admin', email: 'admin@emp.com', passwordHash: hash, role: 'admin' });
    console.log('Seeded admin@emp.com (password: adminpass)');
  }
})();

// Routes

app.post('/api/auth/login', async (req,res)=>{
  const { email, password } = req.body;
  if(!email||!password) return res.status(400).json({error:'Email and password required'});
  const user = await User.findOne({ email });
  if(!user) return res.status(400).json({error:'Invalid creds'});
  const ok = await bcrypt.compare(password, user.passwordHash);
  if(!ok) return res.status(400).json({error:'Invalid creds'});
  const token = jwt.sign({ id:user._id, role:user.role, email:user.email, name:user.name }, JWT_SECRET, { expiresIn:'8h' });
  res.json({ token, user: { name:user.name, email:user.email, role:user.role } });
});

// Admin creates users
app.post('/api/auth/register', authMiddleware, role(['admin','hr']), async (req,res)=>{
  try{
    const { name, email, password, role: r } = req.body;
    if(!name||!email||!password) return res.status(400).json({error:'Missing'});
    const exists = await User.findOne({ email });
    if(exists) return res.status(400).json({error:'Email exists'});
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash: hash, role: r || 'employee' });
    await Audit.create({ user: req.user.id, action:'create_user', entity:'User', entityId: user._id.toString(), details:{ name, email, role: r } });
    res.status(201).json({ user: { id:user._id, name:user.name, email:user.email, role:user.role } });
  }catch(e){ res.status(400).json({error:e.message})}
});

// Employee CRUD
app.get('/api/employees', authMiddleware, async (req,res)=>{
  try{
    const { q='', department='', role='', status='', page=1, limit=100 } = req.query;
    const filter = {};
    if(q) filter.$or = [{ firstName: new RegExp(q,'i') }, { lastName: new RegExp(q,'i') }, { email: new RegExp(q,'i') }];
    if(department) filter.department = department;
    if(role) filter.role = role;
    if(status) filter.status = status;
    const data = await Employee.find(filter).skip((page-1)*limit).limit(parseInt(limit)).sort({ createdAt:-1 });
    const total = await Employee.countDocuments(filter);
    res.json({ data, total, page:Number(page), limit:Number(limit) });
  }catch(e){ res.status(500).json({error:e.message})}
});

app.post('/api/employees', authMiddleware, role(['admin','hr']), upload.single('photo'), async (req,res)=>{
  try{
    const body = req.body;
    if(req.file) body.photo = '/uploads/' + req.file.filename;
    if(body.dateOfJoining) body.dateOfJoining = new Date(body.dateOfJoining);
    if(body.salary && typeof body.salary === 'string') body.salary = { basic: Number(body.salary) || 0 };
    const emp = await Employee.create(body);
    await Audit.create({ user: req.user.id, action:'create', entity:'Employee', entityId: emp._id.toString(), details: emp.toObject() });
    res.status(201).json({ data: emp });
  }catch(e){ res.status(400).json({error:e.message})}
});

app.get('/api/employees/:id', authMiddleware, async (req,res)=>{
  try{
    const emp = await Employee.findById(req.params.id);
    if(!emp) return res.status(404).json({error:'Not found'});
    res.json({ data: emp });
  }catch(e){ res.status(400).json({error:e.message})}
});

app.put('/api/employees/:id', authMiddleware, role(['admin','hr']), upload.single('photo'), async (req,res)=>{
  try{
    const update = req.body;
    if(req.file) update.photo = '/uploads/' + req.file.filename;
    if(update.dateOfJoining) update.dateOfJoining = new Date(update.dateOfJoining);
    if(update.salary && typeof update.salary === 'string') update.salary = { basic: Number(update.salary) || 0 };
    const emp = await Employee.findByIdAndUpdate(req.params.id, update, { new: true });
    if(!emp) return res.status(404).json({error:'Not found'});
    await Audit.create({ user: req.user.id, action:'update', entity:'Employee', entityId: emp._id.toString(), details: update });
    res.json({ data: emp });
  }catch(e){ res.status(400).json({error:e.message})}
});

app.delete('/api/employees/:id', authMiddleware, role(['admin','hr']), async (req,res)=>{
  try{
    const emp = await Employee.findByIdAndDelete(req.params.id);
    if(!emp) return res.status(404).json({error:'Not found'});
    await Audit.create({ user: req.user.id, action:'delete', entity:'Employee', entityId: emp._id.toString(), details: emp.toObject() });
    res.json({ data: emp });
  }catch(e){ res.status(400).json({error:e.message})}
});

// Attendance
app.post('/api/attendance/checkin', authMiddleware, async (req,res)=>{
  try{
    const { employeeId } = req.body;
    if(!employeeId) return res.status(400).json({error:'employeeId'});
    const date = new Date(); date.setHours(0,0,0,0);
    let att = await Attendance.findOne({ employee: employeeId, date });
    if(att) return res.status(400).json({error:'Already checked in'});
    att = await Attendance.create({ employee: employeeId, date, checkIn: new Date() });
    await Audit.create({ user: req.user.id, action:'checkin', entity:'Attendance', entityId: att._id.toString(), details:{ employeeId } });
    res.json({ data: att });
  }catch(e){ res.status(400).json({error:e.message})}
});

app.post('/api/attendance/checkout', authMiddleware, async (req,res)=>{
  try{
    const { employeeId } = req.body;
    if(!employeeId) return res.status(400).json({error:'employeeId'});
    const date = new Date(); date.setHours(0,0,0,0);
    let att = await Attendance.findOne({ employee: employeeId, date });
    if(!att) return res.status(400).json({error:'No checkin found'});
    if(att.checkOut) return res.status(400).json({error:'Already checked out'});
    att.checkOut = new Date();
    att.totalHours = (att.checkOut - att.checkIn) / (1000*60*60);
    await att.save();
    await Audit.create({ user: req.user.id, action:'checkout', entity:'Attendance', entityId: att._id.toString(), details:{ employeeId, totalHours: att.totalHours } });
    res.json({ data: att });
  }catch(e){ res.status(400).json({error:e.message})}
});

// manual adjustments
app.put('/api/attendance/:id', authMiddleware, role(['admin','hr','manager']), async (req,res)=>{
  try{
    const up = req.body;
    const att = await Attendance.findByIdAndUpdate(req.params.id, up, { new:true });
    await Audit.create({ user: req.user.id, action:'update', entity:'Attendance', entityId: att._id.toString(), details: up });
    res.json({ data: att });
  }catch(e){ res.status(400).json({error:e.message})}
});

app.get('/api/attendance', authMiddleware, async (req,res)=>{
  try{
    const { from, to, employeeId } = req.query;
    const q = {};
    if(employeeId) q.employee = employeeId;
    if(from || to){
      q.date = {};
      if(from) q.date.$gte = new Date(from);
      if(to) q.date.$lte = new Date(to);
    }
    const list = await Attendance.find(q).populate('employee').sort({ date:-1 });
    res.json({ data: list });
  }catch(e){ res.status(400).json({error:e.message})}
});
// Get leave balances for all employees
app.get('/api/leaves/balances', authMiddleware, role(['admin','hr','manager','employee']), async (req,res)=>{
  try{
    // fetch employees
    const emps = await Employee.find({});
    // aggregate used approved days per employee
    const used = await Leave.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$employee', usedDays: { $sum: '$days' } } }
    ]);
    const usedMap = {};
    used.forEach(u => { usedMap[u._id.toString()] = u.usedDays; });

    const result = emps.map(e => {
      const usedDays = usedMap[e._id.toString()] || 0;
      const allocation = (e.leaveAllocation || 12);
      const remaining = Math.max(0, allocation - usedDays);
      return {
        employeeId: e._id,
        name: `${e.firstName || ''} ${e.lastName || ''}`.trim(),
        allocation,
        usedDays,
        remaining
      };
    });

    res.json({ data: result });
  }catch(e){
    console.error('GET /api/leaves/balances error', e);
    res.status(500).json({ error: e.message });
  }
});

// Get pending leave requests (admin/hr/manager)
app.get('/api/leaves/pending', authMiddleware, role(['admin','hr','manager']), async (req,res)=>{
  try{
    const pending = await Leave.find({ status: 'pending' }).populate('employee').populate('appliedBy', 'name email').sort({ createdAt: -1 });
    res.json({ data: pending });
  }catch(e){
    console.error('GET /api/leaves/pending error', e);
    res.status(500).json({ error: e.message });
  }
});

// Apply leave - compute days and validate employee
app.post('/api/leaves', authMiddleware, async (req,res)=>{
  try{
    const body = req.body;
    if(!body.employee) return res.status(400).json({ error:'employee is required' });

    // parse dates
    const startDate = body.startDate ? new Date(body.startDate) : null;
    const endDate = body.endDate ? new Date(body.endDate) : null;
    if(!startDate || !endDate) return res.status(400).json({ error:'startDate and endDate required' });
    if(endDate < startDate) return res.status(400).json({ error:'endDate must be >= startDate' });

    // compute inclusive days
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.floor((endDate.setHours(0,0,0,0) - startDate.setHours(0,0,0,0)) / msPerDay) + 1;

    body.startDate = new Date(req.body.startDate);
    body.endDate = new Date(req.body.endDate);
    body.days = days;
    body.appliedBy = req.user.id;
    body.status = 'pending';

    // verify employee exists
    const emp = await Employee.findById(body.employee);
    if(!emp) return res.status(400).json({ error:'Employee not found' });

    const leave = await Leave.create(body);
    await Audit.create({ user: req.user.id, action:'apply_leave', entity:'Leave', entityId: leave._id.toString(), details: body });
    res.status(201).json({ data: leave });
  }catch(e){
    console.error('POST /api/leaves error', e);
    res.status(400).json({ error: e.message });
  }
});


app.get('/api/leaves', authMiddleware, async (req,res)=>{
  try{
    const { status } = req.query;
    const q = {};
    if(status) q.status = status;
    const list = await Leave.find(q).populate('employee').sort({createdAt:-1});
    res.json({ data: list });
  }catch(e){ res.status(400).json({error:e.message})}
});

app.put('/api/leaves/:id/approve', authMiddleware, role(['admin','hr','manager']), async (req,res)=>{
  try{
    const leave = await Leave.findByIdAndUpdate(req.params.id, { status:'approved' }, { new:true });
    await Audit.create({ user: req.user.id, action:'approve_leave', entity:'Leave', entityId: leave._id.toString(), details:{} });
    res.json({ data: leave });
  }catch(e){ res.status(400).json({error:e.message})}
});

app.put('/api/leaves/:id/reject', authMiddleware, role(['admin','hr','manager']), async (req,res)=>{
  try{
    const leave = await Leave.findByIdAndUpdate(req.params.id, { status:'rejected' }, { new:true });
    await Audit.create({ user: req.user.id, action:'reject_leave', entity:'Leave', entityId: leave._id.toString(), details:{} });
    res.json({ data: leave });
  }catch(e){ res.status(400).json({error:e.message})}
});

// Payroll - generate CSV payslip for a month (basic)
app.post('/api/payroll/generate', authMiddleware, role(['admin','hr']), async (req,res)=>{
  try{
    const { month, year } = req.body;
    if(!month || !year) return res.status(400).json({error:'month and year required'});
    const emps = await Employee.find({});
    const rows = emps.map(e=>{
      const gross = (e.salary?.basic||0) + (e.salary?.allowances||0);
      const net = gross - (e.salary?.deductions||0);
      return { name: e.firstName + ' ' + (e.lastName||''), email: e.email, department: e.department||'', gross, net };
    });
    const filePath = path.join(__dirname, 'uploads', `payslip-${month}-${year}.csv`);
    const csvWriter = createCsvWriter({ path: filePath, header:[
      {id:'name', title:'Name'},{id:'email',title:'Email'},{id:'department',title:'Department'},{id:'gross',title:'Gross'},{id:'net',title:'Net'}
    ]});
    await csvWriter.writeRecords(rows);
    await Audit.create({ user: req.user.id, action:'generate_payroll', entity:'Payroll', entityId:'', details:{ month, year } });
    res.download(filePath);
  }catch(e){ res.status(400).json({error:e.message})}
});

// Reports simple endpoints
app.get('/api/reports/headcount', authMiddleware, async (req,res)=>{
  const total = await Employee.countDocuments({});
  const active = await Employee.countDocuments({ status:'active' });
  res.json({ total, active });
});

app.get('/api/reports/attendance-summary', authMiddleware, async (req,res)=>{
  // last 30 days summary: count present per day
  const since = new Date(); since.setDate(since.getDate()-30);
  const arr = await Attendance.aggregate([
    { $match: { date: { $gte: since } } },
    { $group: { _id: '$date', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  res.json({ data: arr });
});

// Audit logs
app.get('/api/audit', authMiddleware, role(['admin','hr']), async (req,res)=>{
  const logs = await Audit.find({}).populate('user').sort({ createdAt:-1 }).limit(200);
  res.json({ data: logs });
});

// Serve uploads and frontend
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('*', (req,res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')));
// Add to backend/server.js - list users (admin/hr)
app.get('/api/users', authMiddleware, role(['admin','hr']), async (req, res) => {
  try {
    const users = await User.find({}, { passwordHash: 0 }).sort({ createdAt: -1 });
    res.json({ data: users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


app.listen(PORT, ()=> console.log('Server listening on', PORT));
