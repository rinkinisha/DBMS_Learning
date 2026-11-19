import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Code2,
  GitBranch,
  Heart,
  Play,
  RefreshCw,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { AiExplanation, Concept, Question, SqlExecutionResult, Unit } from '../types';
import { InteractiveDiagram } from './InteractiveDiagram';
import { MiniGameEngine } from './MiniGameEngine';
import { apiFetch } from '../lib/api';

interface ConceptLessonModalProps {
  unit: Unit;
  concept: Concept | null;
  isUnitAssessment: boolean;
  hearts: number;
  onClose: () => void;
  onOpenPlaygroundWithSql: (sql: string) => void;
  onAskTutor: (prompt: string) => void;
  onLoseHeart: () => Promise<void>;
  onRefillHearts: () => Promise<void>;
  onDashboardRefresh: () => Promise<void>;
  onStreakCelebrated?: () => void;
}

type StageKey = 'brief' | 'diagram' | 'practical' | 'quiz';

export function ConceptLessonModal({
  unit,
  concept,
  isUnitAssessment,
  hearts,
  onClose,
  onOpenPlaygroundWithSql,
  onAskTutor,
  onLoseHeart,
  onRefillHearts,
  onDashboardRefresh,
  onStreakCelebrated,
}: ConceptLessonModalProps) {
  const [stage, setStage] = useState<StageKey>(isUnitAssessment ? 'quiz' : 'brief');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [questionError, setQuestionError] = useState<string | null>(null);

  const [aiData, setAiData] = useState<AiExplanation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [demoResult, setDemoResult] = useState<SqlExecutionResult | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingQuestions(true);
    setQuestionError(null);
    const url = isUnitAssessment
      ? `/api/units/${unit.id}/assessment`
      : `/api/concepts/${concept?.id}/questions`;

    apiFetch(url)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Could not load questions');
        return data;
      })
      .then((data) => {
        if (active) setQuestions(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (active) {
          setQuestions([]);
          setQuestionError((err as Error).message);
        }
      })
      .finally(() => {
        if (active) setLoadingQuestions(false);
      });

    return () => {
      active = false;
    };
  }, [unit.id, concept?.id, isUnitAssessment]);

  const loadAiExplanation = async (refresh = false) => {
    if (!concept) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiFetch('/api/gemini/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conceptId: concept.id, refresh }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate AI explanation');
      setAiData(data);
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const runDemoSql = async () => {
    if (!concept) return;
    setDemoLoading(true);
    setDemoError(null);
    try {
      const res = await apiFetch('/api/sql/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: concept.practical_sql }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SQL execution failed');
      setDemoResult(data);
      await onDashboardRefresh();
    } catch (err) {
      setDemoError((err as Error).message);
    } finally {
      setDemoLoading(false);
    }
  };

  const handleAssessmentComplete = async (score: number) => {
    const res = await apiFetch('/api/assessments/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conceptId: concept?.id,
        unitId: unit.id,
        isUnitAssessment,
        score,
      }),
    });
    const data = await res.json();
    if (data.streak?.streakIncreased && onStreakCelebrated) {
      onStreakCelebrated();
    }
    await onDashboardRefresh();
    return {
      passed: Boolean(data.passed),
      xpEarned: Number(data.xpEarned ?? 0),
      gemsEarned: Number(data.gemsEarned ?? 0),
      unlockedTitle: data.unlockedTitle ?? null,
      duplicateBlocked: Boolean(data.duplicateBlocked),
      streak: data.streak ?? null,
    };
  };

  const stages: { key: StageKey; label: string; icon: typeof BookOpen }[] = [
    { key: 'brief', label: '1. Lesson & AI', icon: BookOpen },
    { key: 'diagram', label: '2. Visual Diagram', icon: GitBranch },
    { key: 'practical', label: '3. Practical Demo', icon: Code2 },
    { key: 'quiz', label: '4. Knowledge Check & Challenge', icon: Trophy },
  ];

  const lc = concept?.lesson_content;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl bg-[#F8FAFC] rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 truncate">
              {unit.title} · {isUnitAssessment ? 'Mastery Assessment' : `${concept?.duration_minutes ?? 15} min concept`}
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 truncate">
              {isUnitAssessment ? `${unit.title} — Unit Assessment` : concept?.title}
            </h2>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-600 tabular-nums">
              <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
              <span>{hearts}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close lesson"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stage Switcher */}
        {!isUnitAssessment && concept && (
          <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto">
            {stages.map((st) => {
              const Icon = st.icon;
              const active = stage === st.key;
              return (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setStage(st.key)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{st.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {stage === 'brief' && concept && (
            <div className="space-y-5">
              {/* 1. Simple Introduction */}
              <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                <div className="text-xs font-semibold text-emerald-800">01. Simple Introduction</div>
                <p className="text-slate-900 text-sm sm:text-base leading-relaxed">
                  {lc?.simpleIntro || concept.summary}
                </p>
              </div>

              {/* 2. Detailed Beginner-Friendly Explanation */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-2">
                <div className="text-xs font-semibold text-sky-700">02. Beginner-Friendly Explanation</div>
                <p className="text-slate-800 text-sm sm:text-base leading-relaxed">
                  {lc?.detailedExplanation || concept.definition_text}
                </p>
              </div>

              {/* 3. Important Definitions & 4. Real-World Examples */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-3">
                  <div className="text-xs font-semibold text-slate-700">03. Key Definitions</div>
                  <div className="space-y-2.5">
                    {(lc?.definitions && lc.definitions.length > 0
                      ? lc.definitions
                      : [{ term: concept.title, meaning: concept.definition_text }]
                    ).map((d, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-semibold text-slate-900">{d.term}: </span>
                        <span className="text-slate-600">{d.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-3">
                  <div className="text-xs font-semibold text-slate-700">04. Real-World Examples</div>
                  <ul className="list-disc pl-4 space-y-2 text-sm text-slate-700">
                    {(lc?.realWorldExamples && lc.realWorldExamples.length > 0
                      ? lc.realWorldExamples
                      : [concept.example_text]
                    ).map((ex, i) => (
                      <li key={i}>{ex}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* 7. Common Mistakes & 8. Quick Recap */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2.5">
                  <div className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Common Mistakes to Avoid</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1.5 text-xs sm:text-sm text-slate-800">
                    {(lc?.commonMistakes ?? ['Double-check definitions and constraints before running queries.']).map(
                      (m, i) => (
                        <li key={i}>{m}</li>
                      )
                    )}
                  </ul>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
                  <div className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Quick Recap</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1.5 text-xs sm:text-sm text-slate-700">
                    {(lc?.quickRecap ?? [concept.summary]).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Gemini AI Deep Dive */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900">
                      AI Tutor Deep Dive ({concept.title})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Generate extra analogies and worked SQL examples tailored to {unit.title}.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => loadAiExplanation(Boolean(aiData))}
                      disabled={aiLoading}
                      className="btn-tactile px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold border-b-4 border-emerald-800 flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {aiData ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>
                        {aiLoading
                          ? 'Generating...'
                          : aiData
                            ? 'Regenerate AI Example'
                            : 'Generate AI Deep Dive'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onAskTutor(`I am studying "${concept.title}" in ${unit.title}. Can you give me another beginner-friendly example?`)
                      }
                      className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                    >
                      Ask Doubt
                    </button>
                  </div>
                </div>

                {aiError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    {aiError}
                  </div>
                )}

                {aiData && (
                  <div className="space-y-4 pt-2 border-t border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1.5">
                        <div className="text-xs font-semibold text-emerald-800">AI Analogy</div>
                        <p className="text-sm text-slate-800 leading-relaxed">{aiData.realWorldAnalogy}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200 space-y-1.5">
                        <div className="text-xs font-semibold text-sky-800">Worked Example</div>
                        <p className="text-sm text-slate-800 leading-relaxed">{aiData.workedExample}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage('diagram')}
                  className="btn-tactile px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm border-b-4 border-emerald-800 cursor-pointer"
                >
                  Next: Visual Diagram
                </button>
              </div>
            </div>
          )}

          {stage === 'diagram' && concept && (
            <div className="space-y-6">
              {lc?.visualSteps && lc.visualSteps.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {lc.visualSteps.map((vs, idx) => (
                    <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
                      <div className="text-xs font-mono font-bold text-emerald-700">{vs.step}</div>
                      <div className="font-display font-semibold text-sm text-slate-900">{vs.title}</div>
                      <p className="text-xs text-slate-600">{vs.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 space-y-4">
                <h3 className="font-display font-bold text-lg text-slate-900">
                  Interactive Visual Diagram · {concept.title}
                </h3>
                <InteractiveDiagram diagramType={concept.diagram_type} config={concept.diagram_config} />
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStage('brief')}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStage('practical')}
                  className="btn-tactile px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm border-b-4 border-emerald-800 cursor-pointer"
                >
                  Next: Practical SQL Demo
                </button>
              </div>
            </div>
          )}

          {stage === 'practical' && concept && (
            <div className="space-y-6">
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display font-bold text-lg text-slate-900">05. Practical Example &amp; Live Demo</h3>
                    <p className="text-sm text-slate-600">{concept.practical_explanation}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenPlaygroundWithSql(concept.practical_sql)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                  >
                    Open in SQL Playground
                  </button>
                </div>

                <pre className="p-4 rounded-xl bg-slate-900 text-emerald-300 font-mono text-xs sm:text-sm overflow-x-auto">
                  {concept.practical_sql}
                </pre>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={runDemoSql}
                    disabled={demoLoading}
                    className="btn-tactile px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold border-b-4 border-sky-800 flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{demoLoading ? 'Running...' : 'Execute Practical Demo'}</span>
                  </button>
                </div>

                {demoError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-mono text-rose-800">
                    {demoError}
                  </div>
                )}

                {demoResult && (
                  <div className="rounded-xl border border-slate-200 overflow-x-auto">
                    <div className="px-4 py-2 bg-slate-100 text-xs text-slate-600 flex justify-between tabular-nums">
                      <span>{demoResult.rowCount} row(s)</span>
                      <span>{demoResult.executionMs} ms</span>
                    </div>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {demoResult.columns.map((col) => (
                            <th key={col} className="px-4 py-2.5 font-mono font-semibold text-slate-900">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {demoResult.rows.map((r, ri) => (
                          <tr key={ri} className="hover:bg-slate-50">
                            {r.map((cell, ci) => (
                              <td key={ci} className="px-4 py-2 font-mono text-slate-700 tabular-nums">
                                {String(cell ?? 'NULL')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStage('diagram')}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStage('quiz')}
                  className="btn-tactile px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm border-b-4 border-emerald-800 cursor-pointer"
                >
                  Start Knowledge Check &amp; Mini Challenge
                </button>
              </div>
            </div>
          )}

          {stage === 'quiz' && (
            <div>
              {loadingQuestions ? (
                <div className="p-8 text-center text-sm text-slate-500">Loading interactive challenges...</div>
              ) : questionError ? (
                <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
                  {questionError}
                </div>
              ) : (
                <MiniGameEngine
                  questions={questions}
                  hearts={hearts}
                  title={isUnitAssessment ? `${unit.title} Mastery` : concept?.title ?? 'Assessment'}
                  isUnitAssessment={isUnitAssessment}
                  onLoseHeart={onLoseHeart}
                  onRefillHearts={onRefillHearts}
                  onComplete={handleAssessmentComplete}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
