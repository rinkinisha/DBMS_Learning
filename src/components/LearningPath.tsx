import { useEffect, useState } from 'react';
import {
  Award,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Lock,
  Play,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Concept, Unit } from '../types';

interface LearningPathProps {
  units: Unit[];
  onStartConcept: (unit: Unit, concept: Concept) => void;
  onStartUnitAssessment: (unit: Unit) => void;
}

const SHOW_MORE_SESSION_KEY = 'dbms_arena_show_more_units';

const ACCENT_STYLES: Record<
  string,
  { banner: string; border: string; activeNode: string; doneNode: string; ring: string }
> = {
  emerald: {
    banner: 'bg-emerald-600 text-white',
    border: 'border-emerald-800',
    activeNode: 'bg-emerald-500 border-b-4 border-emerald-700 text-white hover:bg-emerald-600',
    doneNode: 'bg-emerald-100 border-b-4 border-emerald-300 text-emerald-800 hover:bg-emerald-200',
    ring: 'ring-emerald-200',
  },
  sky: {
    banner: 'bg-sky-600 text-white',
    border: 'border-sky-800',
    activeNode: 'bg-sky-500 border-b-4 border-sky-700 text-white hover:bg-sky-600',
    doneNode: 'bg-sky-100 border-b-4 border-sky-300 text-sky-800 hover:bg-sky-200',
    ring: 'ring-sky-200',
  },
  amber: {
    banner: 'bg-amber-600 text-white',
    border: 'border-amber-800',
    activeNode: 'bg-amber-500 border-b-4 border-amber-700 text-white hover:bg-amber-600',
    doneNode: 'bg-amber-100 border-b-4 border-amber-300 text-amber-900 hover:bg-amber-200',
    ring: 'ring-amber-200',
  },
  indigo: {
    banner: 'bg-indigo-600 text-white',
    border: 'border-indigo-800',
    activeNode: 'bg-indigo-500 border-b-4 border-indigo-700 text-white hover:bg-indigo-600',
    doneNode: 'bg-indigo-100 border-b-4 border-indigo-300 text-indigo-800 hover:bg-indigo-200',
    ring: 'ring-indigo-200',
  },
};

const OFFSET_PATTERN = [0, 38, 56, 38, 0, -38, -56, -38];

export function LearningPath({
  units,
  onStartConcept,
  onStartUnitAssessment,
}: LearningPathProps) {
  const [showMoreUnits, setShowMoreUnits] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SHOW_MORE_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(SHOW_MORE_SESSION_KEY, String(showMoreUnits));
    } catch {
      // Ignore storage availability issues
    }
  }, [showMoreUnits]);

  const unitOne = units.find((u) => u.unit_number === 1) ?? units[0];
  const remainingUnits = units.filter((u) => u.id !== unitOne?.id);

  const totalConcepts = units.reduce((acc, u) => acc + u.concepts.length, 0);
  const completedTotal = units.reduce(
    (acc, u) => acc + u.concepts.filter((c) => c.status === 'completed').length,
    0
  );

  const renderUnitSection = (unit: Unit) => {
    const style = ACCENT_STYLES[unit.accent_color] ?? ACCENT_STYLES.emerald;
    const completedCount = unit.concepts.filter((c) => c.status === 'completed').length;
    const allConceptsCompleted =
      unit.concepts.length > 0 && completedCount === unit.concepts.length;
    const unitLocked = unit.status === 'locked';

    return (
      <section key={unit.id} className="space-y-6">
        {/* Unit World Header */}
        <div
          className={`rounded-2xl p-5 sm:p-6 border-b-4 ${
            unitLocked
              ? 'bg-slate-200 text-slate-700 border-slate-300'
              : `${style.banner} ${style.border}`
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-medium opacity-90 tabular-nums">
                {unit.subtitle} · {completedCount}/{unit.concepts.length} Concepts Completed · ~
                {unit.estimated_hours} hrs
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-bold">{unit.title}</h2>
              <p className="text-sm opacity-90 max-w-2xl">{unit.description}</p>
            </div>
            <div className="shrink-0 flex items-center gap-2 text-xs font-semibold bg-black/15 px-3.5 py-2 rounded-xl whitespace-nowrap self-start sm:self-center">
              {unitLocked ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Pass Unit {unit.unit_number - 1} Assessment</span>
                </>
              ) : unit.status === 'completed' ? (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Mastered ({unit.assessment_score ?? 100}%)</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Active World</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Winding Micro-Concept Nodes */}
        <div className="relative py-3 flex flex-col items-center space-y-5">
          {unit.concepts.map((concept, idx) => {
            const offset = OFFSET_PATTERN[idx % OFFSET_PATTERN.length];
            const isCompleted = concept.status === 'completed';
            const isCurrent = concept.status === 'unlocked' && !unitLocked;
            const isLocked = !isCompleted && !isCurrent;

            const stateLabel = isCompleted ? 'Completed' : isCurrent ? 'Current' : 'Locked';

            return (
              <div
                key={concept.id}
                style={{ transform: `translateX(${offset}px)` }}
                className="flex flex-col items-center text-center max-w-[270px] transition-transform"
              >
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => onStartConcept(unit, concept)}
                  className={`btn-tactile w-16 h-16 rounded-full flex items-center justify-center shadow-sm transition-all ${
                    isCompleted
                      ? `${style.doneNode} cursor-pointer`
                      : isCurrent
                        ? `${style.activeNode} cursor-pointer ring-4 ${style.ring}`
                        : 'bg-slate-200 border-b-4 border-slate-300 text-slate-400 cursor-not-allowed'
                  }`}
                  aria-label={`${concept.title} (${stateLabel})`}
                >
                  {isCompleted ? (
                    <Check className="w-7 h-7 stroke-[2.75]" />
                  ) : isCurrent ? (
                    <Play className="w-7 h-7 fill-current ml-0.5" />
                  ) : (
                    <Lock className="w-6 h-6" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => onStartConcept(unit, concept)}
                  className={`mt-2 px-4 py-2.5 rounded-xl border bg-white text-left w-full transition-colors ${
                    isLocked
                      ? 'border-slate-200 opacity-65 cursor-not-allowed'
                      : 'border-slate-200 hover:border-slate-300 shadow-xs cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                    <span>
                      {unit.unit_number}.{concept.order_index} · {stateLabel}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {concept.duration_minutes}m
                    </span>
                  </div>
                  <div className="font-display font-semibold text-sm text-slate-900 mt-0.5 leading-snug">
                    {concept.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                    {isCompleted
                      ? `Best: ${concept.best_score ?? 100}% · Revisit (+${Math.round(concept.xp_reward * 0.4)} XP)`
                      : isCurrent
                        ? `Ready to start · +${concept.xp_reward} XP`
                        : 'Complete previous concept to unlock'}
                  </div>
                </button>
              </div>
            );
          })}

          {/* Unit Mastery Assessment Gate */}
          <div className="pt-3 flex flex-col items-center text-center max-w-xs">
            <button
              type="button"
              disabled={!allConceptsCompleted || unitLocked}
              onClick={() => onStartUnitAssessment(unit)}
              className={`btn-tactile px-6 py-4 rounded-2xl border-b-4 flex items-center gap-3 font-display font-bold text-sm transition-all ${
                unit.status === 'completed'
                  ? 'bg-amber-100 border-amber-300 text-amber-900 cursor-pointer'
                  : allConceptsCompleted && !unitLocked
                    ? 'bg-amber-500 border-amber-700 text-white hover:bg-amber-600 cursor-pointer'
                    : 'bg-slate-200 border-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Award className="w-5 h-5 shrink-0" />
              <span>
                {unit.status === 'completed'
                  ? `Unit ${unit.unit_number} Assessment Passed (${unit.assessment_score}%)`
                  : `Unit ${unit.unit_number} Mastery Assessment`}
              </span>
            </button>
            <p className="text-xs text-slate-500 mt-2">
              {allConceptsCompleted
                ? unit.unit_number < 4
                  ? `Pass (>=70%) to unlock Unit ${unit.unit_number + 1} · +${unit.unlock_xp_bonus} XP`
                  : `Final Mastery Gate · +${unit.unlock_xp_bonus} XP`
                : `Complete all ${unit.concepts.length} concepts in Unit ${unit.unit_number} to unlock`}
            </p>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-8">
      {/* Focused Hero Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 tabular-nums">
              {completedTotal}/{totalConcepts} Micro-Concepts Mastered · 4 Official DBMS Units
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 text-balance">
              Start with Unit I &amp; Master DBMS Step by Step
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-xl">
              Focus on one 15-minute concept at a time. Pass each quiz to unlock the next node, and pass Unit Mastery Assessments to unlock SQL Part 1, SQL Part 2, and Relational Algebra.
            </p>
          </div>

          <div className="text-xs text-slate-500 pt-1">
            Showing Unit I in focus below · Expand remaining units anytime with Show More Units
          </div>
        </div>

        <div className="lg:col-span-5 bg-slate-100 min-h-[180px] relative overflow-hidden">
          <img
            src="/src/assets/images/unit_one_foundations_1795020562705.jpg"
            alt="Isometric illustration of relational tables and ER nodes"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Primary Focus: UNIT I */}
      {unitOne && renderUnitSection(unitOne)}

      {/* Collapsible Units II, III, IV Section */}
      {remainingUnits.length > 0 && (
        <div className="pt-4 border-t border-slate-200 space-y-6">
          {/* Collapsed Preview Strip (visible when collapsed) */}
          {!showMoreUnits && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {remainingUnits.map((u) => {
                const locked = u.status === 'locked';
                const done = u.concepts.filter((c) => c.status === 'completed').length;
                return (
                  <div
                    key={u.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-white space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
                      <span>Unit {u.unit_number} · {u.concepts.length} concepts</span>
                      {locked ? (
                        <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                          <Lock className="w-3.5 h-3.5" />
                          Locked
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">
                          {done}/{u.concepts.length} done
                        </span>
                      )}
                    </div>
                    <div className="font-display font-bold text-sm text-slate-900">{u.title}</div>
                    <p className="text-xs text-slate-600 line-clamp-2">{u.description}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Rounded Toggle Button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowMoreUnits((prev) => !prev)}
              aria-expanded={showMoreUnits}
              className="btn-tactile px-7 py-3.5 rounded-full bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 border-b-4 font-display font-bold text-xs sm:text-sm tracking-wide flex items-center gap-2.5 shadow-xs cursor-pointer"
            >
              <span>{showMoreUnits ? 'SHOW LESS' : 'SHOW MORE UNITS'}</span>
              {showMoreUnits ? (
                <ChevronUp className="w-4 h-4 text-slate-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-600" />
              )}
            </button>
          </div>

          {/* Smooth Expandable Remaining Units */}
          <AnimatePresence initial={false}>
            {showMoreUnits && (
              <motion.div
                key="remaining-units"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-12 pt-2"
              >
                {remainingUnits.map((u) => renderUnitSection(u))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
