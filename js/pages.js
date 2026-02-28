// ============================================================
// RANKFORGE — Page Renderers v2.0
// Dashboard, Sessions, Leaderboard, Sprint, Analytics, Profile
// ============================================================

// ─── ICON HELPER ─────────────────────────────────────────────
function icon(name, size = 14) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
}

function reIcons() {
  setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 50);
}

// ─── DASHBOARD ───────────────────────────────────────────────
async function renderDashboard() {
  // Reload fresh profile from Firestore to get latest points
  if (App.currentUser) {
    try {
      const doc = await db.collection('users').doc(App.currentUser.uid).get();
      if (doc.exists) {
        App.userProfile = { ...App.userProfile, ...doc.data() };
        App.isAdmin = App.userProfile.role === 'admin';
        updateSidebarUser();
      }
    } catch(e) {}
  }

  const p = App.userProfile;
  if (!p) return;

  document.getElementById('dashTotalPoints').textContent = (p.totalPoints || 0).toLocaleString();
  document.getElementById('dashStudyHours').textContent  = formatHours(p.studyHours || 0);
  document.getElementById('dashAttendance').textContent  = p.attendanceCount || 0;
  document.getElementById('dashStreak').textContent      = `${p.streak || 0}d`;

  if (p.instituteId) loadWeeklyRank(p.instituteId);

  renderTodaySessions();
  renderRecentActivity();
  setTimeout(renderDashboardChart, 200);
  reIcons();
}

async function loadWeeklyRank(instituteId) {
  try {
    const weekKey = getWeekKey();
    const doc = await db.collection('institutes').doc(instituteId)
      .collection('leaderboard').doc(`weekly-${weekKey}`).get();
    if (doc.exists) {
      const entries = Object.values(doc.data()).sort((a, b) => (b.points || 0) - (a.points || 0));
      const myRank  = entries.findIndex(e => e.uid === App.currentUser.uid) + 1;
      document.getElementById('dashWeeklyRank').textContent = myRank > 0 ? `#${myRank}` : '—';
    }
  } catch(e) {}
}

function renderTodaySessions() {
  const container = document.getElementById('todaySessionsList');
  if (!container) return;

  const sessions = [
    { time: '07:00', name: 'Morning Focus', type: 'morning', duration: 120, badge: 'badge-yellow', badgeIcon: 'sunrise' },
    { time: '14:00', name: 'Afternoon Grind', type: 'afternoon', duration: 90, badge: 'badge-cyan', badgeIcon: 'sun' },
    { time: '20:00', name: 'Evening Review', type: 'evening', duration: 60, badge: 'badge-muted', badgeIcon: 'moon' },
  ];

  const now = new Date();
  const currentHour = now.getHours();

  container.innerHTML = sessions.map(s => {
    const sessionHour = parseInt(s.time.split(':')[0]);
    const isLive = currentHour === sessionHour;
    const isPast = currentHour > sessionHour + 2;
    const statusBadge = isLive
      ? `<span class="live-dot">LIVE NOW</span>`
      : isPast
        ? `<span class="badge badge-muted">Completed</span>`
        : `<span class="badge badge-cyan">${icon('clock')} Upcoming</span>`;

    return `
      <div class="session-card ${isLive ? 'live' : ''} mb-3">
        <div class="flex items-center justify-between mb-3">
          <div>
            <div class="card-title" style="font-size:0.9rem">${s.name}</div>
            <div class="card-subtitle">${s.time} · ${s.duration} min · Pomodoro</div>
          </div>
          ${statusBadge}
        </div>
        <div class="flex gap-2">
          ${isLive
            ? `<button class="btn btn-primary btn-sm" onclick="joinSession('${s.type}', '${s.name}')">${icon('video')} Join Now</button>`
            : isPast
              ? `<button class="btn btn-ghost btn-sm" disabled>Session Ended</button>`
              : `<button class="btn btn-secondary btn-sm" onclick="setGoalModal('${s.type}', '${s.name}')">${icon('target')} Set Goal & Join</button>`
          }
          <button class="btn btn-ghost btn-sm">${icon('file-text')} Reports</button>
        </div>
      </div>
    `;
  }).join('');
  reIcons();
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
      container.innerHTML = `
        <div class="empty-state" style="padding:28px 16px">
          <div class="empty-icon">${icon('inbox', 22)}</div>
          <div class="empty-title">No activity yet</div>
          <div class="empty-desc">Join a session to start earning points</div>
        </div>`;
      reIcons();
      return;
    }

    container.innerHTML = snap.docs.map(d => {
      const log = d.data();
      return `
        <div class="flex items-center justify-between" style="padding:10px 0;border-bottom:1px solid var(--border-dim)">
          <div>
            <div class="text-sm" style="font-weight:500">${log.reason || log.type}</div>
            <div class="text-xs text-muted mono" style="margin-top:2px">${timeSince(log.timestamp)}</div>
          </div>
          <span class="badge badge-yellow">+${log.amount} pts</span>
        </div>
      `;
    }).join('');
  } catch(e) {
    container.innerHTML = '<p class="text-muted text-sm" style="padding:16px 0">Unable to load activity.</p>';
  }
}

async function renderDashboardChart() {
  const canvas = document.getElementById('weeklyChart');
  if (!canvas) return;
  if (App.charts.weekly) App.charts.weekly.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#7a89a8' : '#5a6890';

  // Build last 7 days labels
  const labels = [];
  const dayKeys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-IN', { weekday: 'short' }));
    dayKeys.push(d.toDateString());
  }

  // Try to load real point log data
  let pointsData = [0, 0, 0, 0, 0, 0, 0];
  let hoursData  = [0, 0, 0, 0, 0, 0, 0];

  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const logsSnap = await db.collection('users').doc(App.currentUser.uid)
      .collection('pointLogs')
      .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(since))
      .orderBy('timestamp', 'asc')
      .get();

    logsSnap.docs.forEach(d => {
      const log = d.data();
      const dayStr = log.timestamp?.toDate()?.toDateString();
      const idx = dayKeys.indexOf(dayStr);
      if (idx >= 0) {
        pointsData[idx] += log.amount || 0;
        if (log.type === 'STUDY_HOUR') hoursData[idx] += (log.amount / (POINT_VALUES.STUDY_HOUR || 10));
      }
    });
  } catch (e) {
    // Use profile-derived estimates if logs unavailable
    const totalPts = App.userProfile?.totalPoints || 0;
    const avg = Math.round(totalPts / 30);
    pointsData = labels.map(() => Math.max(0, avg + Math.round((Math.random() - 0.5) * avg * 0.6)));
  }

  App.charts.weekly = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Points',
          data: pointsData,
          backgroundColor: 'rgba(255,209,0,0.6)',
          borderColor: '#ffd100',
          borderWidth: 1,
          borderRadius: 6,
          yAxisID: 'y',
        },
        {
          label: 'Study Hours',
          data: hoursData,
          type: 'line',
          borderColor: '#00e6dc',
          backgroundColor: 'rgba(0,230,220,0.06)',
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: '#00e6dc',
          pointBorderColor: isDark ? '#0f1422' : '#fff',
          pointBorderWidth: 2,
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
          labels: {
            color: textColor,
            font: { family: 'JetBrains Mono', size: 11 },
            boxWidth: 14, boxHeight: 14,
            padding: 16,
          }
        },
        tooltip: {
          backgroundColor: isDark ? '#131928' : '#fff',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
          borderWidth: 1,
          titleColor: isDark ? '#eef2ff' : '#1a1f3d',
          bodyColor: textColor,
          padding: 12,
          cornerRadius: 10,
          displayColors: true,
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 11 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: '#ffd100', font: { family: 'JetBrains Mono', size: 11 } },
          position: 'left',
        },
        y1: {
          grid: { display: false },
          ticks: { color: '#00e6dc', font: { family: 'JetBrains Mono', size: 11 } },
          position: 'right',
        }
      }
    }
  });
}

// ─── SESSIONS ─────────────────────────────────────────────────
let currentSession = null;
let pomodoroInterval = null;

function renderSessions() {
  renderTodaySessions2();
  reIcons();
}

function renderTodaySessions2() {}

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

    await awardPoints(App.currentUser.uid, 'ATTENDANCE', POINT_VALUES.ATTENDANCE, `Attended ${currentSession.name}`);
    document.getElementById('sessionGoalModal').classList.remove('open');
    document.getElementById('sessionGoal').value = '';

    openJitsi(jitsiRoom, currentSession.name);
    startPomodoro();
    navigate('sessions');

    showToast(`Joined ${currentSession.name}! +${POINT_VALUES.ATTENDANCE} pts`, 'success');
  } catch(e) {
    showToast('Error joining session: ' + e.message, 'error');
  }
}

function openJitsi(room, title) {
  const container = document.getElementById('activeSessionView');
  container.classList.remove('hidden');
  document.getElementById('activeSessionTitle').textContent = title;
  document.getElementById('jitsiFrame').src =
    `https://meet.jit.si/${encodeURIComponent(room)}#config.startWithVideoMuted=false&config.startWithAudioMuted=false`;
}

function closeSession() {
  document.getElementById('jitsiFrame').src = '';
  document.getElementById('activeSessionView').classList.add('hidden');
  clearInterval(pomodoroInterval);
  document.getElementById('endReportModal').classList.add('open');
}

async function submitEndReport() {
  const report = document.getElementById('endReport').value.trim();
  const tasks  = parseInt(document.getElementById('tasksCompleted')?.value || 0);

  if (!report) { showToast('Please write your session report', 'warning'); return; }

  let bonusPoints = POINT_VALUES.REPORT_FILED;
  if (tasks > 0) bonusPoints += tasks * POINT_VALUES.TASK_DONE;

  await awardPoints(App.currentUser.uid, 'REPORT_FILED', bonusPoints,
    `Session report: ${tasks} tasks completed`);

  document.getElementById('endReportModal').classList.remove('open');
  document.getElementById('endReport').value = '';

  showToast(`Report submitted! +${bonusPoints} points earned`, 'success');
  renderDashboard();
}

// ─── POMODORO TIMER ───────────────────────────────────────────
const POMODORO_PHASES = [
  { name: 'FOCUS', duration: 25 * 60, color: '#ffd100' },
  { name: 'BREAK', duration: 5 * 60,  color: '#00e6dc' },
  { name: 'FOCUS', duration: 25 * 60, color: '#ffd100' },
  { name: 'BREAK', duration: 5 * 60,  color: '#00e6dc' },
  { name: 'FOCUS', duration: 25 * 60, color: '#ffd100' },
  { name: 'LONG BREAK', duration: 15 * 60, color: '#22c55e' },
];

let pomodoroPhaseIdx = 0;
let pomodoroSecsLeft = POMODORO_PHASES[0].duration;
let pomodoroRunning  = false;

function startPomodoro() {
  pomodoroPhaseIdx = 0;
  pomodoroSecsLeft = POMODORO_PHASES[0].duration;
  pomodoroRunning  = true;
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

  const dispEl = document.getElementById('pomodoroDisplay');
  const phaseEl = document.getElementById('pomodoroPhase');
  if (dispEl) dispEl.textContent = display;
  if (phaseEl) phaseEl.textContent = phase.name;

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
  if (btn) {
    btn.innerHTML = pomodoroRunning
      ? `${icon('pause')} Pause`
      : `${icon('play')} Resume`;
    reIcons();
  }
}

function resetPomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroRunning = false;
  pomodoroPhaseIdx = 0;
  pomodoroSecsLeft = POMODORO_PHASES[0].duration;
  updatePomodoroUI();
  const btn = document.getElementById('pomodoroToggle');
  if (btn) { btn.innerHTML = `${icon('play')} Start`; reIcons(); }
}

// ─── LEADERBOARD ─────────────────────────────────────────────
async function renderLeaderboard() {
  if (!App.userProfile?.instituteId) return;
  const instituteId = App.userProfile.instituteId;

  loadLeaderboardTab('weekly', instituteId);

  // Remove old listeners before adding
  const weeklyBtn  = document.getElementById('lbWeeklyBtn');
  const monthlyBtn = document.getElementById('lbMonthlyBtn');
  const allTimeBtn = document.getElementById('lbAllTimeBtn');

  if (weeklyBtn)  weeklyBtn.onclick  = () => { setLbTab('weekly'); loadLeaderboardTab('weekly', instituteId); };
  if (monthlyBtn) monthlyBtn.onclick = () => { setLbTab('monthly'); loadLeaderboardTab('monthly', instituteId); };
  if (allTimeBtn) allTimeBtn.onclick = () => { setLbTab('alltime'); loadLeaderboardAllTime(instituteId); };
}

function setLbTab(tab) {
  document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-lb-tab="${tab}"]`)?.classList.add('active');
}

async function loadLeaderboardTab(type, instituteId) {
  const key = type === 'weekly' ? `weekly-${getWeekKey()}` : `monthly-${getMonthKey()}`;
  const container = document.getElementById('leaderboardBody');
  const podiumEl  = document.getElementById('podiumContainer');

  if (container) container.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px"><div class="spinner"></div></td></tr>`;

  try {
    const doc = await db.collection('institutes').doc(instituteId)
      .collection('leaderboard').doc(key).get();

    let entries = [];
    if (doc.exists) {
      entries = Object.values(doc.data()).sort((a, b) => (b.points||0) - (a.points||0));
    } else {
      const snap = await db.collection('users')
        .where('instituteId', '==', instituteId)
        .orderBy(type === 'weekly' ? 'weeklyPoints' : 'monthlyPoints', 'desc')
        .limit(20).get();
      entries = snap.docs.map(d => ({
        uid: d.id,
        name: d.data().name,
        avatar: d.data().avatar,
        points: type === 'weekly' ? d.data().weeklyPoints : d.data().monthlyPoints,
        streak: d.data().streak,
        studyHours: d.data().studyHours,
      }));
    }

    renderPodium(podiumEl, entries.slice(0, 3));

    if (!entries.length) {
      container.innerHTML = `<tr><td colspan="5"><div class="empty-state">
        <div class="empty-icon">${icon('trophy', 22)}</div>
        <div class="empty-title">No data yet</div>
        <div class="empty-desc">Complete sessions to appear here!</div>
      </div></td></tr>`;
      reIcons(); return;
    }

    const rankIcons = [
      `<span style="color:#ffd100;font-size:1.1rem">&#9646;</span>`,
      `<span style="color:#94a3b8;font-size:1.1rem">&#9646;</span>`,
      `<span style="color:#cd7f32;font-size:1.1rem">&#9646;</span>`,
    ];

    container.innerHTML = entries.map((e, i) => {
      const isMe = e.uid === App.currentUser?.uid;
      const avatarHtml = e.avatar
        ? `<img src="${e.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--border-soft)">`
        : `<div class="user-avatar" style="width:32px;height:32px;font-size:12px">${(e.name||'?')[0].toUpperCase()}</div>`;

      return `
        <tr style="${isMe ? 'background:rgba(255,209,0,0.04);' : ''}">
          <td>
            <span class="rank-medal mono">${i < 3 ? rankIcons[i] : '#'+(i+1)}</span>
          </td>
          <td>
            <div class="flex items-center gap-3">
              ${avatarHtml}
              <span style="font-weight:${isMe?'700':'400'}">${e.name || 'Student'} ${isMe ? '<span class="badge badge-yellow" style="font-size:0.52rem;margin-left:4px">You</span>' : ''}</span>
            </div>
          </td>
          <td><span class="mono text-yellow font-bold">${(e.points||0).toLocaleString()}</span></td>
          <td><span class="mono text-secondary">${formatHours(e.studyHours||0)}</span></td>
          <td>
            <span class="badge badge-yellow" style="gap:5px">
              ${icon('flame', 10)} ${e.streak||0}d
            </span>
          </td>
        </tr>
      `;
    }).join('');
    reIcons();
  } catch(e) {
    container.innerHTML = `<tr><td colspan="5" class="text-muted text-sm" style="padding:24px;text-align:center">${e.message}</td></tr>`;
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

    const entries = snap.docs.map(d => ({ uid: d.id, ...d.data() }));

    renderPodium(podiumEl, entries.slice(0, 3));

    container.innerHTML = entries.map((e, i) => {
      const avatarHtml = e.avatar
        ? `<img src="${e.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--border-soft)">`
        : `<div class="user-avatar" style="width:32px;height:32px;font-size:12px">${(e.name||'?')[0].toUpperCase()}</div>`;

      return `
        <tr>
          <td><span class="rank-medal mono">#${i+1}</span></td>
          <td>
            <div class="flex items-center gap-3">
              ${avatarHtml}
              ${e.name || 'Student'}
            </div>
          </td>
          <td><span class="mono text-yellow font-bold">${(e.totalPoints||0).toLocaleString()}</span></td>
          <td><span class="mono text-secondary">${formatHours(e.studyHours||0)}</span></td>
          <td><span class="badge badge-yellow">${icon('flame', 10)} ${e.streak||0}d</span></td>
        </tr>
      `;
    }).join('');
    reIcons();
  } catch(e) {
    container.innerHTML = `<tr><td colspan="5" class="text-muted text-sm" style="padding:24px;text-align:center">${e.message}</td></tr>`;
  }
}

function renderPodium(el, top3) {
  if (!el || !top3.length) return;
  const order   = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const classes = top3.length >= 3 ? ['second', 'first', 'third'] : ['first'];
  const medals  = ['2', '1', '3']; // rank numbers for icons

  el.innerHTML = order.map((e, i) => {
    const avatarContent = e?.avatar
      ? `<img src="${e.avatar}" alt="${e?.name}">`
      : (e?.name || '?')[0].toUpperCase();

    const rankColors = { 0: '#94a3b8', 1: '#ffd100', 2: '#cd7f32' };
    const rankNum = classes[i] === 'first' ? 1 : classes[i] === 'second' ? 2 : 3;

    return `
      <div class="podium-item ${classes[i]}">
        <div style="font-size:1.4rem;margin-bottom:4px;text-align:center" class="mono font-bold" style="color:${rankColors[i]}">${rankNum}</div>
        <div class="podium-avatar">${avatarContent}</div>
        <div class="podium-name">${e?.name || '—'}</div>
        <div class="podium-score">${(e?.points||e?.weeklyPoints||e?.totalPoints||0).toLocaleString()} pts</div>
        <div class="podium-block"></div>
      </div>
    `;
  }).join('');
}

// ─── SPRINT ───────────────────────────────────────────────────
async function renderSprint() {
  if (!App.userProfile?.instituteId) return;

  const monthKey = getMonthKey();
  const sprintRef = db.collection('sprints').doc(`${App.userProfile.instituteId}-${monthKey}`);

  try {
    const doc = await sprintRef.get();

    if (!doc.exists && App.isAdmin) {
      document.getElementById('createSprintBtn')?.classList.remove('hidden');
      document.getElementById('sprintContent')?.classList.add('hidden');
      reIcons();
      return;
    }

    if (!doc.exists) {
      document.getElementById('sprintContent')?.classList.add('hidden');
      reIcons();
      return;
    }

    const sprint = doc.data();
    renderSprintContent(sprint, monthKey);
  } catch(e) {
    showToast('Error loading sprint: ' + e.message, 'error');
  }
}

function renderSprintContent(sprint, monthKey) {
  if (!sprint) return;

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
    const isPast  = d < now.getDate();

    const div = document.createElement('div');
    div.className = `sprint-day ${isCompleted ? 'completed' : isPast ? 'missed' : ''} ${isToday ? 'today' : ''}`;
    div.textContent = d;
    div.title = `Day ${d}`;
    calEl.appendChild(div);
  }

  const userCompletions = (completions[userKey] || []).length;
  const daysEl = document.getElementById('sprintDaysCompleted');
  if (daysEl) daysEl.textContent = userCompletions;

  const targetEl = document.getElementById('sprintTarget');
  if (targetEl) targetEl.textContent = sprint.dailyTarget || '3 sessions';

  const pct = Math.round((userCompletions / daysInMonth) * 100);
  const progressFill = document.getElementById('sprintProgressFill');
  if (progressFill) progressFill.style.width = `${pct}%`;

  updateSprintLabel && updateSprintLabel();
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
    showToast('Sprint created for this month!', 'success');
    renderSprint();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

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

    const doc = await sprintRef.get();
    const completions = doc.data().completions[App.currentUser.uid] || [];
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    if (completions.length >= daysInMonth) {
      showToast('Sprint COMPLETE! Generating certificate...', 'success');
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
  // ── Live stat cards from real Firestore data ──
  if (App.currentUser) {
    try {
      const doc = await db.collection('users').doc(App.currentUser.uid).get();
      if (doc.exists) {
        App.userProfile = { ...App.userProfile, ...doc.data() };
        updateSidebarUser();
      }
    } catch(e) {}
  }
  const p = App.userProfile || {};

  const totalPtsEl = document.getElementById('analyticsPoints');
  const studyHrsEl = document.getElementById('analyticsHours');
  const testsEl    = document.getElementById('analyticsTests');
  const streakEl   = document.getElementById('analyticsStreak');
  if (totalPtsEl) totalPtsEl.textContent = (p.totalPoints || 0).toLocaleString();
  if (studyHrsEl) studyHrsEl.textContent = formatHours(p.studyHours || 0);
  if (testsEl)    testsEl.textContent    = p.testsGiven || 0;
  if (streakEl)   streakEl.textContent   = `${p.streak || 0}d`;

  // ── Load test history ──
  await loadTestHistory();

  // ── Render charts ──
  setTimeout(async () => {
    await renderConsistencyChart();
    renderSubjectChart();
    await renderPointsHistoryChart();
  }, 100);
}

async function loadTestHistory() {
  const container = document.getElementById('testHistoryList');
  if (!container) return;
  try {
    const snap = await db.collection('users').doc(App.currentUser.uid)
      .collection('pointLogs')
      .where('type', 'in', ['TEST_PASS', 'TEST_PERFECT'])
      .orderBy('timestamp', 'desc')
      .limit(10).get();

    if (snap.empty) {
      container.innerHTML = `<div class="text-xs text-muted mono" style="padding:10px 0">No tests logged yet. Use the form above to log a score.</div>`;
      return;
    }
    container.innerHTML = snap.docs.map(d => {
      const log = d.data();
      return `<div class="flex items-center justify-between" style="padding:8px 0;border-bottom:1px solid var(--border-dim)">
        <div>
          <div class="text-sm" style="font-weight:600">${log.reason || log.type}</div>
          <div class="text-xs text-muted mono" style="margin-top:2px">${timeSince(log.timestamp)}</div>
        </div>
        <span class="badge ${log.type === 'TEST_PERFECT' ? 'badge-yellow' : 'badge-cyan'}">+${log.amount} pts</span>
      </div>`;
    }).join('');
  } catch(e) {
    container.innerHTML = `<div class="text-xs text-muted" style="padding:10px 0">Unable to load test history.</div>`;
  }
}

function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    grid:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)',
    text:    isDark ? '#7a89a8' : '#5a6890',
    surface: isDark ? '#0f1422' : '#ffffff',
    border:  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
    primary: isDark ? '#eef2ff' : '#1a1f3d',
  };
}

async function renderConsistencyChart() {
  const canvas = document.getElementById('consistencyChart');
  if (!canvas) return;
  if (App.charts.consistency) App.charts.consistency.destroy();
  const c = getChartColors();

  const p = App.userProfile || {};
  // Compute real metrics from user profile (0-100 scale)
  const attendance = Math.min(100, Math.round(((p.attendanceCount || 0) / 90) * 100));
  const studyHours = Math.min(100, Math.round(((p.studyHours || 0) / 100) * 100));
  const tests      = Math.min(100, Math.round(((p.testsGiven || 0) / 30) * 100));
  const streak     = Math.min(100, Math.round(((p.streak || 0) / 30) * 100));
  const sessions   = Math.min(100, attendance); // proxy
  const points     = Math.min(100, Math.round(((p.totalPoints || 0) / 3000) * 100));

  App.charts.consistency = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['Attendance', 'Study Hours', 'Tests', 'Streak', 'Sessions', 'Points'],
      datasets: [{
        label: 'Your Performance',
        data: [attendance, studyHours, tests, streak, sessions, points],
        backgroundColor: 'rgba(255,209,0,0.12)',
        borderColor: '#ffd100',
        borderWidth: 2,
        pointBackgroundColor: '#ffd100',
        pointBorderColor: c.surface,
        pointBorderWidth: 2,
        pointRadius: 5,
      }, {
        label: 'Target (100%)',
        data: [100, 100, 100, 100, 100, 100],
        backgroundColor: 'rgba(0,230,220,0.03)',
        borderColor: 'rgba(0,230,220,0.25)',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: c.text, font: { family: 'JetBrains Mono', size: 11 }, padding: 16 } },
        tooltip: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, titleColor: c.primary, bodyColor: c.text }
      },
      scales: {
        r: {
          grid: { color: c.grid },
          ticks: { color: c.text, backdropColor: 'transparent', font: { family: 'JetBrains Mono', size: 9 }, stepSize: 25 },
          pointLabels: { color: c.text, font: { family: 'JetBrains Mono', size: 11 } },
          suggestedMin: 0, suggestedMax: 100,
          angleLines: { color: c.grid },
        }
      }
    }
  });
}

async function renderSubjectChart() {
  const canvas = document.getElementById('subjectChart');
  if (!canvas) return;
  if (App.charts.subject) App.charts.subject.destroy();
  const c = getChartColors();

  const subjects = { Physics: 0, Chemistry: 0, Mathematics: 0, Biology: 0, Other: 0 };
  try {
    const snap = await db.collection('users').doc(App.currentUser.uid)
      .collection('pointLogs').where('type', 'in', ['TEST_PASS', 'TEST_PERFECT']).get();
    snap.docs.forEach(d => {
      const reason = d.data().reason || '';
      if (reason.includes('Physics'))     subjects.Physics++;
      else if (reason.includes('Chem'))   subjects.Chemistry++;
      else if (reason.includes('Math'))   subjects.Mathematics++;
      else if (reason.includes('Bio'))    subjects.Biology++;
      else                                subjects.Other++;
    });
  } catch(e) {}

  const total = Object.values(subjects).reduce((a,b) => a+b, 0);
  const data = total > 0 ? Object.values(subjects) : [30, 25, 28, 12, 5];

  App.charts.subject = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: Object.keys(subjects),
      datasets: [{
        data,
        backgroundColor: ['#ffd100', '#00e6dc', '#a855f7', '#f43f5e', '#6b7a8e'],
        borderColor: c.surface,
        borderWidth: 3,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { color: c.text, font: { family: 'JetBrains Mono', size: 11 }, padding: 16, boxWidth: 12, boxHeight: 12 } },
        tooltip: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, titleColor: c.primary, bodyColor: c.text, cornerRadius: 10, padding: 12 }
      }
    }
  });
}

async function renderPointsHistoryChart() {
  const canvas = document.getElementById('pointsHistoryChart');
  if (!canvas) return;
  if (App.charts.pointsHistory) App.charts.pointsHistory.destroy();
  const c = getChartColors();

  // Build 30-day date buckets
  const labels = [];
  const dayMap = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toDateString();
    const label = d.getDate() + '/' + (d.getMonth() + 1);
    labels.push(label);
    dayMap[key] = 0;
  }
  const dayKeys = Object.keys(dayMap);

  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const logsSnap = await db.collection('users').doc(App.currentUser.uid)
      .collection('pointLogs')
      .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(since))
      .orderBy('timestamp', 'asc')
      .get();

    logsSnap.docs.forEach(d => {
      const log = d.data();
      const dayKey = log.timestamp?.toDate()?.toDateString();
      if (dayKey && dayMap.hasOwnProperty(dayKey)) dayMap[dayKey] += log.amount || 0;
    });
  } catch (e) {
    // use estimated data
    const avg = Math.round((App.userProfile?.totalPoints || 0) / 30);
    dayKeys.forEach(k => { dayMap[k] = Math.max(0, avg + Math.round((Math.random() - 0.3) * avg)); });
  }

  // Cumulative sum
  let cumsum = 0;
  const startPoints = Math.max(0, (App.userProfile?.totalPoints || 0) - Object.values(dayMap).reduce((a,b) => a+b, 0));
  cumsum = startPoints;
  const cumData = dayKeys.map(k => { cumsum += dayMap[k]; return cumsum; });

  App.charts.pointsHistory = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Cumulative Points',
        data: cumData,
        borderColor: '#ffd100',
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, 'rgba(255,209,0,0.18)');
          gradient.addColorStop(1, 'rgba(255,209,0,0.0)');
          return gradient;
        },
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#ffd100',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.surface, borderColor: c.border, borderWidth: 1,
          titleColor: c.primary, bodyColor: c.text, cornerRadius: 10, padding: 12,
          callbacks: {
            label: (ctx) => ' ' + ctx.parsed.y.toLocaleString() + ' pts'
          }
        }
      },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.text, font: { size: 10, family: 'JetBrains Mono' }, maxTicksLimit: 10 } },
        y: {
          grid: { color: c.grid },
          ticks: { color: c.text, font: { size: 10, family: 'JetBrains Mono' },
            callback: (v) => v >= 1000 ? (v/1000).toFixed(1) + 'k' : v
          }
        }
      }
    }
  });
}

// ─── ADMIN: STUDENTS ─────────────────────────────────────────
async function renderStudents() {
  if (!App.isAdmin || !App.userProfile?.instituteId) return;
  const container = document.getElementById('studentsTableBody');
  const totalEl   = document.getElementById('totalStudentsCount');
  const alertEl   = document.getElementById('dropRiskList');

  if (container) container.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px"><div class="spinner"></div></td></tr>`;

  try {
    const snap = await db.collection('users')
      .where('instituteId', '==', App.userProfile.instituteId)
      .where('role', '==', 'student')
      .orderBy('totalPoints', 'desc').get();

    const students = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    if (totalEl) totalEl.textContent = students.length;

    // Drop-risk
    const atRisk = students.filter(s => (s.streak || 0) < 3 || (s.weeklyPoints || 0) === 0);
    if (alertEl) {
      if (atRisk.length > 0) {
        alertEl.innerHTML = atRisk.map(s => `
          <div class="drop-risk-alert mb-3">
            <div class="alert-icon">${icon('alert-triangle', 16)}</div>
            <div>
              <div class="text-sm font-bold">${s.name}</div>
              <div class="text-xs text-muted">Streak: ${s.streak||0} days · Weekly: ${s.weeklyPoints||0} pts</div>
            </div>
            <button class="btn btn-sm btn-ghost" style="margin-left:auto" onclick="nudgeStudent('${s.uid}','${s.name}')">
              ${icon('bell', 12)} Nudge
            </button>
          </div>
        `).join('');
      } else {
        alertEl.innerHTML = `
          <div class="flex items-center gap-3 text-sm" style="padding:12px 0;color:var(--green)">
            ${icon('check-circle-2', 16)} All students are active this week!
          </div>`;
      }
    }

    if (!students.length) {
      if (container) container.innerHTML = `<tr><td colspan="7"><div class="empty-state">
        <div class="empty-icon">${icon('users', 22)}</div>
        <div class="empty-title">No students yet</div>
        <div class="empty-desc">Share your institute code to get started</div>
      </div></td></tr>`;
      reIcons(); return;
    }

    if (container) container.innerHTML = students.map((s, i) => {
      const consistency = Math.min(100, Math.round(((s.attendanceCount||0) / 30) * 100));
      const riskLevel = (s.streak||0) < 3 ? 'badge-red' : (s.streak||0) < 7 ? 'badge-yellow' : 'badge-green';

      const avatarHtml = s.avatar
        ? `<img src="${s.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--border-dim)" onerror="this.parentElement.innerHTML='${(s.name||'?')[0].toUpperCase()}'">`
        : `<span style="font-size:13px;font-weight:700;font-family:var(--font-mono)">${(s.name||'?')[0].toUpperCase()}</span>`;

      return `
        <tr>
          <td><span class="mono text-secondary font-bold">#${i+1}</span></td>
          <td>
            <div class="flex items-center gap-3">
              <div class="user-avatar" style="width:34px;height:34px">${avatarHtml}</div>
              <div>
                <div class="text-sm font-bold">${s.name}</div>
                <div class="text-xs text-muted">${s.email}</div>
              </div>
            </div>
          </td>
          <td><span class="mono text-yellow font-bold">${(s.totalPoints||0).toLocaleString()}</span></td>
          <td><span class="mono text-secondary">${formatHours(s.studyHours||0)}</span></td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;min-width:120px">
              <div class="progress-bar" style="flex:1">
                <div class="progress-fill ${consistency > 70 ? 'green' : consistency > 40 ? 'yellow' : 'red'}" style="width:${consistency}%"></div>
              </div>
              <span class="text-xs mono">${consistency}%</span>
            </div>
          </td>
          <td>
            <span class="badge ${riskLevel}">
              ${icon('flame', 10)} ${s.streak||0}d
            </span>
          </td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-sm" onclick="addPointsModal('${s.uid}','${s.name}')">
                ${icon('star', 12)} Pts
              </button>
              <button class="btn btn-ghost btn-sm" onclick="viewStudentDetail('${s.uid}')">
                ${icon('eye', 12)} View
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    renderInstituteStats(students);
    reIcons();
  } catch(e) {
    if (container) container.innerHTML = `<tr><td colspan="7" class="text-muted text-sm" style="padding:24px;text-align:center">${e.message}</td></tr>`;
  }
}

function renderInstituteStats(students) {
  const totalPts = students.reduce((s, u) => s + (u.totalPoints||0), 0);
  const totalHrs = students.reduce((s, u) => s + (u.studyHours||0), 0);
  const avgPts   = students.length ? Math.round(totalPts / students.length) : 0;

  const hoursEl = document.getElementById('instTotalStudyHours');
  const avgEl   = document.getElementById('instAvgPoints');
  if (hoursEl) hoursEl.textContent = formatHours(totalHrs);
  if (avgEl)   avgEl.textContent   = avgPts.toLocaleString();

  setTimeout(renderInstituteChart, 100);
}

function renderInstituteChart() {
  const canvas = document.getElementById('instituteChart');
  if (!canvas) return;
  if (App.charts.institute) App.charts.institute.destroy();
  const c = getChartColors();

  App.charts.institute = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      datasets: [{
        label: 'Avg Study Hours',
        data: [2.8, 3.5, 3.1, 4.2],
        backgroundColor: 'rgba(255,209,0,0.65)',
        borderColor: '#ffd100',
        borderWidth: 1,
        borderRadius: 5,
      }, {
        label: 'Avg Sessions',
        data: [8, 11, 9, 14],
        backgroundColor: 'rgba(0,230,220,0.45)',
        borderColor: '#00e6dc',
        borderWidth: 1,
        borderRadius: 5,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: c.text, font: { family: 'JetBrains Mono', size: 11 } } }
      },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.text, font: { family: 'JetBrains Mono', size: 11 } } },
        y: { grid: { color: c.grid }, ticks: { color: c.text, font: { family: 'JetBrains Mono', size: 11 } } }
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
  showToast(`Nudge sent to ${name}`, 'success');
}

function viewStudentDetail(uid) {
  showToast('Student detail view coming soon', 'info');
}

// ─── CERTIFICATES (jsPDF) ─────────────────────────────────────
async function generateCertificate() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const name  = App.userProfile?.name || 'Student';
  const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  // Background
  doc.setFillColor(6, 8, 16);
  doc.rect(0, 0, 297, 210, 'F');

  // Yellow gradient border
  doc.setDrawColor(255, 209, 0);
  doc.setLineWidth(0.5);
  doc.rect(8, 8, 281, 194);
  doc.rect(10, 10, 277, 190);

  // Cyan accent corners
  doc.setDrawColor(0, 230, 220);
  doc.setLineWidth(2);
  const corners = [[13, 13], [284, 13], [13, 197], [284, 197]];
  corners.forEach(([x, y]) => {
    doc.line(x, y, x + (x < 150 ? 16 : -16), y);
    doc.line(x, y, x, y + (y < 100 ? 16 : -16));
  });

  // Header
  doc.setFontSize(9);
  doc.setTextColor(255, 209, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('RANKFORGE ACADEMY', 148.5, 33, { align: 'center' });

  doc.setFontSize(6.5);
  doc.setTextColor(100, 120, 140);
  doc.text('EXCELLENCE IN COMPETITIVE STUDY', 148.5, 40, { align: 'center' });

  // Divider
  doc.setDrawColor(255, 209, 0);
  doc.setLineWidth(0.25);
  doc.line(60, 44, 237, 44);

  // Main title
  doc.setFontSize(30);
  doc.setTextColor(241, 245, 249);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICATE', 148.5, 70, { align: 'center' });

  doc.setFontSize(11);
  doc.setTextColor(138, 149, 168);
  doc.setFont('helvetica', 'normal');
  doc.text('OF COMPLETION', 148.5, 79, { align: 'center' });

  // Subtitle
  doc.setFontSize(8);
  doc.setTextColor(138, 149, 168);
  doc.text('This is to certify that', 148.5, 94, { align: 'center' });

  // Name
  doc.setFontSize(26);
  doc.setTextColor(255, 209, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(name.toUpperCase(), 148.5, 113, { align: 'center' });

  // Name underline (cyan)
  const nameWidth = doc.getTextWidth(name.toUpperCase());
  doc.setDrawColor(0, 230, 220);
  doc.setLineWidth(0.4);
  doc.line(148.5 - nameWidth/2, 117, 148.5 + nameWidth/2, 117);

  // Description
  doc.setFontSize(8.5);
  doc.setTextColor(138, 149, 168);
  doc.setFont('helvetica', 'normal');
  doc.text('has successfully completed the', 148.5, 127, { align: 'center' });

  doc.setFontSize(13);
  doc.setTextColor(0, 230, 220);
  doc.setFont('helvetica', 'bold');
  doc.text(`30-DAY RANK SPRINT — ${month.toUpperCase()}`, 148.5, 138, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(138, 149, 168);
  doc.setFont('helvetica', 'normal');
  doc.text('demonstrating exceptional consistency, discipline, and commitment to academic excellence.', 148.5, 148, { align: 'center' });

  // Stats row
  const stats = [
    { label: 'SESSIONS', value: '90+' },
    { label: 'DAYS COMPLETED', value: '30/30' },
    { label: 'POINTS EARNED', value: (App.userProfile?.monthlyPoints || 0).toLocaleString() },
  ];

  stats.forEach((s, i) => {
    const x = 74 + i * 75;
    doc.setFillColor(21, 28, 44);
    doc.roundedRect(x - 26, 157, 52, 22, 3, 3, 'F');
    doc.setDrawColor(255, 209, 0);
    doc.setLineWidth(0.2);
    doc.roundedRect(x - 26, 157, 52, 22, 3, 3, 'S');
    doc.setFontSize(14);
    doc.setTextColor(255, 209, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(s.value, x, 169, { align: 'center' });
    doc.setFontSize(5.5);
    doc.setTextColor(100, 120, 140);
    doc.setFont('helvetica', 'normal');
    doc.text(s.label, x, 175, { align: 'center' });
  });

  // Footer
  doc.setFontSize(6.5);
  doc.setTextColor(74, 85, 104);
  doc.text(
    `Generated: ${new Date().toLocaleDateString('en-IN')} · Certificate ID: RF-${Date.now().toString(36).toUpperCase()} · rankforge.app`,
    148.5, 192, { align: 'center' }
  );

  // Save as PDF (no Firebase Storage needed — Cloudinary handles media)
  doc.save(`RankForge-Certificate-${name}-${month}.pdf`);
  showToast('Certificate downloaded!', 'success');
}

// ─── PROFILE ──────────────────────────────────────────────────
async function renderProfile() {
  const p = App.userProfile;
  if (!p) return;

  // Hero section
  const nameEl  = document.getElementById('profileName');
  const emailEl = document.getElementById('profileEmail');
  const roleEl  = document.getElementById('profileRoleBadge');

  if (nameEl)  nameEl.textContent  = p.name || 'User';
  if (emailEl) emailEl.textContent = App.currentUser?.email || '';
  if (roleEl)  roleEl.innerHTML    = `${icon('shield', 10)} ${p.role === 'admin' ? 'Admin' : 'Student'}`;

  // Stats
  document.getElementById('profilePoints').textContent = (p.totalPoints || 0).toLocaleString();
  document.getElementById('profileStreak').textContent  = `${p.streak || 0} days`;
  document.getElementById('profileHours').textContent   = formatHours(p.studyHours || 0);

  // Profile avatar
  const avatarEl = document.getElementById('profileAvatar');
  if (avatarEl) {
    if (p.avatar) {
      avatarEl.innerHTML = `<img src="${p.avatar}" alt="${p.name || 'Avatar'}">`;
    } else {
      avatarEl.innerHTML = `<span>${(p.name || 'U')[0].toUpperCase()}</span>`;
    }
  }

  // Info rows
  const infoName  = document.getElementById('infoName');
  const infoEmail = document.getElementById('infoEmail');
  const infoRole  = document.getElementById('infoRole');
  const infoInst  = document.getElementById('infoInstitute');
  const editName  = document.getElementById('editName');

  if (infoName)  infoName.textContent  = p.name || '—';
  if (infoEmail) infoEmail.textContent = App.currentUser?.email || '—';
  if (infoRole)  infoRole.textContent  = p.role === 'admin' ? 'Institute Admin' : 'Student';
  if (editName)  editName.value        = p.name || '';

  // Load institute name
  if (infoInst && p.instituteId) {
    try {
      const instDoc = await db.collection('institutes').doc(p.instituteId).get();
      infoInst.textContent = instDoc.exists ? (instDoc.data().name || 'Your Institute') : 'Unknown Institute';
    } catch(e) {
      infoInst.textContent = 'Unable to load';
    }
  } else if (infoInst) {
    infoInst.textContent = 'Not linked';
  }

  reIcons();
}

// ─── ADMIN: INSTITUTE CODE ────────────────────────────────────
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
  navigator.clipboard.writeText(code).then(() => showToast('Code copied to clipboard!', 'success'));
}

// ─── STAFF APPLICATION PAGE ───────────────────────────────────
async function renderStaffApply() {
  const container = document.getElementById('staffApplyContent');
  if (!container) return;

  // Check if hiring is open (stored in Firestore or localStorage for now)
  let hiringOpen = true;
  try {
    const doc = await db.collection('settings').doc('hiring').get();
    if (doc.exists) hiringOpen = doc.data().open !== false;
  } catch(e) { /* use default */ }

  if (App.isAdmin) {
    // Admin sees all applications
    renderStaffApplications();
    return;
  }

  if (!hiringOpen) {
    container.innerHTML = `
      <div style="max-width:560px;margin:0 auto;text-align:center;padding:40px 0">
        <div style="width:72px;height:72px;background:var(--red-dim);border:2px solid rgba(244,63,94,0.25);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:var(--red)">
          ${icon('x-circle', 32)}
        </div>
        <h2 style="margin-bottom:10px">Staff Hiring Closed</h2>
        <p class="text-secondary" style="margin-bottom:24px;line-height:1.7">
          We are not currently accepting staff applications.<br>
          Check back later or contact the administration directly.
        </p>
        <div class="tip-box" style="text-align:left">
          <div class="tip-box-title">${icon('info', 12)} When applications reopen</div>
          <div class="tip-box-body">The admin team controls when hiring is open. You will see an application form here when positions become available.</div>
        </div>
      </div>`;
    reIcons();
    return;
  }

  // Show application form
  container.innerHTML = `
    <div style="max-width:560px;margin:0 auto">
      <div class="staff-apply-hero" style="margin-bottom:24px">
        <div class="staff-apply-icon">${icon('briefcase', 32)}</div>
        <div style="position:relative">
          <div style="display:inline-flex;align-items:center;gap:8px;background:var(--green-dim);border:1px solid rgba(34,197,94,0.2);border-radius:20px;padding:4px 12px;font-size:0.65rem;font-family:var(--font-mono);font-weight:700;color:var(--green);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px">
            ${icon('check-circle-2', 10)} Hiring Open
          </div>
          <h2 style="margin-bottom:8px">Join Our Team</h2>
          <p class="text-secondary" style="font-size:0.85rem;line-height:1.6">
            Apply to become a staff member. Your application will be reviewed and you will be notified on approval.
          </p>
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-4">${icon('file-text', 14)} Staff Application Form</div>

        <div class="form-group">
          <label class="form-label">Full Name</label>
          <div class="input-wrap">${icon('user', 14)}
            <input id="saName" type="text" class="form-input" placeholder="Your full name" value="${App.userProfile?.name || ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <div class="input-wrap">${icon('mail', 14)}
            <input id="saEmail" type="email" class="form-input" placeholder="your@email.com" value="${App.userProfile?.email || App.currentUser?.email || ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <div class="input-wrap">${icon('phone', 14)}
            <input id="saPhone" type="tel" class="form-input" placeholder="+91 98765 43210">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Role Applying For</label>
          <div class="input-wrap">${icon('briefcase', 14)}
            <select id="saRole" class="form-input" style="padding-left:36px">
              <option value="Admin">Admin — Manage students & sessions</option>
              <option value="Co-Admin">Co-Admin — Assist admin</option>
              <option value="Moderator">Moderator — Monitor sessions</option>
              <option value="Content">Content Creator — Study material</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Why do you want to join? (optional)</label>
          <textarea id="saMessage" class="form-input" rows="3"
            placeholder="Tell us about your experience and why you want to join RankForge staff..."
            style="resize:vertical;padding-top:10px;padding-left:14px"></textarea>
        </div>

        <button class="btn btn-primary w-full" onclick="submitStaffApplication()">
          ${icon('send', 14)} Submit Application
        </button>
      </div>
    </div>`;
  reIcons();
}

async function submitStaffApplication() {
  const name    = document.getElementById('saName')?.value.trim();
  const email   = document.getElementById('saEmail')?.value.trim();
  const phone   = document.getElementById('saPhone')?.value.trim();
  const role    = document.getElementById('saRole')?.value;
  const message = document.getElementById('saMessage')?.value.trim();
  const btn     = document.querySelector('#staffApplyContent .btn-primary');

  if (!name || !email) { showToast('Name and email are required', 'warning'); return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'; }

  try {
    const uid = App.currentUser?.uid || 'guest-' + Date.now();
    await db.collection('staffApplications').doc(uid).set({
      uid, name, email, phone, roleApplied: role, message,
      status: 'pending',
      appliedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Update user role to pending if logged in
    if (App.currentUser) {
      await db.collection('users').doc(App.currentUser.uid).update({
        role: 'pending_admin', roleApplied: role, phone
      });
    }

    // Discord notification
    await notifyDiscordAdmin({ uid, name, email, phone, roleApplied: role });

    document.getElementById('staffApplyContent').innerHTML = `
      <div style="max-width:480px;margin:0 auto;text-align:center;padding:60px 20px">
        <div style="width:80px;height:80px;background:var(--green-dim);border:2px solid rgba(34,197,94,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;color:var(--green)">
          ${icon('check-circle-2', 36)}
        </div>
        <h2 style="margin-bottom:10px">Application Submitted!</h2>
        <p class="text-secondary" style="margin-bottom:28px;line-height:1.7">
          Your application has been submitted successfully.<br>
          The admin team has been notified and will review your application.
          You will be updated once a decision is made.
        </p>
        <div class="tip-box">
          <div class="tip-box-title">${icon('message-circle', 12)} What happens next?</div>
          <div class="tip-box-body">The admin team receives your application instantly. Decisions are usually made within 24 hours. Log back in to check your status.</div>
        </div>
      </div>`;
    reIcons();
    showToast('Application submitted!', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = icon('send', 14) + ' Submit Application'; reIcons(); }
  }
}

// ─── ADMIN: View Staff Applications ──────────────────────────
async function renderStaffApplications() {
  const container = document.getElementById('staffApplyContent');
  if (!container) return;

  container.innerHTML = `
    <div class="page-header">
      <h2>Staff Applications</h2>
      <p>Review and manage incoming staff applications</p>
    </div>
    <div id="staffAppsList"><div class="card" style="text-align:center;padding:40px"><div class="spinner"></div></div></div>`;

  try {
    const snap = await db.collection('staffApplications').orderBy('appliedAt', 'desc').get();
    const list = document.getElementById('staffAppsList');

    if (snap.empty) {
      list.innerHTML = `<div class="card"><div class="empty-state">
        ${icon('briefcase', 24)}
        <div class="empty-title">No applications yet</div>
        <div class="empty-desc">Staff applications will appear here when submitted</div>
      </div></div>`;
      reIcons(); return;
    }

    const statusColor = { pending: 'badge-yellow', approved: 'badge-green', rejected: 'badge-red' };

    list.innerHTML = snap.docs.map(d => {
      const a = d.data();
      return `
        <div class="card mb-3">
          <div class="flex items-center justify-between" style="gap:16px">
            <div class="flex items-center gap-3">
              <div class="user-avatar" style="width:44px;height:44px;font-size:16px">${(a.name||'?')[0].toUpperCase()}</div>
              <div>
                <div style="font-weight:700;margin-bottom:2px">${a.name || 'Unknown'}</div>
                <div class="text-xs text-muted">${a.email} · ${a.phone || 'No phone'}</div>
                <div style="margin-top:4px">
                  <span class="badge badge-cyan" style="margin-right:6px">${a.roleApplied || 'Admin'}</span>
                  <span class="badge ${statusColor[a.status] || 'badge-muted'}">${a.status || 'pending'}</span>
                </div>
              </div>
            </div>
            ${a.status === 'pending' ? `
            <div class="flex gap-2" style="flex-shrink:0">
              <button class="btn btn-sm" style="background:var(--green-dim);color:var(--green);border:1px solid rgba(34,197,94,0.2)"
                onclick="approveStaff('${d.id}','${a.name}','${a.roleApplied||'Admin'}')">
                ${icon('check', 12)} Approve
              </button>
              <button class="btn btn-sm btn-danger" onclick="rejectStaff('${d.id}','${a.name}')">
                ${icon('x', 12)} Reject
              </button>
            </div>` : `<span class="badge ${statusColor[a.status]}">${a.status}</span>`}
          </div>
          ${a.message ? `<div class="text-xs text-muted" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-dim)">${a.message}</div>` : ''}
        </div>`;
    }).join('');
    reIcons();
  } catch (e) {
    document.getElementById('staffAppsList').innerHTML = `<div class="card text-muted text-sm" style="padding:24px">${e.message}</div>`;
  }
}

async function approveStaff(uid, name, role) {
  try {
    // Set role to admin
    await db.collection('users').doc(uid).update({ role: 'admin' });

    // Create institute for them
    const instRef = await db.collection('institutes').add({
      name: name + "'s Institute",
      code: generateInstCode(),
      ownerUid: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      totalStudents: 0,
    });
    await db.collection('users').doc(uid).update({ instituteId: instRef.id });

    // Update application status
    await db.collection('staffApplications').doc(uid).update({ status: 'approved', approvedAt: firebase.firestore.FieldValue.serverTimestamp() });

    showToast(`${name} approved as ${role}!`, 'success');
    renderStaffApplications();
  } catch (e) {
    showToast('Approval failed: ' + e.message, 'error');
  }
}

async function rejectStaff(uid, name) {
  try {
    await db.collection('users').doc(uid).update({ role: 'rejected' });
    await db.collection('staffApplications').doc(uid).update({ status: 'rejected' });
    showToast(`${name}'s application rejected.`, 'info');
    renderStaffApplications();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ─── ADMIN: Toggle Staff Hiring ───────────────────────────────
async function toggleStaffHiring() {
  try {
    const doc = await db.collection('settings').doc('hiring').get();
    const currentlyOpen = doc.exists ? doc.data().open !== false : true;
    const newState = !currentlyOpen;

    await db.collection('settings').doc('hiring').set({ open: newState });

    const badge = document.getElementById('hiringStatusBadge');
    if (badge) {
      badge.textContent = newState ? 'OPEN' : 'CLOSED';
      badge.className = 'nav-badge ' + (newState ? 'green' : '');
      if (!newState) badge.style.background = 'var(--red-dim)'; else badge.style.background = '';
    }

    showToast(`Staff hiring is now ${newState ? 'OPEN' : 'CLOSED'}`, newState ? 'success' : 'info');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ─── ADMIN: Institute Code ────────────────────────────────────
async function showInstituteCode() {
  if (!App.isAdmin || !App.userProfile?.instituteId) return;
  try {
    const doc = await db.collection('institutes').doc(App.userProfile.instituteId).get();
    const code = doc.data()?.code || 'N/A';
    document.getElementById('instituteCodeDisplay').textContent = code;
    document.getElementById('instituteCodeModal').classList.add('open');
  } catch (e) { showToast('Error fetching code', 'error'); }
}

function copyInstCode() {
  const code = document.getElementById('instituteCodeDisplay').textContent;
  navigator.clipboard.writeText(code).then(() => showToast('Code copied!', 'success'));
}

// ─── PROFILE: Save Changes ────────────────────────────────────
async function saveProfileChanges() {
  const newName = document.getElementById('editName')?.value.trim();
  if (!newName) { showToast('Name cannot be empty', 'warning'); return; }
  const btn = document.getElementById('saveProfileBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'; }
  try {
    await db.collection('users').doc(App.currentUser.uid).update({ name: newName });
    await App.currentUser.updateProfile({ displayName: newName });
    App.userProfile.name = newName;
    updateSidebarUser();
    document.getElementById('profileName').textContent = newName;
    showToast('Profile updated!', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
  if (btn) { btn.disabled = false; btn.innerHTML = icon('save', 14) + ' Save Changes'; reIcons(); }
}

// ─── Render Sprint Month Label ────────────────────────────────
function updateSprintLabel() {
  const el = document.getElementById('sprintMonthLabel');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  }
}

// ─── DISCORD STUDY STATS ──────────────────────────────────────
async function renderDiscordStudy() {
  const container = document.getElementById('discordContent');
  if (!container) return;

  const discordId = App.userProfile?.discordId;

  // Show connect prompt if not linked
  if (!discordId) {
    container.innerHTML = `
      <div class="discord-connect-card card" style="text-align:center;padding:60px 40px;max-width:560px;margin:0 auto;position:relative;overflow:hidden">
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse 80% 50% at 50% 0%,rgba(88,101,242,0.08),transparent 70%);pointer-events:none"></div>
        <div style="position:relative">
          <div style="width:80px;height:80px;background:rgba(88,101,242,0.12);border:2px solid rgba(88,101,242,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;box-shadow:0 0 40px rgba(88,101,242,0.2)">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="#7289da"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.012.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
          </div>
          <h2 style="margin-bottom:10px">Link Your Discord Account</h2>
          <p class="text-muted" style="font-size:0.88rem;line-height:1.7;margin-bottom:28px">
            Connect your Discord account to view your VC study hours tracked by the Ascend Hub bot — including challenge history, weekly leaderboards, and total study time.
          </p>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px">
            <div style="background:var(--bg-elevated);border:1px solid var(--border-dim);border-radius:var(--radius-md);padding:16px;text-align:center">
              <div style="font-size:1.4rem;font-weight:800;font-family:var(--font-mono);color:#7289da">VC</div>
              <div class="text-xs text-muted" style="margin-top:4px">Study Rooms</div>
            </div>
            <div style="background:var(--bg-elevated);border:1px solid var(--border-dim);border-radius:var(--radius-md);padding:16px;text-align:center">
              <div style="font-size:1.4rem;font-weight:800;font-family:var(--font-mono);color:var(--yellow)">⏱️</div>
              <div class="text-xs text-muted" style="margin-top:4px">Hours Tracked</div>
            </div>
            <div style="background:var(--bg-elevated);border:1px solid var(--border-dim);border-radius:var(--radius-md);padding:16px;text-align:center">
              <div style="font-size:1.4rem;font-weight:800;font-family:var(--font-mono);color:var(--cyan)">🏆</div>
              <div class="text-xs text-muted" style="margin-top:4px">Challenges</div>
            </div>
          </div>
          <button class="discord-btn" style="max-width:300px;margin:0 auto" onclick="loginDiscord()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.012.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
            Connect Discord Account
          </button>
        </div>
      </div>`;
    reIcons();
    return;
  }

  // Discord linked — load challenge data
  container.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div></div>`;

  try {
    // Load all challenges that this user participated in
    const snap = await db.collection('challenges').get();
    const allChallenges = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const myChallenges  = allChallenges.filter(c => c.participants?.[discordId]);

    // Compute totals across all challenges
    let totalMinutes = 0;
    myChallenges.forEach(c => {
      totalMinutes += c.participants[discordId]?.studyMinutes || 0;
    });
    const totalHours = (totalMinutes / 60).toFixed(1);

    // Active challenges (not ended)
    const activeChallenges = myChallenges.filter(c => c.status === 'active');

    // Build leaderboard rank for active challenges
    const activeChallengeDetails = activeChallenges.map(c => {
      const parts = Object.entries(c.participants || {})
        .sort((a,b) => (b[1].studyMinutes||0) - (a[1].studyMinutes||0));
      const rank = parts.findIndex(([uid]) => uid === discordId) + 1;
      const myMins = c.participants[discordId]?.studyMinutes || 0;
      return { ...c, myMins, rank, total: parts.length };
    });

    // Past challenges
    const pastChallenges = myChallenges.filter(c => c.status === 'ended').map(c => {
      const parts = Object.entries(c.participants || {})
        .sort((a,b) => (b[1].studyMinutes||0) - (a[1].studyMinutes||0));
      const rank = parts.findIndex(([uid]) => uid === discordId) + 1;
      return { ...c, rank, myMins: c.participants[discordId]?.studyMinutes || 0, total: parts.length };
    });

    // Build global leaderboard across ALL challenges
    const globalMap = {};
    allChallenges.forEach(c => {
      Object.entries(c.participants || {}).forEach(([uid, data]) => {
        if (!globalMap[uid]) globalMap[uid] = 0;
        globalMap[uid] += data.studyMinutes || 0;
      });
    });
    const globalLb = Object.entries(globalMap)
      .sort((a,b) => b[1] - a[1]).slice(0, 10);
    const myGlobalRank = Object.entries(globalMap)
      .sort((a,b) => b[1] - a[1])
      .findIndex(([uid]) => uid === discordId) + 1;

    container.innerHTML = `
      <!-- Discord Identity Card -->
      <div class="discord-profile-card mb-6">
        <div class="dp-avatar">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#7289da"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.012.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
        </div>
        <div class="dp-info">
          <div class="dp-name">@${App.userProfile.discordUsername}</div>
          <div class="dp-id">ID: ${discordId}</div>
        </div>
        <div class="dp-stats">
          <div class="dp-stat">
            <div class="dp-stat-val">${totalHours}h</div>
            <div class="dp-stat-lbl">Total Study</div>
          </div>
          <div class="dp-stat">
            <div class="dp-stat-val">${myChallenges.length}</div>
            <div class="dp-stat-lbl">Challenges</div>
          </div>
          <div class="dp-stat">
            <div class="dp-stat-val">${myGlobalRank > 0 ? '#'+myGlobalRank : '—'}</div>
            <div class="dp-stat-lbl">Global Rank</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="loginDiscord()" style="flex-shrink:0">
          <i data-lucide="edit-3"></i> Edit
        </button>
      </div>

      <!-- Active Challenges -->
      ${activeChallengeDetails.length ? `
      <div class="mb-6">
        <div class="section-heading">
          <span class="live-dot">ACTIVE</span>
          Active Challenges
        </div>
        <div class="dc-challenges-grid">
          ${activeChallengeDetails.map(c => `
            <div class="dc-challenge-card active">
              <div class="dc-ch-header">
                <div>
                  <div class="dc-ch-title">${c.title}</div>
                  <div class="dc-ch-sub">Ends <span class="mono">${new Date(c.endAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</span></div>
                </div>
                <span class="badge badge-green">Active</span>
              </div>
              <div class="dc-ch-stats">
                <div class="dc-ch-stat" style="color:var(--yellow)">
                  <div class="dc-ch-val">${(c.myMins/60).toFixed(1)}h</div>
                  <div class="dc-ch-lbl">Study Time</div>
                </div>
                <div class="dc-ch-stat" style="color:var(--cyan)">
                  <div class="dc-ch-val">${c.rank > 0 ? '#'+c.rank : '—'}</div>
                  <div class="dc-ch-lbl">Your Rank</div>
                </div>
                <div class="dc-ch-stat" style="color:var(--text-secondary)">
                  <div class="dc-ch-val">${c.total}</div>
                  <div class="dc-ch-lbl">Participants</div>
                </div>
              </div>
              <div class="progress-bar" style="margin-top:10px">
                <div class="progress-fill" style="width:${Math.min(100,Math.round((c.myMins/(c.total*c.myMins||1))*100*c.total/c.total))}%;background:linear-gradient(90deg,#5865f2,#7289da)"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>` : `
      <div class="card mb-6" style="text-align:center;padding:32px">
        <div class="empty-state">
          <div class="empty-icon"><i data-lucide="target" style="width:28px;height:28px;opacity:0.4"></i></div>
          <div class="empty-title">No active challenges</div>
          <div class="empty-desc">Join a Discord challenge via the bot to start tracking</div>
        </div>
      </div>`}

      <!-- Global Leaderboard -->
      <div class="grid-2 mb-6" style="gap:22px">
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#7289da" style="flex-shrink:0"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.012.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
              Global Study Leaderboard
            </div>
            <span class="text-xs text-muted mono">All Challenges</span>
          </div>
          ${globalLb.length ? `
          <div>
            ${globalLb.map(([uid, mins], i) => {
              const isMe = uid === discordId;
              const hrs = (mins/60).toFixed(1);
              const medals = ['🥇','🥈','🥉'];
              return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border-dim);${isMe?'background:rgba(88,101,242,0.06);margin:0 -8px;padding:9px 8px;border-radius:var(--radius-sm)':''}">
                <span style="font-size:${i<3?'1.1rem':'0.75rem'};font-family:var(--font-mono);font-weight:700;color:${i===0?'#ffd100':i===1?'#94a3b8':i===2?'#cd7f32':'var(--text-muted)'};min-width:28px">${i<3?medals[i]:'#'+(i+1)}</span>
                <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${uid.slice(0,6)}...${isMe?' <span class="badge badge-muted" style="font-size:0.5rem">You</span>':''}</span>
                <span style="font-family:var(--font-mono);font-size:0.8rem;font-weight:700;color:#7289da">${hrs}h</span>
              </div>`;
            }).join('')}
          </div>` : `<div class="empty-state" style="padding:24px"><div class="empty-desc">No data yet</div></div>`}
        </div>

        <!-- Weekly chart -->
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="bar-chart-2"></i> Challenge History</div>
          </div>
          ${pastChallenges.length ? `
          <div>
            ${pastChallenges.slice(0,6).map(c => `
              <div style="padding:10px 0;border-bottom:1px solid var(--border-dim)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <div>
                    <div style="font-size:0.8rem;font-weight:600">${c.title}</div>
                    <div class="text-xs text-muted mono">${new Date(c.endAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="font-family:var(--font-mono);font-size:0.85rem;font-weight:700;color:#7289da">${(c.myMins/60).toFixed(1)}h</div>
                    <div class="text-xs text-muted">Rank #${c.rank}/${c.total}</div>
                  </div>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${Math.min(100,Math.round((c.myMins/60)/50*100))}%;background:linear-gradient(90deg,#5865f2,#7289da)"></div>
                </div>
              </div>
            `).join('')}
          </div>` : `<div class="empty-state" style="padding:24px"><div class="empty-desc">No completed challenges yet</div></div>`}
        </div>
      </div>

      <!-- All Challenges Table -->
      ${allChallenges.length ? `
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="list-ordered"></i> All Challenges</div>
          <span class="badge" style="background:rgba(88,101,242,0.12);color:#7289da">${allChallenges.length} Total</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Challenge</th>
              <th>Status</th>
              <th>Participants</th>
              <th>Duration</th>
              <th>Your Time</th>
              <th>Your Rank</th>
            </tr></thead>
            <tbody>
              ${allChallenges.map(c => {
                const parts = Object.entries(c.participants||{}).sort((a,b)=>(b[1].studyMinutes||0)-(a[1].studyMinutes||0));
                const rank = parts.findIndex(([uid])=>uid===discordId)+1;
                const myMins = c.participants?.[discordId]?.studyMinutes || 0;
                const isMe = myMins > 0;
                const days = Math.round((c.endAt - c.startAt)/86400000);
                return `<tr style="${isMe?'background:rgba(88,101,242,0.04)':''}">
                  <td>
                    <div style="font-weight:600;font-size:0.82rem">${c.title}</div>
                    <div class="text-xs text-muted mono">${new Date(c.startAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</div>
                  </td>
                  <td><span class="badge ${c.status==='active'?'badge-green':'badge-muted'}">${c.status}</span></td>
                  <td><span class="mono text-secondary">${Object.keys(c.participants||{}).length}</span></td>
                  <td><span class="mono text-secondary">${days}d</span></td>
                  <td><span class="mono" style="color:#7289da;font-weight:${isMe?'700':'400'}">${isMe?(myMins/60).toFixed(1)+'h':'—'}</span></td>
                  <td>${rank > 0 ? `<span class="badge" style="background:rgba(88,101,242,0.1);color:#7289da">#${rank}</span>` : '<span class="text-muted text-xs">—</span>'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    `;
    reIcons();
  } catch (e) {
    container.innerHTML = `<div class="card text-muted text-sm" style="padding:24px">${e.message}</div>`;
  }
}

// ─── YOUTUBE LIVE STREAM ──────────────────────────────────────
async function renderYoutube() {
  // Show admin config bar
  const adminBar = document.getElementById('ytAdminBar');
  if (adminBar) adminBar.classList.toggle('hidden', !App.isAdmin);

  // Load saved channel from Firestore
  let ytChannelId = '';
  try {
    const doc = await db.collection('settings').doc('youtube').get();
    if (doc.exists) {
      ytChannelId = doc.data().channelId || '';
      if (App.isAdmin) {
        const input = document.getElementById('ytChannelIdInput');
        if (input) input.value = ytChannelId;
      }
    }
  } catch (e) {}

  if (!ytChannelId) {
    showYtNoLive('Set up a YouTube channel first' + (App.isAdmin ? ' using the config bar above.' : '. Ask an admin to configure it.'));
    document.getElementById('ytChannelName').textContent = 'Not configured';
    loadYtPastStreams(null);
    return;
  }

  // The channel ID might be a @handle — we store it and use it
  // For the live embed, YouTube allows: youtube.com/embed/live_stream?channel=CHANNEL_ID
  // This automatically shows the current live stream for that channel
  const isHandle = ytChannelId.startsWith('@') || !ytChannelId.startsWith('UC');
  const embedChannelParam = ytChannelId;

  document.getElementById('ytChannelName').textContent = ytChannelId;

  // Load the live stream embed
  loadYtLiveEmbed(ytChannelId);
  loadYtPastStreams(ytChannelId);
}

function loadYtLiveEmbed(channelId) {
  const frame = document.getElementById('ytLiveFrame');
  const noLive = document.getElementById('ytNoLive');
  const liveBadge = document.getElementById('ytLiveBadge');
  const offlineBadge = document.getElementById('ytOfflineBadge');
  const liveTitle = document.getElementById('ytLiveTitle');
  const liveViewers = document.getElementById('ytLiveViewers');

  if (!frame) return;

  // Use YouTube's live_stream embed — this auto-detects if channel is live
  // Using nocookie domain and NO controls (controls=0), no related (rel=0),
  // no info bar (showinfo=0), no branding (modestbranding=1)
  const embedUrl = `https://www.youtube-nocookie.com/embed/live_stream?channel=${encodeURIComponent(channelId)}&autoplay=1&controls=0&rel=0&showinfo=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&playsinline=1`;

  frame.src = embedUrl;
  frame.style.display = 'block';
  noLive.style.display = 'none';
  if (liveBadge) liveBadge.style.display = 'inline-flex';
  if (offlineBadge) offlineBadge.style.display = 'none';
  if (liveTitle) liveTitle.textContent = 'Live Session';
  if (liveViewers) liveViewers.textContent = `Channel: ${channelId}`;

  // If embed fails (no live stream), YouTube shows an error — we detect via message
  frame.addEventListener('error', () => {
    showYtNoLive('No live stream currently active');
  }, { once: true });
}

function showYtNoLive(msg) {
  const frame = document.getElementById('ytLiveFrame');
  const noLive = document.getElementById('ytNoLive');
  const liveBadge = document.getElementById('ytLiveBadge');
  const offlineBadge = document.getElementById('ytOfflineBadge');
  const liveTitle = document.getElementById('ytLiveTitle');
  const liveViewers = document.getElementById('ytLiveViewers');

  if (frame) frame.style.display = 'none';
  if (noLive) noLive.style.display = 'flex';
  if (liveBadge) liveBadge.style.display = 'none';
  if (offlineBadge) offlineBadge.style.display = 'inline-flex';
  if (liveTitle) liveTitle.textContent = 'Stream Offline';
  if (liveViewers) liveViewers.textContent = msg || 'No live stream at the moment';
}

async function loadYtPastStreams(channelId) {
  const container = document.getElementById('ytPastStreams');
  if (!container) return;

  if (!channelId) {
    container.innerHTML = `<div class="empty-state" style="padding:32px">
      <div class="empty-icon"><i data-lucide="youtube" style="width:28px;height:28px;opacity:0.4;color:var(--red)"></i></div>
      <div class="empty-title">No channel configured</div>
      <div class="empty-desc">An admin needs to set the YouTube channel ID</div>
    </div>`;
    reIcons();
    return;
  }

  // We'll load past streams stored in Firestore (admin can add them)
  // Also show a placeholder grid if none exist
  try {
    const snap = await db.collection('settings').doc('youtube').get();
    const pastVids = snap.data()?.pastStreams || [];

    if (pastVids.length === 0) {
      container.innerHTML = `
        <div style="padding:24px 0">
          <div class="tip-box" style="margin-bottom:20px">
            <div class="tip-box-title"><i data-lucide="info"></i> Adding Past Streams</div>
            <div class="tip-box-body">
              ${App.isAdmin ? 'Use the admin panel (coming soon) or add video IDs directly to Firestore under <code style="background:var(--bg-elevated);padding:1px 5px;border-radius:4px">settings/youtube.pastStreams</code>.' : 'Past live streams will appear here once they are added by an admin.'}
            </div>
          </div>
          <div class="yt-grid">
            ${[1,2,3,4,5,6].map(i => `
              <div class="yt-card skeleton-card">
                <div class="yt-thumb skeleton"></div>
                <div style="padding:12px">
                  <div class="skeleton" style="height:12px;margin-bottom:8px;width:80%"></div>
                  <div class="skeleton" style="height:10px;width:50%"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;
    } else {
      container.innerHTML = `<div class="yt-grid">
        ${pastVids.map(v => `
          <div class="yt-card">
            <div class="yt-thumb" style="position:relative;cursor:pointer" onclick="openYtVideo('${v.videoId}')">
              <img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg"
                alt="${v.title||'Past stream'}"
                style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-md) var(--radius-md) 0 0"
                onerror="this.src=''">
              <div style="position:absolute;inset:0;background:rgba(0,0,0,0.3);border-radius:var(--radius-md) var(--radius-md) 0 0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s"
                onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0'">
                <div style="width:44px;height:44px;background:#ff0000;border-radius:50%;display:flex;align-items:center;justify-content:center">
                  <i data-lucide="play" style="width:18px;height:18px;color:#fff;margin-left:3px"></i>
                </div>
              </div>
              ${v.duration ? `<span style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.8);color:#fff;font-size:0.65rem;font-family:var(--font-mono);padding:2px 6px;border-radius:3px">${v.duration}</span>` : ''}
            </div>
            <div style="padding:12px">
              <div style="font-size:0.82rem;font-weight:600;color:var(--text-primary);margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${v.title||'Past Live Stream'}</div>
              <div style="font-size:0.68rem;color:var(--text-muted);font-family:var(--font-mono)">${v.date||''} ${v.views?'· '+v.views+' views':''}</div>
            </div>
          </div>
        `).join('')}
      </div>`;
    }
  } catch (e) {
    container.innerHTML = `<div class="text-muted text-sm" style="padding:16px">${e.message}</div>`;
  }
  reIcons();
}

function openYtVideo(videoId) {
  // Open in a modal with no controls
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
  overlay.onclick = (e) => { if(e.target===overlay) document.body.removeChild(overlay); };

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:min(900px,90vw);aspect-ratio:16/9;border-radius:16px;overflow:hidden';

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'position:absolute;top:-40px;right:0;background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;z-index:1;display:flex;align-items:center;gap:6px;font-family:var(--font-body);opacity:0.7';
  closeBtn.innerHTML = '✕ Close';
  closeBtn.onclick = () => document.body.removeChild(overlay);

  const frame = document.createElement('iframe');
  frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0`;
  frame.style.cssText = 'width:100%;height:100%;border:none';
  frame.allow = 'autoplay; encrypted-media; fullscreen';

  // Overlay to block controls
  const blocker = document.createElement('div');
  blocker.style.cssText = 'position:absolute;inset:0;z-index:10';
  blocker.oncontextmenu = () => false;

  wrap.appendChild(closeBtn);
  wrap.appendChild(frame);
  wrap.appendChild(blocker);
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);
}
