import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, LoaderCircle, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { Concept } from '../types';
import { apiFetch } from '../lib/api';

interface QuizQuestion {
  id: number;
  type: 'mcq' | 'sql';
  prompt: string;
  options?: string[];
  starterSql?: string;
}

interface QuizReview {
  questionId: number;
  type: 'mcq' | 'sql';
  prompt: string;
  submittedAnswer: string;
  correct: boolean;
  correctAnswer?: string;
  solutionSql?: string;
  explanation: string;
  hint?: string;
  validationError?: string;
  execution?: { columns: string[]; rowCount: number };
  feedback: string;
}

interface QuizSession {
  quizId: string;
  topicTitle: string;
  total: number;
  questions: QuizQuestion[];
}

interface QuizResult {
  score: number;
  total: number;
  review: QuizReview[];
}

interface SqlPracticeQuizProps {
  concept: Concept;
  unitTitle: string;
}

async function readApiResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = await response.text();
  let data: { error?: string } | undefined;
  if (body.trim()) {
    try {
      data = JSON.parse(body) as { error?: string };
    } catch {
      const detail = `The API returned an unexpected non-JSON response (HTTP ${response.status}).`;
      throw new Error(`${detail} Restart the DBMS Arena server and try again.`);
    }
  }
  if (!response.ok) {
    if (response.status === 404 && !data?.error) {
      throw new Error('The quiz API route was not found (HTTP 404). Restart the development server or redeploy the backend to load the quiz routes.');
    }
    throw new Error(data?.error || `The API request failed (HTTP ${response.status}).`);
  }
  if (!data) {
    throw new Error(`${fallbackMessage} The API returned an empty response (HTTP ${response.status}). Restart the DBMS Arena server and try again.`);
  }
  return data as T;
}

export function SqlPracticeQuiz({ concept, unitTitle }: SqlPracticeQuizProps) {
  const [quiz, setQuiz] = useState<QuizSession | null>(null);
  const [answers, setAnswers] = useState<Record<number, { selectedIndex?: number; sql?: string }>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setQuiz(null);
    setResult(null);
    setAnswers({});
    apiFetch('/api/sql/playground/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conceptId: concept.id }),
    })
      .then((response) => readApiResponse<QuizSession>(response, 'Could not generate the topic quiz.'))
      .then((data) => { if (active) setQuiz(data); })
      .catch((err) => { if (active) setError((err as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [concept.id, reloadCount]);

  const answersPayload = useMemo(() => quiz?.questions.map((question) => ({
    questionId: question.id,
    ...(question.type === 'mcq'
      ? { selectedIndex: answers[question.id]?.selectedIndex }
      : { sql: answers[question.id]?.sql }),
  })) ?? [], [answers, quiz]);

  const allAnswered = Boolean(quiz?.questions.every((question) => question.type === 'mcq'
    ? Number.isInteger(answers[question.id]?.selectedIndex)
    : Boolean(answers[question.id]?.sql?.trim())));

  const submitQuiz = async () => {
    if (!quiz || !allAnswered) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await apiFetch('/api/sql/playground/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: quiz.quizId, answers: answersPayload }),
      });
      const data = await readApiResponse<QuizResult>(response, 'Could not evaluate your quiz.');
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">AI practice quiz · {unitTitle}</p>
          <h2 className="mt-1 font-display text-xl font-bold text-slate-900">{concept.title}</h2>
          <p className="mt-1 text-sm text-slate-600">10 questions generated for this topic. Complete every answer, then submit for your score and review.</p>
        </div>
        {result && <button type="button" onClick={() => setReloadCount((count) => count + 1)} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-50"><RefreshCw className="h-3.5 w-3.5" />Generate new quiz</button>}
      </header>

      {loading && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600"><LoaderCircle className="mx-auto mb-3 h-6 w-6 animate-spin text-indigo-600" />Generating 10 topic-specific questions…</div>}

      {error && <div role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span className="flex items-start gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>{!result && <button type="button" onClick={() => setReloadCount((count) => count + 1)} className="shrink-0 font-semibold underline">Retry</button>}</div>}

      {result && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-700" /><p className="mt-2 text-xs font-bold uppercase tracking-wide text-emerald-800">Quiz complete</p><p className="mt-1 font-display text-3xl font-extrabold text-emerald-950">{result.score} / {result.total}</p><p className="mt-1 text-sm text-emerald-800">Your score is based on backend answer checks and SQL execution.</p></div>}

      {quiz && <>
        {quiz.questions.map((question, index) => {
          const review = result?.review.find((item) => item.questionId === question.id);
          const answer = answers[question.id] ?? {};
          return (
            <article key={question.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${review ? review.correct ? 'border-emerald-200' : 'border-amber-200' : 'border-slate-200'}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Question {index + 1} of 10 · {question.type === 'mcq' ? 'Multiple choice' : 'Practical SQL'}</span>
                {review && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${review.correct ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{review.correct ? 'Correct' : 'Incorrect'}</span>}
              </div>
              <h3 className="font-display text-base font-bold leading-relaxed text-slate-900">{question.prompt}</h3>

              {question.type === 'mcq' ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {question.options?.map((option, optionIndex) => {
                    const selected = answer.selectedIndex === optionIndex;
                    const correctOption = review?.correctAnswer === option;
                    return <label key={`${question.id}-${optionIndex}`} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm ${review ? correctOption ? 'border-emerald-300 bg-emerald-50' : selected ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white' : selected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <input type="radio" name={`quiz-question-${question.id}`} value={optionIndex} disabled={Boolean(result)} checked={selected} onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: { selectedIndex: optionIndex } }))} className="mt-0.5 accent-indigo-600" />
                      <span className="text-slate-800">{option}</span>
                    </label>;
                  })}
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-slate-500">Write a query using the practice database. Your answer is run in an isolated copy for grading.</p>
                  <textarea aria-label={`SQL answer for question ${index + 1}`} rows={5} disabled={Boolean(result)} value={answer.sql ?? question.starterSql ?? ''} onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: { sql: event.target.value } }))} spellCheck={false} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm text-slate-100 outline-none focus:border-emerald-400 disabled:opacity-80" />
                </div>
              )}

              {review && <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
                {question.type === 'mcq' && <p className="text-xs text-slate-700"><strong>Your answer:</strong> {review.submittedAnswer} {!review.correct && review.correctAnswer && <><span className="mx-1">·</span><strong>Correct answer:</strong> {review.correctAnswer}</>}</p>}
                {question.type === 'sql' && <>
                  {review.validationError && <p className="text-xs text-rose-800"><strong>Validation:</strong> {review.validationError}</p>}
                  {review.execution && <p className="text-xs text-slate-600">Your query returned {review.execution.rowCount} row(s){review.execution.columns.length ? ` with columns ${review.execution.columns.join(', ')}` : ''}.</p>}
                  {!review.correct && review.solutionSql && <details className="text-xs text-slate-700"><summary className="cursor-pointer font-semibold">Show one correct SQL answer</summary><pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-slate-100">{review.solutionSql}</pre></details>}
                </>}
                <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-700"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />{review.feedback}</p>
                <p className="border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-600"><strong>Explanation:</strong> {review.explanation}</p>
                {review.hint && !review.correct && <p className="text-xs text-amber-900"><strong>Hint:</strong> {review.hint}</p>}
              </div>}
            </article>
          );
        })}
        {!result && <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
          <p className="text-sm text-slate-600">{Object.keys(answers).filter((id) => quiz.questions.some((question) => question.id === Number(id) && (question.type === 'mcq' ? Number.isInteger(answers[Number(id)]?.selectedIndex) : Boolean(answers[Number(id)]?.sql?.trim())))).length} / 10 answered</p>
          <button type="button" disabled={!allAnswered || submitting} onClick={() => void submitQuiz()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}{submitting ? 'Evaluating…' : 'Submit all 10 answers'}</button>
        </div>}
      </>}
    </section>
  );
}
