/* SAFE SHIM: frontend/app.js
   Purpose: prevent runtime crashes when original app.js / backend are missing or buggy.
   This file intentionally keeps UI/layout unchanged and only provides guarded
   minimal behavior so the page does not "collapse". Replace with your real app.js
   when ready. Do NOT change HTML alignment/IDs after pasting.
*/

const API = 'http://localhost:4000'; // adjust if your backend runs on another port

// helper: safe get element
function $id(id) { return document.getElementById(id) || null; }

// show a modal message (non-destructive)
function showModal(title, html) {
  const modal = $id('modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="card" style="max-width:720px">
    <h3 style="margin-top:0">${title}</h3>
    <div style="white-space:pre-wrap;margin-top:8px">${html}</div>
    <div style="text-align:right;margin-top:10px"><button class="btn" onclick="document.getElementById('modal').classList.add('hidden')">Close</button></div>
  </div>`;
}


// safe fetch wrapper that won't throw uncaught exceptions
async function api(path, opts = {}) {
  try {
    opts.headers = opts.headers || {};
    // auto attach JSON header for non-FormData
    if (!(opts.body instanceof FormData) && !opts.headers['Content-Type']) {
      opts.headers['Content-Type'] = 'application/json';
    }
    const token = localStorage.getItem('token');
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API + path, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
    if (!res.ok) {
      // return object with error property
      return Promise.reject(data || { error: 'Request failed', status: res.status });
    }
    return data;
  } catch (err) {
    // network or other failure
    return Promise.reject({ error: 'Network or unexpected error: ' + (err.message || err) });
  }
}
api('/api/auth/register', {
  method: "POST",
  body: JSON.stringify({
    name: "Sujith",
    email: "sujith@gmail.com",
    password: "4505",
    role: "admin"
  })
});


/* ---- Minimal stubbed functions expected by your HTML ----
   These are intentionally safe and will not change layout or HTML.
   Replace them with your full implementations later.
*/

// auth UI rendering (safe)
function renderAuth() {
  const el = $id('authArea');
  if (!el) return;
  const me = JSON.parse(localStorage.getItem('me') || 'null');
  if (me && me.name) {
    el.innerHTML = `<div>Hi ${me.name} (${me.role || 'user'}) <button id="logoutBtn" class="btn">Logout</button></div>`;
    const btn = $id('logoutBtn');
    if (btn) btn.onclick = () => { localStorage.removeItem('token'); localStorage.removeItem('me'); renderAuth(); };
  } else {
    el.innerHTML = `<button id="loginBtn" class="btn">Login</button>`;
    const btn = $id('loginBtn');
    if (btn) btn.onclick = showLoginModal;
  }
}

// simple login modal (safe, performs a real API call if backend exists)
function showLoginModal() {
  showModal('Login', `<div class="row"><input id="shim_email" placeholder="email" value="admin@emp.com" /></div>
    <div class="row"><input id="shim_pass" placeholder="password" value="adminpass" type="password" /></div>
    <div style="text-align:right;margin-top:8px"><button id="shim_do" class="btn primary">Login</button></div>`);
  const btn = $id('shim_do');
  if (!btn) return;
  btn.onclick = async () => {
    const email = $id('shim_email') ? $id('shim_email').value : '';
    const password = $id('shim_pass') ? $id('shim_pass').value : '';
    if (!email || !password) { showModal('Login error', 'Enter email and password'); return; }
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (res && res.token) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('me', JSON.stringify(res.user || { name: res.user?.name || 'Admin', role: res.user?.role || 'admin', email }));
        renderAuth();
        document.getElementById('modal').classList.add('hidden');
        // attempt to refresh page data
        safeInitLoad();
      } else {
        showModal('Login failed', JSON.stringify(res));
      }
    } catch (err) {
      showModal('Login network error', (err && err.error) ? err.error : JSON.stringify(err));
    }
  };
}

/* --- Safe no-op implementations for functions your UI may call.
       They intentionally do minimal work and never throw. --- */

async function loadKPIs() {
  // try the real endpoint; if fails, render placeholders
  try {
    const r = await api('/api/reports/headcount');
    const k = $id('kpis');
    if (k) k.innerHTML = `<div class="card"><h4>Total</h4><div style="font-size:1.4rem">${r.total||0}</div></div>
      <div class="card"><h4>Active</h4><div style="font-size:1.4rem">${r.active||0}</div></div>
      <div class="card"><h4>User</h4><div style="font-size:1.4rem">${JSON.parse(localStorage.getItem('me')||'null')?.name||'-'}</div></div>`;
  } catch(e) {
    const k = $id('kpis');
    if (k) k.innerHTML = `<div class="card"><h4>Total</h4><div style="font-size:1.4rem">-</div></div>
      <div class="card"><h4>Active</h4><div style="font-size:1.4rem">-</div></div>
      <div class="card"><h4>User</h4><div style="font-size:1.4rem">${JSON.parse(localStorage.getItem('me')||'null')?.name||'-'}</div></div>`;
    console.warn('loadKPIs fallback', e);
  }
}

async function loadEmployees() {
  try {
    const res = await api('/api/employees');
    const list = $id('empList');
    if (!list) return;
    if (!res.data || res.data.length === 0) { list.innerHTML = '<div>No employees</div>'; return; }
    list.innerHTML = res.data.map(emp => `<div class="employee"><div class="avatar">${emp.firstName?emp.firstName[0]:'E'}</div>
      <div style="flex:1"><strong>${emp.firstName} ${emp.lastName||''}</strong><div style="color:#64748b">${emp.email||''}</div></div></div>`).join('');
    // populate attendance select
    const sel = $id('attendanceSelect');
    if (sel) sel.innerHTML = res.data.map(e => `<option value="${e._id}">${e.firstName} ${e.lastName||''}</option>`).join('');
  } catch (e) {
    // fallback: no employees
    const list = $id('empList');
    if (list) list.innerHTML = '<div>Failed to load employees</div>';
    console.warn('loadEmployees fallback', e);
  }
}

async function loadAttendanceChart() {
  // try to use /api/reports/attendance-summary; if not available, clear chart area
  try {
    const res = await api('/api/reports/attendance-summary');
    // if Chart.js is available, render small chart; otherwise skip
    if (window.Chart && res && Array.isArray(res.data)) {
      const ctx = $id('attendanceChart');
      if (ctx && ctx.getContext) {
        const labels = res.data.map(r => new Date(r._id).toLocaleDateString());
        const data = res.data.map(r => r.count);
        if (window._shimChart) { try { window._shimChart.destroy(); } catch {} }
        window._shimChart = new Chart(ctx.getContext('2d'), { type: 'line', data:{ labels, datasets:[{label:'Present', data}] } });
      }
    }
  } catch (e) {
    // ignore; chart not essential for safety
    console.warn('loadAttendanceChart fallback', e);
  }
}

async function loadAttendance() {
  try {
    const res = await api('/api/attendance');
    const el = $id('attendanceList');
    if (!el) return;
    if (!res.data || res.data.length === 0) { el.innerHTML = '<div>No attendance</div>'; return; }
    el.innerHTML = res.data.map(a => `<div class="card">${a.employee?.firstName || 'E'} ${a.employee?.lastName || ''} — ${new Date(a.date).toLocaleDateString()}</div>`).join('');
  } catch (e) {
    const el = $id('attendanceList');
    if (el) el.innerHTML = '<div>Failed to load attendance</div>';
    console.warn('loadAttendance fallback', e);
  }
}

async function loadLeaveBalances() {
  try {
    const res = await api('/api/leaves/balances');
    const el = $id('leaveBalances');
    const sel = $id('applyEmployee');
    if (!el) return;
    if (!res.data || res.data.length === 0) { el.innerHTML = '<div>No employees found</div>'; if (sel) sel.innerHTML = '<option value="">No employees</option>'; return; }
    el.innerHTML = res.data.map(e => `<div class="card"><div style="font-weight:700">${e.name}</div><div>Remaining: ${e.remaining} days</div></div>`).join('');
    if (sel) sel.innerHTML = `<option value="">Select Employee</option>` + res.data.map(e => `<option value="${e.employeeId}">${e.name} — ${e.remaining}d left</option>`).join('');
  } catch (e) {
    const el = $id('leaveBalances');
    if (el) el.innerHTML = '<div>Failed to load leave balances</div>';
    console.warn('loadLeaveBalances fallback', e);
  }
}

async function loadLeaveRequests() {
  try {
    const res = await api('/api/leaves');
    const el = $id('leaveRequests');
    if (!el) return;
    if (!res.data || res.data.length === 0) { el.innerHTML = '<div>No leave requests</div>'; return; }
    el.innerHTML = res.data.map(l => `<div class="card"><div><strong>${l.employee?.firstName || 'E'} ${l.employee?.lastName || ''}</strong> • ${l.days||0} day(s)</div><div>${l.reason||''}</div></div>`).join('');
  } catch (e) {
    const el = $id('leaveRequests');
    if (el) el.innerHTML = '<div>Failed to load leave requests</div>';
    console.warn('loadLeaveRequests fallback', e);
  }
}

async function loadPendingLeaves() {
  try {
    const res = await api('/api/leaves/pending');
    const el = $id('pendingLeaves');
    if (!el) return;
    if (!res.data || res.data.length === 0) { el.innerHTML = '<div class="card">No pending leave requests</div>'; return; }
    el.innerHTML = res.data.map(l => `<div class="card"><div style="display:flex;justify-content:space-between"><div><strong>${l.employee?.firstName||'E'} ${l.employee?.lastName||''}</strong></div><div>${l.days||0}d</div></div><div style="text-align:right;margin-top:6px"><button class="btn" onclick="approvePending('${l._id}')">Approve</button> <button class="btn" onclick="rejectPending('${l._id}')">Reject</button></div></div>`).join('');
  } catch (e) {
    const el = $id('pendingLeaves');
    if (el) el.innerHTML = '<div class="card">Failed to load pending leaves</div>';
    console.warn('loadPendingLeaves fallback', e);
  }
}

// safe approve/reject stubs (if backend available they will call it)
window.approvePending = async function(id) {
  try {
    await api('/api/leaves/' + id + '/approve', { method: 'PUT' });
    await safeInitLoad();
  } catch (err) { showModal('Approve failed', JSON.stringify(err)); }
};

window.rejectPending = async function(id) {
  try {
    await api('/api/leaves/' + id + '/reject', { method: 'PUT' });
    await safeInitLoad();
  } catch (err) { showModal('Reject failed', JSON.stringify(err)); }
};

// Admin users
async function loadUsers() {
  try {
    const res = await api('/api/users');
    const el = $id('usersList');
    if (!el) return;
    if (!res.data || res.data.length === 0) { el.innerHTML = '<div class="card">No users</div>'; return; }
    el.innerHTML = res.data.map(u => `<div class="card">${u.name} • ${u.email} • ${u.role}</div>`).join('');
  } catch (e) {
    const el = $id('usersList');
    if (el) el.innerHTML = '<div class="card">Failed to load users</div>';
    console.warn('loadUsers fallback', e);
  }
}

function showCreateUser() {
  const form = $id('createUserForm');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  // bind create/cancel safely
  const createBtn = $id('cu_create'); const cancelBtn = $id('cu_cancel');
  if (createBtn) createBtn.onclick = async () => {
    const name = $id('cu_name') ? $id('cu_name').value : '';
    const email = $id('cu_email') ? $id('cu_email').value : '';
    const password = $id('cu_password') ? $id('cu_password').value : '';
    const role = $id('cu_role') ? $id('cu_role').value : 'employee';
    try {
      await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
      showModal('User created', 'User created successfully');
      form.style.display = 'none';
      await loadUsers();
    } catch (err) { showModal('Create user failed', JSON.stringify(err)); }
  };
  if (cancelBtn) cancelBtn.onclick = () => { form.style.display = 'none'; };
}

// Apply leave (wired to #doApply)
async function applyLeaveFromForm() {
  const empSel = $id('applyEmployee');
  const typeEl = $id('applyType');
  const startEl = $id('applyStart');
  const endEl = $id('applyEnd');
  const reasonEl = $id('applyReason');
  if (!empSel || !startEl || !endEl) { showModal('Apply error', 'Missing form elements'); return; }
  const body = {
    employee: empSel.value,
    type: typeEl ? typeEl.value : 'Casual',
    startDate: startEl.value,
    endDate: endEl.value,
    reason: reasonEl ? reasonEl.value : ''
  };
  try {
    await api('/api/leaves', { method: 'POST', body: JSON.stringify(body) });
    showModal('Applied', 'Leave application submitted (pending)');
    await safeInitLoad();
  } catch (err) { showModal('Apply failed', JSON.stringify(err)); }
}

// attach apply handler safely if element exists
if ($id('doApply')) $id('doApply').onclick = applyLeaveFromForm;

// polling starter
let _pollHandle = null;
function startPolling() {
  if (_pollHandle) clearInterval(_pollHandle);
  _pollHandle = setInterval(() => { safeInitLoad(); }, 10000);
}

// one-shot initialization that won't throw
async function safeInitLoad() {
  try {
    renderAuth();
    await loadKPIs();
    await loadEmployees();
    await loadAttendanceChart();
    await loadAttendance();
    await loadLeaveBalances();
    await loadLeaveRequests();
    await loadPendingLeaves();
    await loadUsers();
  } catch (e) {
    console.warn('safeInitLoad partial failure', e);
  }
}

// DOM ready -> initialize safely
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    safeInitLoad();
    startPolling();
    // wire admin quick buttons safely
    const b1 = $id('adminLoadPendingBtn'); if (b1) b1.onclick = loadPendingLeaves;
    const b2 = $id('adminRefreshBtn'); if (b2) b2.onclick = safeInitLoad;
    const b3 = $id('adminCreateUserBtn'); if (b3) b3.onclick = showCreateUser;
  });
} else {
  safeInitLoad();
  startPolling();
  const b1 = $id('adminLoadPendingBtn'); if (b1) b1.onclick = loadPendingLeaves;
  const b2 = $id('adminRefreshBtn'); if (b2) b2.onclick = safeInitLoad;
  const b3 = $id('adminCreateUserBtn'); if (b3) b3.onclick = showCreateUser;
}
