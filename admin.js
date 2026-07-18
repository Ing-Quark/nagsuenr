// admin.js - Admin Dashboard Logic

let supabaseClient;
let allMembers = [];

// Custom Toast Notification system replacing browser alert dialogs
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
    closeBtn.addEventListener('click', () => {
      this.removeToast(toast);
    });
    toast.appendChild(closeBtn);
    this.container.appendChild(toast);
    toast.offsetHeight; // trigger reflow
    toast.classList.add('show');
    const timeoutId = setTimeout(() => {
      this.removeToast(toast);
    }, duration);
    toast.dataset.timeoutId = timeoutId;
  },
  removeToast(toast) {
    if (toast.dataset.timeoutId) {
      clearTimeout(parseInt(toast.dataset.timeoutId));
    }
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
  },
  success(message, duration) { this.show(message, 'success', duration); },
  error(message, duration) { this.show(message, 'error', duration); },
  info(message, duration) { this.show(message, 'info', duration); }
};

// Haptic & Sound Effects Utilities using Web Audio & Vibration APIs
const HapticEffects = {
  vibrate(pattern) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        console.log('Haptic vibration failed:', e);
      }
    }
  },
  tap() {
    this.vibrate(15);
  },
  success() {
    this.vibrate([20, 50, 40]);
  },
  error() {
    this.vibrate([60, 50, 60]);
  }
};

const AudioEffects = {
  ctx: null,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },
  playClick() {
    try {
      this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {
      console.log('Audio click error:', e);
    }
  },
  playSuccess() {
    try {
      this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (Ascending arpeggio)
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        gain.gain.setValueAtTime(0.06, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.2);
        
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.2);
      });
    } catch (e) {
      console.log('Audio success error:', e);
    }
  },
  playError() {
    try {
      this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch (e) {
      console.log('Audio error error:', e);
    }
  }
};

// Custom Confirmation Modal replacing native confirm dialogs
const Modal = {
  confirm(title, message, onConfirm, isDestructive = true) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const box = document.createElement('div');
    box.className = 'modal-box';

    const titleEl = document.createElement('div');
    titleEl.className = 'modal-title';
    titleEl.textContent = title;
    box.appendChild(titleEl);

    const msgEl = document.createElement('div');
    msgEl.className = 'modal-message';
    msgEl.textContent = message;
    box.appendChild(msgEl);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'modal-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `modal-btn ${isDestructive ? 'modal-btn-confirm' : 'modal-btn-primary'}`;
    confirmBtn.textContent = 'Confirm';

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(confirmBtn);
    box.appendChild(btnContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.offsetHeight; // trigger reflow
    overlay.classList.add('show');

    cancelBtn.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      this.close(overlay);
    });

    confirmBtn.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      this.close(overlay);
      if (onConfirm) onConfirm();
    });
  },

  close(overlay) {
    overlay.classList.remove('show');
    overlay.addEventListener('transitionend', () => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
  }
};

// Initialize Database Client
function initSupabase() {
  if (typeof CONFIG === 'undefined') {
    showError('System Configuration Error: Configuration files are missing.');
    return;
  }
  
  if (CONFIG.SUPABASE_URL === 'https://your-project.supabase.co' || CONFIG.SUPABASE_ANON_KEY === 'your-anon-key') {
    showError('Database Connection Offline: Please check your configuration settings.');
    return;
  }

  try {
    if (window.supabase) {
      supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    } else {
      showError('System Offline: Please verify your internet connection.');
    }
  } catch (e) {
    showError('Database Connection Error: Service temporarily unavailable.');
  }
}

// Authentication Logic
function checkAuth() {
  const isLoggedIn = sessionStorage.getItem('nags_admin_logged_in') === 'true';
  const loginSection = document.getElementById('login-section');
  const dashboardSection = document.getElementById('dashboard-section');

  if (isLoggedIn) {
    if (loginSection) loginSection.classList.add('hidden');
    if (dashboardSection) {
      dashboardSection.classList.remove('hidden');
      loadDashboardData();
    }
  } else {
    if (loginSection) loginSection.classList.remove('hidden');
    if (dashboardSection) dashboardSection.classList.add('hidden');
  }
}

function setupLogin() {
  const loginBtn = document.getElementById('btn-login');
  const passwordInput = document.getElementById('admin-password');
  const errorMsg = document.getElementById('login-error');

  const attemptLogin = () => {
    const password = passwordInput.value;
    if (password === CONFIG.ADMIN_PASSWORD) {
      sessionStorage.setItem('nags_admin_logged_in', 'true');
      AudioEffects.playSuccess();
      HapticEffects.success();
      if (errorMsg) errorMsg.classList.add('hidden');
      passwordInput.value = '';
      checkAuth();
    } else {
      AudioEffects.playError();
      HapticEffects.error();
      if (errorMsg) {
        errorMsg.textContent = 'Incorrect password.';
        errorMsg.classList.remove('hidden');
      }
    }
  };

  if (loginBtn) {
    loginBtn.addEventListener('click', attemptLogin);
  }

  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        attemptLogin();
      }
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      sessionStorage.removeItem('nags_admin_logged_in');
      checkAuth();
    });
  }
  // Toggle password visibility (eye helper)
  const togglePasswordBtn = document.getElementById('btn-toggle-password');
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      togglePasswordBtn.textContent = type === 'password' ? 'Show' : 'Hide';
    });
  }
}

// Dashboard Load Data
async function loadDashboardData() {
  if (!supabaseClient) return;
  
  showTableLoader(true);
  try {
    const { data, error } = await supabaseClient
      .from('nags_members')
      .select('*')
      .order('created_at', { ascending: false });
      
    showTableLoader(false);
    
    if (error) {
      showError('Failed to fetch members: ' + error.message);
      return;
    }
    
    allMembers = data || [];
    updateStatsBar();
    updateSMSRecipientCounts();
    applyFilters();
    initWhatsAppTab();
  } catch (err) {
    showTableLoader(false);
    showError('Unexpected error loading data: ' + err.message);
  }
}

// Stats Calculation & Display
function updateStatsBar() {
  const total = allMembers.length;
  const male = allMembers.filter(m => m.gender === 'Male').length;
  const female = allMembers.filter(m => m.gender === 'Female').length;
  const waJoined = allMembers.filter(m => m.whatsapp_joined).length;

  // Top stats bar
  const totalVal = document.getElementById('stat-total-val');
  const maleVal = document.getElementById('stat-male-val');
  const femaleVal = document.getElementById('stat-female-val');

  if (totalVal) totalVal.textContent = total;
  if (maleVal) maleVal.textContent = male;
  if (femaleVal) femaleVal.textContent = female;

  // Mini stats cards
  const miniTotal = document.getElementById('mini-stat-total');
  const miniMale = document.getElementById('mini-stat-male');
  const miniFemale = document.getElementById('mini-stat-female');
  const miniWA = document.getElementById('mini-stat-whatsapp');

  if (miniTotal) miniTotal.textContent = total;
  if (miniMale) miniMale.textContent = male;
  if (miniFemale) miniFemale.textContent = female;
  if (miniWA) miniWA.textContent = waJoined;

  // Update dynamic visual charts and ranking analytics
  updateAnalyticsDashboard();
}

function updateAnalyticsDashboard() {
  const total = allMembers.length;
  
  // 1. Total Registered
  const totalEl = document.getElementById('analytics-total');
  if (totalEl) totalEl.textContent = total;

  // 2. WhatsApp Onboarding
  const waJoinedCount = allMembers.filter(m => m.whatsapp_joined).length;
  const waRate = total ? Math.round((waJoinedCount / total) * 100) : 0;
  const waRateEl = document.getElementById('analytics-wa-rate');
  const waProgressEl = document.getElementById('analytics-wa-progress');
  if (waRateEl) waRateEl.textContent = `${waRate}%`;
  if (waProgressEl) waProgressEl.style.width = `${waRate}%`;

  // 3. Gender Distribution
  const maleCount = allMembers.filter(m => m.gender === 'Male').length;
  const femaleCount = allMembers.filter(m => m.gender === 'Female').length;
  const malePct = total ? Math.round((maleCount / total) * 100) : 0;
  const femalePct = total ? Math.round((femaleCount / total) * 100) : 0;
  
  const malePctEl = document.getElementById('analytics-male-pct');
  const femalePctEl = document.getElementById('analytics-female-pct');
  const maleBar = document.getElementById('analytics-male-bar');
  const femaleBar = document.getElementById('analytics-female-bar');
  
  if (malePctEl) malePctEl.textContent = `${malePct}% Male (${maleCount})`;
  if (femalePctEl) femalePctEl.textContent = `${femalePct}% Female (${femaleCount})`;
  if (maleBar) maleBar.style.width = `${malePct}%`;
  if (femaleBar) femaleBar.style.width = `${femalePct}%`;

  // 4. Academic Level Breakdown
  const lvl100Count = allMembers.filter(m => m.level === '100').length;
  const lvl200Count = allMembers.filter(m => m.level === '200').length;
  const lvl300Count = allMembers.filter(m => m.level === '300').length;
  const lvl400Count = allMembers.filter(m => m.level === '400').length;

  const lvl100Pct = total ? Math.round((lvl100Count / total) * 100) : 0;
  const lvl200Pct = total ? Math.round((lvl200Count / total) * 100) : 0;
  const lvl300Pct = total ? Math.round((lvl300Count / total) * 100) : 0;
  const lvl400Pct = total ? Math.round((lvl400Count / total) * 100) : 0;

  // Set counts
  const val100 = document.getElementById('val-lvl-100');
  const val200 = document.getElementById('val-lvl-200');
  const val300 = document.getElementById('val-lvl-300');
  const val400 = document.getElementById('val-lvl-400');
  
  if (val100) val100.textContent = lvl100Count;
  if (val200) val200.textContent = lvl200Count;
  if (val300) val300.textContent = lvl300Count;
  if (val400) val400.textContent = lvl400Count;

  // Set bar widths
  const bar100 = document.getElementById('bar-lvl-100');
  const bar200 = document.getElementById('bar-lvl-200');
  const bar300 = document.getElementById('bar-lvl-300');
  const bar400 = document.getElementById('bar-lvl-400');
  
  if (bar100) bar100.style.width = `${lvl100Pct}%`;
  if (bar200) bar200.style.width = `${lvl200Pct}%`;
  if (bar300) bar300.style.width = `${lvl300Pct}%`;
  if (bar400) bar400.style.width = `${lvl400Pct}%`;

  // 5. Academic Level Donut Chart Calculations (Circumference = 219.91)
  const circ = 219.91;
  const levelsData = [
    { id: 'donut-lvl-100', count: lvl100Count, labelId: 'lbl-donut-100' },
    { id: 'donut-lvl-200', count: lvl200Count, labelId: 'lbl-donut-200' },
    { id: 'donut-lvl-300', count: lvl300Count, labelId: 'lbl-donut-300' },
    { id: 'donut-lvl-400', count: lvl400Count, labelId: 'lbl-donut-400' }
  ];

  let cumulativeAngle = -90; // Start at the top center

  levelsData.forEach(lvl => {
    const circle = document.getElementById(lvl.id);
    const label = document.getElementById(lvl.labelId);
    
    const pct = total ? lvl.count / total : 0;
    const pctString = total ? Math.round(pct * 100) : 0;

    if (label) label.textContent = `${pctString}% (${lvl.count})`;

    if (circle) {
      if (lvl.count === 0) {
        circle.style.display = 'none';
      } else {
        circle.style.display = 'block';
        const strokeLength = pct * circ;
        circle.setAttribute('stroke-dasharray', `${strokeLength} ${circ}`);
        circle.setAttribute('transform', `rotate(${cumulativeAngle} 50 50)`);
        cumulativeAngle += pct * 360;
      }
    }
  });

  const donutTotal = document.getElementById('donut-total-text');
  if (donutTotal) donutTotal.textContent = total;

  // 6. Demographics Table (Student | Level | Hometown | Programme)
  const demographicsBody = document.getElementById('list-demographics-main');
  if (demographicsBody) {
    demographicsBody.innerHTML = '';
    if (allMembers.length === 0) {
      demographicsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--ink-light);">No student records available</td></tr>';
    } else {
      // Sort alphabetically by full name
      const sorted = [...allMembers].sort((a, b) => a.full_name.localeCompare(b.full_name));
      
      sorted.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${m.full_name}</td>
          <td>Level ${m.level}</td>
          <td>${m.hometown || 'Not specified'}</td>
          <td>${m.programme || 'Not specified'}</td>
        `;
        demographicsBody.appendChild(tr);
      });
    }
  }
}

// Tab Navigation
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      // Deactivate all
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

      // Activate clicked
      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const content = document.getElementById(`tab-${targetId}`);
      if (content) content.classList.add('active');
      
      // Special actions on tab open
      if (targetId === 'whatsapp') {
        generateQRCode();
      }
    });
  });
}

// TAB A: MEMBERS - Filtering & Table
let textFilter = '';
let genderFilter = 'All';
let levelFilter = 'All';

function setupFilters() {
  const searchInput = document.getElementById('search-input');
  const filterGender = document.getElementById('filter-gender');
  const filterLevel = document.getElementById('filter-level');
  const btnClearFilters = document.getElementById('btn-clear-filters');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      textFilter = e.target.value.toLowerCase().trim();
      applyFilters();
    });
  }

  if (filterGender) {
    filterGender.addEventListener('change', (e) => {
      genderFilter = e.target.value;
      applyFilters();
    });
  }

  if (filterLevel) {
    filterLevel.addEventListener('change', (e) => {
      levelFilter = e.target.value;
      applyFilters();
    });
  }

  if (btnClearFilters) {
    btnClearFilters.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (filterGender) filterGender.value = 'All';
      if (filterLevel) filterLevel.value = 'All';
      textFilter = '';
      genderFilter = 'All';
      levelFilter = 'All';
      applyFilters();
    });
  }
}

function applyFilters() {
  let filtered = allMembers;

  // Text search
  if (textFilter) {
    filtered = filtered.filter(m => 
      (m.full_name && m.full_name.toLowerCase().includes(textFilter)) ||
      (m.phone && m.phone.toLowerCase().includes(textFilter)) ||
      (m.programme && m.programme.toLowerCase().includes(textFilter)) ||
      (m.hometown && m.hometown.toLowerCase().includes(textFilter))
    );
  }

  // Gender filter
  if (genderFilter !== 'All') {
    filtered = filtered.filter(m => m.gender === genderFilter);
  }

  // Level filter
  if (levelFilter !== 'All') {
    filtered = filtered.filter(m => m.level === levelFilter);
  }

  renderMembersTable(filtered);
}

function renderMembersTable(members) {
  const tbody = document.getElementById('members-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (members.length === 0) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    row.innerHTML = `<td colspan="10" class="text-center" style="color: #888; font-style: italic; padding: 20px;">No members registered yet.</td>`;
    tbody.appendChild(row);
    return;
  }

  members.forEach((member, index) => {
    const row = document.createElement('tr');
    
    // Format creation date
    let regDate = 'N/A';
    if (member.created_at) {
      const date = new Date(member.created_at);
      regDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    const genderBadge = member.gender === 'Male' 
      ? '<span class="badge badge-male"><span class="symbol-male"></span> Male</span>'
      : '<span class="badge badge-female"><span class="symbol-female"></span> Female</span>';

    const waJoinedBadge = member.whatsapp_joined
      ? `<span class="badge badge-green btn-action-wa" onclick="toggleWhatsAppJoined('${member.id}', ${member.whatsapp_joined})">Yes ✓</span>`
      : `<span class="badge badge-grey btn-action-wa" onclick="toggleWhatsAppJoined('${member.id}', ${member.whatsapp_joined})">No</span>`;

    row.innerHTML = `
      <td>${index + 1}</td>
      <td style="font-weight: bold; color: var(--ink);">${escapeHTML(member.full_name)}</td>
      <td>${genderBadge}</td>
      <td>${escapeHTML(member.programme || '—')}</td>
      <td>Level ${member.level}</td>
      <td style="font-family: var(--ui-font); font-size: 12px;">${escapeHTML(member.phone)}</td>
      <td>${waJoinedBadge}</td>
      <td>${escapeHTML(member.hometown || '—')}</td>
      <td style="font-size: 11px; color: var(--ink-light);">${regDate}</td>
      <td class="text-center">
        <button class="btn-delete" title="Delete member" onclick="deleteMember('${member.id}', '${escapeJS(member.full_name)}')">&times;</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Inline DB Action: Toggle WhatsApp Group Status
async function toggleWhatsAppJoined(id, currentStatus) {
  if (!supabaseClient) return;

  AudioEffects.playClick();
  HapticEffects.tap();
  try {
    const { error } = await supabaseClient
      .from('nags_members')
      .update({ whatsapp_joined: !currentStatus })
      .eq('id', id);

    if (error) {
      showError('Failed to update status: ' + error.message);
    } else {
      // Local update to avoid full reload
      const member = allMembers.find(m => m.id === id);
      if (member) {
        member.whatsapp_joined = !currentStatus;
        updateStatsBar();
        applyFilters();
      }
    }
  } catch (err) {
    showError('Error updating status: ' + err.message);
  }
}

// DB Action: Delete Member
async function deleteMember(id, name) {
  if (!supabaseClient) return;

  AudioEffects.playClick();
  HapticEffects.tap();
  Modal.confirm(
    'Delete Member',
    `Are you sure you want to delete member: "${name}"? This action cannot be undone.`,
    async () => {
      try {
        const { error } = await supabaseClient
          .from('nags_members')
          .delete()
          .eq('id', id);

        if (error) {
          showError('Failed to delete member: ' + error.message);
        } else {
          // Remove locally
          AudioEffects.playSuccess();
          HapticEffects.success();
          allMembers = allMembers.filter(m => m.id !== id);
          updateStatsBar();
          updateSMSRecipientCounts();
          applyFilters();
        }
      } catch (err) {
        showError('Error deleting member: ' + err.message);
      }
    },
    true
  );
}

// TAB B: SMS BROADCAST
let selectedSMSTarget = 'all';

function setupSMSBroadcast() {
  const smsTextarea = document.getElementById('sms-message');
  const charCounter = document.getElementById('sms-chars');
  const unitCounter = document.getElementById('sms-units');
  const smsForm = document.getElementById('sms-form');
  const targetRadios = document.querySelectorAll('input[name="sms-target"]');
  const previewText = document.getElementById('sms-preview-count');
  const btnSend = document.getElementById('btn-send-sms');

  // Input listener for character count
  if (smsTextarea) {
    smsTextarea.addEventListener('input', () => {
      const len = smsTextarea.value.length;
      const units = len === 0 ? 0 : Math.ceil(len / 160);
      
      if (charCounter) charCounter.textContent = `${len} / 160 characters`;
      if (unitCounter) unitCounter.textContent = `This will use ${units} SMS unit(s) per recipient`;
    });
  }

  // Radio listener for target counts
  targetRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      selectedSMSTarget = e.target.value;
      updateSMSPreview();
    });
  });

  // Submit bulk SMS
  if (smsForm) {
    smsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const senderId = document.getElementById('sms-sender-id').value.trim();
      const message = smsTextarea.value.trim();
      const resultBox = document.getElementById('sms-result-box');

      if (!message) {
        Toast.error('Please enter a message to broadcast.');
        return;
      }

      if (!senderId) {
        Toast.error('Please specify a Sender ID.');
        return;
      }

      const recipients = getSMSRecipients();
      if (recipients.length === 0) {
        Toast.error('No recipient phone numbers match your selected group.');
        return;
      }

      const confirmMsg = `Send SMS broadcast via Arkesel to ${recipients.length} members using Sender ID "${senderId}"?`;
      Modal.confirm(
        'Confirm Broadcast',
        confirmMsg,
        async () => {
          setSMSSendingState(true);
          if (resultBox) resultBox.style.display = 'none';

          try {
            const res = await SMS.sendSMS(recipients, message, senderId);
            setSMSSendingState(false);

            if (res.success) {
              AudioEffects.playSuccess();
              HapticEffects.success();
              if (resultBox) {
                const rawData = res.data || {};
                const dataInfo = rawData.data ? JSON.stringify(rawData.data) : JSON.stringify(rawData);
                resultBox.innerHTML = `
                  <strong>&check; Broadcast sent successfully!</strong><br>
                  Successfully transmitted to ${recipients.length} phone numbers.<br>
                  <span style="font-size: 10px; font-family: monospace; display: block; margin-top: 8px; opacity: 0.85; word-break: break-all;">
                    Network Delivery Report: ${dataInfo}
                  </span>
                `;
                resultBox.className = 'message-box success';
                resultBox.style.display = 'block';
                smsTextarea.value = '';
                if (charCounter) charCounter.textContent = '0 / 160 characters';
                if (unitCounter) unitCounter.textContent = 'This will use 0 SMS unit(s) per recipient';
              }
            }
          } catch (err) {
            setSMSSendingState(false);
            AudioEffects.playError();
            HapticEffects.error();
            if (resultBox) {
              resultBox.innerHTML = `<strong>&times; Broadcast Failed:</strong><br>${err.message}`;
              resultBox.className = 'message-box error';
              resultBox.style.display = 'block';
            }
          }
        },
        false // not destructive, use primary gold theme button
      );
    });
  }
}

function updateSMSRecipientCounts() {
  const allCount = allMembers.length;
  const maleCount = allMembers.filter(m => m.gender === 'Male').length;
  const femaleCount = allMembers.filter(m => m.gender === 'Female').length;
  const lvl100 = allMembers.filter(m => m.level === '100').length;
  const lvl200 = allMembers.filter(m => m.level === '200').length;
  const lvl300 = allMembers.filter(m => m.level === '300').length;
  const lvl400 = allMembers.filter(m => m.level === '400').length;

  document.getElementById('lbl-cnt-all').textContent = `(${allCount} numbers)`;
  document.getElementById('lbl-cnt-male').textContent = `(${maleCount} numbers)`;
  document.getElementById('lbl-cnt-female').textContent = `(${femaleCount} numbers)`;
  document.getElementById('lbl-cnt-l100').textContent = `(${lvl100} numbers)`;
  document.getElementById('lbl-cnt-l200').textContent = `(${lvl200} numbers)`;
  document.getElementById('lbl-cnt-l300').textContent = `(${lvl300} numbers)`;
  document.getElementById('lbl-cnt-l400').textContent = `(${lvl400} numbers)`;

  updateSMSPreview();
}

function getSMSRecipients() {
  let list = [];
  
  if (selectedSMSTarget === 'all') {
    list = allMembers;
  } else if (selectedSMSTarget === 'male') {
    list = allMembers.filter(m => m.gender === 'Male');
  } else if (selectedSMSTarget === 'female') {
    list = allMembers.filter(m => m.gender === 'Female');
  } else if (selectedSMSTarget === 'lvl100') {
    list = allMembers.filter(m => m.level === '100');
  } else if (selectedSMSTarget === 'lvl200') {
    list = allMembers.filter(m => m.level === '200');
  } else if (selectedSMSTarget === 'lvl300') {
    list = allMembers.filter(m => m.level === '300');
  } else if (selectedSMSTarget === 'lvl400') {
    list = allMembers.filter(m => m.level === '400');
  }

  // Extract phone numbers and filter empties
  return list.map(m => m.phone).filter(p => p && p.trim() !== '');
}

function updateSMSPreview() {
  const recipients = getSMSRecipients();
  const previewText = document.getElementById('sms-preview-count');
  const btnSend = document.getElementById('btn-send-sms');
  
  if (previewText) {
    previewText.textContent = `This message will be sent to ${recipients.length} members.`;
  }
  if (btnSend) {
    btnSend.textContent = `Send SMS to ${recipients.length} Members`;
  }
}

function setSMSSendingState(sending) {
  const btn = document.getElementById('btn-send-sms');
  const text = document.getElementById('sms-message');
  if (!btn) return;

  const spinnerHtml = `
    <svg class="btn-spinner" viewBox="0 0 50 50">
      <circle class="path" cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
    </svg>
  `;

  if (sending) {
    btn.disabled = true;
    btn.innerHTML = spinnerHtml + 'Sending Broadcast...';
    if (text) text.disabled = true;
  } else {
    btn.disabled = false;
    updateSMSPreview();
    if (text) text.disabled = false;
  }
}

// TAB C: WHATSAPP MANAGER
let qrCodeInstance = null;

function initWhatsAppTab() {
  const waLinkVal = document.getElementById('wa-current-link-val');
  const waLinkInput = document.getElementById('wa-invite-link');
  const waCopyBtn = document.getElementById('btn-copy-wa-link');

  const fbLinkVal = document.getElementById('fb-current-link-val');
  const fbLinkInput = document.getElementById('fb-invite-link');
  const fbCopyBtn = document.getElementById('btn-copy-fb-link');

  const updateSocialsBtn = document.getElementById('btn-update-socials');

  const currentWaLink = localStorage.getItem('whatsapp_invite_link') || CONFIG.WHATSAPP_INVITE_LINK;
  const currentFbLink = localStorage.getItem('facebook_link') || CONFIG.FACEBOOK_LINK;
  
  if (waLinkVal) waLinkVal.value = currentWaLink;
  if (waLinkInput) waLinkInput.value = currentWaLink;

  if (fbLinkVal) fbLinkVal.value = currentFbLink;
  if (fbLinkInput) fbLinkInput.value = currentFbLink;

  // Copy WhatsApp link handler
  if (waCopyBtn) {
    waCopyBtn.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      navigator.clipboard.writeText(waLinkVal.value);
      Toast.success('WhatsApp invite link copied to clipboard!');
    });
  }

  // Copy Facebook link handler
  if (fbCopyBtn) {
    fbCopyBtn.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      navigator.clipboard.writeText(fbLinkVal.value);
      Toast.success('Facebook page link copied to clipboard!');
    });
  }

  // Update socials handler
  if (updateSocialsBtn) {
    updateSocialsBtn.addEventListener('click', () => {
      const newWaLink = waLinkInput.value.trim();
      const newFbLink = fbLinkInput.value.trim();

      if (newWaLink && !newWaLink.startsWith('http://') && !newWaLink.startsWith('https://')) {
        Toast.error('Please enter a valid WhatsApp URL (starting with https://).');
        return;
      }
      if (newFbLink && !newFbLink.startsWith('http://') && !newFbLink.startsWith('https://')) {
        Toast.error('Please enter a valid Facebook URL (starting with https://).');
        return;
      }

      localStorage.setItem('whatsapp_invite_link', newWaLink);
      localStorage.setItem('facebook_link', newFbLink);

      if (waLinkVal) waLinkVal.value = newWaLink;
      if (fbLinkVal) fbLinkVal.value = newFbLink;

      AudioEffects.playSuccess();
      HapticEffects.success();
      Toast.success('Social Media links updated successfully!');
      generateQRCode();
    });
  }

  // QR actions
  const downloadQRBtn = document.getElementById('btn-download-qr');
  const printQRBtn = document.getElementById('btn-print-qr');

  if (downloadQRBtn) {
    downloadQRBtn.addEventListener('click', () => {
      downloadQRCode();
    });
  }

  if (printQRBtn) {
    printQRBtn.addEventListener('click', () => {
      printQRCode();
    });
  }
}

function generateQRCode() {
  const siteUrl = window.location.origin;
  const container = document.getElementById('qrcode');
  if (!container) return;

  container.innerHTML = '';
  
  if (typeof QRCode === 'undefined') {
    container.textContent = 'QR Code generator library failed to load.';
    return;
  }

  qrCodeInstance = new QRCode(container, {
    text: siteUrl,
    width: 180,
    height: 180,
    colorDark : "#111111",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
  });
}

function downloadQRCode() {
  const qrCanvas = document.querySelector('#qrcode canvas');
  if (!qrCanvas) {
    Toast.error('QR Code not generated yet.');
    return;
  }

  // Create an in-memory canvas for the complete flyer sheet
  const flyer = document.createElement('canvas');
  flyer.width = 800;
  flyer.height = 1000;
  const ctx = flyer.getContext('2d');

  // Fill Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, flyer.width, flyer.height);

  // Draw Header Text
  ctx.fillStyle = '#1a3f72';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NAGS-UENR REGISTRATION PORTAL', 400, 150);

  // Draw Subtitle / Instruction Text
  ctx.fillStyle = '#555555';
  ctx.font = '16px Arial, sans-serif';
  ctx.fillText('Scan this QR code with your phone camera to open the portal and register instantly.', 400, 210);

  // Draw border frame for the QR Code
  ctx.strokeStyle = '#1a3f72';
  ctx.lineWidth = 3;
  ctx.strokeRect(230, 280, 340, 340);

  // Draw the QR Code image inside the frame
  ctx.drawImage(qrCanvas, 250, 300, 300, 300);

  // Draw Footer Text
  ctx.fillStyle = '#888888';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('National Association of Gonjaland Students · UENR Chapter', 400, 850);

  // Download the flyer canvas as PNG
  const link = document.createElement('a');
  link.download = 'NAGS-UENR-Registration-Flyer.png';
  link.href = flyer.toDataURL('image/png');
  link.click();
}

function printQRCode() {
  const qrCanvas = document.querySelector('#qrcode canvas');
  if (!qrCanvas) {
    Toast.error('QR code not ready for print.');
    return;
  }

  const dataUrl = qrCanvas.toDataURL('image/png');
  const printWindow = window.open('', '_blank');
  
  printWindow.document.write(`
    <html>
      <head>
        <title>Print QR Code - NAGS-UENR</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 40px;
          }
          .qr-box {
            border: 2px solid #1a3f72;
            padding: 20px;
            display: inline-block;
            margin-top: 20px;
          }
          h1 {
            color: #1a3f72;
            margin-bottom: 5px;
            font-size: 20px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          p {
            color: #555;
            margin-bottom: 20px;
            font-size: 14px;
          }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        <h1>NAGS-UENR Registration Portal</h1>
        <p>Scan this QR code with your phone camera to open the portal and register instantly.</p>
        <div class="qr-box">
          <img src="${dataUrl}" width="250" height="250" />
        </div>
        <footer style="margin-top: 50px; font-size: 10px; color: #888;">
          National Association of Gonjaland Students &middot; UENR Chapter
        </footer>
      </body>
    </html>
  `);
  printWindow.document.close();
}

// TAB D: EXPORT
function setupExports() {
  const btnCSV = document.getElementById('btn-export-csv');
  const btnSummary = document.getElementById('btn-export-summary');

  if (btnCSV) {
    btnCSV.addEventListener('click', () => {
      downloadCSV();
    });
  }

  if (btnSummary) {
    btnSummary.addEventListener('click', () => {
      copySummaryText();
    });
  }
}

function downloadCSV() {
  if (allMembers.length === 0) {
    Toast.error('No member records to export.');
    return;
  }

  // Format YYYY-MM-DD HH:MM in Local Time
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

  const headers = ['ID', 'Full Name', 'Gender', 'Hometown', 'Programme', 'Level', 'Phone', 'WhatsApp', 'WhatsApp Joined', 'Registered At'];
  const rows = allMembers.map((m, index) => [
    index + 1, // Sequential index instead of system UUID
    m.full_name,
    m.gender,
    m.hometown || '',
    m.programme || '',
    m.level,
    m.phone ? `="${m.phone}"` : '', // Force text format for Excel to prevent scientific notation
    m.whatsapp ? `="${m.whatsapp}"` : '', // Force text format for Excel to prevent scientific notation
    m.whatsapp_joined ? 'Yes' : 'No', // Human-readable Yes/No
    m.created_at ? formatLocalTimestamp(m.created_at) : '' // YYYY-MM-DD HH:MM Local Time
  ]);

  // Convert array to CSV syntax (properly escape fields)
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += headers.map(h => `"${escapeCSVField(h)}"`).join(',') + '\r\n';
  
  rows.forEach(r => {
    csvContent += r.map(field => `"${escapeCSVField(field)}"`).join(',') + '\r\n';
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  
  // Format Date for filename
  const today = new Date().toISOString().split('T')[0];
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `NAGS-UENR-Members-${today}.csv`);
  document.body.appendChild(link);
  
  link.click();
  document.body.removeChild(link);
}

function copySummaryText() {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const total = allMembers.length;
  const male = allMembers.filter(m => m.gender === 'Male').length;
  const female = allMembers.filter(m => m.gender === 'Female').length;
  const waJoined = allMembers.filter(m => m.whatsapp_joined).length;

  const lvl100 = allMembers.filter(m => m.level === '100').length;
  const lvl200 = allMembers.filter(m => m.level === '200').length;
  const lvl300 = allMembers.filter(m => m.level === '300').length;
  const lvl400 = allMembers.filter(m => m.level === '400').length;

  const summary = `NAGS-UENR Registration Summary
Date: ${today}
Total Members: ${total}
Male: ${male} | Female: ${female}
WhatsApp Joined: ${waJoined}
Levels: 100(${lvl100}) 200(${lvl200}) 300(${lvl300}) 400(${lvl400})`;

  navigator.clipboard.writeText(summary)
    .then(() => {
      Toast.success('Summary Report copied to clipboard!');
    })
    .catch(err => {
      Toast.error('Failed to copy report: ' + err.message);
    });
}

// Utility functions
function showError(msg) {
  AudioEffects.playError();
  HapticEffects.error();
  const errorBox = document.getElementById('admin-error-box');
  if (errorBox) {
    errorBox.textContent = msg;
    errorBox.classList.add('error');
    errorBox.style.display = 'block';
    
    // Clear error after 5s
    setTimeout(() => {
      errorBox.style.display = 'none';
      errorBox.classList.remove('error');
    }, 5000);
  } else {
    Toast.error(msg);
  }
}

function showTableLoader(show) {
  const loader = document.getElementById('table-loader');
  if (loader) {
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function escapeJS(str) {
  if (!str) return '';
  return str.replace(/['"\\\r\n]/g, char => {
    switch (char) {
      case "'": return "\\'";
      case '"': return '\\"';
      case '\\': return '\\\\';
      case '\r': return '\\r';
      case '\n': return '\\n';
      default: return char;
    }
  });
}

function escapeCSVField(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Replace quotes with double quotes
  return str.replace(/"/g, '""');
}

// Global Event Initialization
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  checkAuth();
  setupLogin();
  setupTabs();
  setupFilters();
  setupSMSBroadcast();
  setupExports();
});
