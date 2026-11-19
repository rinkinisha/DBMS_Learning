import { Gem, Heart, Shield, Target, Trophy, User, Zap } from 'lucide-react';
import { DailyMission, LeaderboardEntry, StreakInfo, Student } from '../types';
import { DailyStreakCard } from './DailyStreakCard';
import { StudentAvatar } from './StudentAvatar';

interface StudentDashboardSidebarProps {
  student: Student;
  streak: StreakInfo;
  streakCelebrating?: boolean;
  missions: DailyMission[];
  leaderboard: LeaderboardEntry[];
  currentUserRank: number | null;
  onRefillHearts: () => Promise<void>;
  onClaimMission: (missionId: number) => Promise<void>;
  onOpenLeagues: () => void;
  onOpenProfile: () => void;
}

export function StudentDashboardSidebar({
  student,
  streak,
  streakCelebrating = false,
  missions,
  leaderboard,
  currentUserRank,
  onRefillHearts,
  onClaimMission,
  onOpenLeagues,
  onOpenProfile,
}: StudentDashboardSidebarProps) {
  const topFive = leaderboard.slice(0, 5);

  return (
    <aside className="space-y-6">
      {/* Core Gamified Stats Card */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex items-center gap-3 text-left min-w-0 group cursor-pointer"
          >
            <StudentAvatar name={student.name} seed={student.avatar_seed} size="md" />
            <div className="min-w-0">
              <h2 className="font-display font-bold text-base text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                {student.name}
              </h2>
              <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                <span>@{student.username}</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-700 font-semibold">{student.league}</span>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Open student profile"
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer shrink-0"
          >
            <User className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>XP</span>
            </div>
            <div className="font-display text-lg font-bold text-slate-900 tabular-nums mt-0.5">
              {student.xp}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
              <span>Hearts</span>
            </div>
            <div className="font-display text-lg font-bold text-slate-900 tabular-nums mt-0.5">
              {student.hearts}/{student.max_hearts}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <Gem className="w-3.5 h-3.5 text-sky-500" />
              <span>Gems</span>
            </div>
            <div className="font-display text-lg font-bold text-slate-900 tabular-nums mt-0.5">
              {student.gems}
            </div>
          </div>
        </div>

        {student.hearts < student.max_hearts && (
          <button
            type="button"
            onClick={onRefillHearts}
            className="w-full btn-tactile py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold border-b-4 border-rose-800 cursor-pointer"
          >
            {student.gems >= 25
              ? 'Refill Full Hearts (25 Gems)'
              : 'Emergency +1 Heart Recovery (Free)'}
          </button>
        )}
      </div>

      {/* Duolingo-Style Daily Streak Component */}
      <DailyStreakCard streak={streak} celebrating={streakCelebrating} compact />

      {/* Daily Missions */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-600" />
            <span>Daily Missions</span>
          </h3>
          <span className="text-xs text-slate-500 tabular-nums">
            {missions.filter((m) => m.claimed).length}/{missions.length} Claimed
          </span>
        </div>

        <div className="space-y-3">
          {missions.map((m) => {
            const pct = Math.min(100, Math.round((m.current_count / m.target_count) * 100));
            const ready = m.current_count >= m.target_count && !m.claimed;
            return (
              <div key={m.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-900">{m.title}</div>
                  <div className="text-[11px] font-mono text-slate-600 tabular-nums shrink-0">
                    {m.current_count}/{m.target_count}
                  </div>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      m.claimed ? 'bg-emerald-500' : ready ? 'bg-amber-500' : 'bg-sky-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    +{m.xp_reward} XP · +{m.gem_reward} Gems
                  </span>
                  {m.claimed ? (
                    <span className="text-[11px] font-semibold text-emerald-700">Claimed</span>
                  ) : ready ? (
                    <button
                      type="button"
                      onClick={() => onClaimMission(m.id)}
                      className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      Claim
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real Dynamic Weekly Leaderboard Preview */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <img
              src="/src/assets/images/arena_league_crest_1795020561633.jpg"
              alt="Weekly league crest"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-lg object-cover border border-slate-200"
            />
            <div>
              <h3 className="font-display font-bold text-base text-slate-900">Weekly Leaderboard</h3>
              <div className="text-xs text-slate-500 tabular-nums">
                {student.league} · {currentUserRank ? `Rank #${currentUserRank}` : 'Live Standings'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenLeagues}
            className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer whitespace-nowrap"
          >
            View All
          </button>
        </div>

        {topFive.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
            No registered students ranked yet. Complete a lesson to claim #1!
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {topFive.map((entry) => (
              <div
                key={entry.id}
                className={`py-2.5 flex items-center justify-between gap-2 text-xs ${
                  entry.is_current_user ? 'font-bold text-emerald-800' : 'text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 text-center font-mono tabular-nums text-slate-500">
                    {entry.rank === 1 ? (
                      <Trophy className="w-3.5 h-3.5 text-amber-500 inline" />
                    ) : (
                      entry.rank
                    )}
                  </span>
                  <StudentAvatar name={entry.name} seed={entry.avatar_seed} size="sm" />
                  <span className="truncate">
                    {entry.name} {entry.is_current_user ? '(You)' : ''}
                  </span>
                </div>
                <span className="font-mono tabular-nums shrink-0">{entry.period_xp} XP</span>
              </div>
            ))}
          </div>
        )}

        <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-500">
          <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>All registered students appear live with Daily, Weekly &amp; All-Time rankings.</span>
        </div>
      </div>
    </aside>
  );
}
