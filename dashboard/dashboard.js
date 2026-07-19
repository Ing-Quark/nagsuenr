// dashboard.js - Executive Dashboard Controller (Vector SVG & RLS Authenticated Edition)

let supabaseClient;
let universityId = null;
let currentUniversitySlug = null;
let userRole = null;
let userEmail = null;

let allMembersData = [];
let allExecsData = [];
let allFinanceData = [];

// Safe Lucide Vector Icon Re-rendering Engine (Patch #1: Race condition fix)
function refreshVectorIcons() {
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    try {
      lucide.createIcons();
    } catch(e) {
      console.warn('Lucide icon render warning:', e);
    }
  }
}

// Audio & Haptic Utilities
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

// Check Authentication & Session State
function checkAuth() {
  const logged = sessionStorage.getItem('nags_logged_in');
  userRole = sessionStorage.getItem('nags_role');
  universityId = sessionStorage.getItem('nags_university_id');
  userEmail = sessionStorage.getItem('nags_exec_email');

  if (logged !== 'true' || !userRole) {
    sessionStorage.clear();
    window.location.href = '/login.html';
  }
}

// Initialize Supabase Client with User Authenticated JWT Headers (Patch #2)
function initSupabase() {
  if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL) {
    showAdminError('System configuration missing. Refresh the page.');
    return;
  }
  supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

// Display Error Message Notice
function showAdminError(msg) {
  AudioEffects.playError();
  HapticEffects.error();
  const box = document.getElementById('admin-error-box');
  if (box) {
    box.textContent = msg;
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 6000);
  }
}

// ── ROLE PERMISSION MATRIX CONTROLLER ──
function renderRoleNavigation() {
  const nav = document.getElementById('dashboard-tab-bar');
  if (!nav) return;
  nav.innerHTML = '';

  const matrix = {
    members:     ['chapter_admin', 'president', 'vice_president', 'pro', 'secretary', 'welfare'],
    sms:         ['chapter_admin', 'president', 'vice_president', 'pro'],
    socials:     ['chapter_admin', 'president', 'vice_president', 'pro'],
    analytics:   ['chapter_admin', 'president', 'vice_president', 'pro', 'financial_sec', 'secretary'],
    executives:  ['chapter_admin', 'president'],
    finance:     ['chapter_admin', 'president', 'vice_president', 'financial_sec']
  };

  const tabsConfig = [
    { id: 'members', label: 'Members Directory', icon: 'users' },
    { id: 'sms', label: 'SMS Broadcast', icon: 'send' },
    { id: 'socials', label: 'Social Channels', icon: 'share-2' },
    { id: 'analytics', label: 'Analytics & Reports', icon: 'trending-up' },
    { id: 'executives', label: 'Executive Access', icon: 'shield-check' },
    { id: 'finance', label: 'Financial Ledger', icon: 'wallet' }
  ];

  let firstAvailableTab = null;

  tabsConfig.forEach(tab => {
    const allowedRoles = matrix[tab.id] || [];
    if (allowedRoles.includes(userRole)) {
      if (!firstAvailableTab) firstAvailableTab = tab.id;

      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.id = `tab-btn-${tab.id}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-controls', `tab-${tab.id}`);
      btn.onclick = () => switchTab(tab.id);
      
      btn.innerHTML = `<i data-lucide="${tab.icon}" class="lucide-icon" aria-hidden="true"></i> <span>${tab.label}</span>`;
      nav.appendChild(btn);
    }
  });

  if (firstAvailableTab) switchTab(firstAvailableTab);
  refreshVectorIcons();
}

function switchTab(tabId) {
  AudioEffects.playClick();
  HapticEffects.tap();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-selected', 'true');
  }

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  const targetContent = document.getElementById(`tab-${tabId}`);
  if (targetContent) targetContent.classList.add('active');

  // Vice President Read-Only Finance Restrictions (Patch #2)
  if (tabId === 'finance' && userRole === 'vice_president') {
    const triggerAddBtn = document.getElementById('btn-trigger-add-record');
    const exportBtn = document.getElementById('btn-export-finance-csv');
    if (triggerAddBtn) triggerAddBtn.style.display = 'none';
    if (exportBtn) exportBtn.style.display = 'none';
  }

  refreshVectorIcons();
}

// ── DATA FETCHING ──

async function loadChapterDetails() {
  if (!universityId) return;

  const { data, error } = await supabaseClient
    .from('universities')
    .select('*')
    .eq('id', universityId)
    .single();

  if (data) {
    currentUniversitySlug = data.slug;
    document.getElementById('header-title-text').textContent = `NAGS ${data.short_name} — ${data.name}`;
    document.getElementById('header-subtitle-text').textContent = `${data.location || 'Ghana Campus'} Portal`;

    // Social inputs
    document.getElementById('wa-current-link-val').value = data.whatsapp_link || 'Not set';
    document.getElementById('fb-current-link-val').value = data.facebook_link || 'Not set';

    generateQRCode(data.slug);
  }
}

async function fetchMembers() {
  const loader = document.getElementById('table-loader');
  if (loader) loader.classList.remove('hidden');

  let query = supabaseClient.from('nags_members').select('*').order('created_at', { ascending: false });
  if (universityId) query = query.eq('university_id', universityId);

  const { data, error } = await query;
  if (loader) loader.classList.add('hidden');

  if (error) {
    showAdminError('Failed to fetch members directory: ' + error.message);
    return;
  }

  allMembersData = data || [];
  updateMembersSummaryRibbon();
  refreshMembersTable();
  refreshAnalyticsTab();
}

async function fetchExecutives() {
  if (!universityId) return;

  const { data, error } = await supabaseClient
    .from('executives')
    .select('*')
    .eq('university_id', universityId)
    .order('full_name', { ascending: true });

  if (error) {
    showAdminError('Failed to fetch executive officers: ' + error.message);
    return;
  }

  allExecsData = data || [];
  refreshExecutivesTable();
}

async function fetchFinanceRecords() {
  if (!universityId) return;

  const { data, error } = await supabaseClient
    .from('finance_records')
    .select('*')
    .eq('university_id', universityId)
    .order('transaction_date', { ascending: false });

  if (error) {
    showAdminError('Failed to fetch financial ledger: ' + error.message);
    return;
  }

  allFinanceData = data || [];
  refreshFinanceLedger();
}

// ── REFRESH TABLES & METRICS ──

function updateMembersSummaryRibbon() {
  const total = allMembersData.length;
  const male = allMembersData.filter(m => m.gender === 'Male').length;
  const female = allMembersData.filter(m => m.gender === 'Female').length;
  const wa = allMembersData.filter(m => m.whatsapp_joined).length;

  document.getElementById('stat-total-val').textContent = total;
  document.getElementById('stat-male-val').textContent = male;
  document.getElementById('stat-female-val').textContent = female;

  document.getElementById('mini-stat-total').textContent = total;
  document.getElementById('mini-stat-male').textContent = male;
  document.getElementById('mini-stat-female').textContent = female;
  document.getElementById('mini-stat-whatsapp').textContent = wa;

  // SMS target labels (Patch #4 Copy Alignment: "Broadcast to All Registered Chapter Members")
  document.getElementById('lbl-cnt-all').textContent = `(${total} numbers)`;
  document.getElementById('lbl-cnt-male').textContent = `(${male} numbers)`;
  document.getElementById('lbl-cnt-female').textContent = `(${female} numbers)`;
  document.getElementById('lbl-cnt-l100').textContent = `(${allMembersData.filter(m => String(m.academic_level) === '100').length} numbers)`;
  document.getElementById('lbl-cnt-l200').textContent = `(${allMembersData.filter(m => String(m.academic_level) === '200').length} numbers)`;
  document.getElementById('lbl-cnt-l300').textContent = `(${allMembersData.filter(m => String(m.academic_level) === '300').length} numbers)`;
  document.getElementById('lbl-cnt-l400').textContent = `(${allMembersData.filter(m => String(m.academic_level) === '400').length} numbers)`;
}

function refreshMembersTable() {
  const tbody = document.getElementById('members-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const search = document.getElementById('search-input')?.value.toLowerCase().trim() || '';
  const gender = document.getElementById('filter-gender')?.value || 'All';
  const level = document.getElementById('filter-level')?.value || 'All';

  const filtered = allMembersData.filter(m => {
    const matchesSearch = (m.full_name && m.full_name.toLowerCase().includes(search)) ||
                          (m.phone && m.phone.includes(search)) ||
                          (m.programme && m.programme.toLowerCase().includes(search)) ||
                          (m.hometown && m.hometown.toLowerCase().includes(search));

    const matchesGender = gender === 'All' || m.gender === gender;
    const matchesLevel = level === 'All' || String(m.academic_level) === level;

    return matchesSearch && matchesGender && matchesLevel;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-secondary); padding:24px;">No members match the query.</td></tr>`;
    return;
  }

  const isReadOnlyRole = ['secretary', 'welfare'].includes(userRole);

  filtered.forEach((m, idx) => {
    const row = document.createElement('tr');
    const waStatus = m.whatsapp_joined
      ? `<span class="sa-badge sa-badge-active">Joined</span>`
      : `<span class="sa-badge sa-badge-inactive">Pending</span>`;

    const deleteBtn = isReadOnlyRole
      ? `<span style="font-size:10px; color:var(--text-secondary);">Read-Only</span>`
      : `<button class="btn-sm-action" onclick="deleteMember('${m.id}')" aria-label="Delete member">
          <i data-lucide="trash-2" class="lucide-icon lucide-sm lucide-crimson" aria-hidden="true"></i>
        </button>`;

    row.innerHTML = `
      <td>${idx + 1}</td>
      <td style="font-weight: 700; color:#fff;">${escapeHTML(m.full_name)}</td>
      <td>${escapeHTML(m.gender)}</td>
      <td>${escapeHTML(m.programme)}</td>
      <td>L${escapeHTML(String(m.academic_level))}</td>
      <td><code>${escapeHTML(m.phone)}</code></td>
      <td>${waStatus}</td>
      <td>${escapeHTML(m.hometown || '—')}</td>
      <td>${new Date(m.created_at).toLocaleDateString()}</td>
      <td class="text-center exec-only-action">${deleteBtn}</td>
    `;
    tbody.appendChild(row);
  });

  refreshVectorIcons();
}

function refreshExecutivesTable() {
  const tbody = document.getElementById('execs-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  allExecsData.forEach(ex => {
    const row = document.createElement('tr');
    const roleClass = `role-pill role-${ex.role}`;
    const roleText = ex.role.replace(/_/g, ' ');

    const statusBadge = ex.is_active
      ? `<span class="sa-badge sa-badge-active">Active</span>`
      : `<span class="sa-badge sa-badge-inactive">Deactivated</span>`;

    const isSelf = ex.email === userEmail || ex.role === 'president';
    const actionBtn = isSelf
      ? `<span style="font-size:10px; color:var(--text-secondary);">Protected</span>`
      : `<button class="btn-sm-action" onclick="toggleExecActive('${ex.id}', ${ex.is_active})">
          <i data-lucide="${ex.is_active ? 'user-x' : 'user-check'}" class="lucide-icon lucide-sm" aria-hidden="true"></i>
          <span>${ex.is_active ? 'Deactivate' : 'Reactivate'}</span>
        </button>`;

    row.innerHTML = `
      <td style="font-weight:700; color:#fff;">${escapeHTML(ex.full_name)}</td>
      <td><code>${escapeHTML(ex.email)}</code></td>
      <td><span class="${roleClass}">${roleText}</span></td>
      <td>${statusBadge}</td>
      <td class="text-center">${actionBtn}</td>
    `;
    tbody.appendChild(row);
  });

  refreshVectorIcons();
}

function refreshFinanceLedger() {
  const tbody = document.getElementById('finance-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totalIncome = 0;
  let totalExpense = 0;

  allFinanceData.forEach(rec => {
    const amt = parseFloat(rec.amount || 0);
    if (rec.type === 'income') totalIncome += amt;
    else if (rec.type === 'expense') totalExpense += amt;
  });

  const balance = totalIncome - totalExpense;

  document.getElementById('finance-income-val').textContent = `GHS ${totalIncome.toFixed(2)}`;
  document.getElementById('finance-expense-val').textContent = `GHS ${totalExpense.toFixed(2)}`;
  document.getElementById('finance-balance-val').textContent = `GHS ${balance.toFixed(2)}`;

  if (allFinanceData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-secondary); padding:24px;">No financial transactions logged yet.</td></tr>`;
    return;
  }

  const isVP = userRole === 'vice_president';

  allFinanceData.forEach(rec => {
    const row = document.createElement('tr');
    const typeBadge = rec.type === 'income'
      ? `<span class="sa-badge sa-badge-active">Income</span>`
      : `<span class="sa-badge sa-badge-inactive">Expense</span>`;

    const receiptLink = rec.receipt_url
      ? `<a href="${escapeAttr(rec.receipt_url)}" target="_blank" class="btn-sm-action">View</a>`
      : `<span style="color:var(--text-muted);">—</span>`;

    const deleteBtn = isVP
      ? `<span style="font-size:10px; color:var(--text-secondary);">Locked</span>`
      : `<button class="btn-sm-action" onclick="deleteFinanceRecord('${rec.id}')">
          <i data-lucide="trash-2" class="lucide-icon lucide-sm lucide-crimson" aria-hidden="true"></i>
        </button>`;

    row.innerHTML = `
      <td>${new Date(rec.transaction_date).toLocaleDateString()}</td>
      <td style="font-weight:600; color:#fff;">${escapeHTML(rec.description)}</td>
      <td>${typeBadge}</td>
      <td style="font-weight:700; color:${rec.type === 'income' ? '#34d399' : '#f87171'};">GHS ${parseFloat(rec.amount).toFixed(2)}</td>
      <td>${escapeHTML(rec.recorded_by || 'Officer')}</td>
      <td class="text-center">${receiptLink}</td>
      <td class="text-center delete-finance-col">${deleteBtn}</td>
    `;
    tbody.appendChild(row);
  });

  refreshVectorIcons();
}

function refreshAnalyticsTab() {
  const total = allMembersData.length;
  const male = allMembersData.filter(m => m.gender === 'Male').length;
  const female = allMembersData.filter(m => m.gender === 'Female').length;
  const wa = allMembersData.filter(m => m.whatsapp_joined).length;

  document.getElementById('analytics-total').textContent = total;
  const waRate = total > 0 ? Math.round((wa / total) * 100) : 0;
  document.getElementById('analytics-wa-rate').textContent = `${waRate}%`;
  document.getElementById('analytics-wa-progress').style.width = `${waRate}%`;
  document.getElementById('analytics-gender-ratio').textContent = `${male}M / ${female}F`;

  // Bars
  ['100', '200', '300', '400'].forEach(lvl => {
    const count = allMembersData.filter(m => String(m.academic_level) === lvl).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const bar = document.getElementById(`bar-lvl-${lvl}`);
    const val = document.getElementById(`val-lvl-${lvl}`);
    const lbl = document.getElementById(`lbl-donut-${lvl}`);
    if (bar) bar.style.width = `${pct}%`;
    if (val) val.textContent = count;
    if (lbl) lbl.textContent = `${pct}%`;
  });

  document.getElementById('donut-total-text').textContent = total;
}

// ── ACTIONS & HANDLERS (Authenticated JWT Supabase Calls for Patch #2) ──

async function deleteMember(id) {
  AudioEffects.playClick(); HapticEffects.tap();
  if (!confirm('Are you sure you want to remove this member record?')) return;

  try {
    const { error } = await supabaseClient
      .from('nags_members')
      .delete()
      .eq('id', id);

    if (error) throw error;
    AudioEffects.playSuccess(); HapticEffects.success();
    await fetchMembers();
  } catch (err) {
    showAdminError('Database rejected deletion (RLS enforcement active): ' + err.message);
  }
}

async function handleExecSubmit(e) {
  e.preventDefault();
  AudioEffects.playClick(); HapticEffects.tap();

  const fullName = document.getElementById('exec-fullname').value.trim();
  const email = document.getElementById('exec-email').value.trim();
  const role = document.getElementById('exec-role').value;

  const btn = document.getElementById('btn-exec-submit');
  btn.disabled = true;
  btn.textContent = 'Provisioning...';

  try {
    const res = await fetch('/api/create-executive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName,
        email: email,
        role: role,
        university_id: universityId
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create executive');

    AudioEffects.playSuccess(); HapticEffects.success();
    document.getElementById('exec-form').reset();

    // Reveal credentials (Patch #4 Copy Alignment)
    document.getElementById('reveal-email-val').textContent = email;
    document.getElementById('reveal-password-val').textContent = data.tempPassword || 'NAGSExec2026!';
    document.getElementById('reveal-credentials-wrapper').style.display = 'block';

    let count = 30;
    const timer = setInterval(() => {
      count--;
      document.getElementById('credentials-countdown').textContent = count;
      if (count <= 0) {
        clearInterval(timer);
        document.getElementById('reveal-credentials-wrapper').style.display = 'none';
      }
    }, 1000);

    await fetchExecutives();

  } catch (err) {
    showAdminError('Executive creation failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Executive';
  }
}

async function toggleExecActive(id, currentActive) {
  AudioEffects.playClick(); HapticEffects.tap();
  const newStatus = !currentActive;

  try {
    const { error } = await supabaseClient
      .from('executives')
      .update({ is_active: newStatus })
      .eq('id', id);

    if (error) throw error;
    AudioEffects.playSuccess(); HapticEffects.success();
    await fetchExecutives();
  } catch (err) {
    showAdminError('Failed to update executive status: ' + err.message);
  }
}

// Finance Modals & Handlers
function openFinanceModal() {
  if (userRole === 'vice_president') {
    showAdminError('Read-only lock: Vice Presidents are restricted from creating ledger transactions.');
    return;
  }
  AudioEffects.playClick(); HapticEffects.tap();
  document.getElementById('finance-form').reset();
  document.getElementById('fin-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('finance-modal').classList.add('show');
}

function closeFinanceModal() {
  AudioEffects.playClick(); HapticEffects.tap();
  document.getElementById('finance-modal').classList.remove('show');
}

async function handleFinanceSubmit(e) {
  e.preventDefault();
  AudioEffects.playClick(); HapticEffects.tap();

  if (userRole === 'vice_president') {
    showAdminError('Database write rejected: Vice President role is restricted from creating ledger entries.');
    return;
  }

  const type = document.getElementById('fin-type').value;
  const amount = parseFloat(document.getElementById('fin-amount').value);
  const date = document.getElementById('fin-date').value;
  const desc = document.getElementById('fin-desc').value.trim();
  const receipt = document.getElementById('fin-receipt').value.trim();

  const btn = document.getElementById('btn-finance-submit');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const { error } = await supabaseClient
      .from('finance_records')
      .insert([{
        university_id: universityId,
        type: type,
        amount: amount,
        transaction_date: date,
        description: desc,
        receipt_url: receipt || null,
        recorded_by: sessionStorage.getItem('nags_exec_name') || 'Executive Officer'
      }]);

    if (error) throw error;
    AudioEffects.playSuccess(); HapticEffects.success();
    closeFinanceModal();
    await fetchFinanceRecords();
  } catch (err) {
    showAdminError('Failed to save transaction (PostgreSQL RLS Enforcement): ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save Transaction';
  }
}

async function deleteFinanceRecord(id) {
  if (userRole === 'vice_president') {
    showAdminError('Read-only lock: Vice Presidents are restricted from deleting ledger records.');
    return;
  }
  AudioEffects.playClick(); HapticEffects.tap();
  if (!confirm('Are you sure you want to delete this ledger record?')) return;

  try {
    const { error } = await supabaseClient
      .from('finance_records')
      .delete()
      .eq('id', id);

    if (error) throw error;
    AudioEffects.playSuccess(); HapticEffects.success();
    await fetchFinanceRecords();
  } catch (err) {
    showAdminError('Deletion rejected by RLS policy: ' + err.message);
  }
}

function generateQRCode(slug) {
  const qrBox = document.getElementById('qrcode');
  if (!qrBox) return;
  qrBox.innerHTML = '';
  const url = `${window.location.origin}/register/?chapter=${encodeURIComponent(slug)}`;
  if (typeof QRCode !== 'undefined') {
    new QRCode(qrBox, { text: url, width: 140, height: 140 });
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[t]||t));
}
function escapeAttr(str) { return escapeHTML(String(str || '')); }

// DOM Initialization with Lucide Vector Icon Render Hook (Patch #1 & Patch #2)
document.addEventListener('DOMContentLoaded', async () => {
  checkAuth();
  initSupabase();

  const name = sessionStorage.getItem('nags_exec_name') || 'Executive Officer';
  document.getElementById('exec-name-display').textContent = name;
  document.getElementById('exec-role-display').textContent = (userRole || 'officer').replace(/_/g, ' ');

  renderRoleNavigation();

  // Search & Filter Listeners
  document.getElementById('search-input')?.addEventListener('input', refreshMembersTable);
  document.getElementById('filter-gender')?.addEventListener('change', refreshMembersTable);
  document.getElementById('filter-level')?.addEventListener('change', refreshMembersTable);
  document.getElementById('btn-clear-filters')?.addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-gender').value = 'All';
    document.getElementById('filter-level').value = 'All';
    refreshMembersTable();
  });

  // Finance modal trigger
  document.getElementById('btn-trigger-add-record')?.addEventListener('click', openFinanceModal);

  // Copy credentials handler
  document.getElementById('btn-copy-credentials')?.addEventListener('click', () => {
    const email = document.getElementById('reveal-email-val').textContent;
    const pass = document.getElementById('reveal-password-val').textContent;
    navigator.clipboard.writeText(`NAGS Ghana Executive Access\nEmail: ${email}\nPassword: ${pass}`);
    alert('Credentials copied to clipboard!');
  });

  // Logout listener
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    AudioEffects.playClick(); HapticEffects.tap();
    sessionStorage.clear();
    window.location.href = '/login.html';
  });

  await loadChapterDetails();
  await fetchMembers();
  await fetchExecutives();
  await fetchFinanceRecords();

  refreshVectorIcons();
});
