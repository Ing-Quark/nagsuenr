// super-admin.js - Platform Administration Logic (Enhanced Glassmorphic Edition)

let supabaseClient;
let chapters = [];
let executivesList = [];
let totalMembersCount = 0;
let totalSMSCount = 0;
let totalFinanceBalance = 0;
let currentUniversityView = 'table'; // 'table' or 'grid'

// Toast Notifications System
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
    const timeoutId = setTimeout(() => { this.removeToast(toast); }, duration);
    toast.dataset.timeoutId = timeoutId;
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

// Guard Auth with Local Dev Mode Fallback
function checkAuth() {
  const role = sessionStorage.getItem('nags_role');
  const logged = sessionStorage.getItem('nags_logged_in');
  
  if (logged !== 'true' || role !== 'super_admin') {
    // If testing on localhost, auto-initialize demo session to prevent lockout
    if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
      sessionStorage.setItem('nags_logged_in', 'true');
      sessionStorage.setItem('nags_role', 'super_admin');
      sessionStorage.setItem('nags_exec_name', 'Mahama Yakubu');
      sessionStorage.setItem('nags_exec_email', 'ing.mahamayakubu@gmail.com');
      return;
    }
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
  const box = document.getElementById('dashboard-error-box');
  if (box) {
    box.textContent = msg;
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 6000);
  } else {
    Toast.error(msg);
  }
}

// Switch Tabs
function switchTab(tabId) {
  AudioEffects.playClick();
  HapticEffects.tap();

  // Update tabs look
  document.querySelectorAll('.sa-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Toggle sections
  document.querySelectorAll('.tab-section').forEach(sec => { sec.style.display = 'none'; });
  const targetSec = document.getElementById(`tab-${tabId}-section`);
  if (targetSec) targetSec.style.display = 'block';

  // Toggle View Switcher visibility (only for Universities tab)
  const viewToggle = document.getElementById('view-toggle-container');
  if (viewToggle) viewToggle.style.display = (tabId === 'universities') ? 'flex' : 'none';
}

// Set University View Mode (Table vs Grid)
function setUniversityView(mode) {
  AudioEffects.playClick();
  HapticEffects.tap();
  currentUniversityView = mode;

  document.getElementById('btn-view-table').classList.toggle('active', mode === 'table');
  document.getElementById('btn-view-grid').classList.toggle('active', mode === 'grid');

  document.getElementById('chapters-table-view').style.display = mode === 'table' ? 'block' : 'none';
  document.getElementById('chapters-grid-view').style.display = mode === 'grid' ? 'grid' : 'none';
}

// Show/Hide Loader
function showLoader(show) {
  const loader = document.getElementById('panel-loader');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

// Smooth Number Count Up Animation
function animateCounter(id, finalValue, prefix = '') {
  const el = document.getElementById(id);
  if (!el) return;

  const startValue = 0;
  const duration = 1000;
  const frameRate = 30;
  const totalFrames = Math.round((duration / 1000) * frameRate);
  let frame = 0;

  const timer = setInterval(() => {
    frame++;
    const progress = frame / totalFrames;
    const currentVal = Math.round(startValue + (finalValue - startValue) * progress);

    if (typeof finalValue === 'number' && !Number.isInteger(finalValue)) {
      el.textContent = `${prefix}${currentVal.toFixed(2)}`;
    } else {
      el.textContent = `${prefix}${currentVal.toLocaleString()}`;
    }

    if (frame >= totalFrames) {
      clearInterval(timer);
      if (typeof finalValue === 'number' && !Number.isInteger(finalValue)) {
        el.textContent = `${prefix}${finalValue.toFixed(2)}`;
      } else {
        el.textContent = `${prefix}${finalValue.toLocaleString()}`;
      }
    }
  }, 1000 / frameRate);
}

// ── DATA FETCHING ──

async function loadPlatformAggregates() {
  try {
    const { count: uCount, error: uErr } = await supabaseClient
      .from('universities')
      .select('*', { count: 'exact', head: true });
    
    const { count: mCount, error: mErr } = await supabaseClient
      .from('nags_members')
      .select('*', { count: 'exact', head: true });

    const { data: smsData, error: sErr } = await supabaseClient
      .from('sms_logs')
      .select('recipient_count');

    const { data: financeData, error: fErr } = await supabaseClient
      .from('finance_records')
      .select('type, amount');

    if (uErr || mErr || sErr || fErr) throw new Error('Data aggregation query failed.');

    totalSMSCount = (smsData || []).reduce((acc, log) => acc + (log.recipient_count || 0), 0);
    totalMembersCount = mCount || 0;

    let balance = 0;
    (financeData || []).forEach(rec => {
      const amt = parseFloat(rec.amount || 0);
      if (rec.type === 'income') balance += amt;
      else if (rec.type === 'expense') balance -= amt;
    });
    totalFinanceBalance = balance;

    const setElemText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    // Animate stats ribbon
    animateCounter('stat-chapters', uCount || 0);
    animateCounter('stat-execs', executivesList.length);
    animateCounter('stat-members', totalMembersCount);
    setElemText('stat-revenue', `GHS ${totalFinanceBalance.toFixed(2)}`);

    // Sub-pills
    const activeCount = chapters.filter(c => c.is_active).length;
    setElemText('stat-active-chapters-pill', `${activeCount} Active`);

    // Analytics tab
    setElemText('stats-active-chapters', `${activeCount} / ${chapters.length}`);
    setElemText('stats-exec-count', executivesList.length);
    setElemText('stats-sms-count', totalSMSCount);
    setElemText('stats-member-count', totalMembersCount);
    setElemText('stats-total-balances', `GHS ${totalFinanceBalance.toFixed(2)}`);

    // Tab badges
    setElemText('badge-chapters-count', chapters.length);
    setElemText('badge-execs-count', executivesList.length);

  } catch(e) {
    console.error('Stats aggregation error:', e);
  }
}

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
  populateChapters();
  populateUniversityFilters();
}

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

// ── POPULATE UNIVERSITIES (TABLE & GRID) ──

function populateChapters() {
  populateChaptersTable();
  populateChaptersGrid();
}

function populateChaptersTable() {
  const tbody = document.getElementById('chapters-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const query = document.getElementById('search-chapters')?.value.toLowerCase().trim() || '';
  const statusFilter = document.getElementById('filter-chapter-status')?.value || 'all';

  const filtered = chapters.filter(ch => {
    const matchesQuery = ch.name.toLowerCase().includes(query) || 
                         ch.short_name.toLowerCase().includes(query) || 
                         ch.slug.toLowerCase().includes(query) || 
                         (ch.location && ch.location.toLowerCase().includes(query));
    
    const matchesStatus = statusFilter === 'all' || 
                          (statusFilter === 'active' && ch.is_active) || 
                          (statusFilter === 'archived' && !ch.is_active);

    return matchesQuery && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--sa-muted); padding: 30px;">No chapters matching filter.</td></tr>`;
    return;
  }

  filtered.forEach(ch => {
    const row = document.createElement('tr');
    
    const logoSrc = ch.logo_url;
    const logoHtml = logoSrc
      ? `<img src="${escapeAttr(logoSrc)}" class="sa-logo-circle" alt="${escapeAttr(ch.short_name)} Logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
         <div class="sa-logo-initials" style="display:none;">${ch.short_name.substring(0,2).toUpperCase()}</div>`
      : `<div class="sa-logo-initials">${ch.short_name.substring(0,2).toUpperCase()}</div>`;

    const statusBadge = ch.is_active
      ? `<span class="sa-badge sa-badge-active">● Active</span>`
      : `<span class="sa-badge sa-badge-inactive">○ Archived</span>`;

    const toggleLabel = ch.is_active ? 'Archive' : 'Activate';

    row.innerHTML = `
      <td>${logoHtml}</td>
      <td style="font-weight: 700; color:#fff;">${escapeHTML(ch.name)}</td>
      <td><span class="sa-badge sa-badge-active" style="background:rgba(229,193,88,0.15); color:var(--sa-gold); border-color:rgba(229,193,88,0.3);">${escapeHTML(ch.short_name)}</span></td>
      <td><code style="color:var(--sa-gold);">/${escapeHTML(ch.slug)}</code></td>
      <td>${escapeHTML(ch.location || 'Not Specified')}</td>
      <td>${statusBadge}</td>
      <td style="text-align: right;">
        <button class="btn-sm-action" onclick="editChapterClick('${ch.id}')">✏️ Edit</button>
        <button class="btn-sm-action" style="margin-left: 4px;" onclick="toggleChapterActive('${ch.id}', ${ch.is_active})">
          ${ch.is_active ? '📦 Archive' : '⚡ Activate'}
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function populateChaptersGrid() {
  const container = document.getElementById('chapters-grid-view');
  if (!container) return;
  container.innerHTML = '';

  const query = document.getElementById('search-chapters')?.value.toLowerCase().trim() || '';
  const statusFilter = document.getElementById('filter-chapter-status')?.value || 'all';

  const filtered = chapters.filter(ch => {
    const matchesQuery = ch.name.toLowerCase().includes(query) || 
                         ch.short_name.toLowerCase().includes(query) || 
                         ch.slug.toLowerCase().includes(query) || 
                         (ch.location && ch.location.toLowerCase().includes(query));
    
    const matchesStatus = statusFilter === 'all' || 
                          (statusFilter === 'active' && ch.is_active) || 
                          (statusFilter === 'archived' && !ch.is_active);

    return matchesQuery && matchesStatus;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--sa-muted);">No university chapters found.</div>`;
    return;
  }

  filtered.forEach(ch => {
    const logoSrc = ch.logo_url;
    const logoHtml = logoSrc
      ? `<img src="${escapeAttr(logoSrc)}" class="sa-logo-circle" alt="${escapeAttr(ch.short_name)} Logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
         <div class="sa-logo-initials" style="display:none;">${ch.short_name.substring(0,2).toUpperCase()}</div>`
      : `<div class="sa-logo-initials">${ch.short_name.substring(0,2).toUpperCase()}</div>`;

    const statusBadge = ch.is_active
      ? `<span class="sa-badge sa-badge-active">● Active</span>`
      : `<span class="sa-badge sa-badge-inactive">○ Archived</span>`;

    const card = document.createElement('div');
    card.className = 'sa-chapter-card';
    card.innerHTML = `
      <div>
        <div class="sa-card-top">
          ${logoHtml}
          <div>
            <div class="sa-card-title">${escapeHTML(ch.name)}</div>
            <div class="sa-card-location">📍 ${escapeHTML(ch.location || 'Ghana Campus')}</div>
          </div>
        </div>

        <div class="sa-card-body">
          <div>
            <span style="color:var(--sa-muted);">Acronym:</span> <strong style="color:#fff;">${escapeHTML(ch.short_name)}</strong>
          </div>
          <div>
            <span style="color:var(--sa-muted);">Route Slug:</span> <code style="color:var(--sa-gold);">/${escapeHTML(ch.slug)}</code>
          </div>
        </div>
      </div>

      <div class="sa-card-actions">
        ${statusBadge}
        <div>
          <a href="/register/?chapter=${encodeURIComponent(ch.slug)}" target="_blank" class="btn-sm-action">🔗 Portal</a>
          <button class="btn-sm-action" onclick="editChapterClick('${ch.id}')">✏️ Edit</button>
          <button class="btn-sm-action" onclick="toggleChapterActive('${ch.id}', ${ch.is_active})">${ch.is_active ? '📦' : '⚡'}</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function filterChapters() {
  populateChapters();
}

// ── POPULATE EXECUTIVES TABLE ──

function populateExecutivesTable() {
  const tbody = document.getElementById('execs-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const search = document.getElementById('search-execs')?.value.toLowerCase().trim() || '';
  const univFilter = document.getElementById('filter-exec-univ')?.value || '';
  const roleFilter = document.getElementById('filter-exec-role')?.value || '';

  const filtered = executivesList.filter(ex => {
    const matchesSearch = ex.full_name.toLowerCase().includes(search) || ex.email.toLowerCase().includes(search);
    const matchesUniv   = !univFilter || ex.university_id === univFilter;
    const matchesRole   = !roleFilter || ex.role === roleFilter;
    return matchesSearch && matchesUniv && matchesRole;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--sa-muted); padding: 30px;">No executive records matching filter.</td></tr>`;
    return;
  }

  filtered.forEach(ex => {
    const row = document.createElement('tr');

    let univName = 'National Super Admin';
    if (ex.university_id) {
      const uObj = chapters.find(c => c.id === ex.university_id);
      univName = uObj ? `${uObj.name} (${uObj.short_name})` : 'Unknown Chapter';
    }

    const statusBadge = ex.is_active
      ? `<span class="sa-badge sa-badge-active">● Active</span>`
      : `<span class="sa-badge sa-badge-inactive">○ Deactivated</span>`;

    const roleClass = `role-pill role-${ex.role}`;
    const roleText = ex.role.replace(/_/g, ' ');

    const isSelf = ex.email === sessionStorage.getItem('nags_exec_email') || ex.role === 'super_admin';
    const actionBtn = isSelf 
      ? `<span style="font-size:11px; color:var(--sa-muted); font-style:italic;">Protected</span>`
      : `<button class="btn-sm-action" onclick="toggleExecActive('${ex.id}', ${ex.is_active})">
          ${ex.is_active ? '🚫 Deactivate' : '⚡ Reactivate'}
        </button>`;

    row.innerHTML = `
      <td style="font-weight: 700; color:#fff;">${escapeHTML(ex.full_name)}</td>
      <td><code>${escapeHTML(ex.email)}</code></td>
      <td>${escapeHTML(univName)}</td>
      <td><span class="${roleClass}">${roleText}</span></td>
      <td>${statusBadge}</td>
      <td style="text-align: right;">${actionBtn}</td>
    `;
    tbody.appendChild(row);
  });
}

function filterExecs() {
  populateExecutivesTable();
}

function populateUniversityFilters() {
  const select = document.getElementById('filter-exec-univ');
  if (!select) return;

  select.innerHTML = '<option value="">All University Chapters</option>';
  chapters.forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch.id;
    opt.textContent = `${ch.short_name} - ${ch.name}`;
    select.appendChild(opt);
  });
}

// ── LIVE PREVIEW MODAL OPERATIONS ──

function openChapterModal() {
  AudioEffects.playClick();
  HapticEffects.tap();

  document.getElementById('chapter-form').reset();
  document.getElementById('modal-chapter-id').value = '';
  document.getElementById('chapter-modal-title').textContent = 'Configure University Chapter';
  
  updateLivePreview();
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
  
  updateLivePreview();
  document.getElementById('chapter-modal').classList.add('show');
}

// Update Live Card Preview in Modal
function updateLivePreview() {
  const name = document.getElementById('univ-name').value.trim() || 'University Name';
  const short_name = document.getElementById('univ-short').value.trim() || 'ACRONYM';
  const slug = document.getElementById('univ-slug').value.trim() || 'slug';
  const location = document.getElementById('univ-location').value.trim() || 'Campus Location';
  const logo = document.getElementById('univ-logo').value.trim();

  document.getElementById('prev-title').textContent = name;
  document.getElementById('prev-short').textContent = short_name;
  document.getElementById('prev-location').textContent = `📍 ${location}`;
  document.getElementById('prev-url').textContent = `🔗 /register/?chapter=${slug}`;

  // Logo wrap update
  const wrap = document.getElementById('prev-logo-wrap');
  if (logo) {
    wrap.innerHTML = `<img src="${escapeAttr(logo)}" class="sa-logo-circle" alt="Preview Logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                      <div class="sa-logo-initials" style="display:none;">${short_name.substring(0,2).toUpperCase()}</div>`;
  } else {
    wrap.innerHTML = `<div class="sa-logo-initials">${short_name.substring(0,2).toUpperCase()}</div>`;
  }

  // Real-time Slug Regex Check
  const slugInput = document.getElementById('univ-slug');
  const slugRegex = /^[a-z0-9-]+$/;
  const statusBox = document.getElementById('slug-validation-box');

  if (!slugInput.value) {
    statusBox.className = 'slug-status-badge';
    statusBox.innerHTML = `<span>Slug format: <code>lowercase-and-hyphens-only</code></span>`;
  } else if (slugRegex.test(slugInput.value)) {
    statusBox.className = 'slug-status-badge slug-valid';
    statusBox.innerHTML = `<span>✓ Valid URL routing slug</span>`;
  } else {
    statusBox.className = 'slug-status-badge slug-invalid';
    statusBox.innerHTML = `<span>⚠ Slug can only contain lowercase letters and hyphens (no spaces or special chars).</span>`;
  }
}

// Form Submit Handler
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

  // Validate Slug Pattern strictly
  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(slug)) {
    Toast.error('Invalid routing slug! Only lowercase letters, numbers, and hyphens allowed.');
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
      response = await supabaseClient
        .from('universities')
        .update(payload)
        .eq('id', id);
    } else {
      response = await supabaseClient
        .from('universities')
        .insert([payload]);
    }

    if (response.error) throw response.error;

    AudioEffects.playSuccess();
    HapticEffects.success();
    closeChapterModal();
    Toast.success(`University Chapter ${id ? 'updated' : 'added'} successfully!`);

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

// Toggle Chapter Active Status
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
    Toast.success(`University Chapter ${verb}d!`);

    showLoader(true);
    await fetchChapters();
    await loadPlatformAggregates();
    showLoader(false);

  } catch (err) {
    showDashboardError('Action failed: ' + err.message);
  }
}

// Toggle Executive Active Status
async function toggleExecActive(id, currentActive) {
  AudioEffects.playClick();
  HapticEffects.tap();

  const newStatus = !currentActive;
  const verb = newStatus ? 'reactivate' : 'deactivate';

  if (!confirm(`Are you sure you want to ${verb} this executive officer?`)) return;

  try {
    const { error } = await supabaseClient
      .from('executives')
      .update({ is_active: newStatus })
      .eq('id', id);

    if (error) throw error;

    AudioEffects.playSuccess();
    HapticEffects.success();
    Toast.success(`Executive ${verb}d!`);

    showLoader(true);
    await fetchExecutives();
    await loadPlatformAggregates();
    showLoader(false);

  } catch (err) {
    showDashboardError('Action failed: ' + err.message);
  }
}

// Copy Summary Report Text
function copyNationalReportText() {
  AudioEffects.playClick(); HapticEffects.tap();

  const text = `===========================================
NAGS GHANA PLATFORM — NATIONAL SUMMARY REPORT
Date Compiled: ${new Date().toLocaleDateString()}
===========================================

1. ACCREDITED CHAPTERS:
   - Total Chapters: ${chapters.length}
   - Active Chapters: ${chapters.filter(c => c.is_active).length}

2. NATIONAL MEMBERSHIP & LEADERSHIP:
   - Total Registered Members: ${totalMembersCount}
   - Active Executive Officers: ${executivesList.length}

3. MESSAGING & LIQUIDITY:
   - Outbound SMS Broadcast Logs: ${totalSMSCount}
   - Combined Chapter Liquidity: GHS ${totalFinanceBalance.toFixed(2)}

Generated via NAGS Ghana Platform Super Admin Console.`;

  navigator.clipboard.writeText(text);
  Toast.success('National Summary Report copied to clipboard!');
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[t]||t));
}
function escapeAttr(str) { return escapeHTML(String(str || '')); }

// DOM Initialization
document.addEventListener('DOMContentLoaded', async () => {
  checkAuth();
  initSupabase();

  const name = sessionStorage.getItem('nags_exec_name') || 'Mahama Yakubu';
  document.getElementById('sa-user-display').textContent = name;

  // Set avatar initials
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);
  document.getElementById('sa-avatar-initials').textContent = initials || 'MY';

  // Hook auto slug generator
  const acronymInput = document.getElementById('univ-short');
  const slugInput = document.getElementById('univ-slug');
  
  if (acronymInput && slugInput) {
    acronymInput.addEventListener('input', () => {
      const id = document.getElementById('modal-chapter-id').value;
      if (!id) {
        slugInput.value = acronymInput.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
        updateLivePreview();
      }
    });
  }

  // Logout listener
  document.getElementById('btn-sa-logout').addEventListener('click', () => {
    AudioEffects.playClick(); HapticEffects.tap();
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
