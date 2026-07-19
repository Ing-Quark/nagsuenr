// dashboard.js - Chapter Executive Portal Operations

let supabaseClient;
let currentUniversity = null; // Store university record { id, name, short_name, slug, whatsapp_link, facebook_link }
let allMembers = [];
let filteredMembers = [];
let executivesList = [];
let financeRecords = [];

// Pagination State
let currentPage = 1;
const recordsPerPage = 10;

// Audio & Haptic Utilities (Match existing design language)
const HapticEffects = {
  vibrate(pattern) { if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch(e){} } },
  tap()     { this.vibrate(15); },
  success() { this.vibrate([20, 50, 40]); },
  error()   { this.vibrate([60, 50, 60]); }
};

const AudioEffects = {
  ctx: null,
  init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
  _play(freq, type = 'sine', vol = 0.08, dur = 0.05) {
    try {
      this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(); osc.stop(this.ctx.currentTime + dur);
    } catch(e){}
  },
  playClick()   { this._play(600, 'sine', 0.08, 0.05); },
  playError()   { this._play(150, 'sawtooth', 0.12, 0.25); },
  playSuccess() {
    try {
      this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.frequency.setValueAtTime(f, now + i * 0.07);
        g.gain.setValueAtTime(0.06, now + i * 0.07);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.2);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(now + i * 0.07); o.stop(now + i * 0.07 + 0.2);
      });
    } catch(e){}
  }
};

// Toast Notifications
const Toast = {
  container: null,
  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'info', duration = 3500) {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => { this.removeToast(toast); });
    toast.appendChild(closeBtn);
    this.container.appendChild(toast);
    toast.offsetHeight;
    toast.classList.add('show');
    const tId = setTimeout(() => { this.removeToast(toast); }, duration);
    toast.dataset.timeoutId = tId;
  },
  removeToast(toast) {
    if (toast.dataset.timeoutId) clearTimeout(parseInt(toast.dataset.timeoutId));
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => { if (toast.parentNode) toast.parentNode.removeChild(toast); });
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); }
};

// Auth Guard
function checkAuth() {
  const loggedIn = sessionStorage.getItem('nags_logged_in');
  const role     = sessionStorage.getItem('nags_role');
  
  if (loggedIn !== 'true' || !role || role === 'super_admin') {
    sessionStorage.clear();
    window.location.href = '/login.html';
  }
}

// Initialize Supabase Client
function initSupabase() {
  if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL) {
    showDashboardError('System configuration missing. Refresh the page.');
    return;
  }
  supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

// Display Error Notice
function showDashboardError(msg) {
  AudioEffects.playError();
  HapticEffects.error();
  const box = document.getElementById('admin-error-box');
  if (box) {
    box.textContent = msg;
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 6000);
  } else {
    Toast.error(msg);
  }
}

// ── ROLE TAB CONFIGURATION ──

const TABS_CONFIG = {
  chapter_admin:  ['members', 'sms', 'socials', 'analytics', 'executives', 'finance'],
  president:      ['members', 'sms', 'socials', 'analytics', 'executives', 'finance'],
  vice_president: ['members', 'sms', 'socials', 'analytics', 'finance'],
  pro:            ['members', 'sms', 'socials', 'analytics'],
  organizing_sec: ['members', 'sms'],
  financial_sec:  ['finance', 'analytics'],
  secretary:      ['members', 'analytics'],
  welfare:        ['members']
};

function renderTabsNavigation() {
  const role = sessionStorage.getItem('nags_role');
  const allowedTabs = TABS_CONFIG[role] || ['members'];
  const nav = document.getElementById('dashboard-tab-bar');
  if (!nav) return;

  const tabLabels = {
    members: 'Members Directory',
    sms: 'SMS Broadcast',
    socials: 'Social Links',
    analytics: 'Analytics & Export',
    executives: 'Executives Team',
    finance: 'Finance Ledger'
  };

  nav.innerHTML = '';
  allowedTabs.forEach((tabId, idx) => {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${idx === 0 ? 'active' : ''}`;
    btn.dataset.tab = tabId;
    btn.textContent = tabLabels[tabId] || tabId;
    
    btn.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      
      // Update buttons
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update sections
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
      const targetSec = document.getElementById(`tab-${tabId}`);
      if (targetSec) targetSec.classList.add('active');
    });

    nav.appendChild(btn);
  });

  // Activate first section
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  const firstSec = document.getElementById(`tab-${allowedTabs[0]}`);
  if (firstSec) firstSec.classList.add('active');
}

// ── ENFORCE READ-ONLY PERMISSIONS IN UI ──

function enforceUIPermissions() {
  const role = sessionStorage.getItem('nags_role');

  // 1. Members tab read-only (Secretary and Welfare)
  if (role === 'secretary' || role === 'welfare') {
    // Hide action columns & headers in CSS and JS
    document.querySelectorAll('.exec-only-action').forEach(el => el.style.display = 'none');
  }

  // 2. Settings tab write access (only chapter_admin and president)
  if (role === 'chapter_admin' || role === 'president') {
    document.querySelectorAll('.settings-writable-group').forEach(el => el.style.display = 'block');
  }

  // 3. Finance tab read-only (Vice President)
  if (role === 'vice_president') {
    // Hide Add Record trigger
    const addTrigger = document.getElementById('btn-trigger-add-record');
    if (addTrigger) addTrigger.style.display = 'none';

    // Hide Export ledger button
    const expLedger = document.getElementById('btn-export-finance-csv');
    if (expLedger) expLedger.style.display = 'none';

    // Hide Actions column on finance table
    document.querySelectorAll('.delete-finance-col').forEach(el => el.style.display = 'none');
  }
}

// ── DYNAMIC BRANDING FETCH ──

async function loadChapterBranding() {
  const universityId = sessionStorage.getItem('nags_university');
  if (!universityId || !supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from('universities')
      .select('*')
      .eq('id', universityId)
      .single();

    if (error) throw error;
    currentUniversity = data;

    // Prefill headers
    document.getElementById('header-subtitle-text').textContent = `NAGS-${currentUniversity.short_name} — ${currentUniversity.name} Chapter`;
    document.getElementById('header-motto-text').innerHTML = `${currentUniversity.location || 'Ghana'} &middot; Motto: Kishilbi Konwule M'ata Kuyu`;
    if (currentUniversity.logo_url) {
      document.getElementById('header-logo').src = currentUniversity.logo_url;
    }

    // Prefill settings invite links
    const waLink = document.getElementById('wa-current-link-val');
    const fbLink = document.getElementById('fb-current-link-val');
    if (waLink) waLink.value = currentUniversity.whatsapp_link || 'Not Set';
    if (fbLink) fbLink.value = currentUniversity.facebook_link || 'Not Set';

    // Generate chapter specific QR Code
    generateQRCode();

  } catch(e) {
    console.error('Branding fetch failed:', e.message);
  }
}

// Generate Chapter Registration Portal QR Code
function generateQRCode() {
  const qrContainer = document.getElementById('qrcode');
  if (!qrContainer) return;
  qrContainer.innerHTML = '';

  const regUrl = `${window.location.origin}/register/?chapter=${currentUniversity.slug}`;
  new QRCode(qrContainer, {
    text: regUrl,
    width: 140,
    height: 140,
    colorDark: '#081830',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
}

// ── DATA ACQUISITION & INTEGRATION ──

async function reloadDashboardData() {
  const universityId = sessionStorage.getItem('nags_university');
  if (!universityId || !supabaseClient) return;

  showTableLoader(true);

  try {
    // 1. Load Members
    const { data: members, error: mErr } = await supabaseClient
      .from('nags_members')
      .select('*')
      .eq('university_id', universityId)
      .order('created_at', { ascending: false });

    if (mErr) throw mErr;
    allMembers = members || [];
    filteredMembers = [...allMembers];

    // 2. Load Executives (if in role list)
    const role = sessionStorage.getItem('nags_role');
    if (TABS_CONFIG[role].includes('executives')) {
      const { data: execs, error: eErr } = await supabaseClient
        .from('executives')
        .select('*')
        .eq('university_id', universityId)
        .order('created_at', { ascending: true });

      if (eErr) throw eErr;
      executivesList = execs || [];
    }

    // 3. Load Finances (if in role list)
    if (TABS_CONFIG[role].includes('finance')) {
      const { data: finances, error: fErr } = await supabaseClient
        .from('finance_records')
        .select('*')
        .eq('university_id', universityId)
        .order('date', { ascending: false });

      if (fErr) throw fErr;
      financeRecords = finances || [];
    }

    // Refresh UI Components
    refreshStatsRibbons();
    refreshMembersTable();
    refreshExecutivesTable();
    refreshFinanceLedger();
    refreshAnalyticsTab();

  } catch(e) {
    showDashboardError('Query error: ' + e.message);
  } finally {
    showTableLoader(false);
  }
}

// ── REFRESH SUBSECTIONS ──

function refreshStatsRibbons() {
  const total = allMembers.length;
  const males = allMembers.filter(m => m.gender === 'Male').length;
  const females = allMembers.filter(m => m.gender === 'Female').length;

  document.getElementById('stat-total-val').textContent = total;
  document.getElementById('stat-male-val').textContent = males;
  document.getElementById('stat-female-val').textContent = females;

  // SMS target counts
  const setLabel = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `(${count} numbers)`;
  };
  setLabel('lbl-cnt-all', total);
  setLabel('lbl-cnt-male', males);
  setLabel('lbl-cnt-female', females);
  setLabel('lbl-cnt-l100', allMembers.filter(m => String(m.level) === '100').length);
  setLabel('lbl-cnt-l200', allMembers.filter(m => String(m.level) === '200').length);
  setLabel('lbl-cnt-l300', allMembers.filter(m => String(m.level) === '300').length);
  setLabel('lbl-cnt-l400', allMembers.filter(m => String(m.level) === '400').length);
}

function refreshMembersTable() {
  const tbody = document.getElementById('members-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  
  if (filteredMembers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--ink-light);">No student matching query found.</td></tr>`;
    return;
  }

  // Paginate
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = startIndex + recordsPerPage;
  const paginated = filteredMembers.slice(startIndex, endIndex);

  const role = sessionStorage.getItem('nags_role');
  const isReadOnly = role === 'secretary' || role === 'welfare';

  paginated.forEach((m, idx) => {
    const row = document.createElement('tr');
    const number = startIndex + idx + 1;

    const waBadge = m.whatsapp_joined 
      ? '<span class="badge-status active">Joined</span>'
      : '<span class="badge-status inactive">Pending</span>';

    const actionCell = isReadOnly
      ? ''
      : `<td class="text-center exec-only-action">
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size:10px; margin:0;" onclick="deleteMemberClick('${m.id}')">Delete</button>
         </td>`;

    row.innerHTML = `
      <td>${number}</td>
      <td style="font-weight:700;">${escapeHTML(m.full_name)}</td>
      <td>${escapeHTML(m.gender)}</td>
      <td>${escapeHTML(m.programme || 'Not Specified')}</td>
      <td>L${escapeHTML(String(m.level))}</td>
      <td><code>${escapeHTML(m.phone)}</code></td>
      <td>${waBadge}</td>
      <td>${escapeHTML(m.hometown || 'Not Specified')}</td>
      <td>${new Date(m.created_at).toLocaleDateString()}</td>
      ${actionCell}
    `;
    tbody.appendChild(row);
  });
}

function refreshExecutivesTable() {
  const tbody = document.getElementById('execs-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  executivesList.forEach(ex => {
    const row = document.createElement('tr');

    const statusClass = ex.is_active ? 'badge-status active' : 'badge-status inactive';
    const statusText = ex.is_active ? 'Active' : 'Deactivated';
    const toggleLabel = ex.is_active ? 'Deactivate' : 'Activate';

    const isSelf = ex.email === sessionStorage.getItem('nags_exec_email');
    const actionBtn = isSelf
      ? `<span style="font-size:11px; opacity:0.5; font-style:italic;">Protected</span>`
      : `<button class="btn ${ex.is_active ? 'btn-secondary' : 'btn-primary'}" style="padding: 2px 8px; font-size:10px; margin:0;" onclick="toggleChapterExecActive('${ex.id}', ${ex.is_active})">${toggleLabel}</button>`;

    row.innerHTML = `
      <td style="font-weight:700;">${escapeHTML(ex.full_name)}</td>
      <td><code>${escapeHTML(ex.email)}</code></td>
      <td><span style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--blue);">${ex.role.replace(/_/g, ' ')}</span></td>
      <td><span class="${statusClass}">${statusText}</span></td>
      <td class="text-center">${actionBtn}</td>
    `;
    tbody.appendChild(row);
  });
}

function refreshFinanceLedger() {
  const tbody = document.getElementById('finance-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  let totalIncome = 0;
  let totalExpense = 0;

  financeRecords.forEach(rec => {
    const amt = parseFloat(rec.amount || 0);
    if (rec.type === 'income') totalIncome += amt;
    else if (rec.type === 'expense') totalExpense += amt;
  });

  const currentBalance = totalIncome - totalExpense;

  // Format values with GHS prefix and 2 decimals
  document.getElementById('finance-income-val').textContent = `GHS ${totalIncome.toFixed(2)}`;
  document.getElementById('finance-expense-val').textContent = `GHS ${totalExpense.toFixed(2)}`;
  
  const balanceVal = document.getElementById('finance-balance-val');
  balanceVal.textContent = `GHS ${currentBalance.toFixed(2)}`;
  if (currentBalance < 0) balanceVal.style.color = '#ff4d4f';
  else balanceVal.style.color = 'var(--green)';

  if (financeRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--ink-light);">No finance records recorded.</td></tr>`;
    return;
  }

  const role = sessionStorage.getItem('nags_role');
  const isVP = role === 'vice_president';
  const isChapterAdmin = role === 'chapter_admin';

  financeRecords.forEach(rec => {
    const row = document.createElement('tr');
    
    // Find exec name who recorded it
    let recByName = 'System';
    if (rec.recorded_by) {
      const eObj = executivesList.find(e => e.id === rec.recorded_by);
      recByName = eObj ? eObj.full_name : 'Exec';
    }

    const typeBadge = rec.type === 'income' 
      ? '<span class="badge-status active">Income</span>'
      : '<span class="badge-status inactive">Expense</span>';

    const amountFormatted = `GHS ${parseFloat(rec.amount).toFixed(2)}`;
    
    const receiptCell = rec.receipt_url
      ? `<td class="text-center"><a href="${escapeAttr(rec.receipt_url)}" target="_blank" style="font-size:12px; color:var(--blue); font-weight:700;">Receipt &rarr;</a></td>`
      : `<td class="text-center" style="color:var(--ink-light); font-size:11px;">None</td>`;

    // Only chapter_admin can delete finance records
    const deleteBtn = (isChapterAdmin)
      ? `<button class="btn btn-secondary" style="padding: 2px 8px; font-size:10px; margin:0;" onclick="deleteFinanceClick('${rec.id}')">Delete</button>`
      : `<span style="font-size:11px; opacity:0.5; font-style:italic;">Protected</span>`;

    const actionCell = isVP ? '' : `<td class="text-center delete-finance-col">${deleteBtn}</td>`;

    row.innerHTML = `
      <td>${rec.date}</td>
      <td style="font-weight:600;">${escapeHTML(rec.description)}</td>
      <td>${typeBadge}</td>
      <td style="font-weight:700; color: ${rec.type === 'income' ? 'var(--green)' : '#ff4d4f'};">${amountFormatted}</td>
      <td>${escapeHTML(recByName)}</td>
      ${receiptCell}
      ${actionCell}
    `;
    tbody.appendChild(row);
  });
}

function refreshAnalyticsTab() {
  const total = allMembers.length;
  if (total === 0) return;

  const male = allMembers.filter(m => m.gender === 'Male').length;
  const female = allMembers.filter(m => m.gender === 'Female').length;
  const whatsapp = allMembers.filter(m => m.whatsapp_joined).length;

  document.getElementById('analytics-total').textContent = total;
  
  // WA rates
  const waRate = Math.round((whatsapp / total) * 100);
  document.getElementById('analytics-wa-rate').textContent = `${waRate}%`;
  document.getElementById('analytics-wa-progress').style.width = `${waRate}%`;

  // Gender dist
  document.getElementById('analytics-gender-ratio').textContent = `${male}M / ${female}F`;
  const malePerc = (male / total) * 100;
  const femalePerc = (female / total) * 100;
  document.getElementById('analytics-male-bar').style.width = `${malePerc}%`;
  document.getElementById('analytics-female-bar').style.width = `${femalePerc}%`;

  // Level breakdowns
  const getLvlCount = (lvl) => allMembers.filter(m => String(m.level) === String(lvl)).length;
  const l100 = getLvlCount(100);
  const l200 = getLvlCount(200);
  const l300 = getLvlCount(300);
  const l400 = getLvlCount(400);

  const fillBar = (id, valId, count) => {
    document.getElementById(valId).textContent = count;
    const perc = (count / total) * 100;
    document.getElementById(id).style.width = `${perc}%`;
  };
  fillBar('bar-lvl-100', 'val-lvl-100', l100);
  fillBar('bar-lvl-200', 'val-lvl-200', l200);
  fillBar('bar-lvl-300', 'val-lvl-300', l300);
  fillBar('bar-lvl-400', 'val-lvl-400', l400);

  // Donut SVG offsets (circumference of r=35 is 219.91)
  const c = 219.91;
  const offsets = {
    l100: c - (l100 / total) * c,
    l200: c - (l200 / total) * c,
    l300: c - (l300 / total) * c,
    l400: c - (l400 / total) * c
  };

  document.getElementById('donut-lvl-100').style.strokeDashoffset = offsets.l100;
  document.getElementById('donut-lvl-200').style.strokeDashoffset = offsets.l200;
  document.getElementById('donut-lvl-300').style.strokeDashoffset = offsets.l300;
  document.getElementById('donut-lvl-400').style.strokeDashoffset = offsets.l400;
  document.getElementById('donut-total-text').textContent = total;

  // Donut Legend percentages
  document.getElementById('lbl-donut-100').textContent = `${Math.round((l100/total)*100)}%`;
  document.getElementById('lbl-donut-200').textContent = `${Math.round((l200/total)*100)}%`;
  document.getElementById('lbl-donut-300').textContent = `${Math.round((l300/total)*100)}%`;
  document.getElementById('lbl-donut-400').textContent = `${Math.round((l400/total)*100)}%`;

  // Demographics table
  const demTbody = document.getElementById('list-demographics-main');
  if (demTbody) {
    demTbody.innerHTML = '';
    // Show top 6 for layout preview
    allMembers.slice(0, 6).forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${escapeHTML(m.full_name)}</td>
        <td>Level ${m.level}</td>
        <td>${escapeHTML(m.hometown || 'Not set')}</td>
        <td>${escapeHTML(m.programme || 'Not set')}</td>
      `;
      demTbody.appendChild(tr);
    });
  }
}

// ── ACTION HANDLERS ──

// Duplicate delete handler for Members
async function deleteMemberClick(id) {
  AudioEffects.playClick();
  HapticEffects.tap();

  if (!confirm('Are you sure you want to delete this student record from the directory?')) return;

  try {
    const { error } = await supabaseClient
      .from('nags_members')
      .delete()
      .eq('id', id)
      .eq('university_id', currentUniversity.id); // extra guard

    if (error) throw error;

    AudioEffects.playSuccess();
    HapticEffects.success();
    Toast.success('Member removed successfully.');
    await reloadDashboardData();

  } catch(e) {
    showDashboardError('Delete failed: ' + e.message);
  }
}

// Duplicate delete handler for Finances
async function deleteFinanceClick(id) {
  AudioEffects.playClick();
  HapticEffects.tap();

  if (!confirm('Are you sure you want to remove this financial log?')) return;

  try {
    const { error } = await supabaseClient
      .from('finance_records')
      .delete()
      .eq('id', id)
      .eq('university_id', currentUniversity.id);

    if (error) throw error;

    AudioEffects.playSuccess();
    HapticEffects.success();
    Toast.success('Financial record deleted.');
    await reloadDashboardData();

  } catch(e) {
    showDashboardError('Delete transaction failed: ' + e.message);
  }
}

// Update social settings
async function handleUpdateSocials() {
  AudioEffects.playClick();
  HapticEffects.tap();

  const waLink = document.getElementById('wa-invite-link').value.trim();
  const fbLink = document.getElementById('fb-invite-link').value.trim();

  const updates = {};
  if (waLink) updates.whatsapp_link = waLink;
  if (fbLink) updates.facebook_link = fbLink;

  if (Object.keys(updates).length === 0) {
    showDashboardError('Please paste at least one URL to update.');
    return;
  }

  const btn = document.getElementById('btn-update-socials');
  btn.disabled = true;
  btn.textContent = 'Updating...';

  try {
    const { error } = await supabaseClient
      .from('universities')
      .update(updates)
      .eq('id', currentUniversity.id);

    if (error) throw error;

    AudioEffects.playSuccess();
    HapticEffects.success();
    Toast.success('Social Links updated successfully!');
    
    // Refresh branding
    await loadChapterBranding();

  } catch(e) {
    showDashboardError('Update failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update Social Links';
  }
}

// ── SMS BROADCAST HANDLER ──

async function handleSMSBroadcast(e) {
  e.preventDefault();
  AudioEffects.playClick();
  HapticEffects.tap();

  const sender = document.getElementById('sms-sender-id').value.trim();
  const message = document.getElementById('sms-message').value.trim();
  const target = document.querySelector('input[name="sms-target"]:checked').value;

  if (!message) { showDashboardError('SMS Message content cannot be empty.'); return; }

  // Resolve target numbers
  let targets = [];
  if (target === 'all') targets = allMembers;
  else if (target === 'male') targets = allMembers.filter(m => m.gender === 'Male');
  else if (target === 'female') targets = allMembers.filter(m => m.gender === 'Female');
  else if (target.startsWith('lvl')) {
    const levelStr = target.replace('lvl', '');
    targets = allMembers.filter(m => String(m.level) === levelStr);
  }

  const phoneNumbers = targets.map(m => m.phone).filter(p => !!p);

  if (phoneNumbers.length === 0) {
    showDashboardError('No recipients found for the selected filter.');
    return;
  }

  if (!confirm(`Are you sure you want to broadcast this SMS to ${phoneNumbers.length} recipients?`)) return;

  const btn = document.getElementById('btn-send-sms');
  const resultBox = document.getElementById('sms-result-box');
  
  btn.disabled = true;
  btn.textContent = 'Broadcasting...';

  try {
    const res = await fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        recipients: phoneNumbers,
        sender
      })
    });

    const logStatus = res.ok ? 'sent' : 'failed';
    const responseJson = await res.json();

    // Database Insert SMS Log
    const execId = sessionStorage.getItem('nags_exec_id');
    await supabaseClient
      .from('sms_logs')
      .insert([{
        university_id: currentUniversity.id,
        sent_by: execId || null,
        sender_id: sender,
        message,
        recipient_count: phoneNumbers.length,
        status: logStatus
      }]);

    if (!res.ok) {
      throw new Error(responseJson.message || 'SMS Service broadcast returned failure status.');
    }

    AudioEffects.playSuccess();
    HapticEffects.success();

    resultBox.className = 'message-box success';
    resultBox.textContent = `Broadcast completed! Sent to ${phoneNumbers.length} recipients.`;
    resultBox.style.display = 'block';
    
    // Clear form
    document.getElementById('sms-message').value = '';
    document.getElementById('sms-chars').textContent = '0 / 160 characters';

  } catch(err) {
    resultBox.className = 'message-box error';
    resultBox.textContent = 'Broadcast Failed: ' + err.message;
    resultBox.style.display = 'block';
    showDashboardError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send SMS';
  }
}

// ── EXECUTIVES ACCESS CREATION ──

let credentialsTimer = null;

async function handleExecSubmit(e) {
  e.preventDefault();
  AudioEffects.playClick();
  HapticEffects.tap();

  const fullName = document.getElementById('exec-fullname').value.trim();
  const email = document.getElementById('exec-email').value.trim();
  const role = document.getElementById('exec-role').value;

  if (!fullName || !email || !role) {
    showDashboardError('All fields are required.');
    return;
  }

  // Auto-generate safe temporary password
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const tempPassword = `NAGS-${randNum}`;

  const btn = document.getElementById('btn-exec-submit');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    const res = await fetch('/api/create-executive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        tempPassword,
        fullName,
        role,
        universityId: currentUniversity.id
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request to create-executive serverless function failed.');

    AudioEffects.playSuccess();
    HapticEffects.success();

    // Reveal credentials display
    const revealBox = document.getElementById('reveal-credentials-wrapper');
    document.getElementById('reveal-email-val').textContent = email;
    document.getElementById('reveal-password-val').textContent = tempPassword;
    revealBox.style.display = 'block';

    // Hook Clipboard click
    document.getElementById('btn-copy-credentials').onclick = () => {
      AudioEffects.playClick(); HapticEffects.tap();
      navigator.clipboard.writeText(`Email: ${email}\nPassword: ${tempPassword}`);
      Toast.success('Credentials copied to clipboard!');
    };

    // Begin 30 second auto-clear countdown
    let secondsLeft = 30;
    const timerText = document.getElementById('credentials-countdown');
    timerText.textContent = secondsLeft;

    if (credentialsTimer) clearInterval(credentialsTimer);
    credentialsTimer = setInterval(() => {
      secondsLeft--;
      timerText.textContent = secondsLeft;
      if (secondsLeft <= 0) {
        clearInterval(credentialsTimer);
        revealBox.style.display = 'none';
        document.getElementById('reveal-email-val').textContent = '—';
        document.getElementById('reveal-password-val').textContent = '—';
        Toast.info('Credentials display auto-cleared.');
      }
    }, 1000);

    // Refresh leadership list
    document.getElementById('exec-form').reset();
    await reloadDashboardData();

  } catch(err) {
    showDashboardError('Exec creation failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Executive';
  }
}

// Toggle Executive Active Status
async function toggleChapterExecActive(id, currentActive) {
  AudioEffects.playClick();
  HapticEffects.tap();

  const newStatus = !currentActive;
  const verb = newStatus ? 'reactivate' : 'deactivate';

  if (!confirm(`Are you sure you want to ${verb} this executive?`)) return;

  try {
    const { error } = await supabaseClient
      .from('executives')
      .update({ is_active: newStatus })
      .eq('id', id);

    if (error) throw error;

    AudioEffects.playSuccess();
    HapticEffects.success();
    await reloadDashboardData();

  } catch(e) {
    showDashboardError('Deactivation failed: ' + e.message);
  }
}

// ── FINANCE LEDGER TRANSACTIONS ──

function openFinanceModal() {
  AudioEffects.playClick(); HapticEffects.tap();
  document.getElementById('finance-form').reset();
  document.getElementById('fin-date').value = new Date().toISOString().substring(0,10);
  document.getElementById('finance-modal').classList.add('show');
}
function closeFinanceModal() {
  AudioEffects.playClick(); HapticEffects.tap();
  document.getElementById('finance-modal').classList.remove('show');
}

async function handleFinanceSubmit(e) {
  e.preventDefault();
  AudioEffects.playClick(); HapticEffects.tap();

  const type = document.getElementById('fin-type').value;
  const amount = parseFloat(document.getElementById('fin-amount').value);
  const date = document.getElementById('fin-date').value;
  const description = document.getElementById('fin-desc').value.trim();
  const receipt_url = document.getElementById('fin-receipt').value.trim();

  if (!type || isNaN(amount) || amount <= 0 || !date || !description) {
    showDashboardError('Please provide valid finance ledger details.');
    return;
  }

  const btn = document.getElementById('btn-finance-submit');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const execId = sessionStorage.getItem('nags_exec_id');

    const { error } = await supabaseClient
      .from('finance_records')
      .insert([{
        university_id: currentUniversity.id,
        recorded_by: execId || null,
        type,
        amount,
        date,
        description,
        receipt_url: receipt_url || null
      }]);

    if (error) throw error;

    AudioEffects.playSuccess();
    HapticEffects.success();
    closeFinanceModal();
    Toast.success('Transaction logged.');

    await reloadDashboardData();

  } catch(err) {
    showDashboardError('Failed to record transaction: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Transaction';
  }
}

// ── SPREADSHEET EXPORTS ──

// Format YYYY-MM-DD HH:MM in Local Time for XML Spreadsheet
const formatLocalTimestamp = (isoStr) => {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${mins}`;
  } catch (e) {
    return '';
  }
};

function downloadMembersXLS() {
  if (allMembers.length === 0) {
    Toast.error('No member records to export.');
    return;
  }

  const escapeXML = (val) => {
    if (val === null || val === undefined) return '';
    return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  };

  const headers = [
    'ID', 'Full Name', 'Gender', 'Hometown', 'Programme', 'Level', 'Phone', 'WhatsApp Number', 'Has WhatsApp', 'Registered At'
  ];

  const rows = allMembers.map((m, index) => [
    String(index + 1),
    m.full_name || '',
    m.gender || '',
    m.hometown || '',
    m.programme || '',
    `Level ${m.level}`,
    m.phone || '',
    m.whatsapp || '',
    m.whatsapp_joined ? 'Yes' : 'No',
    m.created_at ? formatLocalTimestamp(m.created_at) : ''
  ]);

  const colWidths = headers.map((header, colIndex) => {
    let maxLength = header.length;
    rows.forEach(row => {
      const cellVal = String(row[colIndex] || '');
      if (cellVal.length > maxLength) maxLength = cellVal.length;
    });
    return Math.max(50, maxLength * 6 + 25);
  });

  const alignments = ['Center', 'Left', 'Center', 'Left', 'Left', 'Center', 'Center', 'Center', 'Center', 'Center'];

  let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Calibri" x:CharSet="1" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#000000"/>
      <Interior ss:Color="#EAEAEA" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B0B0B0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B0B0B0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B0B0B0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B0B0B0"/>
      </Borders>
    </Style>
    <Style ss:ID="AlignLeft">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
      </Borders>
    </Style>
    <Style ss:ID="AlignCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
      </Borders>
    </Style>
  </Styles>
  <Worksheet ss:Name="Members Directory">
    <Table ss:ExpandedColumnCount="${headers.length}" ss:ExpandedRowCount="${rows.length + 1}" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="20">
      ${colWidths.map(w => `<Column ss:Width="${w}"/>`).join('\n')}
      <Row ss:AutoFitHeight="0" ss:Height="24">
        ${headers.map(h => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXML(h)}</Data></Cell>`).join('')}
      </Row>
      ${rows.map(row => `
      <Row ss:AutoFitHeight="0">
        ${row.map((cell, colIndex) => {
          const style = alignments[colIndex] === 'Left' ? 'AlignLeft' : 'AlignCenter';
          return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${escapeXML(cell)}</Data></Cell>`;
        }).join('')}
      </Row>`).join('')}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <PageSetup>
        <Header x:Margin="0.3"/>
        <Footer x:Margin="0.3"/>
      </PageSetup>
      <Selected/>
      <ProtectObjects>False</ProtectObjects>
      <ProtectScenarios>False</ProtectScenarios>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nags_${currentUniversity.short_name.toLowerCase()}_members_${new Date().toISOString().slice(0,10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  Toast.success('Excel Sheet downloaded!');
}

function downloadFinanceXLS() {
  if (financeRecords.length === 0) {
    Toast.error('No finance entries to export.');
    return;
  }

  const escapeXML = (val) => {
    if (val === null || val === undefined) return '';
    return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  };

  const headers = ['Date', 'Description', 'Type', 'Amount (GHS)', 'Recorded By', 'Receipt URL'];
  const rows = financeRecords.map(rec => {
    const eObj = executivesList.find(e => e.id === rec.recorded_by);
    const recByName = eObj ? eObj.full_name : 'Exec';
    return [
      rec.date || '',
      rec.description || '',
      rec.type.toUpperCase(),
      parseFloat(rec.amount || 0).toFixed(2),
      recByName,
      rec.receipt_url || ''
    ];
  });

  const colWidths = headers.map((header, colIndex) => {
    let maxLength = header.length;
    rows.forEach(row => {
      const cellVal = String(row[colIndex] || '');
      if (cellVal.length > maxLength) maxLength = cellVal.length;
    });
    return Math.max(60, maxLength * 6 + 25);
  });

  const alignments = ['Center', 'Left', 'Center', 'Right', 'Left', 'Left'];

  let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Calibri" x:CharSet="1" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#000000"/>
      <Interior ss:Color="#EAEAEA" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B0B0B0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B0B0B0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B0B0B0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B0B0B0"/>
      </Borders>
    </Style>
    <Style ss:ID="AlignLeft">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
      </Borders>
    </Style>
    <Style ss:ID="AlignCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
      </Borders>
    </Style>
    <Style ss:ID="AlignRight">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCDCDC"/>
      </Borders>
    </Style>
  </Styles>
  <Worksheet ss:Name="Financial Ledger">
    <Table ss:ExpandedColumnCount="${headers.length}" ss:ExpandedRowCount="${rows.length + 1}" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="20">
      ${colWidths.map(w => `<Column ss:Width="${w}"/>`).join('\n')}
      <Row ss:AutoFitHeight="0" ss:Height="24">
        ${headers.map(h => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXML(h)}</Data></Cell>`).join('')}
      </Row>
      ${rows.map(row => `
      <Row ss:AutoFitHeight="0">
        ${row.map((cell, colIndex) => {
          let style = 'AlignCenter';
          if (alignments[colIndex] === 'Left') style = 'AlignLeft';
          else if (alignments[colIndex] === 'Right') style = 'AlignRight';
          return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${escapeXML(cell)}</Data></Cell>`;
        }).join('')}
      </Row>`).join('')}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <Selected/>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nags_${currentUniversity.short_name.toLowerCase()}_finance_${new Date().toISOString().slice(0,10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  Toast.success('Finance ledger exported!');
}

// Summary Report text creation
function copySummaryText() {
  AudioEffects.playClick(); HapticEffects.tap();
  const total = allMembers.length;
  if (total === 0) { Toast.error('No member records available.'); return; }

  const male = allMembers.filter(m => m.gender === 'Male').length;
  const female = allMembers.filter(m => m.gender === 'Female').length;
  const whatsapp = allMembers.filter(m => m.whatsapp_joined).length;
  const l100 = allMembers.filter(m => String(m.level) === '100').length;
  const l200 = allMembers.filter(m => String(m.level) === '200').length;
  const l300 = allMembers.filter(m => String(m.level) === '300').length;
  const l400 = allMembers.filter(m => String(m.level) === '400').length;

  const text = `===========================================
NAGS ${currentUniversity.short_name} MEMBERSHIP DIRECTORY REPORT
Date Compiled: ${new Date().toLocaleDateString()}
Chapter: ${currentUniversity.name}
===========================================

1. OVERALL ONBOARDING:
   - Total Registered Members: ${total}
   - WhatsApp Group Rate: ${whatsapp} joined (${Math.round((whatsapp/total)*100)}%)

2. GENDER DEMOGRAPHICS:
   - Male Members: ${male} (${Math.round((male/total)*100)}%)
   - Female Members: ${female} (${Math.round((female/total)*100)}%)

3. ACADEMIC LEVELS BREAKDOWN:
   - Level 100: ${l100} (${Math.round((l100/total)*100)}%)
   - Level 200: ${l200} (${Math.round((l200/total)*100)}%)
   - Level 300: ${l300} (${Math.round((l300/total)*100)}%)
   - Level 400: ${l400} (${Math.round((l400/total)*100)}%)

Compiled dynamically via NAGS Ghana platform.`;

  navigator.clipboard.writeText(text);
  Toast.success('Text summary copied to clipboard!');
}

// ── UTILITIES & SEARCH ──

function setupDirectoryFilters() {
  const searchInput = document.getElementById('search-input');
  const genderFilter = document.getElementById('filter-gender');
  const levelFilter = document.getElementById('filter-level');
  const clearBtn = document.getElementById('btn-clear-filters');

  const runFilter = () => {
    currentPage = 1;
    const query = searchInput.value.toLowerCase().trim();
    const gender = genderFilter.value;
    const level = levelFilter.value;

    filteredMembers = allMembers.filter(m => {
      const nameMatch = m.full_name?.toLowerCase().includes(query);
      const phoneMatch = m.phone?.toLowerCase().includes(query);
      const progMatch = m.programme?.toLowerCase().includes(query);
      const homeMatch = m.hometown?.toLowerCase().includes(query);
      
      const queryMatches = !query || nameMatch || phoneMatch || progMatch || homeMatch;
      const genderMatches = gender === 'All' || m.gender === gender;
      const levelMatches  = level === 'All'  || String(m.level) === level;

      return queryMatches && genderMatches && levelMatches;
    });

    refreshMembersTable();
  };

  if (searchInput) searchInput.addEventListener('input', runFilter);
  if (genderFilter) genderFilter.addEventListener('change', runFilter);
  if (levelFilter) levelFilter.addEventListener('change', runFilter);
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      AudioEffects.playClick(); HapticEffects.tap();
      searchInput.value = '';
      genderFilter.value = 'All';
      levelFilter.value = 'All';
      filteredMembers = [...allMembers];
      currentPage = 1;
      refreshMembersTable();
    });
  }
}

function showTableLoader(show) {
  const loader = document.getElementById('table-loader');
  if (loader) {
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
  }
}

// Dynamic SMS character counter
function setupSMSCounters() {
  const area = document.getElementById('sms-message');
  const charsLabel = document.getElementById('sms-chars');
  const unitsLabel = document.getElementById('sms-units');
  const btnSend = document.getElementById('btn-send-sms');

  if (!area) return;

  const countSMS = () => {
    const text = area.value;
    const count = text.length;
    
    // SMS unit calculation: GSM basic is 160 chars, parts after are 153 chars
    let parts = 0;
    if (count > 0) {
      if (count <= 160) parts = 1;
      else parts = Math.ceil(count / 153);
    }

    charsLabel.textContent = `${count} / ${parts * (parts === 1 ? 160 : 153)} characters`;
    unitsLabel.textContent = `Uses ${parts} text credit(s) per recipient`;

    // Recipient calculations dynamically
    const target = document.querySelector('input[name="sms-target"]:checked')?.value || 'all';
    let countTargets = 0;
    if (target === 'all') countTargets = allMembers.length;
    else if (target === 'male') countTargets = allMembers.filter(m => m.gender === 'Male').length;
    else if (target === 'female') countTargets = allMembers.filter(m => m.gender === 'Female').length;
    else if (target.startsWith('lvl')) {
      const l = target.replace('lvl', '');
      countTargets = allMembers.filter(m => String(m.level) === l).length;
    }

    document.getElementById('sms-preview-count').textContent = `This message will be sent to ${countTargets} members.`;
    btnSend.textContent = `Send SMS to ${countTargets} Members`;
  };

  area.addEventListener('input', countSMS);
  document.querySelectorAll('input[name="sms-target"]').forEach(radio => {
    radio.addEventListener('change', countSMS);
  });
}

function setupCopyButtons() {
  const hookCopy = (btnId, inputId, label) => {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (btn && input) {
      btn.addEventListener('click', () => {
        AudioEffects.playClick(); HapticEffects.tap();
        if (input.value === 'Loading...' || input.value === 'Not Set') return;
        navigator.clipboard.writeText(input.value);
        Toast.success(`${label} copied to clipboard!`);
      });
    }
  };
  hookCopy('btn-copy-wa-link', 'wa-current-link-val', 'WhatsApp Invite link');
  hookCopy('btn-copy-fb-link', 'fb-current-link-val', 'Facebook page link');
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[t]||t));
}
function escapeAttr(str) { return escapeHTML(String(str || '')); }

// DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  checkAuth();
  initSupabase();

  // Populate Exec details in top bar
  const name = sessionStorage.getItem('nags_exec_name') || 'Executive';
  const role = sessionStorage.getItem('nags_role') || 'exec';
  document.getElementById('exec-name-display').textContent = name;
  document.getElementById('exec-role-display').textContent = role.replace(/_/g, ' ').toUpperCase();

  // Load pages
  renderTabsNavigation();
  enforceUIPermissions();
  await loadChapterBranding();
  await reloadDashboardData();

  // Setup dynamic listeners
  setupDirectoryFilters();
  setupSMSCounters();
  setupCopyButtons();

  // Settings update socials form trigger
  const btnUpdSocials = document.getElementById('btn-update-socials');
  if (btnUpdSocials) btnUpdSocials.addEventListener('click', handleUpdateSocials);

  // SMS Broadcast form submit
  const smsForm = document.getElementById('sms-form');
  if (smsForm) smsForm.addEventListener('submit', handleSMSBroadcast);

  // Add finance modal triggers
  const btnTrigAddRecord = document.getElementById('btn-trigger-add-record');
  if (btnTrigAddRecord) btnTrigAddRecord.addEventListener('click', openFinanceModal);

  // Download export directory triggers
  const btnExportCSV = document.getElementById('btn-export-csv');
  if (btnExportCSV) btnExportCSV.addEventListener('click', downloadMembersXLS);

  const btnExportSummary = document.getElementById('btn-export-summary');
  if (btnExportSummary) btnExportSummary.addEventListener('click', copySummaryText);

  // Export finance transaction ledger
  const btnExportFinCSV = document.getElementById('btn-export-finance-csv');
  if (btnExportFinCSV) btnExportFinCSV.addEventListener('click', downloadFinanceXLS);

  // Logout listener
  document.getElementById('btn-logout').addEventListener('click', () => {
    AudioEffects.playClick(); HapticEffects.tap();
    sessionStorage.clear();
    window.location.href = '/login.html';
  });
});
