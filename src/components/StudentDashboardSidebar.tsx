import { Target } from 'lucide-react';
import { DailyMission, StreakInfo } from '../types';
import { DailyStreakCard } from './DailyStreakCard';

interface StudentDashboardSidebarProps {
  streak: StreakInfo;
  streakCelebrating?: boolean;
  missions: DailyMission[];
  onClaimMission: (missionId: number) => Promise<void>;
}

export function StudentDashboardSidebar({
  streak,
  streakCelebrating = false,
  missions,
  onClaimMission,
}: StudentDashboardSidebarProps) {
  return (
    <aside className="space-y-6">
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

    </aside>
  );
}
