// ============================================================
// RANKFORGE — Core App Logic v3.0
// Auth, Routing, State, Points, Security, Discord
// ============================================================

const App = {
  currentUser: null,
  currentPage: 'dashboard',
  userProfile: null,
  isAdmin: false,
  charts: {},
  pomodoroInterval: null,
  pomodoroState: null,
  sessionListener: null,
  unsubscribers: [],
};

// ─── Config ──────────────────────────────────────────────────
// Change ADMIN_SECRET_KEY to any strong passphrase you want
const ADMIN_SECRET_KEY = 'RF-ADMIN-2026';

// Discord webhook for admin notifications
// Using no-cors mode to avoid CORS errors (webhooks don't need CORS response)
const DISCORD_WEBHOOK = 'https://canary.discord.com/api/webhooks/1476079557630234676/q7ybZUVYpgWIsLU2EWIjNZc6X82cdY9ojNbBDFtB3kZu2rVa5R8EwIchwHpFlfk0b81o';

// ─── Page Load Progress Bar ────────────────────────────────
let loadBarTimer = null;

function startPageLoad() {
  const bar = document.getElementById('pageLoadBar');
  if (!bar) return;
  bar.style.width = '0%';
  bar.style.opacity = '1';
  bar.classList.remove('done');
  let w = 0;
  clearInterval(loadBarTimer);
  loadBarTimer = setInterval(() => {
    w += Math.random() * 15;
    if (w > 85) w = 85;
    bar.style.width = w + '%';
  }, 120);
}

function finishPageLoad() {
  const bar = document.getElementById('pageLoadBar');
  if (!bar) return;
  clearInterval(loadBarTimer);
  bar.style.width = '100%';
  setTimeout(() => { bar.classList.add('done'); }, 300);
}

// ─── Toast Notifications ────────────────────────────────────
const TOAST_ICONS = {
  success: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error:   `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${TOAST_ICONS[type] || TOAST_ICONS.info}<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 310);
  }, duration);
}

// ─── Discord Notification ─────────────────────────────────────
async function notifyDiscordAdmin(data) {
  const when = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  // Build approve link — deep link to approve page inside the app
  // Admin opens this URL and approves directly, no Firebase console needed
  const approveUrl = `${window.location.origin}${window.location.pathname}?action=approve&uid=${data.uid}&key=${ADMIN_SECRET_KEY}`;
  const rejectUrl  = `${window.location.origin}${window.location.pathname}?action=reject&uid=${data.uid}&key=${ADMIN_SECRET_KEY}`;

  const body = {
    username: 'RankForge Guard',
    embeds: [{
      title: '🔔  New Staff Application Received',
      color: 0xFFD100,
      fields: [
        { name: '👤  Name',       value: data.name,          inline: true  },
        { name: '📧  Email',      value: data.email,         inline: true  },
        { name: '📱  Phone',      value: data.phone || 'Not provided', inline: true },
        { name: '💼  Role Applied', value: data.roleApplied || 'Admin', inline: true },
        { name: '🕐  Applied At', value: when,               inline: false },
        { name: '🆔  User UID',   value: '`' + data.uid + '`', inline: false },
        { name: '✅  Approve',    value: `[Click to Approve](${approveUrl})`, inline: true },
        { name: '❌  Reject',     value: `[Click to Reject](${rejectUrl})`,   inline: true },
      ],
      description: 'Use the links above to approve or reject directly — no Firebase Console needed.',
      footer: { text: 'RankForge Security System · Staff Applications' },
      timestamp: new Date().toISOString(),
    }]
  };

  try {
    // mode: 'no-cors' bypasses the CORS restriction for Discord webhooks
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log('Discord notification sent');
  } catch (e) {
    console.warn('Discord ping failed (non-critical):', e.message);
  }
}

// ─── Handle Approve/Reject from Discord Link ──────────────────
async function handleDiscordAction() {
  const params = new URLSearchParams(window.location.search);
  const action  = params.get('action');
  const uid     = params.get('uid');
  const key     = params.get('key');

  if (!action || !uid || !key) return;
  if (key !== ADMIN_SECRET_KEY) { showToast('Invalid key in link', 'error'); return; }

  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);

  if (action === 'approve') {
    try {
      // Get applicant info first
      const appDoc = await db.collection('staffApplications').doc(uid).get();
      const applicant = appDoc.data() || {};

      // Set role to admin
      await db.collection('users').doc(uid).update({ role: 'admin' });

      // Create their institute doc
      const instRef = await db.collection('institutes').add({
        name: applicant.instituteName || applicant.name + "'s Institute",
        code: generateInstCode(),
        ownerUid: uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        totalStudents: 0,
      });
      await db.collection('users').doc(uid).update({ instituteId: instRef.id });

      // Update application status
      await db.collection('staffApplications').doc(uid).update({ status: 'approved', approvedAt: firebase.firestore.FieldValue.serverTimestamp() });

      showToast(`Approved! ${applicant.name || uid} is now an Admin.`, 'success');
    } catch (e) {
      showToast('Approval failed: ' + e.message, 'error');
    }
  } else if (action === 'reject') {
    try {
      await db.collection('users').doc(uid).update({ role: 'rejected' });
      await db.collection('staffApplications').doc(uid).update({ status: 'rejected' });
      showToast('Application rejected.', 'info');
    } catch (e) {
      showToast('Reject failed: ' + e.message, 'error');
    }
  }
}

// ─── Admin Key Gate ───────────────────────────────────────────
function showAdminKeyModal() {
  const modal = document.getElementById('adminKeyModal');
  if (!modal) return;
  document.getElementById('adminKeyError').style.display = 'none';
  document.getElementById('adminSecretKeyInput').value = '';
  modal.classList.add('open');
  if (window.lucide) lucide.createIcons();
}

function verifyAdminKey() {
  const input  = document.getElementById('adminSecretKeyInput').value.trim();
  const errBox = document.getElementById('adminKeyError');
  const errMsg = document.getElementById('adminKeyErrorMsg');

  if (input !== ADMIN_SECRET_KEY) {
    errMsg.textContent = 'Wrong key. Contact RankForge to obtain one.';
    errBox.style.display = 'block';
    const m = document.querySelector('#adminKeyModal .modal');
    m.style.animation = 'shake 0.4s ease';
    setTimeout(() => m.style.animation = '', 450);
    if (window.lucide) lucide.createIcons();
    return;
  }

  document.getElementById('adminKeyModal').classList.remove('open');
  document.getElementById('staffAppSection').style.display = 'block';
  document.getElementById('regRole').value = 'admin';
  document.getElementById('instCodeGroup').style.display = 'none';
  document.getElementById('adminKeyTrigger').style.display = 'none';
  showToast('Staff application form unlocked.', 'success');
}

// ─── Pending Screen ───────────────────────────────────────────
function showPendingScreen(data) {
  const el = document.getElementById('pendingScreen');
  if (!el) return;
  const nameEl = document.getElementById('pendingUserName');
  if (nameEl) nameEl.textContent = data?.name || 'Applicant';
  const roleEl = document.getElementById('pendingRoleApplied');
  if (roleEl) roleEl.textContent = data?.roleApplied || 'Admin';
  el.classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('authScreen').classList.add('hidden');
  if (window.lucide) lucide.createIcons();
}

function hidePendingScreen() {
  const el = document.getElementById('pendingScreen');
  if (el) el.classList.add('hidden');
}

async function checkApprovalStatus() {
  if (!App.currentUser) return;
  const btn = document.getElementById('checkApprovalBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'; }
  try {
    const doc = await db.collection('users').doc(App.currentUser.uid).get();
    const data = doc.data() || {};
    const role = data.role;

    if (role === 'admin') {
      hidePendingScreen();
      await loadUserProfile(App.currentUser.uid);
      document.getElementById('appShell').classList.remove('hidden');
      initApp();
      showToast('Approved! Welcome, Admin.', 'success');
    } else if (role === 'rejected') {
      hidePendingScreen();
      auth.signOut();
      showToast('Your application was rejected. Contact support for more info.', 'error');
    } else {
      showToast('Still pending. Our team will review your application soon.', 'info');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="refresh-cw"></i> Check Status';
        if (window.lucide) lucide.createIcons();
      }
    }
  } catch (e) {
    showToast('Could not check status. Try again.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="refresh-cw"></i> Check Status';
      if (window.lucide) lucide.createIcons();
    }
  }
}

function logoutFromPending() {
  hidePendingScreen();
  auth.signOut();
}

// ─── Auth State ──────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    App.currentUser = user;
    await loadUserProfile(user.uid);

    if (App.userProfile?.role === 'pending_admin') {
      document.getElementById('authScreen').classList.add('hidden');
      document.getElementById('appShell').classList.add('hidden');
      showPendingScreen(App.userProfile);
      return;
    }

    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    initApp();
    // Handle approve/reject links from Discord
    handleDiscordAction();
  } else {
    App.currentUser = null;
    App.userProfile = null;
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
    hidePendingScreen();
    stopAllListeners();
  }
});

async function loadUserProfile(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      App.userProfile = doc.data();
      App.isAdmin = App.userProfile.role === 'admin';
    }
    updateSidebarUser();
  } catch (e) {
    console.error('Profile load error:', e);
  }
}

// ─── Auth: Email Login ───────────────────────────────────────
async function loginEmail(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const pass  = document.getElementById('loginPass').value;
  const btn   = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    showToast('Welcome back!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="log-in"></i> Sign In';
    if (window.lucide) lucide.createIcons();
  }
}

// ─── Auth: Email Register ────────────────────────────────────
async function registerEmail(e) {
  e.preventDefault();
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPass').value;
  const code  = document.getElementById('regCode').value.trim();
  const role  = document.getElementById('regRole').value;
  const phone = (document.getElementById('regPhone')?.value || '').trim();
  const roleApplied = document.getElementById('regRoleApplied')?.value || 'Admin';
  const btn   = document.getElementById('registerBtn');

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });

    if (role === 'admin') {
      // Staff application — pending_admin until approved
      await db.collection('users').doc(cred.user.uid).set({
        name, email, phone, roleApplied,
        role: 'pending_admin',
        instituteId: null,
        totalPoints: 0, weeklyPoints: 0, monthlyPoints: 0,
        streak: 0, studyHours: 0, attendanceCount: 0, testsGiven: 0,
        appliedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('staffApplications').doc(cred.user.uid).set({
        uid: cred.user.uid, name, email, phone, roleApplied,
        status: 'pending',
        appliedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      await notifyDiscordAdmin({ uid: cred.user.uid, name, email, phone, roleApplied });
      showToast('Application submitted! You will be notified once approved.', 'success');

    } else {
      // Student — must have valid institute code
      if (!code) {
        showToast('Please enter your institute code.', 'warning');
        await cred.user.delete();
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="user-plus"></i> Create Account';
        if (window.lucide) lucide.createIcons();
        return;
      }
      const snap = await db.collection('institutes').where('code', '==', code.toUpperCase()).get();
      if (snap.empty) {
        showToast('Invalid institute code. Ask your admin.', 'error');
        await cred.user.delete();
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="user-plus"></i> Create Account';
        if (window.lucide) lucide.createIcons();
        return;
      }
      const instituteId = snap.docs[0].id;
      await db.collection('institutes').doc(instituteId).update({
        totalStudents: firebase.firestore.FieldValue.increment(1)
      });
      await db.collection('users').doc(cred.user.uid).set({
        name, email, role: 'student', instituteId,
        totalPoints: 0, weeklyPoints: 0, monthlyPoints: 0,
        streak: 0, studyHours: 0, attendanceCount: 0, testsGiven: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      showToast('Account created! Welcome to RankForge!', 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="user-plus"></i> Create Account';
    if (window.lucide) lucide.createIcons();
  }
}

// ─── Auth: Google ────────────────────────────────────────────
async function loginGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    const uid = result.user.uid;
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) {
      document.getElementById('googleRoleModal').classList.add('open');
      window._pendingGoogleUser = result.user;
    } else {
      showToast('Welcome back!', 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── Auth: Discord (link account via User ID) ─────────────────
function loginDiscord() {
  // If already logged into Firebase, open link modal
  if (App.currentUser) {
    document.getElementById('discordLinkModal').classList.add('open');
    // Pre-fill if already linked
    const discordId = App.userProfile?.discordId || '';
    const discordUsername = App.userProfile?.discordUsername || '';
    if (discordId) document.getElementById('discordUserIdInput').value = discordId;
    if (discordUsername) document.getElementById('discordUsernameInput').value = discordUsername;
    if (window.lucide) lucide.createIcons();
    return;
  }
  // If on auth screen, prompt them to sign in with email/google first
  showToast('Sign in with Email or Google first, then link your Discord account.', 'info');
}

async function linkDiscordAccount() {
  const discordId       = document.getElementById('discordUserIdInput').value.trim();
  const discordUsername = document.getElementById('discordUsernameInput').value.trim().replace('@','');

  if (!discordId || !discordUsername) {
    showToast('Please enter both your Discord username and User ID.', 'warning');
    return;
  }
  if (!/^\d{17,20}$/.test(discordId)) {
    showToast('User ID should be 17-20 digits. Check Discord settings.', 'warning');
    return;
  }

  try {
    await db.collection('users').doc(App.currentUser.uid).update({
      discordId,
      discordUsername,
      discordLinkedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    App.userProfile.discordId = discordId;
    App.userProfile.discordUsername = discordUsername;
    document.getElementById('discordLinkModal').classList.remove('open');
    showToast(`Discord account @${discordUsername} linked!`, 'success');
    // Reload discord page if open
    if (App.currentPage === 'discord') renderDiscordStudy();
  } catch (e) {
    showToast('Error linking Discord: ' + e.message, 'error');
  }
}

async function completeGoogleSetup() {
  const u    = window._pendingGoogleUser;
  const code = document.getElementById('googleCode').value.trim();
  if (!u) return;

  if (!code) { showToast('Please enter your institute code.', 'warning'); return; }

  const snap = await db.collection('institutes').where('code', '==', code.toUpperCase()).get();
  if (snap.empty) { showToast('Invalid institute code. Ask your admin.', 'error'); return; }

  const instituteId = snap.docs[0].id;
  await db.collection('institutes').doc(instituteId).update({
    totalStudents: firebase.firestore.FieldValue.increment(1)
  });
  await db.collection('users').doc(u.uid).set({
    name: u.displayName, email: u.email, role: 'student', instituteId,
    totalPoints: 0, weeklyPoints: 0, monthlyPoints: 0,
    streak: 0, studyHours: 0, attendanceCount: 0, testsGiven: 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  document.getElementById('googleRoleModal').classList.remove('open');
  showToast('Welcome to RankForge!', 'success');
}

function logout() {
  auth.signOut();
  showToast('Signed out', 'info');
}

// ─── Navigation with Loading Indicator ────────────────────────
const PAGE_TITLES = {
  dashboard:    { icon: 'layout-dashboard', label: 'Dashboard' },
  sessions:     { icon: 'video',            label: 'Live Sessions' },
  leaderboard:  { icon: 'trophy',           label: 'Leaderboard' },
  sprint:       { icon: 'zap',              label: 'Rank Sprint' },
  analytics:    { icon: 'bar-chart-2',      label: 'Analytics' },
  students:     { icon: 'users',            label: 'Students' },
  staffapply:   { icon: 'briefcase',        label: 'Staff Application' },
  profile:      { icon: 'user-circle',      label: 'Profile' },
  discord:      { icon: 'activity',         label: 'Discord Study Stats' },
  youtube:      { icon: 'youtube',          label: 'Live Stream' },
};

function navigate(page) {
  startPageLoad();

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.add('active');
    App.currentPage = page;
  }

  document.querySelectorAll(`[data-page="${page}"]`).forEach(el => el.classList.add('active'));

  const meta = PAGE_TITLES[page] || { icon: 'layout-dashboard', label: 'RankForge' };
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) {
    titleEl.innerHTML = `<i data-lucide="${meta.icon}" style="width:16px;height:16px;color:var(--yellow)"></i>${meta.label}`;
  }

  loadPageData(page);
  closeMobileSidebar();
  setTimeout(() => {
    if (window.lucide) lucide.createIcons();
    finishPageLoad();
  }, 50);
}

function loadPageData(page) {
  switch (page) {
    case 'dashboard':   renderDashboard(); break;
    case 'sessions':    renderSessions(); break;
    case 'leaderboard': renderLeaderboard(); break;
    case 'sprint':      renderSprint(); break;
    case 'analytics':   renderAnalytics(); break;
    case 'students':    renderStudents(); break;
    case 'staffapply':  renderStaffApply(); break;
    case 'profile':     renderProfile(); break;
    case 'discord':     renderDiscordStudy(); break;
    case 'youtube':     renderYoutube(); break;
  }
}

// ─── App Init ────────────────────────────────────────────────
function initApp() {
  updateSidebarUser();
  updateNavForRole();
  startClock();
  // Apply saved theme
  const savedTheme = localStorage.getItem('rf_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon();
  navigate('dashboard');
  startStreakCheck();
}

function updateNavForRole() {
  const adminItems   = document.querySelectorAll('.admin-only');
  const studentItems = document.querySelectorAll('.student-only');
  adminItems.forEach(el   => el.classList.toggle('hidden', !App.isAdmin));
  studentItems.forEach(el => el.classList.toggle('hidden', App.isAdmin));
}

function updateSidebarUser() {
  const p = App.userProfile;
  if (!p) return;

  // Fix: show actual user name, not "Scholar"
  const greetingNameEl = document.getElementById('greetingName');
  if (greetingNameEl) greetingNameEl.textContent = p.name?.split(' ')[0] || 'User';

  // Greeting time
  const hour = new Date().getHours();
  const greetingTimeEl = document.getElementById('greetingTime');
  if (greetingTimeEl) {
    greetingTimeEl.textContent = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  }

  document.getElementById('sidebarUserName').textContent = p.name || 'User';
  document.getElementById('sidebarUserRank').textContent = App.isAdmin
    ? 'Admin'
    : `#${p.rank || '—'} · ${(p.totalPoints || 0).toLocaleString()} pts`;

  const avatarEl = document.getElementById('sidebarUserAvatar');
  if (avatarEl) {
    avatarEl.innerHTML = '';
    if (p.avatar) {
      const img = document.createElement('img');
      img.src = p.avatar;
      img.alt = p.name || 'Avatar';
      img.onerror = () => { avatarEl.textContent = (p.name || 'U')[0].toUpperCase(); };
      avatarEl.appendChild(img);
    } else {
      avatarEl.textContent = (p.name || 'U')[0].toUpperCase();
    }
  }

  const streakEl = document.getElementById('sidebarStreak');
  if (streakEl) streakEl.textContent = `${p.streak || 0} day streak`;
}

// ─── Theme Toggle ─────────────────────────────────────────────
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('rf_theme', next);
  updateThemeIcon();
  // Redraw charts for theme
  if (App.charts.weekly)      { renderDashboardChart(); }
  if (App.charts.consistency) { renderConsistencyChart(); }
  if (App.charts.subject)     { renderSubjectChart(); }
}

function updateThemeIcon() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.setAttribute('data-lucide', isDark ? 'moon' : 'sun');
    if (window.lucide) lucide.createIcons();
  }
}

function startClock() {
  function tick() {
    const now = new Date();
    const el = document.getElementById('topbarClock');
    if (el) el.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  tick();
  setInterval(tick, 1000);
}

function stopAllListeners() {
  App.unsubscribers.forEach(fn => fn && fn());
  App.unsubscribers = [];
}

// ─── Auth Tab Switch ─────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-panel').forEach(p => {
    p.style.display = 'none';
    p.classList.remove('active');
  });
  document.querySelector(`[data-auth="${tab}"]`).classList.add('active');
  const panel = document.getElementById(`auth-${tab}`);
  if (panel) { panel.style.display = 'block'; panel.classList.add('active'); }
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// ─── Utilities ───────────────────────────────────────────────
function generateInstCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function getWeekKey() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week.toString().padStart(2, '0')}`;
}

function getMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

function timeSince(ts) {
  if (!ts) return 'never';
  const seconds = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatHours(h) {
  if (!h) return '0h 0m';
  return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
}

// ─── Points System ───────────────────────────────────────────
const POINT_VALUES = {
  ATTENDANCE:   15,
  STUDY_HOUR:   10,
  TEST_PASS:    25,
  TEST_PERFECT: 50,
  TASK_DONE:    8,
  GOAL_MET:     12,
  REPORT_FILED: 5,
  STREAK_7:     30,
  STREAK_30:    100,
};

async function awardPoints(uid, type, amount, reason) {
  const batch  = db.batch();
  const userRef = db.collection('users').doc(uid);
  const logRef  = db.collection('users').doc(uid).collection('pointLogs').doc();

  batch.update(userRef, {
    totalPoints:   firebase.firestore.FieldValue.increment(amount),
    weeklyPoints:  firebase.firestore.FieldValue.increment(amount),
    monthlyPoints: firebase.firestore.FieldValue.increment(amount),
  });
  batch.set(logRef, {
    type, amount, reason,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();
  await updateLeaderboard(uid);

  // Live update dashboard stats
  if (App.currentUser?.uid === uid && App.userProfile) {
    App.userProfile.totalPoints = (App.userProfile.totalPoints || 0) + amount;
    App.userProfile.weeklyPoints = (App.userProfile.weeklyPoints || 0) + amount;
    document.getElementById('dashTotalPoints').textContent = App.userProfile.totalPoints.toLocaleString();
  }
}

async function updateLeaderboard(uid) {
  const userDoc = await db.collection('users').doc(uid).get();
  const user = userDoc.data();
  if (!user?.instituteId) return;

  const weekKey  = getWeekKey();
  const monthKey = getMonthKey();
  const lbRef    = db.collection('institutes').doc(user.instituteId).collection('leaderboard');

  await lbRef.doc(`weekly-${weekKey}`).set({
    [`${uid}`]: { name: user.name, points: user.weeklyPoints, uid }
  }, { merge: true });
  await lbRef.doc(`monthly-${monthKey}`).set({
    [`${uid}`]: { name: user.name, points: user.monthlyPoints, uid }
  }, { merge: true });
}

// ─── Mobile Sidebar ──────────────────────────────────────────
function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('mobileOverlay').classList.add('open');
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mobileOverlay').classList.remove('open');
}

// ─── Streak Check ────────────────────────────────────────────
async function startStreakCheck() {
  if (!App.currentUser) return;
  const today   = new Date().toDateString();
  const lastKey = `rf_lastActive_${App.currentUser.uid}`;
  const last    = localStorage.getItem(lastKey);
  if (last === today) return;
  localStorage.setItem(lastKey, today);
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (last === yesterday) {
    const newStreak = (App.userProfile?.streak || 0) + 1;
    await db.collection('users').doc(App.currentUser.uid).update({ streak: newStreak });
    App.userProfile.streak = newStreak;
    updateSidebarUser();
    if (newStreak === 7)  await awardPoints(App.currentUser.uid, 'STREAK_7', POINT_VALUES.STREAK_7, '7-Day Streak!');
    if (newStreak === 30) await awardPoints(App.currentUser.uid, 'STREAK_30', POINT_VALUES.STREAK_30, '30-Day Legend!');
  } else if (last) {
    await db.collection('users').doc(App.currentUser.uid).update({ streak: 1 });
    App.userProfile.streak = 1;
    updateSidebarUser();
  }
}

// ─── Cloudinary Avatar Upload ─────────────────────────────────
async function uploadAvatarToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/dkxuilgai/image/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', 'rankforge');
  const response = await fetch(url, { method: 'POST', body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Upload failed');
  return data.secure_url;
}

async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2MB', 'warning'); return; }
  showToast('Uploading...', 'info');
  try {
    const avatarUrl = await uploadAvatarToCloudinary(file);
    await db.collection('users').doc(App.currentUser.uid).update({ avatar: avatarUrl });
    App.userProfile.avatar = avatarUrl;
    updateSidebarUser();
    const profAvatar = document.getElementById('profileAvatar');
    if (profAvatar) profAvatar.innerHTML = `<img src="${avatarUrl}" alt="Avatar">`;
    showToast('Photo updated!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── YouTube Channel Config (Admin) ──────────────────────────
async function saveYtChannel() {
  const val = document.getElementById('ytChannelIdInput')?.value.trim();
  if (!val) { showToast('Enter a YouTube Channel ID or handle', 'warning'); return; }
  try {
    await db.collection('settings').doc('youtube').set({
      channelId: val,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: App.currentUser.uid,
    });
    showToast('YouTube channel saved!', 'success');
    renderYoutube();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ─── Event Listeners ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm')?.addEventListener('submit', loginEmail);
  document.getElementById('registerForm')?.addEventListener('submit', registerEmail);
  // Escape closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
  });
});
