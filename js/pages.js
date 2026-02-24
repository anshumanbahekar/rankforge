// ============================================================
// RANKFORGE — Page Renderers
// Dashboard, Sessions, Leaderboard, Sprint, Analytics
// ============================================================

// ─── DASHBOARD ───────────────────────────────────────────────
async function renderDashboard() {
  const p = App.userProfile;
  if (!p) return;

  // Stats
  document.getElementById('dashTotalPoints').textContent = (p.totalPoints || 0).toLocaleString();
  document.getElementById('dashStudyHours').textContent  = formatHours(p.studyHours || 0);
  document.getElementById('dashAttendance').textContent  = p.attendanceCount || 0;
  document.getElementById('dashStreak').textContent      = `${p.streak || 0}d`;

  // Weekly rank
  if (p.instituteId) {
    loadWeeklyRank(p.instituteId);
  }

  // Today's sessions
  renderTodaySessions();

  // Recent activity
  renderRecentActivity();

  // Performance mini-chart
  setTimeout(renderDashboardChart, 200);
}

async function loadWeeklyRank(instituteId) {
  try {
    const weekKey = getWeekKey();
    const doc = await db.collection('institutes').doc(instituteId)
      .collection('leaderboard').doc(`weekly-${weekKey}`).get();
    if (doc.exists) {
      const data = doc.data();
      const entries = Object.values(data)
        .sort((a, b) => (b.points || 0) - (a.points || 0));
      const myRank = entries.findIndex(e => e.uid === App.currentUser.uid) + 1;
      document.getElementById('dashWeeklyRank').textContent = myRank > 0 ? `#${myRank}` : '—';
    }
  } catch(e) {}
}

function renderTodaySessions() {
  const container = document.getElementById('todaySessionsList');
  if (!container) return;

  const sessions = [
    { time: '07:00', name: 'Morning Focus', type: 'morning', duration: 120 },
    { time: '14:00', name: 'Afternoon Grind', type: 'afternoon', duration: 90 },
    { time: '20:00', name: 'Evening Review', type: 'evening', duration: 60 },
  ];

  const now = new Date();
  const currentHour = now.getHours();

  container.innerHTML = sessions.map(s => {
    const sessionHour = parseInt(s.time.split(':')[0]);
    const isLive = currentHour === sessionHour || (currentHour === sessionHour && now.getMinutes() < s.duration);
    const isPast = currentHour > sessionHour;
    const statusBadge = isLive
      ? '<span class="live-dot">LIVE NOW</span>'
      : isPast
        ? '<span class="badge badge-muted">Completed</span>'
        : '<span class="badge badge-blue">Upcoming</span>';

    return `
      <div class="session-card ${isLive ? 'live' : ''} mb-4">
        <div class="flex items-center justify-between mb-4">
          <div>
            <div class="card-title">${s.name}</div>
            <div class="card-subtitle mono">${s.time} · ${s.duration} min · Pomodoro</div>
          </div>
          ${statusBadge}
        </div>
        <div class="flex gap-2">
          ${isLive
            ? `<button class="btn btn-primary" onclick="joinSession('${s.type}', '${s.name}')">📹 Join Now</button>`
            : isPast
              ? `<button class="btn btn-ghost btn-sm" disabled>Session Ended</button>`
              : `<button class="btn btn-secondary btn-sm" onclick="setGoalModal('${s.type}', '${s.name}')">Set Goal & Join</button>`
          }
          <button class="btn btn-ghost btn-sm">📋 View Reports</button>
        </div>
      </div>
    `;
  }).join('');
}

async function renderRecentActivity() {
  const container = document.getElementById('recentActivity');
  if (!container) return;
  try {
    const snap = await db.collection('users').doc(App.currentUser.uid)
      .collection('pointLogs')
      .orderBy('timestamp', 'desc')
      .limit(5).get();

    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No activity yet. Join a session to earn points!</p></div>`;
      return;
    }

    container.innerHTML = snap.docs.map(d => {
      const log = d.data();
      return `
        <div class="flex items-center justify-between" style="padding: 10px 0; border-bottom: 1px solid var(--border-dim);">
          <div>
            <div class="text-sm">${log.reason || log.type}</div>
            <div class="text-xs text-muted mono">${timeSince(log.timestamp)}</div>
          </div>
          <span class="badge badge-amber">+${log.amount} pts</span>
        </div>
      `;
    }).join('');
  } catch(e) { container.innerHTML = '<p class="text-muted text-sm">Unable to load activity.</p>'; }
}

function renderDashboardChart() {
  const canvas = document.getElementById('weeklyChart');
  if (!canvas) return;
  if (App.charts.weekly) App.charts.weekly.destroy();

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Sample data - replace with real Firestore data in production
  const points = [45, 80, 60, 95, 70, 110, 85];
  const hours  = [2.5, 4, 3, 5, 3.5, 6, 4.5];

  App.charts.weekly = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Points',
          data: points,
          backgroundColor: 'rgba(255,180,0,0.7)',
          borderColor: '#ffb400',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Study Hours',
          data: hours,
          type: 'line',
          borderColor: '#00e5a0',
          backgroundColor: 'rgba(0,229,160,0.1)',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#00e5a0',
          fill: true,
          tension: 0.4,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: { color: '#8a95a8', font: { family: 'DM Mono', size: 11 } }
        },
        tooltip: {
          backgroundColor: '#1a2030',
          borderColor: '#2a3040',
          borderWidth: 1,
          titleColor: '#f0e6d3',
          bodyColor: '#8a95a8',
          titleFont: { family: 'Playfair Display' },
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8a95a8', font: { family: 'DM Mono', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#ffb400', font: { family: 'DM Mono', size: 11 } },
          position: 'left',
        },
        y1: {
          grid: { display: false },
          ticks: { color: '#00e5a0', font: { family: 'DM Mono', size: 11 } },
          position: 'right',
        }
      }
    }
  });
}

// ─── SESSIONS ─────────────────────────────────────────────────
let currentSession = null;
let pomodoroInterval = null;
let pomodoroSeconds = 0;
let isPomodoro = false;

function renderSessions() {
  renderTodaySessions2();
  loadSessionHistory();
}

function renderTodaySessions2() {
  // Full sessions page render
}

function joinSession(type, name) {
  currentSession = { type, name };
  document.getElementById('sessionGoalModal').classList.add('open');
  document.getElementById('sessionGoalTitle').textContent = name;
}

function setGoalModal(type, name) {
  joinSession(type, name);
}

async function submitGoalAndJoin() {
  const goal = document.getElementById('sessionGoal').value.trim();
  if (!goal) { showToast('Please set your goal first', 'warning'); return; }

  const jitsiRoom = `RankForge-${currentSession.type}-${App.userProfile?.instituteId?.slice(-6) || 'demo'}-${new Date().toDateString().replace(/ /g,'-')}`;

  // Save goal to Firestore
  try {
    const sessionRef = db.collection('sessions').doc(`${jitsiRoom}`);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      await sessionRef.set({
        title: currentSession.name,
        type: currentSession.type,
        jitsiRoom,
        instituteId: App.userProfile?.instituteId || '',
        status: 'live',
        startTime: firebase.firestore.FieldValue.serverTimestamp(),
        participants: [],
      });
    }

    await sessionRef.update({
      participants: firebase.firestore.FieldValue.arrayUnion({
        uid: App.currentUser.uid,
        name: App.userProfile?.name || 'Student',
        goal,
        joinedAt: new Date().toISOString(),
        report: null,
      })
    });

    // Award attendance points
    await awardPoints(App.currentUser.uid, 'ATTENDANCE', POINT_VALUES.ATTENDANCE, `Attended ${currentSession.name}`);
    document.getElementById('sessionGoalModal').classList.remove('open');
    document.getElementById('sessionGoal').value = '';

    // Open Jitsi
    openJitsi(jitsiRoom, currentSession.name);
    startPomodoro();
    navigate('sessions');

    showToast(`Joined ${currentSession.name}! +${POINT_VALUES.ATTENDANCE} pts for attendance 🎯`, 'success');
  } catch(e) {
    showToast('Error joining session: ' + e.message, 'error');
  }
}

function openJitsi(room, title) {
  const container = document.getElementById('activeSessionView');
  container.classList.remove('hidden');
  document.getElementById('activeSessionTitle').textContent = title;
  document.getElementById('jitsiFrame').src =
    `https://meet.jit.si/${encodeURIComponent(room)}#config.startWithVideoMuted=false&config.startWithAudioMuted=false&interfaceConfig.SHOW_CHROME_EXTENSION_BANNER=false`;
}

function closeSession() {
  document.getElementById('jitsiFrame').src = '';
  document.getElementById('activeSessionView').classList.add('hidden');
  clearInterval(pomodoroInterval);
  document.getElementById('endReportModal').classList.add('open');
}

async function submitEndReport() {
  const report = document.getElementById('endReport').value.trim();
  const tasksEl = document.getElementById('tasksCompleted');
  const tasks = parseInt(tasksEl?.value || 0);

  if (!report) { showToast('Please write your session report', 'warning'); return; }

  let bonusPoints = POINT_VALUES.REPORT_FILED;
  if (tasks > 0) bonusPoints += tasks * POINT_VALUES.TASK_DONE;

  await awardPoints(App.currentUser.uid, 'REPORT_FILED', bonusPoints,
    `Session report: ${tasks} tasks completed`);

  document.getElementById('endReportModal').classList.remove('open');
  document.getElementById('endReport').value = '';

  showToast(`Report submitted! +${bonusPoints} points earned 🏆`, 'success');
  renderDashboard();
}

// ─── POMODORO TIMER ───────────────────────────────────────────
const POMODORO_PHASES = [
  { name: 'FOCUS', duration: 25 * 60, color: '#ffb400' },
  { name: 'BREAK', duration: 5 * 60, color: '#00e5a0' },
  { name: 'FOCUS', duration: 25 * 60, color: '#ffb400' },
  { name: 'BREAK', duration: 5 * 60, color: '#00e5a0' },
  { name: 'FOCUS', duration: 25 * 60, color: '#ffb400' },
  { name: 'LONG BREAK', duration: 15 * 60, color: '#4d9fff' },
];

let pomodoroPhaseIdx = 0;
let pomodoroSecsLeft = POMODORO_PHASES[0].duration;
let pomodoroRunning = false;

function startPomodoro() {
  pomodoroPhaseIdx = 0;
  pomodoroSecsLeft = POMODORO_PHASES[0].duration;
  pomodoroRunning = true;
  clearInterval(pomodoroInterval);
  pomodoroInterval = setInterval(tickPomodoro, 1000);
  updatePomodoroUI();
}

function tickPomodoro() {
  if (!pomodoroRunning) return;
  pomodoroSecsLeft--;
  updatePomodoroUI();

  if (pomodoroSecsLeft <= 0) {
    const phase = POMODORO_PHASES[pomodoroPhaseIdx];
    if (phase.name === 'FOCUS') {
      // Award study hour points
      const hoursStudied = phase.duration / 3600;
      awardPoints(App.currentUser.uid, 'STUDY_HOUR',
        Math.round(POINT_VALUES.STUDY_HOUR * hoursStudied),
        `Completed ${phase.duration/60}min focus session`);
      db.collection('users').doc(App.currentUser.uid).update({
        studyHours: firebase.firestore.FieldValue.increment(hoursStudied)
      });
    }
    showToast(`${phase.name} complete! Moving to next phase.`, 'success');
    pomodoroPhaseIdx = (pomodoroPhaseIdx + 1) % POMODORO_PHASES.length;
    pomodoroSecsLeft = POMODORO_PHASES[pomodoroPhaseIdx].duration;
  }
}

function updatePomodoroUI() {
  const phase = POMODORO_PHASES[pomodoroPhaseIdx];
  const totalSecs = phase.duration;
  const elapsed = totalSecs - pomodoroSecsLeft;
  const pct = elapsed / totalSecs;

  const mins = Math.floor(pomodoroSecsLeft / 60);
  const secs = pomodoroSecsLeft % 60;
  const display = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;

  document.getElementById('pomodoroDisplay').textContent = display;
  document.getElementById('pomodoroPhase').textContent = phase.name;

  // SVG circle
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const progressCircle = document.getElementById('pomodoroCircle');
  if (progressCircle) {
    progressCircle.style.strokeDasharray = circumference;
    progressCircle.style.strokeDashoffset = offset;
    progressCircle.style.stroke = phase.color;
  }
}

function togglePomodoro() {
  pomodoroRunning = !pomodoroRunning;
  const btn = document.getElementById('pomodoroToggle');
  if (btn) btn.textContent = pomodoroRunning ? '⏸ Pause' : '▶ Resume';
}

function resetPomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroRunning = false;
  pomodoroPhaseIdx = 0;
  pomodoroSecsLeft = POMODORO_PHASES[0].duration;
  updatePomodoroUI();
  const btn = document.getElementById('pomodoroToggle');
  if (btn) btn.textContent = '▶ Start';
}

// ─── LEADERBOARD ─────────────────────────────────────────────
async function renderLeaderboard() {
  if (!App.userProfile?.instituteId) return;
  const instituteId = App.userProfile.instituteId;

  // Load weekly + monthly tabs
  loadLeaderboardTab('weekly', instituteId);

  document.getElementById('lbWeeklyBtn')?.addEventListener('click', () => {
    setLbTab('weekly');
    loadLeaderboardTab('weekly', instituteId);
  });
  document.getElementById('lbMonthlyBtn')?.addEventListener('click', () => {
    setLbTab('monthly');
    loadLeaderboardTab('monthly', instituteId);
  });
  document.getElementById('lbAllTimeBtn')?.addEventListener('click', () => {
    setLbTab('alltime');
    loadLeaderboardAllTime(instituteId);
  });
}

function setLbTab(tab) {
  document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`lb-${tab}`)?.classList.add('active');
  document.querySelectorAll('[data-lb-tab]').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-lb-tab="${tab}"]`)?.classList.add('active');
}

async function loadLeaderboardTab(type, instituteId) {
  const key = type === 'weekly' ? `weekly-${getWeekKey()}` : `monthly-${getMonthKey()}`;
  const container = document.getElementById('leaderboardBody');
  const podiumEl  = document.getElementById('podiumContainer');

  container.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px"><div class="spinner"></div></td></tr>`;

  try {
    const doc = await db.collection('institutes').doc(instituteId)
      .collection('leaderboard').doc(key).get();

    let entries = [];
    if (doc.exists) {
      entries = Object.values(doc.data()).sort((a, b) => (b.points||0) - (a.points||0));
    } else {
      // Fallback: query users directly
      const snap = await db.collection('users')
        .where('instituteId', '==', instituteId)
        .orderBy(type === 'weekly' ? 'weeklyPoints' : 'monthlyPoints', 'desc')
        .limit(20).get();
      entries = snap.docs.map(d => ({
        uid: d.id,
        name: d.data().name,
        points: type === 'weekly' ? d.data().weeklyPoints : d.data().monthlyPoints,
        streak: d.data().streak,
        studyHours: d.data().studyHours,
      }));
    }

    // Render podium
    renderPodium(podiumEl, entries.slice(0, 3));

    // Render table
    if (entries.length === 0) {
      container.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🏆</div><p>No data yet. Complete sessions to appear here!</p></div></td></tr>`;
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    container.innerHTML = entries.map((e, i) => {
      const isMe = e.uid === App.currentUser?.uid;
      const rankDisplay = i < 3 ? medals[i] : `#${i+1}`;
      return `
        <tr style="${isMe ? 'background: rgba(255,180,0,0.05);' : ''}">
          <td><span class="rank-medal mono">${rankDisplay}</span></td>
          <td>
            <div class="flex items-center gap-3">
              <div class="user-avatar" style="width:32px;height:32px;font-size:12px">${(e.name||'?')[0].toUpperCase()}</div>
              <span style="font-weight:${isMe?'700':'400'}">${e.name || 'Student'}${isMe ? ' <span class="badge badge-amber" style="font-size:0.55rem">You</span>' : ''}</span>
            </div>
          </td>
          <td><span class="mono text-amber">${(e.points||0).toLocaleString()}</span></td>
          <td><span class="mono text-muted">${formatHours(e.studyHours||0)}</span></td>
          <td><span class="badge badge-green">🔥 ${e.streak||0}d</span></td>
        </tr>
      `;
    }).join('');
  } catch(e) {
    container.innerHTML = `<tr><td colspan="5" class="text-muted text-sm" style="padding:24px;text-align:center">Unable to load leaderboard. ${e.message}</td></tr>`;
  }
}

async function loadLeaderboardAllTime(instituteId) {
  const container = document.getElementById('leaderboardBody');
  const podiumEl  = document.getElementById('podiumContainer');

  try {
    const snap = await db.collection('users')
      .where('instituteId', '==', instituteId)
      .orderBy('totalPoints', 'desc')
      .limit(20).get();

    const entries = snap.docs.map(d => ({
      uid: d.id, ...d.data()
    }));

    renderPodium(podiumEl, entries.slice(0, 3));
    const medals = ['🥇', '🥈', '🥉'];
    container.innerHTML = entries.map((e, i) => `
      <tr>
        <td><span class="rank-medal mono">${i < 3 ? medals[i] : '#'+(i+1)}</span></td>
        <td>
          <div class="flex items-center gap-3">
            <div class="user-avatar" style="width:32px;height:32px;font-size:12px">${(e.name||'?')[0].toUpperCase()}</div>
            ${e.name || 'Student'}
          </div>
        </td>
        <td><span class="mono text-amber">${(e.totalPoints||0).toLocaleString()}</span></td>
        <td><span class="mono text-muted">${formatHours(e.studyHours||0)}</span></td>
        <td><span class="badge badge-green">🔥 ${e.streak||0}d</span></td>
      </tr>
    `).join('');
  } catch(e) {
    container.innerHTML = `<tr><td colspan="5" class="text-muted text-sm" style="padding:24px;text-align:center">${e.message}</td></tr>`;
  }
}

function renderPodium(el, top3) {
  if (!el || top3.length < 1) return;
  const order = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]  // 2nd, 1st, 3rd
    : top3;
  const classes = top3.length >= 3 ? ['second', 'first', 'third'] : ['first'];
  const medals  = top3.length >= 3 ? ['🥈', '🥇', '🥉'] : ['🥇'];

  el.innerHTML = order.map((e, i) => `
    <div class="podium-item ${classes[i]}">
      <div class="podium-avatar">${(e?.name||'?')[0].toUpperCase()}</div>
      <div class="podium-name">${e?.name || '—'}</div>
      <div class="podium-score">${(e?.points||e?.weeklyPoints||e?.totalPoints||0).toLocaleString()} pts</div>
      <div class="podium-block">${medals[i]}</div>
    </div>
  `).join('');
}

// ─── SPRINT ───────────────────────────────────────────────────
async function renderSprint() {
  if (!App.userProfile?.instituteId) return;

  const monthKey = getMonthKey();
  const sprintRef = db.collection('sprints').doc(`${App.userProfile.instituteId}-${monthKey}`);

  try {
    const doc = await sprintRef.get();
    let sprint;

    if (!doc.exists && App.isAdmin) {
      // Admin can create sprint
      document.getElementById('createSprintBtn')?.classList.remove('hidden');
      document.getElementById('sprintContent')?.classList.add('hidden');
      return;
    }

    sprint = doc.data();
    renderSprintContent(sprint, monthKey);
  } catch(e) {
    showToast('Error loading sprint: ' + e.message, 'error');
  }
}

function renderSprintContent(sprint, monthKey) {
  if (!sprint) return;

  // Calendar
  const calEl = document.getElementById('sprintCalendar');
  if (!calEl) return;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const completions = sprint.completions || {};
  const userKey = App.currentUser?.uid;

  calEl.innerHTML = '';
  for (let d = 1; d <= daysInMonth; d++) {
    const dayKey = `${monthKey}-${d.toString().padStart(2,'0')}`;
    const isCompleted = completions[userKey]?.includes(dayKey);
    const isToday = d === now.getDate();
    const isPast = d < now.getDate();

    const div = document.createElement('div');
    div.className = `sprint-day ${isCompleted ? 'completed' : isPast ? 'missed' : ''} ${isToday ? 'today' : ''}`;
    div.textContent = d;
    div.title = `Day ${d}`;
    calEl.appendChild(div);
  }

  // Sprint stats
  const userCompletions = (completions[userKey] || []).length;
  document.getElementById('sprintDaysCompleted').textContent = userCompletions;
  document.getElementById('sprintTarget').textContent = sprint.dailyTarget || '3 sessions';

  const pct = Math.round((userCompletions / daysInMonth) * 100);
  const progressFill = document.getElementById('sprintProgressFill');
  if (progressFill) {
    progressFill.style.width = `${pct}%`;
    progressFill.textContent = `${pct}%`;
  }
}

async function createSprint() {
  if (!App.isAdmin) return;
  const monthKey = getMonthKey();
  const now = new Date();

  try {
    await db.collection('sprints').doc(`${App.userProfile.instituteId}-${monthKey}`).set({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      monthKey,
      instituteId: App.userProfile.instituteId,
      dailyTarget: '3 sessions',
      weeklyMockReview: true,
      completions: {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: App.currentUser.uid,
    });
    showToast('Sprint created for this month! 🚀', 'success');
    renderSprint();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// Mark today complete
async function markSprintDayComplete() {
  if (!App.userProfile?.instituteId) return;
  const monthKey = getMonthKey();
  const now = new Date();
  const dayKey = `${monthKey}-${now.getDate().toString().padStart(2,'0')}`;
  const sprintRef = db.collection('sprints').doc(`${App.userProfile.instituteId}-${monthKey}`);

  try {
    await sprintRef.update({
      [`completions.${App.currentUser.uid}`]: firebase.firestore.FieldValue.arrayUnion(dayKey)
    });

    // Check if month complete for certificate
    const doc = await sprintRef.get();
    const completions = doc.data().completions[App.currentUser.uid] || [];
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    if (completions.length >= daysInMonth) {
      showToast('🎉 Sprint COMPLETE! Generating certificate...', 'success');
      setTimeout(() => generateCertificate(), 500);
    } else {
      showToast(`Day ${now.getDate()} marked complete! ${daysInMonth - completions.length} days remaining.`, 'success');
    }

    renderSprint();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ─── ANALYTICS ────────────────────────────────────────────────
async function renderAnalytics() {
  setTimeout(() => {
    renderConsistencyChart();
    renderSubjectChart();
    renderPointsHistoryChart();
  }, 100);
}

function renderConsistencyChart() {
  const canvas = document.getElementById('consistencyChart');
  if (!canvas) return;
  if (App.charts.consistency) App.charts.consistency.destroy();

  const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
  const data  = [72, 85, 63, 91];

  App.charts.consistency = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['Attendance', 'Study Hours', 'Tests', 'Tasks', 'Sessions', 'Reports'],
      datasets: [{
        label: 'Your Performance',
        data: [85, 72, 90, 68, 95, 80],
        backgroundColor: 'rgba(255,180,0,0.1)',
        borderColor: '#ffb400',
        borderWidth: 2,
        pointBackgroundColor: '#ffb400',
      }, {
        label: 'Institute Average',
        data: [70, 60, 75, 65, 80, 70],
        backgroundColor: 'rgba(77,159,255,0.05)',
        borderColor: '#4d9fff',
        borderWidth: 1,
        pointBackgroundColor: '#4d9fff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8a95a8', font: { family: 'DM Mono', size: 11 } } }
      },
      scales: {
        r: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#4a5568', backdropColor: 'transparent', font: { family: 'DM Mono', size: 9 } },
          pointLabels: { color: '#8a95a8', font: { family: 'DM Mono', size: 11 } },
          suggestedMin: 0, suggestedMax: 100,
        }
      }
    }
  });
}

function renderSubjectChart() {
  const canvas = document.getElementById('subjectChart');
  if (!canvas) return;
  if (App.charts.subject) App.charts.subject.destroy();

  App.charts.subject = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Physics', 'Chemistry', 'Maths', 'Biology', 'Other'],
      datasets: [{
        data: [30, 25, 28, 12, 5],
        backgroundColor: ['#ffb400', '#00e5a0', '#4d9fff', '#ff4d6d', '#8a95a8'],
        borderColor: '#131720',
        borderWidth: 3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8a95a8', font: { family: 'DM Mono', size: 11 }, padding: 16 }
        }
      }
    }
  });
}

function renderPointsHistoryChart() {
  const canvas = document.getElementById('pointsHistoryChart');
  if (!canvas) return;
  if (App.charts.pointsHistory) App.charts.pointsHistory.destroy();

  const days = Array.from({length: 30}, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.getDate().toString();
  });
  const data = Array.from({length: 30}, () => Math.floor(Math.random() * 80 + 20));
  // cumulative
  let cumsum = 0;
  const cumData = data.map(v => cumsum += v);

  App.charts.pointsHistory = new Chart(canvas, {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        label: 'Cumulative Points',
        data: cumData,
        borderColor: '#ffb400',
        backgroundColor: 'rgba(255,180,0,0.06)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2030',
          titleColor: '#f0e6d3',
          bodyColor: '#8a95a8',
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4a5568', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8a95a8', font: { size: 10, family: 'DM Mono' } } }
      }
    }
  });
}

// ─── ADMIN: STUDENTS PAGE ─────────────────────────────────────
async function renderStudents() {
  if (!App.isAdmin || !App.userProfile?.instituteId) return;
  const container = document.getElementById('studentsTableBody');
  const totalEl   = document.getElementById('totalStudentsCount');
  const alertEl   = document.getElementById('dropRiskList');

  container.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px"><div class="spinner"></div></td></tr>`;

  try {
    const snap = await db.collection('users')
      .where('instituteId', '==', App.userProfile.instituteId)
      .where('role', '==', 'student')
      .orderBy('totalPoints', 'desc').get();

    const students = snap.docs.map(d => ({ uid: d.id, ...d.data() }));

    if (totalEl) totalEl.textContent = students.length;

    // Drop-risk: streak = 0 or less than 3 days
    const atRisk = students.filter(s => (s.streak || 0) < 3 || (s.weeklyPoints || 0) === 0);
    if (alertEl && atRisk.length > 0) {
      alertEl.innerHTML = atRisk.map(s => `
        <div class="drop-risk-alert mb-4">
          <span class="alert-icon">⚠️</span>
          <div>
            <div class="text-sm" style="font-weight:600">${s.name}</div>
            <div class="text-xs text-muted">Streak: ${s.streak||0} days · Weekly: ${s.weeklyPoints||0} pts</div>
          </div>
          <button class="btn btn-sm btn-ghost" style="margin-left:auto" onclick="nudgeStudent('${s.uid}','${s.name}')">Nudge</button>
        </div>
      `).join('');
    } else if (alertEl) {
      alertEl.innerHTML = `<p class="text-muted text-sm">✅ All students are active this week!</p>`;
    }

    if (students.length === 0) {
      container.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👥</div><p>No students yet. Share your institute code!</p></div></td></tr>`;
      return;
    }

    container.innerHTML = students.map((s, i) => {
      const consistency = Math.min(100, Math.round(((s.attendanceCount||0) / 30) * 100));
      const riskLevel = (s.streak||0) < 3 ? 'badge-red' : (s.streak||0) < 7 ? 'badge-amber' : 'badge-green';

      return `
        <tr>
          <td><span class="mono text-muted">#${i+1}</span></td>
          <td>
            <div class="flex items-center gap-3">
              <div class="user-avatar" style="width:32px;height:32px;font-size:12px">${(s.name||'?')[0].toUpperCase()}</div>
              <div>
                <div class="text-sm" style="font-weight:600">${s.name}</div>
                <div class="text-xs text-muted">${s.email}</div>
              </div>
            </div>
          </td>
          <td><span class="mono text-amber">${(s.totalPoints||0).toLocaleString()}</span></td>
          <td><span class="mono">${formatHours(s.studyHours||0)}</span></td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;min-width:120px">
              <div class="progress-bar" style="flex:1">
                <div class="progress-fill ${consistency > 70 ? 'green' : consistency > 40 ? 'amber' : 'red'}" style="width:${consistency}%"></div>
              </div>
              <span class="text-xs mono">${consistency}%</span>
            </div>
          </td>
          <td><span class="badge ${riskLevel}">🔥 ${s.streak||0}d</span></td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-sm" onclick="addPointsModal('${s.uid}','${s.name}')">+Pts</button>
              <button class="btn btn-ghost btn-sm" onclick="viewStudentDetail('${s.uid}')">View</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Stats
    renderInstituteStats(students);
  } catch(e) {
    container.innerHTML = `<tr><td colspan="7" class="text-muted text-sm" style="padding:24px;text-align:center">${e.message}</td></tr>`;
  }
}

function renderInstituteStats(students) {
  const totalPts = students.reduce((s, u) => s + (u.totalPoints||0), 0);
  const totalHrs = students.reduce((s, u) => s + (u.studyHours||0), 0);
  const avgPts   = students.length ? Math.round(totalPts / students.length) : 0;

  document.getElementById('instTotalStudyHours')?.textContent && (
    document.getElementById('instTotalStudyHours').textContent = formatHours(totalHrs)
  );
  document.getElementById('instAvgPoints')?.textContent && (
    document.getElementById('instAvgPoints').textContent = avgPts.toLocaleString()
  );

  // Render institute performance chart
  setTimeout(renderInstituteChart, 100);
}

function renderInstituteChart() {
  const canvas = document.getElementById('instituteChart');
  if (!canvas) return;
  if (App.charts.institute) App.charts.institute.destroy();

  App.charts.institute = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      datasets: [{
        label: 'Avg Study Hours',
        data: [2.8, 3.5, 3.1, 4.2],
        backgroundColor: 'rgba(255,180,0,0.7)',
        borderColor: '#ffb400',
        borderWidth: 1,
        borderRadius: 4,
      }, {
        label: 'Avg Sessions',
        data: [8, 11, 9, 14],
        backgroundColor: 'rgba(0,229,160,0.5)',
        borderColor: '#00e5a0',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8a95a8', font: { family: 'DM Mono', size: 11 } } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8a95a8', font: { family: 'DM Mono', size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8a95a8', font: { family: 'DM Mono', size: 11 } } }
      }
    }
  });
}

// ─── ADMIN: ADD POINTS ────────────────────────────────────────
function addPointsModal(uid, name) {
  document.getElementById('addPtsStudentUid').value = uid;
  document.getElementById('addPtsStudentName').textContent = name;
  document.getElementById('addPointsModal').classList.add('open');
}

async function submitAddPoints() {
  const uid    = document.getElementById('addPtsStudentUid').value;
  const amount = parseInt(document.getElementById('addPtsAmount').value);
  const reason = document.getElementById('addPtsReason').value;
  const type   = document.getElementById('addPtsType').value;

  if (!uid || !amount || amount <= 0) { showToast('Enter a valid amount', 'warning'); return; }

  try {
    await awardPoints(uid, type || 'MANUAL', amount, reason || 'Admin award');
    document.getElementById('addPointsModal').classList.remove('open');
    showToast(`+${amount} points awarded!`, 'success');
    renderStudents();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function nudgeStudent(uid, name) {
  // In production, this would trigger FCM notification
  showToast(`Nudge sent to ${name} 📲`, 'success');
}

// ─── CERTIFICATES (jsPDF) ─────────────────────────────────────
async function generateCertificate() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const name = App.userProfile?.name || 'Student';
  const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  // Background
  doc.setFillColor(8, 10, 14);
  doc.rect(0, 0, 297, 210, 'F');

  // Border decoration
  doc.setDrawColor(255, 180, 0);
  doc.setLineWidth(0.5);
  doc.rect(10, 10, 277, 190);
  doc.rect(12, 12, 273, 186);

  // Ornamental corners
  doc.setLineWidth(2);
  [[15, 15], [282, 15], [15, 195], [282, 195]].forEach(([x, y]) => {
    doc.line(x, y, x + (x < 150 ? 15 : -15), y);
    doc.line(x, y, x, y + (y < 100 ? 15 : -15));
  });

  // Header
  doc.setFontSize(10);
  doc.setTextColor(255, 180, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('RANKFORGE ACADEMY', 148.5, 35, { align: 'center' });

  doc.setFontSize(7);
  doc.setTextColor(100, 120, 140);
  doc.text('EXCELLENCE IN COMPETITIVE STUDY', 148.5, 42, { align: 'center' });

  // Divider
  doc.setDrawColor(255, 180, 0);
  doc.setLineWidth(0.3);
  doc.line(60, 46, 237, 46);

  // Title
  doc.setFontSize(32);
  doc.setTextColor(240, 230, 211);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICATE', 148.5, 72, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(138, 149, 168);
  doc.setFont('helvetica', 'normal');
  doc.text('OF COMPLETION', 148.5, 82, { align: 'center' });

  // Body text
  doc.setFontSize(9);
  doc.setTextColor(138, 149, 168);
  doc.text('This is to certify that', 148.5, 98, { align: 'center' });

  // Name
  doc.setFontSize(28);
  doc.setTextColor(255, 180, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(name.toUpperCase(), 148.5, 118, { align: 'center' });

  // Underline name
  const nameWidth = doc.getTextWidth(name.toUpperCase());
  doc.setDrawColor(255, 180, 0);
  doc.setLineWidth(0.3);
  doc.line(148.5 - nameWidth/2, 122, 148.5 + nameWidth/2, 122);

  // Description
  doc.setFontSize(9);
  doc.setTextColor(138, 149, 168);
  doc.setFont('helvetica', 'normal');
  doc.text('has successfully completed the', 148.5, 132, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor(77, 159, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(`30-DAY RANK SPRINT CHALLENGE — ${month.toUpperCase()}`, 148.5, 143, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(138, 149, 168);
  doc.setFont('helvetica', 'normal');
  doc.text('demonstrating exceptional consistency, discipline, and commitment to academic excellence.', 148.5, 153, { align: 'center' });

  // Stats row
  const stats = [
    { label: 'SESSIONS', value: '90+' },
    { label: 'DAYS COMPLETED', value: '30/30' },
    { label: 'POINTS EARNED', value: (App.userProfile?.monthlyPoints || 0).toLocaleString() },
  ];

  stats.forEach((s, i) => {
    const x = 74 + i * 75;
    doc.setFillColor(26, 32, 48);
    doc.roundedRect(x - 25, 160, 50, 20, 2, 2, 'F');
    doc.setFontSize(14);
    doc.setTextColor(255, 180, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(s.value, x, 172, { align: 'center' });
    doc.setFontSize(6);
    doc.setTextColor(100, 120, 140);
    doc.setFont('helvetica', 'normal');
    doc.text(s.label, x, 177, { align: 'center' });
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(74, 85, 104);
  doc.text(
    `Generated: ${new Date().toLocaleDateString('en-IN')} · ID: RF-${Date.now().toString(36).toUpperCase()}`,
    148.5, 192, { align: 'center' }
  );

  // Save & upload to Firebase Storage
  const pdfBlob = doc.output('blob');
  const fileName = `certificate-${App.currentUser.uid}-${getMonthKey()}.pdf`;

  try {
    const storageRef = storage.ref(`certificates/${App.currentUser.uid}/${fileName}`);
    await storageRef.put(pdfBlob, { contentType: 'application/pdf' });
    const url = await storageRef.getDownloadURL();
    await db.collection('users').doc(App.currentUser.uid).update({
      [`certificates.${getMonthKey()}`]: url
    });
    showToast('Certificate saved to your profile! 📜', 'success');
  } catch(e) {
    showToast('Certificate generated (storage save failed — check Firebase rules)', 'warning');
  }

  doc.save(`RankForge-Certificate-${name}-${month}.pdf`);
}

// ─── PROFILE ──────────────────────────────────────────────────
async function renderProfile() {
  const p = App.userProfile;
  if (!p) return;

  document.getElementById('profileName').textContent  = p.name || 'User';
  document.getElementById('profileEmail').textContent = App.currentUser?.email || '';
  document.getElementById('profilePoints').textContent = (p.totalPoints || 0).toLocaleString();
  document.getElementById('profileStreak').textContent  = `${p.streak || 0} days`;
  document.getElementById('profileHours').textContent   = formatHours(p.studyHours || 0);
  document.getElementById('profileAvatar').textContent  = (p.name || 'U')[0].toUpperCase();
}

// ─── ADMIN: GET INSTITUTE CODE ─────────────────────────────────
async function showInstituteCode() {
  if (!App.isAdmin || !App.userProfile?.instituteId) return;
  try {
    const doc = await db.collection('institutes').doc(App.userProfile.instituteId).get();
    const code = doc.data()?.code || 'N/A';
    document.getElementById('instituteCodeDisplay').textContent = code;
    document.getElementById('instituteCodeModal').classList.add('open');
  } catch(e) {
    showToast('Error fetching code', 'error');
  }
}

function copyInstCode() {
  const code = document.getElementById('instituteCodeDisplay').textContent;
  navigator.clipboard.writeText(code);
  showToast('Code copied!', 'success');
}

// ─── Handle Avatar Upload ─────────────────────────────
async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showToast("Image must be under 2MB", "warning");
    return;
  }

  try {
    showToast("Uploading avatar...", "info");

    const avatarUrl = await uploadAvatarToCloudinary(file);

    await db.collection("users")
      .doc(App.currentUser.uid)
      .update({ avatar: avatarUrl });

    App.userProfile.avatar = avatarUrl;
    updateSidebarUser();

    showToast("Avatar updated successfully! 🎉", "success");

  } catch (err) {
    showToast(err.message, "error");
  }
}
