import { Check, Flame, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import { StreakInfo } from '../types';

interface DailyStreakCardProps {
  streak: StreakInfo;
  celebrating?: boolean;
  compact?: boolean;
}

export function DailyStreakCard({
  streak,
  celebrating = false,
  compact = false,
}: DailyStreakCardProps) {
  const isActiveToday = streak.completedToday;

  return (
    <motion.div
      initial={false}
      animate={celebrating ? { scale: [1, 1.025, 1] } : { scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4"
    >
      {/* Top Streak Counter Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <motion.div
            animate={
              celebrating
                ? { rotate: [-6, 8, -4, 0], scale: [1, 1.18, 1] }
                : { rotate: 0, scale: 1 }
            }
            transition={{ duration: 0.5 }}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
              streak.currentStreak > 0
                ? 'bg-orange-500 text-white border-orange-600'
                : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
          >
            <Flame className={`w-6 h-6 ${streak.currentStreak > 0 ? 'fill-white' : ''}`} />
          </motion.div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-extrabold text-slate-900 tabular-nums">
                {streak.currentStreak} {streak.currentStreak === 1 ? 'Day' : 'Days'}
              </span>
              <span className="text-xs font-medium text-slate-500">Current Streak</span>
            </div>
            <div className="text-xs text-slate-500 tabular-nums mt-0.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                Longest: <strong className="text-slate-700">{streak.longestStreak} days</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>{isActiveToday ? 'Completed today' : 'Pending today'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Motivational Message */}
      <div
        className={`px-3.5 py-2.5 rounded-xl text-xs font-medium border ${
          isActiveToday
            ? 'bg-orange-50/80 border-orange-200 text-orange-950'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}
      >
        {streak.motivationalMessage}
      </div>

      {/* Weekly Activity Calendar (Mon - Sun) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium text-slate-700">This Week&apos;s Activity</span>
          <span className="tabular-nums">{streak.timezone}</span>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {streak.weeklyCalendar.map((day) => {
            const isCompleted = day.status === 'completed';
            const isMissed = day.status === 'missed';
            const isPending = day.status === 'pending';

            return (
              <div
                key={day.date}
                title={`${day.dayFull} (${day.date}): ${
                  isCompleted
                    ? 'Completed'
                    : isMissed
                      ? 'Missed'
                      : isPending
                        ? 'Today - Complete an activity'
                        : 'Upcoming'
                }`}
                className="flex flex-col items-center gap-1"
              >
                <span
                  className={`text-[11px] font-medium ${
                    day.isToday ? 'text-orange-700 font-bold' : 'text-slate-500'
                  }`}
                >
                  {day.dayShort}
                </span>
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border text-xs font-semibold transition-colors ${
                    isCompleted
                      ? 'bg-orange-500 border-orange-600 text-white'
                      : isPending
                        ? 'bg-orange-50 border-orange-400 text-orange-700 border-dashed'
                        : isMissed
                          ? 'bg-slate-200/80 border-slate-300 text-slate-500'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 stroke-[2.75]" />
                  ) : (
                    <Flame className="w-3.5 h-3.5" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Streak Milestones */}
      {!compact && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="text-xs font-medium text-slate-600">Streak Milestones</div>
          <div className="grid grid-cols-6 gap-1.5">
            {streak.milestones.map((m) => (
              <div
                key={m.days}
                title={m.title}
                className={`py-2 px-1 rounded-lg border text-center tabular-nums ${
                  m.unlocked
                    ? 'bg-orange-50 border-orange-300 text-orange-900 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                <div className="text-xs">{m.days}d</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
