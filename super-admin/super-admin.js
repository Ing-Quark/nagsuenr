// super-admin.js - Platform Administration Logic

let supabaseClient;
let chapters = [];
let executivesList = [];
let totalMembersCount = 0;
let totalSMSCount = 0;
let totalFinanceBalance = 0;

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

// Guard Auth
function checkAuth() {
  const role = sessionStorage.getItem('nags_role');
  const logged = sessionStorage.getItem('nags_logged_in');
  
  if (logged !== 'true' || role !== 'super_admin') {
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

// Display Error messages
function showDashboardError(msg) {
  AudioEffects.playError();
  HapticEffects.error();
  const box = document.getElementById('dashboard-error-box');
  if (box) {
    box.textContent = msg;
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 6000);
  }
}

// Switch tabs inside portal
function switchTab(tabId) {
  AudioEffects.playClick();
  HapticEffects.tap();

  // Update tabs look
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.toLowerCase().includes(tabId === 'stats' ? 'platform' : tabId)) {
      btn.classList.add('active');
    }
  });

  // Toggle sections
  document.querySelectorAll('.tab-section').forEach(sec => { sec.style.display = 'none'; });
  document.getElementById(`tab-${tabId}-section`).style.display = 'block';
}

// Show/Hide page loaders
function showLoader(show) {
  const loader = document.getElementById('panel-loader');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

// ── DATA FETCHES ──

// Load stats aggregates
async function loadPlatformAggregates() {
  try {
    // 1. Total chapters
    const { count: uCount, error: uErr } = await supabaseClient
      .from('universities')
      .select('*', { count: 'exact', head: true });
    
    // 2. Total members
    const { count: mCount, error: mErr } = await supabaseClient
      .from('nags_members')
      .select('*', { count: 'exact', head: true });

    // 3. Total SMS Sent
    const { data: smsData, error: sErr } = await supabaseClient
      .from('sms_logs')
      .select('recipient_count');

    // 4. Combined balances
    const { data: financeData, error: fErr } = await supabaseClient
      .from('finance_records')
      .select('type, amount');

    if (uErr || mErr || sErr || fErr) throw new Error('Data aggregation query failed.');

    // Count SMS
    totalSMSCount = smsData.reduce((acc, log) => acc + (log.recipient_count || 0), 0);
    totalMembersCount = mCount || 0;

    // Calc aggregated revenue
    let balance = 0;
    financeData.forEach(rec => {
      const amt = parseFloat(rec.amount || 0);
      if (rec.type === 'income') balance += amt;
      else if (rec.type === 'expense') balance -= amt;
    });
    totalFinanceBalance = balance;

    // Fill UI ribbon
    document.getElementById('stat-chapters').textContent = uCount || 0;
    document.getElementById('stat-members').textContent = totalMembersCount;
    document.getElementById('stat-logs').textContent = totalSMSCount;
    document.getElementById('stat-revenue').textContent = `GHS ${totalFinanceBalance.toFixed(2)}`;

    // Fill Stats tab
    document.getElementById('stats-active-chapters').textContent = chapters.filter(c => c.is_active).length;
    document.getElementById('stats-exec-count').textContent = executivesList.length;
    document.getElementById('stats-sms-count').textContent = totalSMSCount;
    document.getElementById('stats-member-count').textContent = totalMembersCount;
    document.getElementById('stats-total-balances').textContent = `GHS ${totalFinanceBalance.toFixed(2)}`;

  } catch(e) {
    console.error('Stats aggregation error:', e);
  }
}

// Fetch all chapters
async function fetchChapters() {
  const { data, error } = await supabaseClient
    .from('universities')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    showDashboardError('Error fetching chapters: ' + error.message);
    return;
  }
  chapters = data || [];
  populateChaptersTable();
  populateUniversityFilters();
}

// Fetch all executives
async function fetchExecutives() {
  const { data, error } = await supabaseClient
    .from('executives')
    .select('*')
    .order('full_name', { ascending: true });

  if (error) {
    showDashboardError('Error fetching executives: ' + error.message);
    return;
  }
  executivesList = data || [];
  populateExecutivesTable();
}

// ── POPULATE TABLES ──

function populateChaptersTable() {
  const tbody = document.getElementById('chapters-tbody');
  tbody.innerHTML = '';

  chapters.forEach(ch => {
    const row = document.createElement('tr');
    
    const logoSrc = ch.logo_url || '../nags.png';
    const statusClass = ch.is_active ? 'badge-status active' : 'badge-status inactive';
    const statusText = ch.is_active ? 'Active' : 'Archived';
    const toggleLabel = ch.is_active ? 'Archive' : 'Activate';

    row.innerHTML = `
      <td><img src="${escapeAttr(logoSrc)}" class="logo-thumbnail" alt="${escapeAttr(ch.short_name)} Logo" onerror="this.src='../nags.png';"></td>
      <td style="font-weight: 600;">${escapeHTML(ch.name)}</td>
      <td><span class="chapter-badge" style="margin:0;">${escapeHTML(ch.short_name)}</span></td>
      <td><code>/${escapeHTML(ch.slug)}</code></td>
      <td>${escapeHTML(ch.location || 'Not Specified')}</td>
      <td><span class="${statusClass}">${statusText}</span></td>
      <td style="text-align: right;">
        <button class="btn btn-secondary" style="padding: 4px 10px; font-size:11px; margin:0 4px 0 0;" onclick="editChapterClick('${ch.id}')">Edit</button>
        <button class="btn ${ch.is_active ? 'btn-secondary' : 'btn-primary'}" style="padding: 4px 10px; font-size:11px; margin:0;" onclick="toggleChapterActive('${ch.id}', ${ch.is_active})">
          ${toggleLabel}
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function populateExecutivesTable() {
  const tbody = document.getElementById('execs-tbody');
  tbody.innerHTML = '';

  executivesList.forEach(ex => {
    const row = document.createElement('tr');

    // Resolve university name
    let univName = 'Super Administration';
    if (ex.university_id) {
      const uObj = chapters.find(c => c.id === ex.university_id);
      univName = uObj ? `${uObj.name} (${uObj.short_name})` : 'Unknown Chapter';
    }

    const statusClass = ex.is_active ? 'badge-status active' : 'badge-status inactive';
    const statusText = ex.is_active ? 'Active' : 'Deactivated';
    const toggleLabel = ex.is_active ? 'Deactivate' : 'Reactivate';
    
    // Prevent super admins from locking themselves out
    const isSelf = ex.email === sessionStorage.getItem('nags_exec_email') || ex.role === 'super_admin';
    const actionButton = isSelf 
      ? `<span style="font-size:11px; opacity:0.5; font-style:italic;">Protected</span>`
      : `<button class="btn ${ex.is_active ? 'btn-secondary' : 'btn-primary'}" style="padding: 4px 10px; font-size:11px; margin:0;" onclick="toggleExecActive('${ex.id}', ${ex.is_active})">
          ${toggleLabel}
        </button>`;

    row.innerHTML = `
      <td style="font-weight: 600;">${escapeHTML(ex.full_name)}</td>
      <td><code>${escapeHTML(ex.email)}</code></td>
      <td>${escapeHTML(univName)}</td>
      <td><span style="font-size:10px; font-weight:700; text-transform:uppercase; color:#c9a227;">${ex.role.replace(/_/g, ' ')}</span></td>
      <td><span class="${statusClass}">${statusText}</span></td>
      <td style="text-align: right;">${actionButton}</td>
    `;
    tbody.appendChild(row);
  });
}

function populateUniversityFilters() {
  const select = document.getElementById('filter-exec-univ');
  if (!select) return;

  // Clear existing items except "All"
  select.innerHTML = '<option value="">All Chapters</option>';
  
  chapters.forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch.id;
    opt.textContent = `${ch.short_name} - ${ch.name}`;
    select.appendChild(opt);
  });
}

// ── FILTERING ──

function filterChaptersTable() {
  const query = document.getElementById('search-chapters').value.toLowerCase();
  const rows = document.querySelectorAll('#chapters-tbody tr');

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
}

function filterExecsTable() {
  const search = document.getElementById('search-execs').value.toLowerCase();
  const univFilter = document.getElementById('filter-exec-univ').value;
  const roleFilter = document.getElementById('filter-exec-role').value;
  
  const rows = document.querySelectorAll('#execs-tbody tr');

  executivesList.forEach((ex, idx) => {
    const row = rows[idx];
    if (!row) return;

    const matchesSearch = ex.full_name.toLowerCase().includes(search) || ex.email.toLowerCase().includes(search);
    const matchesUniv   = !univFilter || ex.university_id === univFilter;
    const matchesRole   = !roleFilter || ex.role === roleFilter;

    if (matchesSearch && matchesUniv && matchesRole) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// ── UNIVERSITIES CRUD MODAL OPERATIONS ──

function openChapterModal() {
  AudioEffects.playClick();
  HapticEffects.tap();

  document.getElementById('chapter-form').reset();
  document.getElementById('modal-chapter-id').value = '';
  document.getElementById('chapter-modal-title').textContent = 'Add New University Chapter';
  document.getElementById('slug-validation-error').style.display = 'none';

  document.getElementById('chapter-modal').classList.add('show');
}

function closeChapterModal() {
  AudioEffects.playClick();
  HapticEffects.tap();
  document.getElementById('chapter-modal').classList.remove('show');
}

function editChapterClick(id) {
  const ch = chapters.find(c => c.id === id);
  if (!ch) return;

  AudioEffects.playClick();
  HapticEffects.tap();

  document.getElementById('modal-chapter-id').value = ch.id;
  document.getElementById('univ-name').value = ch.name;
  document.getElementById('univ-short').value = ch.short_name;
  document.getElementById('univ-slug').value = ch.slug;
  document.getElementById('univ-location').value = ch.location || '';
  document.getElementById('univ-logo').value = ch.logo_url || '';
  document.getElementById('univ-whatsapp').value = ch.whatsapp_link || '';
  document.getElementById('univ-facebook').value = ch.facebook_link || '';

  document.getElementById('chapter-modal-title').textContent = 'Modify University Details';
  document.getElementById('slug-validation-error').style.display = 'none';

  document.getElementById('chapter-modal').classList.add('show');
}

// Handle Form Submission with full validation checks
async function handleChapterSubmit(e) {
  e.preventDefault();
  AudioEffects.playClick();
  HapticEffects.tap();

  const id = document.getElementById('modal-chapter-id').value;
  const name = document.getElementById('univ-name').value.trim();
  const short_name = document.getElementById('univ-short').value.trim();
  const slug = document.getElementById('univ-slug').value.trim();
  const location = document.getElementById('univ-location').value.trim();
  const logo_url = document.getElementById('univ-logo').value.trim();
  const whatsapp_link = document.getElementById('univ-whatsapp').value.trim();
  const facebook_link = document.getElementById('univ-facebook').value.trim();

  // Validate Slug strictly: lowercase, hyphens, and numbers only
  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(slug)) {
    document.getElementById('slug-validation-error').style.display = 'block';
    AudioEffects.playError();
    HapticEffects.error();
    return;
  }

  const payload = {
    name,
    short_name,
    slug,
    location: location || null,
    logo_url: logo_url || null,
    whatsapp_link: whatsapp_link || null,
    facebook_link: facebook_link || null,
    is_active: true
  };

  const btn = document.getElementById('btn-chapter-submit');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    let response;
    if (id) {
      // Edit
      response = await supabaseClient
        .from('universities')
        .update(payload)
        .eq('id', id);
    } else {
      // Insert
      response = await supabaseClient
        .from('universities')
        .insert([payload]);
    }

    if (response.error) throw response.error;

    AudioEffects.playSuccess();
    HapticEffects.success();
    closeChapterModal();
    
    // Refresh lists
    showLoader(true);
    await fetchChapters();
    await loadPlatformAggregates();
    showLoader(false);

  } catch (err) {
    showDashboardError('Failed to save chapter: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Chapter';
  }
}

// Toggle University Active/Archive Status
async function toggleChapterActive(id, currentActive) {
  AudioEffects.playClick();
  HapticEffects.tap();

  const newStatus = !currentActive;
  const verb = newStatus ? 'activate' : 'archive';

  if (!confirm(`Are you sure you want to ${verb} this university chapter?`)) return;

  try {
    const { error } = await supabaseClient
      .from('universities')
      .update({ is_active: newStatus })
      .eq('id', id);

    if (error) throw error;

    AudioEffects.playSuccess();
    HapticEffects.success();
    
    showLoader(true);
    await fetchChapters();
    await loadPlatformAggregates();
    showLoader(false);

  } catch (err) {
    showDashboardError('Deactivation failed: ' + err.message);
  }
}

// Toggle Executive Active Status
async function toggleExecActive(id, currentActive) {
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

    showLoader(true);
    await fetchExecutives();
    await loadPlatformAggregates();
    showLoader(false);

  } catch (err) {
    showDashboardError('Deactivation failed: ' + err.message);
  }
}

// ── UTILITIES ──

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[t]||t));
}
function escapeAttr(str) { return escapeHTML(String(str || '')); }

// DOM Ready initialization
document.addEventListener('DOMContentLoaded', async () => {
  checkAuth();
  initSupabase();

  // Populate super admin email/name in UI greeting
  const name = sessionStorage.getItem('nags_exec_name') || 'Admin';
  document.getElementById('admin-greeting').textContent = `Welcome, ${name}`;

  // Hook input listener to slug field for auto slug generation & dynamic validation
  const slugInput = document.getElementById('univ-slug');
  const acronymInput = document.getElementById('univ-short');
  
  if (acronymInput && slugInput) {
    acronymInput.addEventListener('input', () => {
      // Auto-generate slug if not editing an existing record
      const id = document.getElementById('modal-chapter-id').value;
      if (!id) {
        slugInput.value = acronymInput.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      }
    });

    slugInput.addEventListener('input', () => {
      // Strict lowercase check on typing
      slugInput.value = slugInput.value.toLowerCase();
      const slugRegex = /^[a-z0-9-]+$/;
      const hint = document.getElementById('slug-validation-error');
      
      if (slugInput.value === '' || slugRegex.test(slugInput.value)) {
        hint.style.display = 'none';
      } else {
        hint.style.display = 'block';
      }
    });
  }

  // Logout listener
  document.getElementById('btn-logout').addEventListener('click', () => {
    AudioEffects.playClick();
    HapticEffects.tap();
    sessionStorage.clear();
    window.location.href = '/login.html';
  });

  // Load baseline tables
  showLoader(true);
  await fetchChapters();
  await fetchExecutives();
  await loadPlatformAggregates();
  showLoader(false);
});
