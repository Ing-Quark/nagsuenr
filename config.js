// NAGS Ghana Platform — Global Configuration
// Phase 1: Foundation keys. See deprecation notes below.

const CONFIG = {
  // ── Core (permanent) ──
  SUPABASE_URL:      'https://sedlaceuhcfrkfofynhs.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZGxhY2V1aGNmcmtmb2Z5bmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMjYxMzYsImV4cCI6MjA5OTkwMjEzNn0.hHtCpxJ9L-TNvstg9uu41_Ts6zWBgGp4wVUrpu0BSUE',

  // ── DEPRECATED — Phase 3: moves to Netlify env var ARKESEL_API_KEY ──
  // Kept here temporarily so old admin.html SMS broadcast continues working
  ARKESEL_API_KEY: 'c0JSckpVS0ZiZGVDUlFURkNqdnE',

  // ── DEPRECATED — Phase 4: replaced by Supabase Auth (login.html) ──
  // Kept here temporarily so old admin.html password login continues working
  ADMIN_PASSWORD: '#Nags@26!',

  // ── DEPRECATED — Phase 4: stored per-chapter in universities table ──
  // Kept here temporarily so register/registration.js fallback continues working
  WHATSAPP_INVITE_LINK: 'https://chat.whatsapp.com/invite',
  FACEBOOK_LINK:        'https://facebook.com/nagsuenr'
};
