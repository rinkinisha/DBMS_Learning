import type { DataStore } from './storeTypes.ts';
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

export async function recordXpTransaction(
  store: DataStore,
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
): Promise<{
  xpAwarded: number;
  gemsAwarded: number;
  duplicateBlocked: boolean;
  newXp: number;
  newWeeklyXp: number;
  newGems: number;
  newLeague: string;
}> {
  const now = params.now ?? new Date();
  const tz = params.timezone || DEFAULT_TIMEZONE;
  const localDate = getLocalDateIso(now, tz);
  const createdAt = now.toISOString();

  if (params.sourceType === 'concept_replay' || params.sourceType === 'unit_replay') {
    const existingToday = await store.hasXpTransaction(
      params.studentId,
      params.sourceType,
      params.sourceRefId,
      localDate
    );
    if (existingToday) {
      const st = (await store.getStudentById(params.studentId))!;
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

  if (
    params.sourceType === 'concept_pass' ||
    params.sourceType === 'unit_assessment' ||
    params.sourceType === 'daily_mission' ||
    params.sourceType === 'sql_challenge'
  ) {
    const existingPass = await store.hasXpTransaction(
      params.studentId,
      params.sourceType,
      params.sourceRefId
    );
    if (existingPass) {
      const st = (await store.getStudentById(params.studentId))!;
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
    await store.insertXpTransaction({
      student_id: params.studentId,
      source_type: params.sourceType,
      source_ref_id: params.sourceRefId,
      xp_amount: xpAwarded,
      gems_amount: gemsAwarded,
      local_date: localDate,
      created_at: createdAt,
    });
  }

  const st = (await store.getStudentById(params.studentId))!;
  const newXp = st.xp + xpAwarded;
  const newGems = st.gems + gemsAwarded;
  const newLeague = computeLeague(newXp);

  const weekStart = getMondayOfWeekIso(localDate);
  const newWeeklyXp = await store.sumStudentXpSince(params.studentId, weekStart);

  await store.updateStudentFields(params.studentId, {
    xp: newXp,
    weekly_xp: newWeeklyXp,
    gems: newGems,
    league: newLeague,
  });

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

export async function buildDynamicLeaderboard(
  store: DataStore,
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

  let sinceDate: string | null = null;
  let isDailyExact = false;
  if (period === 'daily') {
    sinceDate = todayLocal;
    isDailyExact = true;
  } else if (period === 'weekly') {
    sinceDate = weekStart;
  } else if (period === 'monthly') {
    sinceDate = monthStart;
  }

  const agg = await store.getLeaderboardAggregateData(sinceDate, isDailyExact, weekStart);

  const combined = agg.students.map((s) => {
    const pInfo = agg.periodMap.get(s.id);
    const periodXp = period === 'all_time' ? s.xp : pInfo?.sum_xp ?? 0;
    const completedConcepts = agg.conceptMap.get(s.id) ?? 0;
    const completedUnits = agg.unitMap.get(s.id) ?? 0;
    const sqlSolved = Math.max(s.sql_solved_count ?? 0, agg.sqlMap.get(s.id) ?? 0);
    const accuracy = agg.accMap.get(s.id) ?? 0;
    const achievedAt = pInfo?.achieved_at ?? s.created_at;

    return {
      id: s.id,
      name: s.name,
      username: s.username || `student_${s.id}`,
      avatar_seed: s.avatar_seed,
      xp: s.xp,
      period_xp: periodXp,
      weekly_xp: agg.weeklyMap.get(s.id) ?? s.weekly_xp ?? 0,
      streak_days: s.streak_days,
      longest_streak: Math.max(s.longest_streak ?? 0, s.streak_days),
      completed_concepts: completedConcepts,
      total_concepts: agg.totalConcepts,
      completed_units: completedUnits,
      total_units: agg.totalUnits,
      unit_completion_pct:
        agg.totalConcepts > 0 ? Math.round((completedConcepts / agg.totalConcepts) * 100) : 0,
      sql_solved: sqlSolved,
      accuracy,
      league: s.league,
      achievedAt,
      createdAt: s.created_at,
      is_current_user: s.id === options.currentUserId,
    };
  });

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
