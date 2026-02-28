// ============================================================
// RANKFORGE - Firebase Configuration
// Replace these values with YOUR Firebase project credentials
// Get them from: https://console.firebase.google.com
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDBqIUzMN5Wp8pOknnRmlPYZWpTWbRimEM",
  authDomain: "rankforge-f5b54.firebaseapp.com",
  projectId: "rankforge-f5b54",
  storageBucket: "rankforge-f5b54.firebasestorage.app",
  messagingSenderId: "493928988352",
  appId: "1:493928988352:web:6a631196cff4586a0b3725"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// ============================================================
// FIRESTORE STRUCTURE (for reference)
// ============================================================
// /institutes/{instituteId}
//   name, code, ownerUid, createdAt, totalStudents
//
// /users/{uid}
//   name, email, role (student/admin), instituteId, avatar
//   totalPoints, weeklyPoints, monthlyPoints, streak
//   studyHours, attendanceCount, testsGiven
//
// /sessions/{sessionId}
//   title, type (morning/afternoon/evening), startTime, endTime
//   hostUid, instituteId, jitsiRoom, status, pomodoroConfig
//   participants: [{uid, goal, report, joinedAt}]
//
// /leaderboard/{instituteId}/weekly/{weekKey}
//   rankings: [{uid, name, points, change}]
//
// /sprints/{sprintId}
//   month, year, instituteId, targets, completions
//
// /points/{uid}/logs/{logId}
//   type, amount, reason, timestamp
// ============================================================

console.log("✅ Firebase initialized - RankForge ready");
