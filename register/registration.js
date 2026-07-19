// registration.js - Public Registration Flow Logic

let supabaseClient;
let currentRegisteredPhone = '';

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

// Initialize Database Client
function initSupabase() {
  if (typeof CONFIG === 'undefined') {
    showErrorBanner('System Configuration Error: Configuration files are missing.');
    return;
  }
  
  if (CONFIG.SUPABASE_URL === 'https://your-project.supabase.co' || CONFIG.SUPABASE_ANON_KEY === 'your-anon-key') {
    showErrorBanner('Database Connection Offline: Please check your configuration settings.');
    return;
  }

  try {
    if (window.supabase) {
      supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    } else {
      showErrorBanner('System Offline: Please verify your internet connection.');
    }
  } catch (e) {
    showErrorBanner('Database Connection Error: Service temporarily unavailable.');
  }
}

// Display error banner for configuration issues
function showErrorBanner(msg) {
  const banner = document.getElementById('config-warning');
  if (banner) {
    banner.textContent = msg;
    banner.style.display = 'block';
  }
}

// State variables
let currentStep = 1;
let selectedGender = '';

// DOM Elements
const step1Sec = document.getElementById('step-1');
const step2Sec = document.getElementById('step-2');
const step3Sec = document.getElementById('step-3');

const node1 = document.getElementById('node-1');
const node2 = document.getElementById('node-2');
const node3 = document.getElementById('node-3');

const conn1 = document.getElementById('conn-1');
const conn2 = document.getElementById('conn-2');

// Initialize events when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  setupGenderToggles();
  setupPhoneSync();
  setupNavigation();
  setupAdminPortalEasterEgg();
});

// Easter Egg shortcut to Admin Portal: Triple-tap or Long-press the site logo
function setupAdminPortalEasterEgg() {
  const logo = document.getElementById('logo-container');
  if (!logo) return;

  // 1. Triple tap listener (taps within 600ms)
  let logoClickCount = 0;
  let logoClickTimeout;
  logo.addEventListener('click', () => {
    logoClickCount++;
    clearTimeout(logoClickTimeout);
    logoClickTimeout = setTimeout(() => {
      logoClickCount = 0;
    }, 600);

    if (logoClickCount === 3) {
      logoClickCount = 0;
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([80, 50, 80]); // Triple haptic vibration
      }
      window.location.href = '/admin';
    }
  });

  // 2. Long press listener (1.5 seconds hold)
  let logoPressTimer;
  const startPress = () => {
    logoPressTimer = setTimeout(() => {
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(120); // Single long vibration confirmation
      }
      window.location.href = '/admin';
    }, 1500);
  };
  const endPress = () => {
    clearTimeout(logoPressTimer);
  };

  // Mouse holds
  logo.addEventListener('mousedown', startPress);
  logo.addEventListener('mouseup', endPress);
  logo.addEventListener('mouseleave', endPress);

  // Touch holds (mobile)
  logo.addEventListener('touchstart', startPress, { passive: true });
  logo.addEventListener('touchend', endPress, { passive: true });
  logo.addEventListener('touchcancel', endPress, { passive: true });

  // Disable dragging on the logo image to prevent hold interference
  const logoImg = logo.querySelector('img');
  if (logoImg) {
    logoImg.setAttribute('draggable', 'false');
  }
  logo.style.cursor = 'pointer';
}

// Gender Toggles (Male/Female buttons)
function setupGenderToggles() {
  const maleBtn = document.getElementById('btn-male');
  const femaleBtn = document.getElementById('btn-female');
  const genderInput = document.getElementById('gender');

  if (maleBtn && femaleBtn) {
    maleBtn.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      selectedGender = 'Male';
      genderInput.value = 'Male';
      maleBtn.classList.add('selected-male');
      femaleBtn.classList.remove('selected-female');
      clearError();
    });

    femaleBtn.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      selectedGender = 'Female';
      genderInput.value = 'Female';
      femaleBtn.classList.add('selected-female');
      maleBtn.classList.remove('selected-male');
      clearError();
    });
  }
}

// Prefill/Sync WhatsApp number with Phone number and enforce +233 prefix
function setupPhoneSync() {
  const phoneInput = document.getElementById('phone');
  const whatsappInput = document.getElementById('whatsapp');
  let userEditedWhatsapp = false;

  const enforcePrefix = (inputEl, onInputCallback) => {
    inputEl.addEventListener('input', (e) => {
      let val = e.target.value;

      // Force start with +233
      if (val.length < 4) {
        val = '+233';
      } else if (!val.startsWith('+233')) {
        val = '+233' + val.replace(/\D/g, '').replace(/^233/, '');
      }

      // Strip non-digits after '+'
      let digits = val.substring(1).replace(/\D/g, '');

      // Auto-strip leading 0 if typed after country code (e.g. +233024... -> +23324...)
      if (digits.startsWith('2330')) {
        digits = '233' + digits.substring(4);
      }

      let cleaned = '+' + digits;

      // Limit to 13 characters (+233 + 9 digits)
      if (cleaned.length > 13) {
        cleaned = cleaned.substring(0, 13);
      }

      e.target.value = cleaned;
      
      if (onInputCallback) {
        onInputCallback(cleaned);
      }
    });
  };

  if (phoneInput && whatsappInput) {
    // Set initial values
    if (phoneInput.value === '') phoneInput.value = '+233';
    if (whatsappInput.value === '') whatsappInput.value = '+233';

    enforcePrefix(phoneInput, (cleanedValue) => {
      if (!userEditedWhatsapp) {
        whatsappInput.value = cleanedValue;
      }
    });

    enforcePrefix(whatsappInput, () => {
      userEditedWhatsapp = true;
    });
  }
}

// Handle Form Navigation
function setupNavigation() {
  const btnContinue = document.getElementById('btn-continue');
  const btnEdit = document.getElementById('btn-edit');
  const btnConfirm = document.getElementById('btn-confirm');
  const btnJoinWhatsapp = document.getElementById('btn-join-whatsapp');

  if (btnContinue) {
    btnContinue.addEventListener('click', async () => {
      const isValid = await validateStep1();
      if (isValid) {
        AudioEffects.playClick();
        HapticEffects.tap();
        goToStep(2);
      }
    });
  }

  if (btnEdit) {
    btnEdit.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      goToStep(1);
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      await registerMember();
    });
  }

  if (btnJoinWhatsapp) {
    btnJoinWhatsapp.addEventListener('click', async () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      const inviteLink = localStorage.getItem('whatsapp_invite_link') || CONFIG.WHATSAPP_INVITE_LINK;
      window.open(inviteLink, '_blank');
      
      // Attempt to silently update database that they joined
      if (supabaseClient && currentRegisteredPhone) {
        try {
          await supabaseClient
            .from('nags_members')
            .update({ whatsapp_joined: true })
            .eq('phone', currentRegisteredPhone);
        } catch (e) {
          console.warn('Silent WA status update failed: ', e);
        }
      }
    });
  }

  const btnVisitFacebook = document.getElementById('btn-visit-facebook');
  if (btnVisitFacebook) {
    btnVisitFacebook.addEventListener('click', () => {
      AudioEffects.playClick();
      HapticEffects.tap();
      const fbLink = localStorage.getItem('facebook_link') || CONFIG.FACEBOOK_LINK;
      window.open(fbLink, '_blank');
    });
  }
}

// Go to specific step visually
function goToStep(step) {
  currentStep = step;
  
  // Toggle sections
  step1Sec.classList.add('hidden');
  step2Sec.classList.add('hidden');
  step3Sec.classList.add('hidden');
  
  if (step === 1) {
    step1Sec.classList.remove('hidden');
    node1.className = 'step-node active';
    node2.className = 'step-node';
    node3.className = 'step-node';
    conn1.classList.remove('filled');
    conn2.classList.remove('filled');
  } else if (step === 2) {
    step2Sec.classList.remove('hidden');
    node1.className = 'step-node completed';
    node2.className = 'step-node active';
    node3.className = 'step-node';
    conn1.classList.add('filled');
    conn2.classList.remove('filled');
    
    // Fill confirm details
    populateConfirmationDetails();
  } else if (step === 3) {
    step3Sec.classList.remove('hidden');
    node1.className = 'step-node completed';
    node2.className = 'step-node completed';
    node3.className = 'step-node completed';
    conn1.classList.add('filled');
    conn2.classList.add('filled');
  }

  // Scroll to top of panel
  document.querySelector('.page-panel').scrollIntoView({ behavior: 'smooth' });
}

// Validate Step 1 Data and check duplicate
async function validateStep1() {
  clearError();
  
  const fullName = document.getElementById('full_name').value.trim();
  const gender = selectedGender;
  const phone = document.getElementById('phone').value.trim();
  const level = document.getElementById('level').value;

  if (!fullName) {
    showFormError('Full Name is required.');
    return false;
  }

  if (!gender) {
    showFormError('Please select your Gender.');
    return false;
  }

  if (!level) {
    showFormError('Please select your Academic Level.');
    return false;
  }

  if (!phone || phone === '+233') {
    showFormError('Phone Number is required.');
    return false;
  }

  // Ghana number check: Starts with +233 followed by exactly 9 digits
  const ghanaPhoneRegex = /^\+233[0-9]{9}$/;
  if (!ghanaPhoneRegex.test(phone)) {
    showFormError('Please enter a valid phone number after the +233 prefix (e.g. +233244123456).');
    return false;
  }

  // Check duplicate in Supabase
  if (!supabaseClient) {
    showFormError('Database client is not initialized. Cannot register at this time.');
    return false;
  }

  showLoader(true);
  try {
    const { data, error } = await supabaseClient
      .from('nags_members')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    showLoader(false);

    if (error) {
      console.error(error);
      showFormError('Database query failed: ' + error.message);
      return false;
    }

    if (data) {
      showFormError('This number is already registered. Welcome back!');
      return false;
    }

    return true;
  } catch (err) {
    showLoader(false);
    console.error(err);
    showFormError('Error checking duplicate record: ' + err.message);
    return false;
  }
}

// Populating read-only details on Step 2
function populateConfirmationDetails() {
  document.getElementById('lbl-name').textContent = document.getElementById('full_name').value.trim();
  document.getElementById('lbl-gender').textContent = selectedGender;
  document.getElementById('lbl-hometown').textContent = document.getElementById('hometown').value.trim() || 'Not specified';
  document.getElementById('lbl-programme').textContent = document.getElementById('programme').value.trim() || 'Not specified';
  document.getElementById('lbl-level').textContent = 'Level ' + document.getElementById('level').value;
  document.getElementById('lbl-phone').textContent = document.getElementById('phone').value.trim();
  
  const waVal = document.getElementById('whatsapp').value.trim();
  document.getElementById('lbl-whatsapp').textContent = (waVal === '+233' || !waVal) ? 'Not specified' : waVal;
}

// Register Member in Supabase
async function registerMember() {
  clearError();

  const fullName = document.getElementById('full_name').value.trim();
  const gender = selectedGender;
  const hometown = document.getElementById('hometown').value.trim();
  const programme = document.getElementById('programme').value.trim();
  const level = document.getElementById('level').value;
  const phone = document.getElementById('phone').value.trim();
  let whatsapp = document.getElementById('whatsapp').value.trim();
  if (whatsapp === '+233') {
    whatsapp = '';
  }

  if (!supabaseClient) {
    showFormError('Database client is not available. Please try again.');
    return;
  }

  showLoader(true, 'Registering...');
  try {
    const { data, error } = await supabaseClient
      .from('nags_members')
      .insert([
        {
          full_name: fullName,
          gender: gender,
          hometown: hometown,
          programme: programme,
          level: level,
          phone: phone,
          whatsapp: whatsapp,
          whatsapp_joined: false
        }
      ])
      .select();

    showLoader(false);

    if (error) {
      console.error(error);
      showFormError('Registration failed: ' + error.message);
    } else {
      currentRegisteredPhone = phone;
      AudioEffects.playSuccess();
      HapticEffects.success();
      goToStep(3);
    }
  } catch (err) {
    showLoader(false);
    console.error(err);
    showFormError('An unexpected error occurred: ' + err.message);
  }
}

// Utility UI Functions
function showFormError(msg) {
  AudioEffects.playError();
  HapticEffects.error();
  const errorBox = document.getElementById('form-error-box');
  if (errorBox) {
    errorBox.textContent = msg;
    errorBox.classList.add('error');
  }
}

function clearError() {
  const errorBox = document.getElementById('form-error-box');
  if (errorBox) {
    errorBox.textContent = '';
    errorBox.classList.remove('error');
  }
}

function showLoader(show, text = 'Checking...') {
  const btn = document.getElementById('btn-continue');
  const btnConfirm = document.getElementById('btn-confirm');
  
  const spinnerHtml = `
    <svg class="btn-spinner" viewBox="0 0 50 50">
      <circle class="path" cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
    </svg>
  `;

  if (show) {
    if (currentStep === 1 && btn) {
      btn.disabled = true;
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = spinnerHtml + text;
    } else if (currentStep === 2 && btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.dataset.originalText = btnConfirm.innerHTML;
      btnConfirm.innerHTML = spinnerHtml + text;
    }
  } else {
    if (btn && btn.disabled) {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.originalText || 'Continue &rarr;';
    }
    if (btnConfirm && btnConfirm.disabled) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = btnConfirm.dataset.originalText || 'Confirm &amp; Register &rarr;';
    }
  }
}
