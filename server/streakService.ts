import type { Database } from 'sql.js';
import { queryOne, runStmt, saveAppDb } from './db.ts';

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export const STREAK_MILESTONES = [
  { days: 3, code: 'STREAK_3', title: '3-Day Spark' },
  { days: 7, code: 'STREAK_7', title: '7-Day Week Warrior' },
  { days: 14, code: 'STREAK_14', title: '14-Day Fortnight Scholar' },
  { days: 30, code: 'STREAK_30', title: '30-Day Monthly Titan' },
  { days: 60, code: 'STREAK_60', title: '60-Day Iron Architect' },
  { days: 100, code: 'STREAK_100', title: '100-Day DBMS Legend' },
];

export function getLocalDateIso(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

export function addDaysIso(dateIso: string, deltaDays: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

export function getMondayOfWeekIso(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = dt.getUTCDay(); // 0 = Sunday, 1 = Monday...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDaysIso(dateIso, diffToMonday);
}

export function getMonthStartIso(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  streakHistory: string[];
}

export function computeEffectiveStreak(state: StreakState, todayLocal: string): StreakState {
  if (!state.lastActivityDate) {
    return { ...state, currentStreak: 0 };
  }
  const yesterdayLocal = addDaysIso(todayLocal, -1);
  if (state.lastActivityDate === todayLocal || state.lastActivityDate === yesterdayLocal) {
    return state;
  }
  // Missed at least one complete calendar day
  return {
    ...state,
    currentStreak: 0,
  };
}

export function computeNextStreakOnActivity(
  state: StreakState,
  todayLocal: string
): {
  next: StreakState;
  incremented: boolean;
  wasBrokenAndRestarted: boolean;
} {
  const yesterdayLocal = addDaysIso(todayLocal, -1);
  const historySet = new Set(state.streakHistory);

  if (state.lastActivityDate === todayLocal) {
    // Already counted today — duplicate activities must NOT increment streak twice
    historySet.add(todayLocal);
    return {
      next: {
        currentStreak: Math.max(1, state.currentStreak),
        longestStreak: Math.max(state.longestStreak, state.currentStreak),
        lastActivityDate: todayLocal,
        streakHistory: Array.from(historySet).sort(),
      },
      incremented: false,
      wasBrokenAndRestarted: false,
    };
  }

  historySet.add(todayLocal);
  const sortedHistory = Array.from(historySet).sort().slice(-120);

  if (state.lastActivityDate === yesterdayLocal) {
    // Consecutive day!
    const nextCurrent = state.currentStreak + 1;
    const nextLongest = Math.max(state.longestStreak, nextCurrent);
    return {
      next: {
        currentStreak: nextCurrent,
        longestStreak: nextLongest,
        lastActivityDate: todayLocal,
        streakHistory: sortedHistory,
      },
      incremented: true,
      wasBrokenAndRestarted: false,
    };
  }

  // First ever activity OR missed a complete calendar day -> starts new streak at 1
  const wasBroken = Boolean(state.lastActivityDate && state.lastActivityDate < yesterdayLocal);
  const nextCurrent = 1;
  const nextLongest = Math.max(state.longestStreak, nextCurrent);
  return {
    next: {
      currentStreak: nextCurrent,
      longestStreak: nextLongest,
      lastActivityDate: todayLocal,
      streakHistory: sortedHistory,
    },
    incremented: true,
    wasBrokenAndRestarted: wasBroken,
  };
}

function ensureDailyStreakRow(db: Database, studentId: number): {
  user_id: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  streak_history_json: string;
  timezone: string;
  updated_at: string;
} {
  let row = queryOne<{
    user_id: number;
    current_streak: number;
    longest_streak: number;
    last_activity_date: string | null;
    streak_history_json: string;
    timezone: string;
    updated_at: string;
  }>(db, 'SELECT * FROM daily_streaks WHERE user_id = ?', [studentId]);

  if (!row) {
    const student = queryOne<{
      streak_days: number;
      longest_streak: number;
      last_active_date: string;
      streak_history_json: string;
      timezone: string;
    }>(
      db,
      'SELECT streak_days, longest_streak, last_active_date, streak_history_json, timezone FROM students WHERE id = ?',
      [studentId]
    );
    const current = student?.streak_days ?? 0;
    const longest = Math.max(student?.longest_streak ?? 0, current);
    const lastDate = current > 0 && student?.last_active_date ? student.last_active_date : null;
    const historyJson = student?.streak_history_json || (lastDate ? JSON.stringify([lastDate]) : '[]');
    const tz = student?.timezone || DEFAULT_TIMEZONE;
    const nowIso = new Date().toISOString();

    db.run(
      `INSERT INTO daily_streaks (user_id, current_streak, longest_streak, last_activity_date, streak_history_json, timezone, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [studentId, current, longest, lastDate, historyJson, tz, nowIso]
    );
    saveAppDb();
    row = {
      user_id: studentId,
      current_streak: current,
      longest_streak: longest,
      last_activity_date: lastDate,
      streak_history_json: historyJson,
      timezone: tz,
      updated_at: nowIso,
    };
  }
  return row;
}

function parseHistory(jsonStr: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(jsonStr || '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function awardStreakMilestones(db: Database, studentId: number, currentStreak: number): string[] {
  const newlyAwarded: string[] = [];
  for (const m of STREAK_MILESTONES) {
    if (currentStreak >= m.days) {
      const badge = queryOne<{ id: number }>(db, 'SELECT id FROM badges WHERE code = ?', [m.code]);
      if (badge) {
        const exists = queryOne(
          db,
          'SELECT 1 FROM student_badges WHERE student_id = ? AND badge_id = ?',
          [studentId, badge.id]
        );
        if (!exists) {
          runStmt(
            db,
            'INSERT INTO student_badges (student_id, badge_id, earned_at) VALUES (?, ?, ?)',
            [studentId, badge.id, new Date().toISOString()],
            false
          );
          newlyAwarded.push(m.title);
        }
      }
    }
  }
  if (currentStreak >= 5) {
    const b5 = queryOne<{ id: number }>(db, 'SELECT id FROM badges WHERE code = ?', ['STREAK_KEEPER']);
    if (b5) {
      const exists = queryOne(
        db,
        'SELECT 1 FROM student_badges WHERE student_id = ? AND badge_id = ?',
        [studentId, b5.id]
      );
      if (!exists) {
        runStmt(
          db,
          'INSERT INTO student_badges (student_id, badge_id, earned_at) VALUES (?, ?, ?)',
          [studentId, b5.id, new Date().toISOString()],
          false
        );
      }
    }
  }
  return newlyAwarded;
}

export function evaluateAndPersistStreakBreak(
  db: Database,
  studentId: number,
  now: Date = new Date()
): StreakState & { timezone: string } {
  const row = ensureDailyStreakRow(db, studentId);
  const tz = row.timezone || DEFAULT_TIMEZONE;
  const todayLocal = getLocalDateIso(now, tz);
  const rawState: StreakState = {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastActivityDate: row.last_activity_date,
    streakHistory: parseHistory(row.streak_history_json),
  };

  const effective = computeEffectiveStreak(rawState, todayLocal);
  if (effective.currentStreak !== rawState.currentStreak) {
    const nowIso = now.toISOString();
    db.run(
      `UPDATE daily_streaks SET current_streak = ?, updated_at = ? WHERE user_id = ?`,
      [effective.currentStreak, nowIso, studentId]
    );
    db.run(
      `UPDATE students SET streak_days = ?, streak_updated_at = ? WHERE id = ?`,
      [effective.currentStreak, nowIso, studentId]
    );
    saveAppDb();
  }

  return { ...effective, timezone: tz };
}

export function recordQualifyingStreakActivity(
  db: Database,
  studentId: number,
  now: Date = new Date()
): {
  currentStreak: number;
  longestStreak: number;
  streakIncreased: boolean;
  wasBrokenAndRestarted: boolean;
  newMilestones: string[];
} {
  const row = ensureDailyStreakRow(db, studentId);
  const tz = row.timezone || DEFAULT_TIMEZONE;
  const todayLocal = getLocalDateIso(now, tz);
  const rawState: StreakState = {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastActivityDate: row.last_activity_date,
    streakHistory: parseHistory(row.streak_history_json),
  };

  const effective = computeEffectiveStreak(rawState, todayLocal);
  const { next, incremented, wasBrokenAndRestarted } = computeNextStreakOnActivity(
    effective,
    todayLocal
  );

  const nowIso = now.toISOString();
  const historyJson = JSON.stringify(next.streakHistory);

  db.run(
    `UPDATE daily_streaks
     SET current_streak = ?, longest_streak = ?, last_activity_date = ?, streak_history_json = ?, updated_at = ?
     WHERE user_id = ?`,
    [next.currentStreak, next.longestStreak, next.lastActivityDate, historyJson, nowIso, studentId]
  );

  db.run(
    `UPDATE students
     SET streak_days = ?, longest_streak = ?, last_active_date = ?, streak_history_json = ?, streak_updated_at = ?
     WHERE id = ?`,
    [
      next.currentStreak,
      next.longestStreak,
      next.lastActivityDate ?? '',
      historyJson,
      nowIso,
      studentId,
    ]
  );

  const newMilestones = awardStreakMilestones(db, studentId, next.currentStreak);
  saveAppDb();

  return {
    currentStreak: next.currentStreak,
    longestStreak: next.longestStreak,
    streakIncreased: incremented,
    wasBrokenAndRestarted,
    newMilestones,
  };
}

export interface StreakWeeklyDay {
  date: string;
  dayShort: string;
  dayFull: string;
  status: 'completed' | 'missed' | 'pending' | 'future';
  isToday: boolean;
}

export interface StreakPayload {
  userId: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  streakHistory: string[];
  timezone: string;
  todayDate: string;
  completedToday: boolean;
  motivationalMessage: string;
  weeklyCalendar: StreakWeeklyDay[];
  milestones: { days: number; title: string; unlocked: boolean }[];
}

const WEEKDAYS = [
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday' },
];

export function buildStreakPayload(db: Database, studentId: number, now: Date = new Date()): StreakPayload {
  const effective = evaluateAndPersistStreakBreak(db, studentId, now);
  const todayDate = getLocalDateIso(now, effective.timezone);
  const historySet = new Set(effective.streakHistory);
  const completedToday = effective.lastActivityDate === todayDate || historySet.has(todayDate);

  const mondayIso = getMondayOfWeekIso(todayDate);
  const weeklyCalendar: StreakWeeklyDay[] = WEEKDAYS.map((wd, idx) => {
    const date = addDaysIso(mondayIso, idx);
    let status: StreakWeeklyDay['status'];
    if (historySet.has(date)) {
      status = 'completed';
    } else if (date < todayDate) {
      status = 'missed';
    } else if (date === todayDate) {
      status = 'pending';
    } else {
      status = 'future';
    }
    return {
      date,
      dayShort: wd.short,
      dayFull: wd.full,
      status,
      isToday: date === todayDate,
    };
  });

  let motivationalMessage = 'Complete a lesson or SQL challenge today to start your streak!';
  if (effective.currentStreak === 0 && effective.streakHistory.length > 0) {
    motivationalMessage = 'Welcome back! Start a new streak today.';
  } else if (effective.currentStreak >= 14) {
    motivationalMessage = completedToday
      ? `You're becoming a DBMS champion! ${effective.currentStreak}-day streak!`
      : `Don't break your ${effective.currentStreak}-day streak! Complete one activity today.`;
  } else if (effective.currentStreak >= 1) {
    motivationalMessage = completedToday
      ? `Amazing! ${effective.currentStreak}-day streak!`
      : `Don't break your ${effective.currentStreak}-day streak! Practice for 15 minutes today.`;
  }

  return {
    userId: studentId,
    currentStreak: effective.currentStreak,
    longestStreak: effective.longestStreak,
    lastActivityDate: effective.lastActivityDate,
    streakHistory: effective.streakHistory,
    timezone: effective.timezone,
    todayDate,
    completedToday,
    motivationalMessage,
    weeklyCalendar,
    milestones: STREAK_MILESTONES.map((m) => ({
      days: m.days,
      title: m.title,
      unlocked: effective.longestStreak >= m.days || effective.currentStreak >= m.days,
    })),
  };
}
