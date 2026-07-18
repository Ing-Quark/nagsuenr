// admin.js - Admin Dashboard Logic

let supabaseClient;
let allMembers = [];

// Initialize Supabase
function initSupabase() {
  if (typeof CONFIG === 'undefined') {
    showError('Config file (config.js) is missing or not loaded.');
    return;
  }
  
  if (CONFIG.SUPABASE_URL === 'https://your-project.supabase.co' || CONFIG.SUPABASE_ANON_KEY === 'your-anon-key') {
    showError('Supabase is not configured. Please set your credentials in config.js.');
    return;
  }

  try {
    if (window.supabase) {
      supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    } else {
      showError('Supabase library failed to load.');
    }
  } catch (e) {
    showError('Failed to initialize Supabase: ' + e.message);
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
      if (errorMsg) errorMsg.classList.add('hidden');
      passwordInput.value = '';
      checkAuth();
    } else {
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
      sessionStorage.removeItem('nags_admin_logged_in');
      checkAuth();
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
}

// Tab Navigation
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
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

  if (confirm(`Are you sure you want to delete member: "${name}"? This action cannot be undone.`)) {
    try {
      const { error } = await supabaseClient
        .from('nags_members')
        .delete()
        .eq('id', id);

      if (error) {
        showError('Failed to delete member: ' + error.message);
      } else {
        // Remove locally
        allMembers = allMembers.filter(m => m.id !== id);
        updateStatsBar();
        updateSMSRecipientCounts();
        applyFilters();
      }
    } catch (err) {
      showError('Error deleting member: ' + err.message);
    }
  }
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
        alert('Please enter a message to broadcast.');
        return;
      }

      if (!senderId) {
        alert('Please specify a Sender ID.');
        return;
      }

      const recipients = getSMSRecipients();
      if (recipients.length === 0) {
        alert('No recipient phone numbers match your selected group.');
        return;
      }

      const confirmMsg = `Send SMS broadcast via Arkesel to ${recipients.length} members using Sender ID "${senderId}"?`;
      if (!confirm(confirmMsg)) return;

      setSMSSendingState(true);
      if (resultBox) resultBox.style.display = 'none';

      try {
        const res = await SMS.sendSMS(recipients, message, senderId);
        setSMSSendingState(false);

        if (res.success) {
          if (resultBox) {
            resultBox.innerHTML = `<strong>&check; Broadcast sent successfully!</strong><br>Successfully transmitted to ${recipients.length} phone numbers via Arkesel gateway.`;
            resultBox.className = 'message-box success';
            resultBox.style.display = 'block';
            smsTextarea.value = '';
            if (charCounter) charCounter.textContent = '0 / 160 characters';
            if (unitCounter) unitCounter.textContent = 'This will use 0 SMS unit(s) per recipient';
          }
        }
      } catch (err) {
        setSMSSendingState(false);
        if (resultBox) {
          resultBox.innerHTML = `<strong>&times; Broadcast Failed:</strong><br>${err.message}`;
          resultBox.className = 'message-box error';
          resultBox.style.display = 'block';
        }
      }
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

  if (sending) {
    btn.disabled = true;
    btn.textContent = 'Sending SMS...';
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
      navigator.clipboard.writeText(waLinkVal.value);
      alert('WhatsApp invite link copied to clipboard!');
    });
  }

  // Copy Facebook link handler
  if (fbCopyBtn) {
    fbCopyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(fbLinkVal.value);
      alert('Facebook page link copied to clipboard!');
    });
  }

  // Update socials handler
  if (updateSocialsBtn) {
    updateSocialsBtn.addEventListener('click', () => {
      const newWaLink = waLinkInput.value.trim();
      const newFbLink = fbLinkInput.value.trim();

      if (newWaLink && !newWaLink.startsWith('http://') && !newWaLink.startsWith('https://')) {
        alert('Please enter a valid WhatsApp URL (starting with https://).');
        return;
      }
      if (newFbLink && !newFbLink.startsWith('http://') && !newFbLink.startsWith('https://')) {
        alert('Please enter a valid Facebook URL (starting with https://).');
        return;
      }

      localStorage.setItem('whatsapp_invite_link', newWaLink);
      localStorage.setItem('facebook_link', newFbLink);

      if (waLinkVal) waLinkVal.value = newWaLink;
      if (fbLinkVal) fbLinkVal.value = newFbLink;

      alert('Social Media links updated successfully!');
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
  const currentLink = localStorage.getItem('whatsapp_invite_link') || CONFIG.WHATSAPP_INVITE_LINK;
  const container = document.getElementById('qrcode');
  if (!container) return;

  container.innerHTML = '';
  
  if (typeof QRCode === 'undefined') {
    container.textContent = 'QR Code generator library failed to load.';
    return;
  }

  qrCodeInstance = new QRCode(container, {
    text: currentLink,
    width: 180,
    height: 180,
    colorDark : "#111111",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
  });
}

function downloadQRCode() {
  const qrImg = document.querySelector('#qrcode img');
  const qrCanvas = document.querySelector('#qrcode canvas');
  
  if (!qrImg && !qrCanvas) {
    alert('QR Code not generated yet.');
    return;
  }

  const link = document.createElement('a');
  link.download = 'NAGS-UENR-WhatsApp-QR.png';

  if (qrCanvas) {
    link.href = qrCanvas.toDataURL('image/png');
    link.click();
  } else if (qrImg) {
    link.href = qrImg.src;
    link.click();
  }
}

function printQRCode() {
  const qrCanvas = document.querySelector('#qrcode canvas');
  if (!qrCanvas) {
    alert('QR code not ready for print.');
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
        <h1>NAGS-UENR Official WhatsApp Group</h1>
        <p>Scan this QR code with your phone camera or WhatsApp scan feature to join the group instantly.</p>
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
    alert('No member records to export.');
    return;
  }

  const headers = ['ID', 'Full Name', 'Gender', 'Hometown', 'Programme', 'Level', 'Phone', 'WhatsApp', 'WhatsApp Joined', 'Registered At'];
  const rows = allMembers.map(m => [
    m.id,
    m.full_name,
    m.gender,
    m.hometown || '',
    m.programme || '',
    m.level,
    m.phone,
    m.whatsapp || '',
    m.whatsapp_joined ? 'TRUE' : 'FALSE',
    m.created_at ? new Date(m.created_at).toISOString() : ''
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
      alert('Summary Report copied to clipboard!');
    })
    .catch(err => {
      alert('Failed to copy report: ' + err.message);
    });
}

// Utility functions
function showError(msg) {
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
    alert(msg);
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
