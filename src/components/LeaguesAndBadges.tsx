import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Crown,
  Flame,
  Medal,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trophy,
  Users,
} from 'lucide-react';
import { io } from 'socket.io-client';
import {
  Badge,
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardResponse,
  Student,
} from '../types';
import { StudentAvatar } from './StudentAvatar';
import { apiFetch, getAuthToken } from '../lib/api';

interface LeaguesAndBadgesProps {
  student: Student;
  badges: Badge[];
}

const LEAGUE_TIERS = [
  { name: 'Bronze', minXp: 0 },
  { name: 'Silver', minXp: 200 },
  { name: 'Gold', minXp: 450 },
  { name: 'Obsidian', minXp: 800 },
  { name: 'Diamond', minXp: 1200 },
];

const PERIOD_TABS: { id: LeaderboardPeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'all_time', label: 'All Time' },
];

export function LeaguesAndBadges({ student, badges }: LeaguesAndBadgesProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [meta, setMeta] = useState<Omit<LeaderboardResponse, 'entries'> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchLeaderboard = useCallback(
    async (targetPage: number, append = false) => {
      try {
        const params = new URLSearchParams({
          period,
          q: debouncedSearch,
          page: String(targetPage),
          limit: '20',
        });
        const res = await apiFetch(`/api/leaderboard?${params.toString()}`);
        const data: LeaderboardResponse = await res.json();
        if (!res.ok) return;
        setMeta({
          period: data.period,
          totalRegistered: data.totalRegistered,
          totalFiltered: data.totalFiltered,
          page: data.page,
          pageSize: data.pageSize,
          hasMore: data.hasMore,
          currentUserRank: data.currentUserRank,
          currentUserEntry: data.currentUserEntry,
        });
        setEntries((prev) => (append ? [...prev, ...data.entries] : data.entries));
      } finally {
        setLoading(false);
      }
    },
    [period, debouncedSearch]
  );

  useEffect(() => {
    setLoading(true);
    fetchLeaderboard(1, false);
  }, [fetchLeaderboard]);

  // Live Socket.IO leaderboard updates
  useEffect(() => {
    const token = getAuthToken();
    const socket = io({
      withCredentials: true,
      auth: token ? { token } : undefined,
    });
    socket.emit('leaderboard:subscribe');
    socket.on('leaderboard:updated', () => {
      fetchLeaderboard(1, false);
      setPage(1);
    });
    return () => {
      socket.disconnect();
    };
  }, [fetchLeaderboard]);

  const handleLoadMore = async () => {
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchLeaderboard(nextPage, true);
  };

  const iconForBadge = (name: string) => {
    switch (name) {
      case 'ShieldCheck':
        return ShieldCheck;
      case 'Terminal':
        return Terminal;
      case 'Flame':
        return Flame;
      case 'Trophy':
        return Trophy;
      default:
        return Sparkles;
    }
  };

  const topThree = !debouncedSearch ? entries.slice(0, 3) : [];
  const periodLabel = PERIOD_TABS.find((t) => t.id === period)?.label ?? 'Weekly';

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-2xl border border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <img
            src="/src/assets/images/arena_league_crest_1795020561633.jpg"
            alt="DBMS Arena Trophy Crest"
            referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0"
          />
          <div className="space-y-1">
            <div className="text-xs text-slate-500 tabular-nums">
              Real-Time Student Rankings · {meta?.totalRegistered ?? 0} Registered Learners
            </div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900">
              {student.league} League &amp; Global Leaderboard
            </h1>
            <p className="text-sm text-slate-600">
              Every registered student is ranked automatically by XP earned across concepts, SQL challenges, and daily missions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <div>
            <div className="text-xs text-slate-500">Your Rank</div>
            <div className="font-display text-2xl font-bold text-emerald-600 tabular-nums">
              {meta?.currentUserRank ? `#${meta.currentUserRank}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Badges Unlocked</div>
            <div className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              {badges.filter((b) => b.earned).length} / {badges.length}
            </div>
          </div>
        </div>
      </div>

      {/* League Tier Ladder */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
        <div className="text-xs font-semibold text-slate-600">Arena League Ladder</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {LEAGUE_TIERS.map((tier) => {
            const isCurrent = student.league === tier.name;
            const unlocked = student.xp >= tier.minXp;
            return (
              <div
                key={tier.name}
                className={`p-3.5 rounded-xl border text-center ${
                  isCurrent
                    ? 'border-amber-500 bg-amber-50 text-amber-950'
                    : unlocked
                      ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                <div className="font-display font-bold text-sm">{tier.name}</div>
                <div className="text-[11px] font-mono tabular-nums mt-0.5">{tier.minXp}+ XP</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top 3 Podium Cards */}
      {topThree.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topThree.map((entry) => {
            const isFirst = entry.rank === 1;
            const isSecond = entry.rank === 2;
            const podiumStyle = isFirst
              ? 'border-amber-300 bg-amber-50/60'
              : isSecond
                ? 'border-slate-300 bg-slate-50'
                : 'border-orange-200 bg-orange-50/50';
            const RankIcon = isFirst ? Crown : isSecond ? Medal : Award;
            const iconColor = isFirst
              ? 'text-amber-500'
              : isSecond
                ? 'text-slate-500'
                : 'text-orange-600';

            return (
              <div
                key={entry.id}
                className={`p-5 rounded-2xl border flex items-center justify-between gap-3 ${podiumStyle} ${
                  entry.is_current_user ? 'ring-2 ring-emerald-500' : ''
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative">
                    <StudentAvatar name={entry.name} seed={entry.avatar_seed} size="lg" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 tabular-nums">
                      <RankIcon className={`w-4 h-4 ${iconColor}`} />
                      <span>Rank #{entry.rank}</span>
                    </div>
                    <div className="font-display font-bold text-base text-slate-900 truncate">
                      {entry.name} {entry.is_current_user ? '(You)' : ''}
                    </div>
                    <div className="text-xs text-slate-500 truncate">@{entry.username}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-extrabold text-base text-slate-900 tabular-nums">
                    {entry.period_xp} XP
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {entry.completed_concepts} concepts · {entry.streak_days}d
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Leaderboard + Badges Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {/* Controls Header */}
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
              {PERIOD_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setPeriod(tab.id);
                    setPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    period === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name or @username..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Highlighted Logged-In Student Banner */}
          {meta?.currentUserEntry && (
            <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 font-semibold text-emerald-950">
                <span>Your {periodLabel} Rank:</span>
                <span className="font-mono font-bold tabular-nums">#{meta.currentUserEntry.rank}</span>
                <span>·</span>
                <span>{meta.currentUserEntry.name}</span>
              </div>
              <div className="font-mono tabular-nums text-emerald-900">
                {meta.currentUserEntry.period_xp} XP · {meta.currentUserEntry.completed_concepts} concepts ·{' '}
                {meta.currentUserEntry.streak_days}d streak
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading real-time standings...</div>
          ) : entries.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="font-display font-bold text-base text-slate-800">
                {debouncedSearch
                  ? 'No students matched your search'
                  : 'No registered students on the leaderboard yet'}
              </div>
              <p className="text-xs text-slate-500">
                {debouncedSearch
                  ? 'Try searching a different student name or username.'
                  : 'Create a student account via /signup to appear automatically on the leaderboard!'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                      <th className="px-4 py-3 font-medium">Rank</th>
                      <th className="px-4 py-3 font-medium">Student</th>
                      <th className="px-4 py-3 font-medium text-right">{periodLabel} XP</th>
                      <th className="px-4 py-3 font-medium text-right">Concepts</th>
                      <th className="px-4 py-3 font-medium text-right">SQL</th>
                      <th className="px-4 py-3 font-medium text-right">Streak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={
                          entry.is_current_user
                            ? 'bg-emerald-50/90 font-semibold text-emerald-950'
                            : 'hover:bg-slate-50'
                        }
                      >
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700">
                          <span className="inline-flex items-center gap-1.5">
                            {entry.rank === 1 && <Crown className="w-4 h-4 text-amber-500" />}
                            {entry.rank === 2 && <Medal className="w-4 h-4 text-slate-500" />}
                            {entry.rank === 3 && <Award className="w-4 h-4 text-orange-600" />}
                            <span>#{entry.rank}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <StudentAvatar name={entry.name} seed={entry.avatar_seed} size="sm" />
                            <div className="min-w-0">
                              <div className="text-slate-900 truncate">
                                {entry.name} {entry.is_current_user ? '(You)' : ''}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                @{entry.username} · {entry.unit_completion_pct}% syllabus
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-right text-slate-900">
                          {entry.period_xp} XP
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-right text-slate-700">
                          {entry.completed_concepts}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-right text-slate-700">
                          {entry.sql_solved}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-right text-orange-700">
                          {entry.streak_days} days
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {meta?.hasMore && (
                <div className="p-4 border-t border-slate-200 flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    className="px-5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Load More Students ({entries.length} of {meta.totalFiltered})
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Badges & Achievements */}
        <div className="lg:col-span-4 p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
          <h2 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <span>Badges &amp; Milestones</span>
          </h2>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {badges.map((b) => {
              const Icon = iconForBadge(b.icon_name);
              return (
                <div
                  key={b.id}
                  className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    b.earned
                      ? 'border-emerald-300 bg-emerald-50/50'
                      : 'border-slate-200 bg-slate-50/70 opacity-75'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      b.earned ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-display font-bold text-xs text-slate-900">{b.title}</div>
                      <span className="text-[11px] font-medium text-slate-500 shrink-0">
                        {b.earned ? 'Earned' : b.requirement_text}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">{b.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
