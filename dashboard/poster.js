// poster.js - Executive Lineup Poster Controller (Glassmorphic Print Edition)
// Patch: All interactive functions explicitly attached to window to support HTML onclick attributes

let supabaseClient;
let chapterId = null;
let chapterSlug = 'uenr';
let executives = [];

// Fallback seeded placeholder lineup specifically for NAGS UENR
const uenrDefaultPlaceholders = [
  { id: 'p1', full_name: 'President Name (Placeholder)',           role: 'president',       photo_url: '', motto: 'Serving with Integrity, Empowering through Unity' },
  { id: 'p2', full_name: 'Vice President Name (Placeholder)',      role: 'vice_president',  photo_url: '', motto: 'Committed to Progress, Grounded in Service' },
  { id: 'p3', full_name: 'General Secretary Name (Placeholder)',   role: 'secretary',       photo_url: '', motto: 'Organizing the Present, Securing the Future' },
  { id: 'p4', full_name: 'Financial Secretary Name (Placeholder)', role: 'financial_sec',   photo_url: '', motto: 'Accountability and Financial Prudence First' },
  { id: 'p5', full_name: 'PRO Name (Placeholder)',                 role: 'pro',             photo_url: '', motto: 'Your Voice, Our Mission, Clear Communication' },
  { id: 'p6', full_name: 'Welfare Officer Name (Placeholder)',     role: 'welfare',         photo_url: '', motto: 'Prioritizing Student Wellbeing, Compassion in Action' },
  { id: 'p7', full_name: 'Organizing Secretary Name (Placeholder)',role: 'organizing_sec',  photo_url: '', motto: 'Mobilizing Strength, Building Community' }
];

// ── Vector icon renderer (Patch #1: Zero race conditions) ──
function refreshVectorIcons() {
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    try { lucide.createIcons(); } catch (e) { console.warn('[Lucide]', e); }
  }
}
window.refreshVectorIcons = refreshVectorIcons;

// ── Sidebar toggle ──
function toggleSidebar() {
  const sidebar = document.getElementById('customizer-sidebar');
  if (sidebar) sidebar.classList.toggle('show');
}
window.toggleSidebar = toggleSidebar;

// ── Apply customizer display settings ──
function applyCustomizerSettings() {
  const theme  = document.getElementById('setting-theme')  ? document.getElementById('setting-theme').value  : 'theme-dark';
  const layout = document.getElementById('setting-layout') ? document.getElementById('setting-layout').value : 'layout-portrait';
  const canvas = document.getElementById('poster-canvas');
  if (canvas) canvas.className = `poster-canvas ${theme} ${layout}`;
  renderPosterGrid();
}
window.applyCustomizerSettings = applyCustomizerSettings;

// ── Live update a single exec field and re-render grid ──
function updateExecField(index, field, value) {
  if (executives[index]) {
    executives[index][field] = value;
    renderPosterGrid();
  }
}
window.updateExecField = updateExecField;

// ── Reset to baseline (database or placeholders) ──
async function resetToDatabaseDefaults() {
  if (confirm('Reset all values to the database baseline?')) {
    await loadPosterData();
  }
}
window.resetToDatabaseDefaults = resetToDatabaseDefaults;

// ── Initialize Supabase client ──
function initSupabase() {
  if (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
}

// ── Fetch chapter & executive records ──
async function loadPosterData() {
  const params = new URLSearchParams(window.location.search);
  chapterSlug = params.get('chapter') || 'uenr';

  // 1. Default to placeholders immediately so the poster is never blank
  executives = JSON.parse(JSON.stringify(uenrDefaultPlaceholders));

  // 2. Attempt live Supabase fetch
  if (supabaseClient) {
    try {
      const { data: univData, error: univErr } = await supabaseClient
        .from('universities')
        .select('*')
        .eq('slug', chapterSlug)
        .eq('is_active', true)
        .single();

      if (!univErr && univData) {
        chapterId = univData.id;
        const chapEl = document.getElementById('poster-header-chapter');
        if (chapEl) chapEl.textContent = `NAGS ${univData.short_name || chapterSlug.toUpperCase()} — ${univData.name} Chapter`;
        const univCrest = document.getElementById('univ-crest');
        if (univCrest) {
          if (univData.logo_url && univData.logo_url !== '../nags.png') {
            univCrest.src = univData.logo_url;
            univCrest.style.display = 'inline-block';
          } else {
            univCrest.style.display = 'none';
          }
        }
      }
    } catch (err) {
      console.warn('[Poster] University fetch skipped:', err.message);
    }

    if (chapterId) {
      try {
        const { data: execsData, error: execErr } = await supabaseClient
          .from('executives')
          .select('*')
          .eq('university_id', chapterId)
          .eq('is_active', true)
          .order('full_name', { ascending: true });

        if (!execErr && execsData && execsData.length > 0) {
          executives = execsData.map(e => ({
            id: e.id,
            full_name: e.full_name || 'Executive Name',
            role:      e.role      || 'member',
            photo_url: e.photo_url || '',
            motto:     e.motto     || 'Serving with Integrity and Dedication'
          }));
        }
        // else keep the placeholders set above
      } catch (err) {
        console.warn('[Poster] Executives fetch skipped:', err.message);
      }
    }
  }

  renderPosterGrid();
  renderCustomizerInputs();
  generateVerificationQRCode();
}

// ── Render exec grid cards ──
function renderPosterGrid() {
  const container = document.getElementById('poster-grid-container');
  if (!container) return;
  container.innerHTML = '';

  const roleOrder = ['president','vice_president','secretary','financial_sec','pro','welfare','organizing_sec'];
  const sorted    = [...executives].sort((a, b) => {
    const ai = roleOrder.indexOf(a.role); const bi = roleOrder.indexOf(b.role);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  sorted.forEach(exec => {
    const card      = document.createElement('div');
    const isTier1   = exec.role === 'president';
    const roleCls   = exec.role.replace(/_/g, '-');
    const badgeTxt  = exec.role.replace(/_/g, ' ').toUpperCase();

    const imgHtml = exec.photo_url
      ? `<img src="${esc(exec.photo_url)}" class="exec-img" alt="${esc(exec.full_name)}"
             onerror="this.outerHTML='<div class=exec-img-placeholder><svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><circle cx=\\'12\\' cy=\\'8\\' r=\\'4\\'></circle><path d=\\'M4 20c0-4 3.6-7 8-7s8 3 8 7\\'></path></svg></div>';">`
      : `<div class="exec-img-placeholder">
           <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
             <circle cx="12" cy="8" r="4"></circle>
             <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"></path>
           </svg>
         </div>`;

    card.className = `exec-card${isTier1 ? ' exec-card-tier1' : ''}`;
    card.innerHTML = `
      <div class="exec-img-wrap">${imgHtml}</div>
      <h3 class="exec-name">${escHTML(exec.full_name)}</h3>
      <span class="exec-role-badge exec-role-${roleCls}">${badgeTxt}</span>
      <p  class="exec-quote">"${escHTML(exec.motto)}"</p>
    `;
    container.appendChild(card);
  });
}

// ── Render customizer input cards ──
function renderCustomizerInputs() {
  const list = document.getElementById('customizer-execs-list');
  if (!list) return;
  list.innerHTML = '';

  executives.forEach((exec, i) => {
    const card = document.createElement('div');
    card.className = 'exec-edit-card';
    card.innerHTML = `
      <label>${exec.role.replace(/_/g,' ').toUpperCase()}</label>
      <input  type="text" class="sa-input" style="font-size:11px;padding:6px;"
              value="${esc(exec.full_name)}"
              oninput="updateExecField(${i},'full_name',this.value)"
              placeholder="Full Name">
      <input  type="url"  class="sa-input" style="font-size:11px;padding:6px;margin-top:4px;"
              value="${esc(exec.photo_url)}"
              oninput="updateExecField(${i},'photo_url',this.value)"
              placeholder="Photo URL (optional)">
      <input  type="text" class="sa-input" style="font-size:11px;padding:6px;margin-top:4px;"
              value="${esc(exec.motto)}"
              oninput="updateExecField(${i},'motto',this.value)"
              placeholder="Motto / Quote">
    `;
    list.appendChild(card);
  });
}

// ── Generate QR code footer ──
function generateVerificationQRCode() {
  const container = document.getElementById('footer-qr-container');
  if (!container) return;
  container.innerHTML = '';
  if (typeof QRCode === 'undefined') return;
  const url = `${window.location.origin}/register/?chapter=${encodeURIComponent(chapterSlug)}`;
  new QRCode(container, { text: url, width: 46, height: 46, colorDark: '#000', colorLight: '#fff' });
}

// ── Escape helpers ──
function escHTML(s) {
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
}
function esc(s) { return escHTML(s); }

// ── DOM Load ──
document.addEventListener('DOMContentLoaded', async () => {
  initSupabase();

  // Render placeholders immediately so canvas is never blank on load
  executives = JSON.parse(JSON.stringify(uenrDefaultPlaceholders));
  renderPosterGrid();
  renderCustomizerInputs();

  // Then load real data (overwrites placeholders if Supabase data exists)
  await loadPosterData();
  applyCustomizerSettings();
  refreshVectorIcons();
});
