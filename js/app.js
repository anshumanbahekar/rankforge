// ============================================================
// RANKFORGE — Core App Logic
// Auth, Routing, State Management, Utilities
// ============================================================

// ─── App State ──────────────────────────────────────────────
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

// ─── Toast Notifications ────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Auth ────────────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    App.currentUser = user;
    await loadUserProfile(user.uid);
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    initApp();
  } else {
    App.currentUser = null;
    App.userProfile = null;
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
    stopAllListeners();
  }
});

async function loadUserProfile(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      App.userProfile = doc.data();
      App.isAdmin = App.userProfile.role === 'admin';
    } else {
      // New user - show onboarding
      showOnboarding();
    }
    updateSidebarUser();
  } catch (e) {
    console.error('Profile load error:', e);
  }
}

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
    btn.textContent = 'Sign In';
  }
}

async function registerEmail(e) {
  e.preventDefault();
  const name  = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const pass  = document.getElementById('regPass').value;
  const code  = document.getElementById('regCode').value;
  const role  = document.getElementById('regRole').value;
  const btn   = document.getElementById('registerBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });
    // Verify institute code if student
    let instituteId = null;
    if (role === 'student' && code) {
      const snap = await db.collection('institutes')
        .where('code', '==', code.toUpperCase()).get();
      if (!snap.empty) {
        instituteId = snap.docs[0].id;
        await db.collection('institutes').doc(instituteId).update({
          totalStudents: firebase.firestore.FieldValue.increment(1)
        });
      } else {
        showToast('Invalid institute code', 'error');
        btn.disabled = false;
        btn.textContent = 'Create Account';
        return;
      }
    }
    await db.collection('users').doc(cred.user.uid).set({
      name, email, role, instituteId,
      totalPoints: 0, weeklyPoints: 0, monthlyPoints: 0,
      streak: 0, studyHours: 0, attendanceCount: 0, testsGiven: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    if (role === 'admin') {
      // Create institute
      const instRef = await db.collection('institutes').add({
        name: `${name}'s Institute`,
        code: generateInstCode(),
        ownerUid: cred.user.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        totalStudents: 0,
      });
      await db.collection('users').doc(cred.user.uid).update({
        instituteId: instRef.id
      });
    }
    showToast('Account created! Welcome to RankForge 🚀', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

async function loginGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    const uid = result.user.uid;
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) {
      // New Google user
      document.getElementById('googleRoleModal').classList.add('open');
      window._pendingGoogleUser = result.user;
    }
    showToast('Signed in with Google!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function completeGoogleSetup() {
  const u = window._pendingGoogleUser;
  const role = document.getElementById('googleRole').value;
  const code = document.getElementById('googleCode').value;
  if (!u) return;
  let instituteId = null;
  if (role === 'student') {
    const snap = await db.collection('institutes')
      .where('code', '==', code.toUpperCase()).get();
    if (!snap.empty) {
      instituteId = snap.docs[0].id;
      await db.collection('institutes').doc(instituteId).update({
        totalStudents: firebase.firestore.FieldValue.increment(1)
      });
    } else {
      showToast('Invalid institute code', 'error');
      return;
    }
  }
  await db.collection('users').doc(u.uid).set({
    name: u.displayName, email: u.email, role, instituteId,
    totalPoints: 0, weeklyPoints: 0, monthlyPoints: 0,
    streak: 0, studyHours: 0, attendanceCount: 0, testsGiven: 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  if (role === 'admin') {
    const instRef = await db.collection('institutes').add({
      name: `${u.displayName}'s Institute`,
      code: generateInstCode(),
      ownerUid: u.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      totalStudents: 0,
    });
    await db.collection('users').doc(u.uid).update({ instituteId: instRef.id });
  }
  document.getElementById('googleRoleModal').classList.remove('open');
  showToast('Setup complete!', 'success');
}

function logout() {
  auth.signOut();
  showToast('Signed out', 'info');
}

// ─── Navigation ──────────────────────────────────────────────
function navigate(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.add('active');
    App.currentPage = page;
  }

  document.querySelectorAll(`[data-page="${page}"]`).forEach(el => el.classList.add('active'));

  // Update topbar title
  const titles = {
    dashboard:   '📊 Dashboard',
    sessions:    '🎥 Live Sessions',
    leaderboard: '🏆 Leaderboard',
    sprint:      '🔥 Rank Sprint',
    analytics:   '📈 Analytics',
    students:    '👥 Students',
    'add-points':'⭐ Add Points',
    profile:     '👤 Profile',
    settings:    '⚙️ Settings',
  };
  document.getElementById('topbarTitle').textContent = titles[page] || 'RankForge';

  // Load page data
  loadPageData(page);
  closeMobileSidebar();
}

function loadPageData(page) {
  switch(page) {
    case 'dashboard':    renderDashboard(); break;
    case 'sessions':     renderSessions(); break;
    case 'leaderboard':  renderLeaderboard(); break;
    case 'sprint':       renderSprint(); break;
    case 'analytics':    renderAnalytics(); break;
    case 'students':     renderStudents(); break;
  }
}

// ─── App Init ───────────────────────────────────────────────
function initApp() {
  updateSidebarUser();
  updateNavForRole();
  startClock();
  navigate('dashboard');
  startStreakCheck();
}

function updateNavForRole() {
  const adminItems = document.querySelectorAll('.admin-only');
  const studentItems = document.querySelectorAll('.student-only');
  adminItems.forEach(el => el.classList.toggle('hidden', !App.isAdmin));
  studentItems.forEach(el => el.classList.toggle('hidden', App.isAdmin));
}

function updateSidebarUser() {
  const p = App.userProfile;
  if (!p) return;
  document.getElementById('sidebarUserName').textContent = p.name || 'User';
  document.getElementById('sidebarUserRank').textContent =
    App.isAdmin ? '👑 Admin' : `#${p.rank || '—'} · ${p.totalPoints || 0} pts`;
  const avatarEl = document.getElementById("sidebarUserAvatar");

avatarEl.innerHTML = "";

if (App.userProfile?.avatar) {
  avatarEl.innerHTML = `<img src="${App.userProfile.avatar}" />`;
} else {
  avatarEl.textContent =
    App.userProfile?.name?.charAt(0)?.toUpperCase() || "U";
}
  document.getElementById('sidebarStreak').textContent = `${p.streak || 0} day streak`;
}

function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById('topbarClock').textContent =
      now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  tick();
  setInterval(tick, 1000);
}

function stopAllListeners() {
  App.unsubscribers.forEach(fn => fn && fn());
  App.unsubscribers = [];
}

// ─── Utilities ───────────────────────────────────────────────
function generateInstCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function getWeekKey() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week.toString().padStart(2, '0')}`;
}

function getMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}`;
}

function timeSince(ts) {
  if (!ts) return 'never';
  const seconds = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds/3600)}h ago`;
  return `${Math.floor(seconds/86400)}d ago`;
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
  const batch = db.batch();
  const userRef = db.collection('users').doc(uid);
  const logRef = db.collection('users').doc(uid)
    .collection('pointLogs').doc();

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
}

async function updateLeaderboard(uid) {
  const userDoc = await db.collection('users').doc(uid).get();
  const user = userDoc.data();
  if (!user?.instituteId) return;

  const weekKey = getWeekKey();
  const monthKey = getMonthKey();
  const lbRef = db.collection('institutes').doc(user.instituteId)
    .collection('leaderboard');

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
  const today = new Date().toDateString();
  const lastKey = `rf_lastActive_${App.currentUser.uid}`;
  const last = localStorage.getItem(lastKey);
  if (last !== today) {
    localStorage.setItem(lastKey, today);
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (last === yesterday) {
      // Streak continues
      const newStreak = (App.userProfile?.streak || 0) + 1;
      await db.collection('users').doc(App.currentUser.uid)
        .update({ streak: newStreak });
      App.userProfile.streak = newStreak;
      updateSidebarUser();
      // Bonus points for streaks
      if (newStreak === 7)  await awardPoints(App.currentUser.uid, 'STREAK_7', POINT_VALUES.STREAK_7, '7-Day Streak! 🔥');
      if (newStreak === 30) await awardPoints(App.currentUser.uid, 'STREAK_30', POINT_VALUES.STREAK_30, '30-Day Legend! 🏆');
    } else if (last && last !== yesterday) {
      // Streak broken
      await db.collection('users').doc(App.currentUser.uid).update({ streak: 1 });
      App.userProfile.streak = 1;
      updateSidebarUser();
    }
  }
}

// ─── Auth Tab Switch ─────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-auth="${tab}"]`).classList.add('active');
  document.getElementById(`auth-${tab}`).classList.add('active');
}

// ─── Event Delegation ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm')?.addEventListener('submit', loginEmail);
  document.getElementById('registerForm')?.addEventListener('submit', registerEmail);
});

// ─── Cloudinary Avatar Upload ─────────────────────────────
async function uploadAvatarToCloudinary(file) {
  const cloudName = "dkxuilgai";        // <-- paste your cloud name
  const uploadPreset = "rankforge";  // <-- paste your preset name

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(url, {
    method: "POST",
    body: formData
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Upload failed");
  }

  return data.secure_url;
}
