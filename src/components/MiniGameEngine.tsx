import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Flame,
  Heart,
  Play,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Question } from '../types';
import { apiFetch } from '../lib/api';

interface MiniGameEngineProps {
  questions: Question[];
  hearts: number;
  title: string;
  isUnitAssessment?: boolean;
  onLoseHeart: () => Promise<void>;
  onRefillHearts: () => Promise<void>;
  onComplete: (score: number) => Promise<{
    passed: boolean;
    xpEarned: number;
    gemsEarned: number;
    unlockedTitle: string | null;
    duplicateBlocked?: boolean;
    streak?: {
      currentStreak: number;
      longestStreak: number;
      streakIncreased: boolean;
    } | null;
  }>;
}

export function MiniGameEngine({
  questions,
  hearts,
  title,
  isUnitAssessment = false,
  onLoseHeart,
  onRefillHearts,
  onComplete,
}: MiniGameEngineProps) {
  const [idx, setIdx] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [checked, setChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [finishedResult, setFinishedResult] = useState<{
    score: number;
    passed: boolean;
    xpEarned: number;
    gemsEarned: number;
    unlockedTitle: string | null;
    duplicateBlocked?: boolean;
    streak?: {
      currentStreak: number;
      longestStreak: number;
      streakIncreased: boolean;
    } | null;
  } | null>(null);

  // Per-type states
  const [selectedMcq, setSelectedMcq] = useState<number | null>(null);
  const [selectedTf, setSelectedTf] = useState<boolean | null>(null);

  // Matching state
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<Record<string, string>>({});

  // Drag-and-drop state
  const [orderList, setOrderList] = useState<string[]>([]);
  const [bucketAssignments, setBucketAssignments] = useState<Record<string, string>>({});
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  // SQL challenge state
  const [sqlText, setSqlText] = useState('');
  const [sqlChecking, setSqlChecking] = useState(false);
  const [sqlPreview, setSqlPreview] = useState<{
    columns: string[];
    rows: (string | number | null)[][];
    error?: string;
  } | null>(null);

  // Memory game state
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [solvedPairIds, setSolvedPairIds] = useState<string[]>([]);

  const currentQ = questions[idx];

  // Initialize question-specific state cleanly
  const initForQuestion = (q: Question | undefined) => {
    setChecked(false);
    setIsCorrect(false);
    setFeedbackMsg('');
    setSelectedMcq(null);
    setSelectedTf(null);
    setSelectedLeft(null);
    setMatchedPairs({});
    setBucketAssignments({});
    setSqlPreview(null);
    setFlippedIds([]);
    setSolvedPairIds([]);
    if (!q) return;
    if (q.question_type === 'drag_drop' && q.payload.mode === 'order') {
      setOrderList([...((q.payload.items as string[]) ?? [])]);
    } else {
      setOrderList([]);
    }
    if (q.question_type === 'sql_challenge') {
      setSqlText(String(q.payload.starterSql ?? 'SELECT * FROM students LIMIT 5;'));
    }
  };

  // Ensure initial question setup on first render
  useMemo(() => {
    if (currentQ && currentQ.question_type === 'drag_drop' && currentQ.payload.mode === 'order' && orderList.length === 0) {
      setOrderList([...((currentQ.payload.items as string[]) ?? [])]);
    }
    if (currentQ && currentQ.question_type === 'sql_challenge' && sqlText === '') {
      setSqlText(String(currentQ.payload.starterSql ?? ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQ?.id]);

  // Shuffled right-hand column for matching & cards for memory
  const shuffledRight = useMemo(() => {
    if (!currentQ || currentQ.question_type !== 'matching') return [];
    const pairs = (currentQ.payload.pairs as { left: string; right: string }[]) ?? [];
    return [...pairs.map((p) => p.right)].sort((a, b) => a.localeCompare(b));
  }, [currentQ]);

  const memoryCards = useMemo(() => {
    if (!currentQ || currentQ.question_type !== 'memory') return [];
    const pairs = (currentQ.payload.pairs as { id: string; term: string; definition: string }[]) ?? [];
    const cards = pairs.flatMap((p) => [
      { cardKey: `${p.id}-term`, pairId: p.id, label: p.term, kind: 'Term' },
      { cardKey: `${p.id}-def`, pairId: p.id, label: p.definition, kind: 'Meaning' },
    ]);
    return cards.sort((a, b) => a.label.localeCompare(b.label));
  }, [currentQ]);

  if (!questions || questions.length === 0) {
    return (
      <div className="p-6 rounded-xl border border-slate-200 bg-white text-center text-slate-600">
        No assessment questions found for this module yet.
      </div>
    );
  }

  if (hearts <= 0 && !finishedResult) {
    return (
      <div className="p-8 rounded-2xl border border-rose-200 bg-rose-50 text-center space-y-4">
        <Heart className="w-12 h-12 text-rose-500 mx-auto fill-rose-500" />
        <h3 className="font-display text-xl font-bold text-slate-900">Out of Hearts!</h3>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Mistakes happen while mastering schemas and SQL. Refill your hearts to continue the assessment.
        </p>
        <button
          type="button"
          onClick={onRefillHearts}
          className="btn-tactile px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm border-b-4 border-rose-800 cursor-pointer"
        >
          Restore Hearts Now
        </button>
      </div>
    );
  }

  if (finishedResult) {
    return (
      <div className="p-8 rounded-2xl border border-slate-200 bg-white text-center space-y-6">
        <div
          className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${
            finishedResult.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {finishedResult.passed ? <Sparkles className="w-8 h-8" /> : <RotateCcw className="w-8 h-8" />}
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500">
            {isUnitAssessment ? 'Unit Mastery Assessment' : 'Concept Assessment'}
          </div>
          <h3 className="font-display text-2xl font-bold text-slate-900">
            {finishedResult.passed ? 'Assessment Passed!' : 'Keep Practicing — Almost There!'}
          </h3>
          <p className="text-sm text-slate-600">
            You scored <strong className="tabular-nums text-slate-900">{finishedResult.score}%</strong> (70% required to unlock next stage).
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-6 py-4 border-y border-slate-100">
          <div>
            <div className="text-xs text-slate-500">XP Earned</div>
            <div className="font-display text-2xl font-bold text-emerald-600 tabular-nums">
              +{finishedResult.xpEarned} XP
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Gems Earned</div>
            <div className="font-display text-2xl font-bold text-sky-600 tabular-nums">
              +{finishedResult.gemsEarned} Gems
            </div>
          </div>
        </div>

        {finishedResult.duplicateBlocked && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
            Practice replay completed (daily replay XP cap reached for this module).
          </div>
        )}

        {finishedResult.streak?.streakIncreased && (
          <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-950 flex items-center justify-center gap-2 font-semibold">
            <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
            <span>
              Daily Streak Maintained: {finishedResult.streak.currentStreak}{' '}
              {finishedResult.streak.currentStreak === 1 ? 'Day' : 'Days'}!
            </span>
          </div>
        )}

        {finishedResult.unlockedTitle && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
            Unlocked Next Step: <strong>{finishedResult.unlockedTitle}</strong>
          </div>
        )}

        {!finishedResult.passed && (
          <button
            type="button"
            onClick={() => {
              setIdx(0);
              setCorrectCount(0);
              setFinishedResult(null);
              initForQuestion(questions[0]);
            }}
            className="btn-tactile px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm border-b-4 border-emerald-800 cursor-pointer"
          >
            Retry Assessment
          </button>
        )}
      </div>
    );
  }

  const recordOutcome = async (ok: boolean, customMsg?: string) => {
    setChecked(true);
    setIsCorrect(ok);
    setFeedbackMsg(customMsg || currentQ.explanation);
    if (ok) {
      setCorrectCount((c) => c + 1);
    } else {
      await onLoseHeart();
    }
  };

  const handleCheck = async () => {
    if (currentQ.question_type === 'mcq') {
      if (selectedMcq === null) return;
      const ok = selectedMcq === Number(currentQ.payload.correctIndex);
      await recordOutcome(ok);
    } else if (currentQ.question_type === 'true_false') {
      if (selectedTf === null) return;
      const ok = selectedTf === Boolean(currentQ.payload.correct);
      await recordOutcome(ok);
    } else if (currentQ.question_type === 'matching') {
      const pairs = (currentQ.payload.pairs as { left: string; right: string }[]) ?? [];
      if (Object.keys(matchedPairs).length < pairs.length) return;
      const ok = pairs.every((p) => matchedPairs[p.left] === p.right);
      await recordOutcome(ok);
    } else if (currentQ.question_type === 'drag_drop') {
      if (currentQ.payload.mode === 'order') {
        const expected = (currentQ.payload.correctOrder as string[]) ?? [];
        const ok = expected.every((val, i) => orderList[i] === val);
        await recordOutcome(ok);
      } else {
        const items = (currentQ.payload.items as string[]) ?? [];
        if (Object.keys(bucketAssignments).length < items.length) return;
        const buckets = (currentQ.payload.correctBuckets as Record<string, string[]>) ?? {};
        const ok = items.every((item) => {
          const chosenCat = bucketAssignments[item];
          return (buckets[chosenCat] ?? []).includes(item);
        });
        await recordOutcome(ok);
      }
    } else if (currentQ.question_type === 'sql_challenge') {
      setSqlChecking(true);
      try {
        const res = await apiFetch('/api/sql/check-challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sql: sqlText,
            requiredColumns: currentQ.payload.requiredColumns,
            expectedMinRows: currentQ.payload.expectedMinRows,
            challengeKey: `q:${currentQ.id}`,
            conceptId: currentQ.concept_id ?? undefined,
          }),
        });
        const data = await res.json();
        setSqlPreview({
          columns: data.columns ?? [],
          rows: data.rows ?? [],
          error: data.error,
        });
        await recordOutcome(Boolean(data.passed), data.feedback || data.error || currentQ.explanation);
      } catch (err) {
        setSqlPreview({ columns: [], rows: [], error: (err as Error).message });
      } finally {
        setSqlChecking(false);
      }
    }
  };

  const handleMemoryFlip = async (cardKey: string, pairId: string) => {
    if (checked) return;
    if (flippedIds.includes(cardKey) || solvedPairIds.includes(pairId)) return;
    if (flippedIds.length >= 2) return;

    const nextFlipped = [...flippedIds, cardKey];
    setFlippedIds(nextFlipped);

    if (nextFlipped.length === 2) {
      const [firstKey, secondKey] = nextFlipped;
      const firstCard = memoryCards.find((c) => c.cardKey === firstKey);
      const secondCard = memoryCards.find((c) => c.cardKey === secondKey);
      if (firstCard && secondCard && firstCard.pairId === secondCard.pairId) {
        const nextSolved = [...solvedPairIds, firstCard.pairId];
        setSolvedPairIds(nextSolved);
        setFlippedIds([]);
        const totalPairs = ((currentQ.payload.pairs as unknown[]) ?? []).length;
        if (nextSolved.length === totalPairs) {
          await recordOutcome(true, 'All concept pairs matched!');
        }
      } else {
        setTimeout(() => setFlippedIds([]), 650);
      }
    }
  };

  const handleNext = async () => {
    if (idx + 1 < questions.length) {
      const nextIndex = idx + 1;
      setIdx(nextIndex);
      initForQuestion(questions[nextIndex]);
    } else {
      const finalScore = Math.round((correctCount / questions.length) * 100);
      const res = await onComplete(finalScore);
      if (res.passed) {
        confetti({ particleCount: 70, spread: 65, origin: { y: 0.65 } });
      }
      setFinishedResult({ score: finalScore, ...res });
    }
  };

  const moveOrderItem = (index: number, dir: -1 | 1) => {
    if (checked) return;
    const target = index + dir;
    if (target < 0 || target >= orderList.length) return;
    const copy = [...orderList];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    setOrderList(copy);
  };

  const typeLabelMap: Record<string, string> = {
    mcq: 'Multiple Choice',
    true_false: 'True or False',
    matching: 'Match Pairs',
    drag_drop: 'Drag & Drop Builder',
    sql_challenge: 'Live SQL Challenge',
    memory: 'Memory Flip Game',
  };

  return (
    <div className="space-y-5">
      {/* Progress Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="text-xs text-slate-500">
            {title} · {typeLabelMap[currentQ.question_type]}
          </div>
          <div className="text-sm font-semibold text-slate-900 tabular-nums">
            Challenge {idx + 1} of {questions.length}
          </div>
        </div>
        <div className="flex-1 max-w-xs h-2.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${((idx + (checked ? 1 : 0)) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <div className="p-5 sm:p-6 rounded-2xl border border-slate-200 bg-white space-y-5">
        <h4 className="font-display text-lg font-bold text-slate-900">{currentQ.prompt}</h4>

        {/* MCQ */}
        {currentQ.question_type === 'mcq' && (
          <div className="space-y-2.5">
            {((currentQ.payload.options as string[]) ?? []).map((opt, i) => {
              const isSelected = selectedMcq === i;
              const isRightOpt = checked && i === Number(currentQ.payload.correctIndex);
              const isWrongPicked = checked && isSelected && !isRightOpt;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={checked}
                  onClick={() => setSelectedMcq(i)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3 cursor-pointer ${
                    isRightOpt
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-950'
                      : isWrongPicked
                        ? 'border-rose-400 bg-rose-50 text-rose-950'
                        : isSelected
                          ? 'border-sky-500 bg-sky-50 text-slate-900'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800'
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-sm font-medium">{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* TRUE / FALSE */}
        {currentQ.question_type === 'true_false' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800">
              “{String(currentQ.payload.statement ?? '')}”
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'True', val: true },
                { label: 'False', val: false },
              ].map((btn) => {
                const isSelected = selectedTf === btn.val;
                return (
                  <button
                    key={btn.label}
                    type="button"
                    disabled={checked}
                    onClick={() => setSelectedTf(btn.val)}
                    className={`p-4 rounded-xl border-2 font-display font-bold text-base transition-all cursor-pointer ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50 text-sky-900'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800'
                    }`}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* MATCHING */}
        {currentQ.question_type === 'matching' && (
          <div className="space-y-3">
            <div className="text-xs text-slate-500">
              Select a term on the left, then click its matching definition on the right.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                {((currentQ.payload.pairs as { left: string; right: string }[]) ?? []).map((p) => {
                  const active = selectedLeft === p.left;
                  const paired = Boolean(matchedPairs[p.left]);
                  return (
                    <button
                      key={p.left}
                      type="button"
                      disabled={checked}
                      onClick={() => setSelectedLeft(p.left)}
                      className={`w-full text-left p-3.5 rounded-xl border-2 text-sm transition-all cursor-pointer ${
                        active
                          ? 'border-sky-500 bg-sky-50 font-semibold'
                          : paired
                            ? 'border-emerald-400 bg-emerald-50/70'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="font-medium text-slate-900">{p.left}</div>
                      {paired && (
                        <div className="text-xs text-emerald-700 mt-1 truncate">
                          &rarr; {matchedPairs[p.left]}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2">
                {shuffledRight.map((rightText) => {
                  const isUsed = Object.values(matchedPairs).includes(rightText);
                  return (
                    <button
                      key={rightText}
                      type="button"
                      disabled={checked || !selectedLeft}
                      onClick={() => {
                        if (!selectedLeft) return;
                        setMatchedPairs((prev) => ({ ...prev, [selectedLeft]: rightText }));
                        setSelectedLeft(null);
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border-2 text-sm transition-all cursor-pointer ${
                        isUsed
                          ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900'
                          : selectedLeft
                            ? 'border-sky-200 bg-white hover:border-sky-500'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {rightText}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* DRAG & DROP (ORDER OR CATEGORIZE) */}
        {currentQ.question_type === 'drag_drop' && currentQ.payload.mode === 'order' && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500">Drag rows or use arrows to arrange in the exact order:</div>
            {orderList.map((item, i) => (
              <div
                key={item}
                draggable={!checked}
                onDragStart={() => setDraggedItem(item)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!draggedItem || draggedItem === item || checked) return;
                  const fromIdx = orderList.indexOf(draggedItem);
                  const copy = [...orderList];
                  copy.splice(fromIdx, 1);
                  copy.splice(i, 0, draggedItem);
                  setOrderList(copy);
                  setDraggedItem(null);
                }}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 cursor-grab"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-md bg-white border border-slate-200 text-xs font-mono font-bold flex items-center justify-center text-slate-700">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-900">{item}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={checked || i === 0}
                    onClick={() => moveOrderItem(i, -1)}
                    aria-label="Move up"
                    className="p-1.5 rounded-lg hover:bg-white text-slate-600 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={checked || i === orderList.length - 1}
                    onClick={() => moveOrderItem(i, 1)}
                    aria-label="Move down"
                    className="p-1.5 rounded-lg hover:bg-white text-slate-600 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {currentQ.question_type === 'drag_drop' && currentQ.payload.mode === 'categorize' && (
          <div className="space-y-4">
            <div className="text-xs text-slate-500">
              Drag each item into a bucket below (or click an item then click a bucket):
            </div>
            <div className="flex flex-wrap gap-2">
              {((currentQ.payload.items as string[]) ?? []).map((item) => {
                const assigned = bucketAssignments[item];
                const isActive = draggedItem === item;
                return (
                  <button
                    key={item}
                    type="button"
                    draggable={!checked}
                    onDragStart={() => setDraggedItem(item)}
                    onClick={() => setDraggedItem(isActive ? null : item)}
                    className={`px-3.5 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                      isActive
                        ? 'border-sky-500 bg-sky-50 text-sky-900'
                        : assigned
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400'
                    }`}
                  >
                    {item} {assigned ? `(${assigned})` : ''}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {((currentQ.payload.categories as string[]) ?? []).map((cat) => {
                const itemsInCat = Object.entries(bucketAssignments)
                  .filter(([, c]) => c === cat)
                  .map(([k]) => k);
                return (
                  <div
                    key={cat}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!draggedItem || checked) return;
                      setBucketAssignments((prev) => ({ ...prev, [draggedItem]: cat }));
                      setDraggedItem(null);
                    }}
                    onClick={() => {
                      if (!draggedItem || checked) return;
                      setBucketAssignments((prev) => ({ ...prev, [draggedItem]: cat }));
                      setDraggedItem(null);
                    }}
                    className="p-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 min-h-[110px] space-y-2 cursor-pointer hover:border-sky-400"
                  >
                    <div className="font-display font-semibold text-sm text-slate-900">{cat}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {itemsInCat.length === 0 ? (
                        <span className="text-xs text-slate-400">Drop or click items here</span>
                      ) : (
                        itemsInCat.map((it) => (
                          <span key={it} className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs text-slate-800">
                            {it}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SQL CHALLENGE */}
        {currentQ.question_type === 'sql_challenge' && (
          <div className="space-y-3">
            <div className="text-xs text-slate-500">
              Practice tables: <span className="font-mono">students, departments, courses, enrollments, instructors</span>
            </div>
            <textarea
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              disabled={checked}
              rows={4}
              spellCheck={false}
              className="w-full p-3.5 rounded-xl bg-slate-900 text-emerald-300 font-mono text-sm border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {sqlPreview && (
              <div className="rounded-xl border border-slate-200 overflow-x-auto bg-slate-50">
                {sqlPreview.error ? (
                  <div className="p-3 text-xs font-mono text-rose-700">{sqlPreview.error}</div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200">
                        {sqlPreview.columns.map((c) => (
                          <th key={c} className="px-3 py-2 font-mono font-semibold text-slate-800">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sqlPreview.rows.slice(0, 5).map((r, ri) => (
                        <tr key={ri}>
                          {r.map((cell, ci) => (
                            <td key={ci} className="px-3 py-1.5 font-mono text-slate-700 tabular-nums">
                              {String(cell ?? 'NULL')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

        {/* MEMORY GAME */}
        {currentQ.question_type === 'memory' && (
          <div className="space-y-3">
            <div className="text-xs text-slate-500 tabular-nums">
              Pairs Matched: {solvedPairIds.length} / {((currentQ.payload.pairs as unknown[]) ?? []).length}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {memoryCards.map((card) => {
                const isSolved = solvedPairIds.includes(card.pairId);
                const isFlipped = flippedIds.includes(card.cardKey) || isSolved;
                return (
                  <button
                    key={card.cardKey}
                    type="button"
                    onClick={() => handleMemoryFlip(card.cardKey, card.pairId)}
                    className={`p-3 rounded-xl border-2 min-h-[88px] text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                      isSolved
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-950'
                        : isFlipped
                          ? 'border-sky-500 bg-sky-50 text-slate-900'
                          : 'border-slate-200 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {isFlipped ? (
                      <>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          {card.kind}
                        </span>
                        <span className="text-xs font-medium leading-snug">{card.label}</span>
                      </>
                    ) : (
                      <span className="font-display font-bold text-sm">DBMS</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Feedback Banner */}
        {checked && (
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              isCorrect
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}
          >
            {isCorrect ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1 text-sm">
              <div className="font-display font-bold">{isCorrect ? 'Spot on!' : 'Not quite right'}</div>
              <p className="text-slate-700">{feedbackMsg}</p>
            </div>
          </div>
        )}

        {/* Footer Controls */}
        <div className="flex justify-end pt-2">
          {!checked ? (
            currentQ.question_type !== 'memory' && (
              <button
                type="button"
                disabled={sqlChecking}
                onClick={handleCheck}
                className="btn-tactile px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm border-b-4 border-emerald-800 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {currentQ.question_type === 'sql_challenge' && <Play className="w-4 h-4" />}
                {sqlChecking ? 'Executing SQL...' : 'Check Answer'}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="btn-tactile px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm border-b-4 border-sky-800 cursor-pointer"
            >
              {idx + 1 < questions.length ? 'Continue' : 'Finish Assessment'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
