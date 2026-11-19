import type { Database } from 'sql.js';
import { queryAll, queryOne, runStmt, saveAppDb } from './db.ts';
import {
  DEFAULT_TIMEZONE,
  getLocalDateIso,
  getMondayOfWeekIso,
  getMonthStartIso,
} from './streakService.ts';

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';

export function computeLeague(xp: number): string {
  if (xp >= 1200) return 'Diamond';
  if (xp >= 800) return 'Obsidian';
  if (xp >= 450) return 'Gold';
  if (xp >= 200) return 'Silver';
  return 'Bronze';
}

export function recordXpTransaction(
  db: Database,
  params: {
    studentId: number;
    sourceType:
      | 'concept_pass'
      | 'concept_replay'
      | 'unit_assessment'
      | 'unit_replay'
      | 'daily_mission'
      | 'sql_challenge'
      | 'admin_grant';
    sourceRefId: string;
    xpAmount: number;
    gemsAmount?: number;
    timezone?: string;
    now?: Date;
  }
): {
  xpAwarded: number;
  gemsAwarded: number;
  duplicateBlocked: boolean;
  newXp: number;
  newWeeklyXp: number;
  newGems: number;
  newLeague: string;
} {
  const now = params.now ?? new Date();
  const tz = params.timezone || DEFAULT_TIMEZONE;
  const localDate = getLocalDateIso(now, tz);
  const createdAt = now.toISOString();

  // Anti-farming: block repeated replay XP for the exact same concept/unit on the same calendar day
  if (params.sourceType === 'concept_replay' || params.sourceType === 'unit_replay') {
    const existingToday = queryOne<{ id: number }>(
      db,
      `SELECT id FROM xp_transactions
       WHERE student_id = ? AND source_type = ? AND source_ref_id = ? AND local_date = ?
       LIMIT 1`,
      [params.studentId, params.sourceType, params.sourceRefId, localDate]
    );
    if (existingToday) {
      const st = queryOne<{ xp: number; weekly_xp: number; gems: number; league: string }>(
        db,
        'SELECT xp, weekly_xp, gems, league FROM students WHERE id = ?',
        [params.studentId]
      )!;
      return {
        xpAwarded: 0,
        gemsAwarded: 0,
        duplicateBlocked: true,
        newXp: st.xp,
        newWeeklyXp: st.weekly_xp,
        newGems: st.gems,
        newLeague: st.league,
      };
    }
  }

  // Anti-farming: prevent double first-pass XP for same concept or unit or mission
  if (
    params.sourceType === 'concept_pass' ||
    params.sourceType === 'unit_assessment' ||
    params.sourceType === 'daily_mission' ||
    params.sourceType === 'sql_challenge'
  ) {
    const existingPass = queryOne<{ id: number }>(
      db,
      `SELECT id FROM xp_transactions
       WHERE student_id = ? AND source_type = ? AND source_ref_id = ?
       LIMIT 1`,
      [params.studentId, params.sourceType, params.sourceRefId]
    );
    if (existingPass) {
      const st = queryOne<{ xp: number; weekly_xp: number; gems: number; league: string }>(
        db,
        'SELECT xp, weekly_xp, gems, league FROM students WHERE id = ?',
        [params.studentId]
      )!;
      return {
        xpAwarded: 0,
        gemsAwarded: 0,
        duplicateBlocked: true,
        newXp: st.xp,
        newWeeklyXp: st.weekly_xp,
        newGems: st.gems,
        newLeague: st.league,
      };
    }
  }

  const xpAwarded = Math.max(0, Math.round(params.xpAmount));
  const gemsAwarded = Math.max(0, Math.round(params.gemsAmount ?? 0));

  if (xpAwarded > 0 || gemsAwarded > 0) {
    runStmt(
      db,
      `INSERT INTO xp_transactions (student_id, source_type, source_ref_id, xp_amount, gems_amount, local_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [params.studentId, params.sourceType, params.sourceRefId, xpAwarded, gemsAwarded, localDate, createdAt],
      false
    );
  }

  const st = queryOne<{ xp: number; gems: number }>(
    db,
    'SELECT xp, gems FROM students WHERE id = ?',
    [params.studentId]
  )!;
  const newXp = st.xp + xpAwarded;
  const newGems = st.gems + gemsAwarded;
  const newLeague = computeLeague(newXp);

  // Recalculate true weekly XP from xp_transactions for current Monday..today window
  const weekStart = getMondayOfWeekIso(localDate);
  const weekAgg = queryOne<{ w_xp: number }>(
    db,
    `SELECT COALESCE(SUM(xp_amount), 0) AS w_xp
     FROM xp_transactions
     WHERE student_id = ? AND local_date >= ?`,
    [params.studentId, weekStart]
  );
  const newWeeklyXp = weekAgg?.w_xp ?? 0;

  runStmt(
    db,
    'UPDATE students SET xp = ?, weekly_xp = ?, gems = ?, league = ? WHERE id = ?',
    [newXp, newWeeklyXp, newGems, newLeague, params.studentId]
  );

  return {
    xpAwarded,
    gemsAwarded,
    duplicateBlocked: false,
    newXp,
    newWeeklyXp,
    newGems,
    newLeague,
  };
}

export interface RankedLeaderboardEntry {
  rank: number;
  id: number;
  name: string;
  username: string;
  avatar_seed: string;
  xp: number;
  period_xp: number;
  weekly_xp: number;
  streak_days: number;
  longest_streak: number;
  completed_concepts: number;
  total_concepts: number;
  completed_units: number;
  total_units: number;
  unit_completion_pct: number;
  sql_solved: number;
  accuracy: number;
  league: string;
  is_current_user: boolean;
}

export function buildDynamicLeaderboard(
  db: Database,
  options: {
    currentUserId: number;
    period?: LeaderboardPeriod;
    search?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const period: LeaderboardPeriod = options.period ?? 'weekly';
  const search = (options.search ?? '').trim().toLowerCase();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 20));

  const todayLocal = getLocalDateIso(new Date(), DEFAULT_TIMEZONE);
  const weekStart = getMondayOfWeekIso(todayLocal);
  const monthStart = getMonthStartIso(todayLocal);

  const totalConceptsRow = queryOne<{ c: number }>(
    db,
    'SELECT COUNT(*) AS c FROM concepts WHERE is_published = 1'
  );
  const totalConcepts = totalConceptsRow?.c ?? 87;

  const totalUnitsRow = queryOne<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM units');
  const totalUnits = totalUnitsRow?.c ?? 4;

  // Fetch all real registered students (even 0 XP!)
  const students = queryAll<{
    id: number;
    name: string;
    username: string;
    avatar_seed: string;
    xp: number;
    weekly_xp: number;
    streak_days: number;
    longest_streak: number;
    league: string;
    sql_solved_count: number;
    created_at: string;
  }>(
    db,
    `SELECT id, name, username, avatar_seed, xp, weekly_xp, streak_days, longest_streak, league, sql_solved_count, created_at
     FROM students
     WHERE role = 'student' AND is_demo = 0`
  );

  // Aggregate period XP from xp_transactions
  let dateFilter = '';
  const dateParams: string[] = [];
  if (period === 'daily') {
    dateFilter = 'WHERE local_date = ?';
    dateParams.push(todayLocal);
  } else if (period === 'weekly') {
    dateFilter = 'WHERE local_date >= ?';
    dateParams.push(weekStart);
  } else if (period === 'monthly') {
    dateFilter = 'WHERE local_date >= ?';
    dateParams.push(monthStart);
  }

  const periodRows = queryAll<{ student_id: number; sum_xp: number; achieved_at: string | null }>(
    db,
    `SELECT student_id, COALESCE(SUM(xp_amount), 0) AS sum_xp, MAX(created_at) AS achieved_at
     FROM xp_transactions
     ${dateFilter}
     GROUP BY student_id`,
    dateParams
  );
  const periodMap = new Map(periodRows.map((r) => [r.student_id, r]));

  const weeklyRows = queryAll<{ student_id: number; sum_xp: number }>(
    db,
    `SELECT student_id, COALESCE(SUM(xp_amount), 0) AS sum_xp
     FROM xp_transactions
     WHERE local_date >= ?
     GROUP BY student_id`,
    [weekStart]
  );
  const weeklyMap = new Map(weeklyRows.map((r) => [r.student_id, r.sum_xp]));

  const conceptRows = queryAll<{ student_id: number; c_count: number }>(
    db,
    `SELECT scp.student_id, COUNT(*) AS c_count
     FROM student_concept_progress scp
     JOIN concepts c ON c.id = scp.concept_id
     WHERE scp.status = 'completed' AND c.is_published = 1
     GROUP BY scp.student_id`
  );
  const conceptMap = new Map(conceptRows.map((r) => [r.student_id, r.c_count]));

  const unitRows = queryAll<{ student_id: number; u_count: number }>(
    db,
    `SELECT student_id, COUNT(*) AS u_count
     FROM student_unit_progress
     WHERE status = 'completed'
     GROUP BY student_id`
  );
  const unitMap = new Map(unitRows.map((r) => [r.student_id, r.u_count]));

  const accRows = queryAll<{ student_id: number; avg_score: number }>(
    db,
    `SELECT student_id, ROUND(AVG(score), 1) AS avg_score
     FROM quiz_attempts
     GROUP BY student_id`
  );
  const accMap = new Map(accRows.map((r) => [r.student_id, r.avg_score]));

  const sqlRows = queryAll<{ student_id: number; solved: number }>(
    db,
    `SELECT student_id, COUNT(DISTINCT COALESCE(challenge_key, sql_text)) AS solved
     FROM sql_submissions
     WHERE passed = 1
     GROUP BY student_id`
  );
  const sqlMap = new Map(sqlRows.map((r) => [r.student_id, r.solved]));

  const combined = students.map((s) => {
    const pInfo = periodMap.get(s.id);
    const periodXp = period === 'all_time' ? s.xp : (pInfo?.sum_xp ?? 0);
    const completedConcepts = conceptMap.get(s.id) ?? 0;
    const completedUnits = unitMap.get(s.id) ?? 0;
    const sqlSolved = Math.max(s.sql_solved_count ?? 0, sqlMap.get(s.id) ?? 0);
    const accuracy = accMap.get(s.id) ?? 0;
    const achievedAt = pInfo?.achieved_at ?? s.created_at;

    return {
      id: s.id,
      name: s.name,
      username: s.username || `student_${s.id}`,
      avatar_seed: s.avatar_seed,
      xp: s.xp,
      period_xp: periodXp,
      weekly_xp: weeklyMap.get(s.id) ?? s.weekly_xp ?? 0,
      streak_days: s.streak_days,
      longest_streak: Math.max(s.longest_streak ?? 0, s.streak_days),
      completed_concepts: completedConcepts,
      total_concepts: totalConcepts,
      completed_units: completedUnits,
      total_units: totalUnits,
      unit_completion_pct:
        totalConcepts > 0 ? Math.round((completedConcepts / totalConcepts) * 100) : 0,
      sql_solved: sqlSolved,
      accuracy,
      league: s.league,
      achievedAt,
      createdAt: s.created_at,
      is_current_user: s.id === options.currentUserId,
    };
  });

  // Sort strictly using tie-breaking specification:
  // 1. Higher period XP
  // 2. More concepts completed
  // 3. More correctly solved SQL queries
  // 4. Higher assessment accuracy
  // 5. Earlier achievement of the same score
  combined.sort((a, b) => {
    if (b.period_xp !== a.period_xp) return b.period_xp - a.period_xp;
    if (b.completed_concepts !== a.completed_concepts) {
      return b.completed_concepts - a.completed_concepts;
    }
    if (b.sql_solved !== a.sql_solved) return b.sql_solved - a.sql_solved;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    const tA = a.achievedAt || a.createdAt;
    const tB = b.achievedAt || b.createdAt;
    if (tA !== tB) return tA.localeCompare(tB);
    return a.id - b.id;
  });

  const ranked: RankedLeaderboardEntry[] = combined.map((entry, idx) => ({
    rank: idx + 1,
    id: entry.id,
    name: entry.name,
    username: entry.username,
    avatar_seed: entry.avatar_seed,
    xp: entry.xp,
    period_xp: entry.period_xp,
    weekly_xp: entry.weekly_xp,
    streak_days: entry.streak_days,
    longest_streak: entry.longest_streak,
    completed_concepts: entry.completed_concepts,
    total_concepts: entry.total_concepts,
    completed_units: entry.completed_units,
    total_units: entry.total_units,
    unit_completion_pct: entry.unit_completion_pct,
    sql_solved: entry.sql_solved,
    accuracy: entry.accuracy,
    league: entry.league,
    is_current_user: entry.is_current_user,
  }));

  const currentUserEntry = ranked.find((r) => r.is_current_user) ?? null;

  const filtered = search
    ? ranked.filter(
        (r) =>
          r.name.toLowerCase().includes(search) || r.username.toLowerCase().includes(search)
      )
    : ranked;

  const totalFiltered = filtered.length;
  const totalRegistered = ranked.length;
  const startIdx = (page - 1) * pageSize;
  const entries = filtered.slice(startIdx, startIdx + pageSize);

  return {
    period,
    totalRegistered,
    totalFiltered,
    page,
    pageSize,
    hasMore: startIdx + pageSize < totalFiltered,
    currentUserRank: currentUserEntry?.rank ?? null,
    currentUserEntry,
    entries,
  };
}
