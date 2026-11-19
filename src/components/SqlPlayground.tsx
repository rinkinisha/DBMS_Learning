import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, CheckCircle2, Database, Flame, History, KeyRound, Lightbulb, Play,
  RotateCcw, Sparkles, Table2, Trophy, XCircle,
} from 'lucide-react';
import { Concept, PracticeTableInfo, QuestionType, SqlExecutionResult, Unit } from '../types';
import { apiFetch } from '../lib/api';

interface SqlPlaygroundProps {
  units: Unit[];
  initialSql?: string;
  initialConceptId?: number;
  onAskTutorAboutSql: (sql: string) => void;
  onQueryExecuted: () => Promise<void>;
}

type TopicMode = 'theory' | 'mixed' | 'sql';
type Challenge = {
  challengeId: string; kind: TopicMode; type?: QuestionType | 'fill_blank' | 'scenario';
  prompt: string; hint: string; options?: string[]; statement?: string;
  leftItems?: string[]; rightItems?: string[]; starterSql?: string;
};
type Feedback = { correct: boolean; feedback: string; hint?: string | null; xpAwarded: number; gemsAwarded: number };

const THEORY_SEQUENCE = ['mcq', 'true_false', 'fill_blank', 'matching', 'scenario'] as const;
const PRESET_QUERIES = [
  { label: 'Filter high GPA', sql: 'SELECT full_name, gpa\nFROM students\nWHERE gpa >= 3.8;\n' },
  { label: 'Join courses & instructors', sql: 'SELECT c.course_code, c.title, i.full_name\nFROM courses c\nJOIN instructors i ON i.instructor_id = c.instructor_id;\n' },
  { label: 'Group students by department', sql: 'SELECT dept_id, COUNT(*) AS student_count\nFROM students\nGROUP BY dept_id;\n' },
];

function topicMode(concept: Concept): TopicMode {
  const text = `${concept.title} ${concept.topic_tag ?? ''} ${concept.summary}`.toLowerCase();
  if (/primary key|foreign key|candidate key|relational algebra|normalization|normal form|integrity constraint|er model|entity relationship/.test(text)) return 'mixed';
  if (/\bsql\b|select|where clause|join|group by|having|order by|insert|update|delete|aggregate|subquery|union|exists|view|index|trigger|transaction/.test(text)) return 'sql';
  return 'theory';
}

const sqlTokens = /(--[^\n]*|'(?:''|[^'])*'|\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|AND|OR|NOT|NULL|IS|IN|LIKE|BETWEEN|GROUP|BY|HAVING|ORDER|ASC|DESC|LIMIT|OFFSET|UNION|ALL|DISTINCT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|PRIMARY|KEY|FOREIGN|REFERENCES|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END|WITH)\b|\b\d+(?:\.\d+)?\b)/gi;
function highlightSql(source: string) {
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of source.matchAll(sqlTokens)) {
    const index = match.index ?? 0;
    if (index > cursor) pieces.push(source.slice(cursor, index));
    const token = match[0];
    const color = token.startsWith('--') ? 'text-slate-500' : token.startsWith("'") ? 'text-amber-300' : /^\d/.test(token) ? 'text-fuchsia-300' : /^(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|AND|OR|NOT|GROUP|BY|HAVING|ORDER|ASC|DESC|LIMIT|UNION|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|WITH)$/i.test(token) ? 'text-sky-300' : 'text-violet-300';
    pieces.push(<span key={`${index}-${token}`} className={color}>{token}</span>);
    cursor = index + token.length;
  }
  if (cursor < source.length) pieces.push(source.slice(cursor));
  return pieces;
}

export function SqlPlayground({ units, initialSql, initialConceptId, onAskTutorAboutSql, onQueryExecuted }: SqlPlaygroundProps) {
  const concepts = useMemo(() => units.flatMap((unit) => unit.concepts.map((concept) => ({ unit, concept }))), [units]);
  const [selectedConceptId, setSelectedConceptId] = useState<number>(() => initialConceptId ?? concepts.find(({ concept }) => topicMode(concept) === 'sql')?.concept.id ?? concepts.find(({ concept }) => concept.status !== 'locked')?.concept.id ?? concepts[0]?.concept.id ?? 0);
  const selected = concepts.find(({ concept }) => concept.id === selectedConceptId) ?? concepts[0];
  const mode = selected ? topicMode(selected.concept) : 'theory';
  const [mixedPart, setMixedPart] = useState<'theory' | 'sql'>('theory');
  const activeMode = mode === 'mixed' ? mixedPart : mode;
  const [tables, setTables] = useState<PracticeTableInfo[]>([]);
  const [sql, setSql] = useState(initialSql || 'SELECT full_name, gpa\nFROM students\nWHERE gpa >= 3.8;');
  const [result, setResult] = useState<SqlExecutionResult | null>(null);
  const [sqlError, setSqlError] = useState('');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [challengeStep, setChallengeStep] = useState(0);
  const [selection, setSelection] = useState<number | null>(null);
  const [booleanAnswer, setBooleanAnswer] = useState<boolean | null>(null);
  const [fillAnswer, setFillAnswer] = useState('');
  const [matchingAnswers, setMatchingAnswers] = useState<Record<string, string>>({});
  const [hintVisible, setHintVisible] = useState(false);
  const [highlightScroll, setHighlightScroll] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [solvedTopics, setSolvedTopics] = useState<Set<number>>(() => new Set());
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const loadTables = async () => {
    try { const res = await apiFetch('/api/sql/tables'); const data = await res.json(); if (Array.isArray(data)) setTables(data); }
    catch { /* The schema panel can retry after the server reconnects. */ }
  };

  useEffect(() => { void loadTables(); }, []);
  useEffect(() => { if (initialSql) setSql(initialSql); }, [initialSql]);
  useEffect(() => { if (initialConceptId) changeTopic(initialConceptId); }, [initialConceptId]);

  useEffect(() => {
    if (!selected) return;
    if (activeMode !== 'sql' && challengeStep >= THEORY_SEQUENCE.length) {
      setChallenge(null);
      setChallengeLoading(false);
      return;
    }
    let active = true;
    setChallenge(null); setFeedback(null); setChallengeError(''); setHintVisible(false);
    setSelection(null); setBooleanAnswer(null); setFillAnswer(''); setMatchingAnswers({});
    setChallengeLoading(true);
    const kind = activeMode === 'sql' ? 'sql' : 'theory';
    const type = THEORY_SEQUENCE[challengeStep % THEORY_SEQUENCE.length];
    apiFetch(`/api/sql/playground/challenge/${selected.concept.id}?kind=${kind}&type=${type}`)
      .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not load the challenge.'); return data; })
      .then((data) => { if (active) { setChallenge(data); if (data.starterSql) setSql(data.starterSql); } })
      .catch((err) => { if (active) setChallengeError((err as Error).message); })
      .finally(() => { if (active) setChallengeLoading(false); });
    return () => { active = false; };
  }, [selected?.concept.id, activeMode, challengeStep, reloadKey]);

  const changeTopic = (id: number) => {
    setSelectedConceptId(id); setChallengeStep(0); setResult(null); setSqlError('');
    setMixedPart('theory');
    setSql(initialSql || 'SELECT * FROM students LIMIT 5;');
  };

  const executeSql = async () => {
    const query = sql.trim();
    if (!query) { setSqlError('Write a query before running it.'); return; }
    setRunning(true); setSqlError(''); setFeedback(null);
    try {
      const res = await apiFetch('/api/sql/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: query }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SQL query failed.');
      setResult(data); setHistory((prev) => [query, ...prev.filter((item) => item !== query)].slice(0, 6));
      await loadTables(); await onQueryExecuted();
    } catch (err) { setSqlError((err as Error).message); setResult(null); }
    finally { setRunning(false); }
  };

  const submitAnswer = async () => {
    if (!challenge) return;
    const answer = challenge.type === 'mcq' || challenge.type === 'scenario' ? { selectedIndex: selection }
      : challenge.type === 'true_false' ? { value: booleanAnswer }
        : challenge.type === 'fill_blank' ? { value: fillAnswer }
          : { pairs: matchingAnswers };
    if (activeMode !== 'sql' && (selection === null && booleanAnswer === null && !fillAnswer.trim() && Object.keys(matchingAnswers).length === 0)) return;
    setRunning(true); setFeedback(null);
    try {
      const res = await apiFetch('/api/sql/playground/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId: challenge.challengeId, answer: activeMode === 'sql' ? undefined : answer, sql: activeMode === 'sql' ? sql : undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit the answer.');
      setFeedback(data);
      if (data.result) setResult(data.result);
      if (data.error) setSqlError(data.error);
      if (data.correct) {
        if (activeMode === 'sql' || challengeStep === THEORY_SEQUENCE.length - 1) {
          setSolvedTopics((previous) => new Set(previous).add(selected!.concept.id));
        }
        await onQueryExecuted();
        if (activeMode === 'sql') await loadTables();
      }
    } catch (err) { setChallengeError((err as Error).message); }
    finally { setRunning(false); }
  };

  const resetSandbox = async () => {
    await apiFetch('/api/sql/reset', { method: 'POST' });
    setSqlError(''); setResult(null); await loadTables(); await onQueryExecuted(); setReloadKey((key) => key + 1);
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void executeSql(); }
  };
  const theoryProgress = activeMode === 'sql' ? 0 : Math.min(challengeStep, THEORY_SEQUENCE.length);
  const nextConcept = selected ? concepts[concepts.findIndex(({ concept }) => concept.id === selected.concept.id) + 1] : undefined;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-emerald-950 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200"><Sparkles className="h-3.5 w-3.5" />DBMS Arena · Practice Quests</div><h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Learn by doing.</h1><p className="mt-2 max-w-xl text-sm text-slate-300">Pick a curriculum topic. Theory topics become quick knowledge games; SQL topics open a live database challenge.</p></div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm"><Flame className="h-5 w-5 text-orange-300" /><span className="text-slate-300">Topics cleared this session</span><strong className="text-white">{solvedTopics.size}/{concepts.length}</strong></div>
        </div>
        <div className="relative mt-6 grid gap-2 sm:max-w-2xl sm:grid-cols-[1fr_auto] sm:items-center">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-300" htmlFor="playground-topic">Choose your curriculum topic</label>
          <select id="playground-topic" value={selected?.concept.id ?? ''} onChange={(e) => changeTopic(Number(e.target.value))} className="rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none focus:border-emerald-300 sm:col-span-2">
            {units.map((unit) => <optgroup key={unit.id} label={unit.title}>{unit.concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.title} {concept.status === 'completed' ? '✓' : ''}</option>)}</optgroup>)}
          </select>
        </div>
      </section>

      {selected && <div className={`grid items-start gap-6 ${activeMode === 'sql' ? 'lg:grid-cols-12' : ''}`}>
        {activeMode === 'sql' && <aside className="space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-display font-bold text-slate-900"><Database className="h-4 w-4 text-sky-600" />Database schema</h2><span className="text-xs text-slate-500">{tables.length} tables</span></div><div className="max-h-[570px] space-y-3 overflow-y-auto pr-1">{tables.map((table) => <div key={table.name} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"><div className="mb-2 flex items-center justify-between"><button type="button" onClick={() => setSql(`SELECT * FROM ${table.name} LIMIT 10;`)} className="flex items-center gap-1.5 font-mono text-xs font-bold text-sky-800 hover:underline"><Table2 className="h-3.5 w-3.5" />{table.name}</button><span className="text-[11px] text-slate-500">{table.rowCount} rows</span></div><div className="space-y-1">{table.columns.map((column) => <div key={column.name} className="flex justify-between gap-2 font-mono text-[11px]"><span className="flex items-center gap-1 text-slate-700">{column.pk && <KeyRound className="h-3 w-3 text-amber-600" />}{column.name}</span><span className="text-slate-400">{column.type}</span></div>)}</div></div>)}</div></div>
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void resetSandbox()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" />Reset database</button><button type="button" onClick={() => onAskTutorAboutSql(sql)} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"><Sparkles className="h-3.5 w-3.5" />Ask AI Tutor</button></div>
        </aside>}

        <section className={activeMode === 'sql' ? 'space-y-5 lg:col-span-8' : 'mx-auto w-full max-w-3xl space-y-5'}>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{selected.unit.title} · {mode === 'sql' ? 'SQL Quest' : mode === 'mixed' ? 'Mixed Quest' : 'Knowledge Quest'}</p><h2 className="mt-1 font-display text-xl font-bold text-slate-900">{selected.concept.title}</h2><p className="mt-1 text-sm text-slate-600">{mode === 'sql' ? 'Write, run, and submit a query. The database checks the result.' : 'Answer one question at a time to unlock the next challenge.'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold capitalize text-slate-700">{mode === 'mixed' ? 'Theory + SQL' : mode === 'sql' ? 'SQL challenge' : 'Theory challenge'}</span></div>
            {mode === 'mixed' && <div className="mt-5 flex gap-2"><button type="button" onClick={() => { setMixedPart('theory'); setChallengeStep(0); }} className={`rounded-xl px-4 py-2 text-xs font-semibold ${mixedPart === 'theory' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Knowledge challenge</button><button type="button" onClick={() => { setMixedPart('sql'); setChallengeStep(0); }} className={`rounded-xl px-4 py-2 text-xs font-semibold ${mixedPart === 'sql' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Practical SQL</button></div>}
            {activeMode !== 'sql' && <div className="mt-5 flex items-center gap-2" aria-label={`Challenge progress ${theoryProgress} of ${THEORY_SEQUENCE.length}`}>{THEORY_SEQUENCE.map((type, index) => <div key={type} title={type.replace('_', ' ')} className={`h-2 flex-1 rounded-full ${index < theoryProgress ? 'bg-emerald-500' : index === challengeStep ? 'bg-emerald-200' : 'bg-slate-100'}`} />)}<span className="ml-1 text-xs tabular-nums text-slate-500">{Math.min(challengeStep + 1, 5)}/5</span></div>}
            {activeMode === 'sql' && <div className="mt-5 flex flex-wrap gap-2">{PRESET_QUERIES.map((preset) => <button key={preset.label} type="button" onClick={() => setSql(preset.sql)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-sky-300 hover:bg-sky-50">{preset.label}</button>)}</div>}

            {challengeLoading ? <div className="mt-6 animate-pulse rounded-xl bg-slate-100 p-10 text-center text-sm text-slate-500">Building your topic challenge…</div>
              : challengeError && !challenge ? <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{challengeError}<button type="button" onClick={() => setReloadKey((key) => key + 1)} className="ml-2 font-semibold underline">Retry</button></div>
                : activeMode !== 'sql' && challengeStep >= THEORY_SEQUENCE.length ? <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-7 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /><h3 className="mt-3 font-display text-xl font-bold text-emerald-950">Topic cleared!</h3><p className="mt-1 text-sm text-emerald-800">You completed all five question types for {selected.concept.title}.</p>{nextConcept && <button type="button" onClick={() => changeTopic(nextConcept.concept.id)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Continue to next topic <ArrowRight className="h-4 w-4" /></button>}</div>
                  : challenge && activeMode !== 'sql' ? <div className="mt-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 sm:p-6">
                    <div className="mb-3 flex items-center justify-between"><span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-800">{String(challenge.type).replace('_', ' ')}</span><span className="text-xs text-slate-500">Challenge {challengeStep + 1}</span></div>
                    <h3 className="font-display text-lg font-bold leading-relaxed text-slate-900">{challenge.statement ?? challenge.prompt}</h3>
                    {(challenge.type === 'mcq' || challenge.type === 'scenario') && <div className="mt-5 grid gap-2.5">{challenge.options?.map((option, index) => <button key={index} type="button" disabled={feedback?.correct} onClick={() => setSelection(index)} className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${selection === index ? 'border-indigo-500 bg-indigo-100 text-indigo-950' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}><span className="mr-2 font-mono text-xs text-slate-400">{String.fromCharCode(65 + index)}.</span>{option}</button>)}</div>}
                    {challenge.type === 'true_false' && <div className="mt-5 grid grid-cols-2 gap-3">{[true, false].map((value) => <button key={String(value)} type="button" onClick={() => setBooleanAnswer(value)} className={`rounded-xl border px-4 py-4 font-semibold ${booleanAnswer === value ? 'border-indigo-500 bg-indigo-100 text-indigo-900' : 'border-slate-200 bg-white text-slate-700'}`}>{value ? 'True' : 'False'}</button>)}</div>}
                    {challenge.type === 'fill_blank' && <input aria-label="Fill in the blank answer" value={fillAnswer} onChange={(e) => setFillAnswer(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submitAnswer(); }} placeholder="Type the missing term" className="mt-5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-indigo-500" />}
                    {challenge.type === 'matching' && <div className="mt-5 space-y-2">{challenge.leftItems?.map((left) => <label key={left} className="grid items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2"><span className="text-sm font-medium text-slate-800">{left}</span><select value={matchingAnswers[left] ?? ''} onChange={(e) => setMatchingAnswers((prev) => ({ ...prev, [left]: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">Choose a match…</option>{challenge.rightItems?.map((right) => <option key={right} value={right}>{right}</option>)}</select></label>)}</div>}
                    {feedback && <div className={`mt-5 rounded-xl border p-4 ${feedback.correct ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-start gap-2">{feedback.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}<div><p className="text-sm font-semibold text-slate-900">{feedback.correct ? `Correct! +${feedback.xpAwarded} XP` : 'Keep going'}</p><p className="mt-1 text-sm leading-relaxed text-slate-700">{feedback.feedback}</p>{!feedback.correct && feedback.hint && <p className="mt-2 text-xs text-amber-900"><strong>Hint:</strong> {feedback.hint}</p>}</div></div></div>}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => setHintVisible((visible) => !visible)} className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 hover:underline"><Lightbulb className="h-4 w-4" />{hintVisible ? 'Hide hint' : 'Get a hint'}</button>{hintVisible && <p className="w-full rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{challenge.hint}</p>}{feedback?.correct ? <button type="button" onClick={() => { setChallengeStep((step) => step + 1); setFeedback(null); }} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">{challengeStep + 1 === THEORY_SEQUENCE.length ? 'Finish topic' : 'Next challenge'}<ArrowRight className="h-4 w-4" /></button> : <button type="button" disabled={running || (challenge.type === 'mcq' || challenge.type === 'scenario' ? selection === null : challenge.type === 'true_false' ? booleanAnswer === null : challenge.type === 'fill_blank' ? !fillAnswer.trim() : Object.keys(matchingAnswers).length !== (challenge.leftItems?.length ?? 0))} onClick={() => void submitAnswer()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{running ? 'Checking…' : 'Check answer'}<ArrowRight className="h-4 w-4" /></button>}</div>
                  </div>
                    : challenge && activeMode === 'sql' ? <div className="mt-6 space-y-5">
                      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-sky-800">Your mission</div><p className="mt-1 text-sm leading-relaxed text-slate-800">{challenge.prompt}</p></div>
                      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-lg"><div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-xs text-slate-300"><span className="font-mono">SQLite · {selected.concept.title}</span><span>⌘/Ctrl + Enter to run</span></div><div className="relative"><pre aria-hidden="true" className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words p-4 font-mono text-sm leading-6 text-slate-200" style={{ transform: `translateY(-${highlightScroll}px)` }}>{highlightSql(sql)}{sql.endsWith('\n') ? ' ' : ''}</pre><textarea ref={editorRef} aria-label="SQL editor" value={sql} onChange={(e) => setSql(e.target.value)} onKeyDown={onEditorKeyDown} onScroll={(e) => setHighlightScroll(e.currentTarget.scrollTop)} spellCheck={false} rows={9} className="relative block w-full resize-y bg-transparent p-4 font-mono text-sm leading-6 text-transparent caret-white selection:bg-emerald-500/30 outline-none" style={{ WebkitTextFillColor: 'transparent' }} /></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900 px-4 py-3"><span className="text-xs text-slate-400">Practice queries run in the SQL sandbox. Reset it to restore the starter data.</span><div className="flex gap-2"><button type="button" disabled={running} onClick={() => void executeSql()} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50"><Play className="h-3.5 w-3.5 fill-current" />{running ? 'Running…' : 'Run Query'}</button><button type="button" disabled={running || !sql.trim()} onClick={() => void submitAnswer()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"><Trophy className="h-3.5 w-3.5" />Submit Answer</button></div></div></div>
                      {sqlError && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 font-mono text-xs text-rose-800"><XCircle className="h-4 w-4 shrink-0" />{sqlError}</div>}
                      {result && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex justify-between bg-slate-50 px-4 py-3 text-xs text-slate-600"><span>{result.message || `${result.rowCount} row(s) returned`}</span><span>{result.executionMs} ms</span></div>{result.columns.length > 0 && <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-xs"><thead><tr className="bg-slate-100">{result.columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-2.5 font-mono font-bold text-slate-800">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-4 py-2.5 font-mono text-slate-700">{cell === null ? <em className="text-slate-400">NULL</em> : String(cell)}</td>)}</tr>)}</tbody></table></div>}</div>}
                      {feedback && <div className={`rounded-xl border p-4 ${feedback.correct ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><p className="text-sm font-semibold text-slate-900">{feedback.correct ? `Challenge passed · +${feedback.xpAwarded} XP, +${feedback.gemsAwarded} gems` : 'AI coach feedback'}</p><p className="mt-1 text-sm leading-relaxed text-slate-700">{feedback.feedback}</p>{feedback.hint && <p className="mt-2 text-sm text-amber-900"><strong>Hint:</strong> {feedback.hint}</p>}{feedback.correct && nextConcept && <button type="button" onClick={() => changeTopic(nextConcept.concept.id)} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline">Next curriculum challenge <ArrowRight className="h-4 w-4" /></button>}</div>}
                      {history.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><History className="h-4 w-4" />Recent queries</h3><div className="flex flex-wrap gap-2">{history.map((query, index) => <button key={`${index}-${query}`} onClick={() => setSql(query)} className="max-w-full truncate rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-700 hover:bg-slate-200">{query}</button>)}</div></div>}
                    </div> : null}
          </div>
        </section>
      </div>}
    </div>
  );
}
