import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Database, KeyRound, LoaderCircle, Play, RefreshCw, Search, Sparkles, Table2, XCircle } from 'lucide-react';
import { Concept, PracticeTableInfo, SqlExecutionResult, Unit } from '../types';
import { apiFetch } from '../lib/api';
import { SqlPracticeQuiz } from './SqlPracticeQuiz';

interface SqlPlaygroundProps {
  units: Unit[];
  initialSql?: string;
  initialConceptId?: number;
  onAskTutorAboutSql: (sql: string) => void;
  onQueryExecuted: () => Promise<void>;
}

type PlaygroundTab = 'quiz' | 'ide';

interface SqlAiReview {
  feedback: string;
  result?: SqlExecutionResult | null;
  executionError?: string | null;
  selectedQuestion?: { topic: string; unitNumber: number; prompt: string } | null;
}

interface PracticeQuestion {
  id: number;
  unitNumber: 2 | 3;
  unitLabel: string;
  topic: string;
  prompt: string;
  requirements: { requiredColumns: string[]; minimumRows: number | null };
  relevantTables: string[];
}

interface TablePreview {
  name: string;
  objectType: 'table' | 'view';
  columns: string[];
  rows: (string | number | null)[][];
  totalRows: number;
  offset: number;
  limit: number;
}

const sqlTokens = /(--[^\n]*|\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|AND|OR|NOT|NULL|IS|IN|LIKE|BETWEEN|GROUP|BY|HAVING|ORDER|ASC|DESC|LIMIT|OFFSET|UNION|ALL|DISTINCT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|PRIMARY|KEY|FOREIGN|REFERENCES|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END|WITH|DROP|ALTER|ADD|COLUMN|INDEX|VIEW|UNIQUE|CHECK|DEFAULT|EXISTS|REPLACE|PRAGMA|ATTACH|DETACH)\b|'(?:''|[^'])*'|"(?:""|[^"])*"|\b\d+(?:\.\d+)?\b)/gi;

function highlightSql(source: string) {
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of source.matchAll(sqlTokens)) {
    const index = match.index ?? 0;
    if (index > cursor) pieces.push(source.slice(cursor, index));
    const token = match[0];
    const color = token.startsWith('--') ? 'text-slate-500' : token.startsWith("'") || token.startsWith('"') ? 'text-amber-300' : /^\d/.test(token) ? 'text-fuchsia-300' : /^(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|AND|OR|NOT|GROUP|BY|HAVING|ORDER|ASC|DESC|LIMIT|UNION|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|WITH|DROP|ALTER|ADD|COLUMN|EXISTS|PRAGMA)$/i.test(token) ? 'text-sky-300' : 'text-violet-300';
    pieces.push(<span key={`${index}-${token}`} className={color}>{token}</span>);
    cursor = index + token.length;
  }
  if (cursor < source.length) pieces.push(source.slice(cursor));
  return pieces;
}

export function SqlPlayground({ units, initialSql, initialConceptId, onAskTutorAboutSql, onQueryExecuted: _onQueryExecuted }: SqlPlaygroundProps) {
  const concepts = useMemo(() => units.flatMap((unit) => unit.concepts.map((concept) => ({ unit, concept }))), [units]);
  const [selectedConceptId, setSelectedConceptId] = useState(() => initialConceptId ?? concepts[0]?.concept.id ?? 0);
  const selected = concepts.find(({ concept }) => concept.id === selectedConceptId) ?? concepts[0];
  const [tab, setTab] = useState<PlaygroundTab>('quiz');
  const [sql, setSql] = useState(initialSql || 'SELECT full_name, gpa\nFROM students\nWHERE gpa >= 3.8;');
  const [tables, setTables] = useState<PracticeTableInfo[]>([]);
  const [tablePreviews, setTablePreviews] = useState<Record<string, TablePreview>>({});
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [loadingTables, setLoadingTables] = useState(false);
  const [explorerError, setExplorerError] = useState('');
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [questionSearch, setQuestionSearch] = useState('');
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [result, setResult] = useState<SqlExecutionResult | null>(null);
  const [sqlError, setSqlError] = useState('');
  const [executionMessage, setExecutionMessage] = useState('');
  const [running, setRunning] = useState(false);
  const [review, setReview] = useState<SqlAiReview | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [bottomPanel, setBottomPanel] = useState<'results' | 'messages' | 'errors' | 'ai'>('results');
  const [highlightScroll, setHighlightScroll] = useState(0);
  const [highlightScrollLeft, setHighlightScrollLeft] = useState(0);
  const [editorCaret, setEditorCaret] = useState(0);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const editorSelectionRef = useRef({ start: 0, end: 0 });

  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId) ?? null;
  const sqlKeywords = useMemo(() => [
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'IS NULL', 'IS NOT NULL', 'IN', 'BETWEEN',
    'LIKE', 'GROUP BY', 'HAVING', 'ORDER BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'DISTINCT', 'JOIN',
    'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'CROSS JOIN', 'ON', 'AS', 'UNION', 'UNION ALL', 'EXISTS',
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'INSERT INTO',
    'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE INDEX',
    'CREATE VIEW', 'PRAGMA', 'ATTACH DATABASE', 'DETACH DATABASE', 'COALESCE', 'IFNULL', 'DATE', 'STRFTIME',
  ], []);
  const autocompleteItems = useMemo(() => {
    const identifiers = tables.flatMap((table) => [table.name, ...table.columns.map((column) => `${table.name}.${column.name}`)]);
    return [...new Set([...sqlKeywords, ...identifiers])];
  }, [sqlKeywords, tables]);
  const activeToken = sql.slice(0, editorCaret).match(/[A-Za-z_][A-Za-z0-9_.]*$/)?.[0] ?? '';
  const suggestions = autocompleteOpen && activeToken
    ? autocompleteItems.filter((item) => item.toLowerCase().startsWith(activeToken.toLowerCase()) && item.toLowerCase() !== activeToken.toLowerCase()).slice(0, 10)
    : [];

  useEffect(() => { if (initialSql) setSql(initialSql); }, [initialSql]);
  useEffect(() => {
    if (initialConceptId && concepts.some(({ concept }) => concept.id === initialConceptId)) {
      setSelectedConceptId(initialConceptId);
    }
  }, [initialConceptId, concepts]);

  const selectTopic = (conceptId: number) => {
    setSelectedConceptId(conceptId);
  };

  useEffect(() => {
    if (tab !== 'ide') return;
    let active = true;
    setLoadingTables(true);
    setLoadingQuestions(true);
    setExplorerError('');
    Promise.all([
      apiFetch('/api/sql/tables').then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load your connected practice database.');
        return data as PracticeTableInfo[];
      }),
      apiFetch('/api/sql/ide/questions').then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load Unit-II and Unit-III SQL questions.');
        return data as PracticeQuestion[];
      }),
    ]).then(([tableData, questionData]) => {
      if (!active) return;
      setTables(tableData);
      setQuestions(questionData);
    }).catch((error) => {
      if (active) setExplorerError((error as Error).message);
    }).finally(() => {
      if (active) { setLoadingTables(false); setLoadingQuestions(false); }
    });
    return () => { active = false; };
  }, [tab]);

  const refreshExplorer = async () => {
    setLoadingTables(true);
    setExplorerError('');
    try {
      const response = await apiFetch('/api/sql/tables');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not refresh your practice schema.');
      setTables(data as PracticeTableInfo[]);
      setTablePreviews({});
    } catch (error) {
      setExplorerError((error as Error).message);
    } finally {
      setLoadingTables(false);
    }
  };

  const loadTablePreview = async (tableName: string, offset = 0) => {
    const response = await apiFetch(`/api/sql/tables/${encodeURIComponent(tableName)}/rows?limit=30&offset=${offset}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Could not preview ${tableName}.`);
    setTablePreviews((previous) => ({ ...previous, [tableName]: data as TablePreview }));
  };

  const toggleTable = async (tableName: string) => {
    const expanded = expandedTables.has(tableName);
    setExpandedTables((previous) => {
      const next = new Set(previous);
      if (expanded) next.delete(tableName); else next.add(tableName);
      return next;
    });
    if (!expanded && !tablePreviews[tableName]) {
      try { await loadTablePreview(tableName); }
      catch (error) { setExplorerError((error as Error).message); }
    }
  };

  const insertEditorText = (text: string, replaceToken = false) => {
    const textarea = editorRef.current;
    const selection = editorSelectionRef.current;
    const tokenStart = replaceToken ? Math.max(0, selection.start - activeToken.length) : selection.start;
    const before = sql.slice(0, tokenStart);
    const after = sql.slice(selection.end);
    const nextSql = `${before}${text}${after}`;
    const caret = tokenStart + text.length;
    setSql(nextSql);
    setResult(null);
    setReview(null);
    setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(caret, caret);
      editorSelectionRef.current = { start: caret, end: caret };
      setEditorCaret(caret);
      setAutocompleteOpen(false);
    }, 0);
  };

  const applySuggestion = (suggestion: string) => insertEditorText(suggestion, true);

  const handleEditorChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value, selectionStart, selectionEnd } = event.currentTarget;
    setSql(value);
    setSqlError('');
    setReview(null);
    setReviewError('');
    editorSelectionRef.current = { start: selectionStart, end: selectionEnd };
    setEditorCaret(selectionStart);
    setActiveSuggestion(0);
    setAutocompleteOpen(true);
  };

  const syncEditorSelection = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    editorSelectionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
    setEditorCaret(textarea.selectionStart);
  };

  const executeSql = async () => {
    const query = sql.trim();
    if (!query) { setSqlError('Write a query before running it.'); return; }
    setRunning(true);
    setSqlError('');
    setResult(null);
    setReview(null);
    setReviewError('');
    setBottomPanel('results');
    try {
      const response = await apiFetch('/api/sql/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: query, trackProgress: false }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'SQL query failed.');
      setResult(data as SqlExecutionResult);
      setExecutionMessage(data.message || `Query executed successfully. ${data.rowCount} row(s) returned.`);
      await refreshExplorer();
    } catch (err) {
      setSqlError((err as Error).message);
      setBottomPanel('errors');
    } finally {
      setRunning(false);
    }
  };

  const submitForAiReview = async () => {
    if (!sql.trim() || reviewing) return;
    setReviewing(true);
    setReviewError('');
    setReview(null);
    setResult(null);
    setBottomPanel('ai');
    try {
      const response = await apiFetch('/api/sql/ide/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, questionId: selectedQuestion?.id ?? null }),
      });
      const data = await response.json() as SqlAiReview & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not review this SQL query.');
      setReview(data);
      if (data.result) setResult(data.result);
      setExecutionMessage(data.result?.message || (data.result ? `AI review executed the query and inspected ${data.result.rowCount} row(s).` : 'AI review completed; see the execution details below.'));
    } catch (err) {
      setReviewError((err as Error).message);
    } finally {
      setReviewing(false);
    }
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void executeSql();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      setAutocompleteOpen(true);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      insertEditorText('  ');
      return;
    }
    if (suggestions.length > 0 && event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestion((index) => (index + 1) % suggestions.length);
      return;
    }
    if (suggestions.length > 0 && event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestion((index) => (index + suggestions.length - 1) % suggestions.length);
      return;
    }
    if (suggestions.length > 0 && event.key === 'Enter') {
      event.preventDefault();
      applySuggestion(suggestions[activeSuggestion] ?? suggestions[0]);
      return;
    }
    if (event.key === 'Escape') {
      setAutocompleteOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200"><Sparkles className="h-3.5 w-3.5" />DBMS Arena · Practice Lab</div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Learn by doing.</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">Generate a quiz for a curriculum topic or switch to the SQL IDE to experiment with the practice database.</p>
          </div>
          {tab === 'quiz' && <div className="grid gap-2 sm:min-w-80 sm:grid-cols-[auto_1fr] sm:items-center">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-300" htmlFor="playground-topic">Curriculum topic</label>
            <select id="playground-topic" value={selected?.concept.id ?? ''} onChange={(event) => selectTopic(Number(event.target.value))} className="rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none focus:border-emerald-300 sm:col-span-2">
              {units.map((unit) => <optgroup key={unit.id} label={unit.title}>{unit.concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.title}</option>)}</optgroup>)}
            </select>
          </div>}
        </div>
      </section>

      <nav className="flex w-fit gap-1.5 rounded-xl bg-slate-100 p-1.5" aria-label="Practice tools">
        <button type="button" onClick={() => setTab('quiz')} aria-pressed={tab === 'quiz'} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'quiz' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Topic Quiz</button>
        <button type="button" onClick={() => setTab('ide')} aria-pressed={tab === 'ide'} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'ide' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>SQL IDE</button>
      </nav>

      {selected && <div className={tab === 'quiz' ? '' : 'hidden'}><SqlPracticeQuiz key={selected.concept.id} concept={selected.concept} unitTitle={selected.unit.title} /></div>}

      <section className={tab === 'ide' ? 'block' : 'hidden'} aria-label="SQL IDE">
        <div className="grid min-h-[780px] overflow-hidden rounded-2xl border border-slate-700 bg-[#1e1e1e] text-slate-200 shadow-2xl lg:grid-cols-[310px_minmax(0,1fr)]">
          <aside className="flex max-h-[820px] min-h-[520px] flex-col border-b border-slate-700 bg-[#181818] lg:row-span-2 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Explorer</p><h2 className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-200"><Database className="h-4 w-4 text-sky-400" />Your Practice Database</h2></div>
              <button type="button" onClick={() => void refreshExplorer()} aria-label="Refresh database explorer" title="Refresh schema and records" className="rounded-md p-2 text-slate-400 hover:bg-slate-700 hover:text-white"><RefreshCw className={'h-4 w-4 ' + (loadingTables ? 'animate-spin' : '')} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="px-3 py-3">
                <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500"><span>Connected objects</span><span>{tables.length}</span></div>
                {loadingTables && tables.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">Loading your database…</p>}
                {explorerError && <p role="alert" className="m-1 rounded-md border border-rose-900/60 bg-rose-950/40 p-2 text-xs text-rose-300">{explorerError}</p>}
                {!loadingTables && tables.length === 0 && !explorerError && <p className="px-2 py-3 text-xs text-slate-500">No tables or views found in this database.</p>}
                <div className="space-y-1">
                  {tables.map((table) => {
                    const expanded = expandedTables.has(table.name);
                    const preview = tablePreviews[table.name];
                    return <div key={table.name} className="rounded-md">
                      <div className="group flex items-center gap-1 rounded-md px-1 py-1 hover:bg-[#2a2d2e]">
                        <button type="button" onClick={() => void toggleTable(table.name)} aria-label={(expanded ? 'Collapse ' : 'Expand ') + table.name} className="rounded p-0.5 text-slate-500 hover:text-white">{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
                        <Table2 className={'h-3.5 w-3.5 shrink-0 ' + (table.objectType === 'view' ? 'text-violet-400' : 'text-sky-400')} />
                        <button type="button" onClick={() => insertEditorText(table.name)} className="min-w-0 flex-1 truncate text-left font-mono text-xs text-slate-200 hover:text-sky-300" title={'Insert ' + table.name + ' into editor'}>{table.name}</button>
                        {table.objectType === 'view' && <span className="rounded bg-violet-950 px-1 text-[9px] uppercase text-violet-300">view</span>}
                        <span className="text-[10px] tabular-nums text-slate-500">{table.rowCount}</span>
                      </div>
                      {expanded && <div className="ml-5 border-l border-slate-700 pl-2">
                        <div className="py-1">
                          {table.columns.map((column) => {
                            const reference = table.foreignKeys.find((key) => key.column === column.name);
                            return <button key={column.name} type="button" onClick={() => insertEditorText(column.name)} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-[#2a2d2e]" title={reference ? column.name + ' references ' + reference.referencedTable + '.' + reference.referencedColumn : column.name}>
                              {column.pk ? <KeyRound className="h-3 w-3 shrink-0 text-amber-400" /> : <span className="w-3 shrink-0" />}
                              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-300">{column.name}</span>
                              <span className="shrink-0 font-mono text-[10px] text-slate-500">{column.type || 'ANY'}</span>
                              {reference && <span className="rounded bg-blue-950 px-1 text-[9px] text-blue-300">FK</span>}
                              {column.notNull && <span className="rounded bg-slate-700 px-1 text-[9px] text-slate-300" title="NOT NULL">NN</span>}
                              {column.defaultValue !== null && <span className="max-w-16 truncate rounded bg-slate-800 px-1 text-[9px] text-slate-400" title={'DEFAULT ' + column.defaultValue}>DEF</span>}
                            </button>;
                          })}
                          {table.foreignKeys.map((key) => <p key={String(key.id) + key.column} className="ml-5 py-0.5 text-[10px] text-blue-300/80">{key.column} → {key.referencedTable}.{key.referencedColumn}</p>)}
                        </div>
                        <div className="my-1 border-t border-slate-700/70 pt-2">
                          <div className="mb-1 flex items-center justify-between px-1"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Actual rows</span><span className="text-[10px] text-slate-500">{table.rowCount} total</span></div>
                          {!preview && <button type="button" onClick={() => void loadTablePreview(table.name).catch((error) => setExplorerError((error as Error).message))} className="px-1 py-1 text-[10px] text-sky-400 hover:underline">Load preview</button>}
                          {preview && <div className="overflow-x-auto rounded border border-slate-700">
                            <table className="w-full border-collapse text-left font-mono text-[10px]"><thead><tr className="bg-[#252526]">{preview.columns.map((column) => <th key={column} className="max-w-32 whitespace-nowrap px-2 py-1.5 font-semibold text-slate-400">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{preview.rows.map((row, rowIndex) => <tr key={table.name + preview.offset + rowIndex} className="hover:bg-[#252526]">{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-36 truncate whitespace-nowrap px-2 py-1.5 text-slate-300">{cell === null ? <em className="text-slate-600">NULL</em> : String(cell)}</td>)}</tr>)}</tbody></table>
                            {preview.totalRows > preview.limit && <div className="flex items-center justify-between border-t border-slate-700 bg-[#202020] px-2 py-1">
                              <button type="button" disabled={preview.offset === 0} onClick={() => void loadTablePreview(table.name, Math.max(0, preview.offset - preview.limit)).catch((error) => setExplorerError((error as Error).message))} className="text-[10px] text-sky-400 disabled:text-slate-600">Previous</button>
                              <span className="text-[9px] text-slate-500">{preview.offset + 1}–{Math.min(preview.offset + preview.rows.length, preview.totalRows)} / {preview.totalRows}</span>
                              <button type="button" disabled={preview.offset + preview.limit >= preview.totalRows} onClick={() => void loadTablePreview(table.name, preview.offset + preview.limit).catch((error) => setExplorerError((error as Error).message))} className="text-[10px] text-sky-400 disabled:text-slate-600">Next</button>
                            </div>}
                          </div>}
                        </div>
                      </div>}
                    </div>;
                  })}
                </div>
              </div>

              <details open className="border-t border-slate-700">
                <summary className="sticky top-0 cursor-pointer bg-[#181818] px-4 py-3 text-xs font-semibold text-slate-300 hover:bg-[#222]">Practice Questions · Units II–III</summary>
                <div className="px-3 pb-3">
                  <label className="relative mb-2 block"><Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" /><input value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} placeholder="Filter topics…" className="w-full rounded-md border border-slate-700 bg-[#252526] py-1.5 pl-8 pr-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-700" /></label>
                  {loadingQuestions && questions.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">Loading SQL questions…</p>}
                  {!loadingQuestions && questions.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">No SQL practice questions are available yet.</p>}
                  {[2, 3].map((unitNumber) => {
                    const unitQuestions = questions.filter((question) => question.unitNumber === unitNumber && (question.topic + ' ' + question.prompt).toLowerCase().includes(questionSearch.toLowerCase()));
                    return <details key={unitNumber} open className="mt-2">
                      <summary className="cursor-pointer rounded px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-[#252526]">Unit {unitNumber} · {unitQuestions.length} questions</summary>
                      <div className="mt-1 space-y-0.5">{unitQuestions.map((question) => <button key={question.id} type="button" onClick={() => setSelectedQuestionId(question.id)} className={'w-full rounded px-2 py-2 text-left ' + (selectedQuestionId === question.id ? 'bg-sky-950/70 text-sky-200 ring-1 ring-sky-800' : 'text-slate-400 hover:bg-[#252526] hover:text-slate-200')}>
                        <span className="block truncate text-[10px] font-semibold">{question.topic}</span><span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 opacity-80">{question.prompt.replace(/^Mini Challenge:\s*/i, '')}</span>
                      </button>)}</div>
                    </details>;
                  })}
                  {selectedQuestion && <div className="mt-3 rounded-lg border border-sky-800 bg-sky-950/40 p-3">
                    <div className="flex items-start justify-between gap-2"><div><p className="text-[9px] font-bold uppercase tracking-wider text-sky-400">Selected · {selectedQuestion.topic}</p><p className="mt-1 text-xs leading-5 text-slate-200">{selectedQuestion.prompt.replace(/^Mini Challenge:\s*/i, '')}</p></div><button type="button" onClick={() => setSelectedQuestionId(null)} aria-label="Clear selected question" className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white">×</button></div>
                    <div className="mt-2 space-y-1 text-[10px] text-slate-400">
                      {selectedQuestion.requirements.requiredColumns.length > 0 && <p>Required columns: <span className="font-mono text-slate-300">{selectedQuestion.requirements.requiredColumns.join(', ')}</span></p>}
                      {selectedQuestion.requirements.minimumRows !== null && <p>Minimum rows: <span className="font-mono text-slate-300">{selectedQuestion.requirements.minimumRows}</span></p>}
                      <p>Relevant tables: {selectedQuestion.relevantTables.length ? selectedQuestion.relevantTables.map((name) => <button key={name} type="button" onClick={() => insertEditorText(name)} className="mx-0.5 font-mono text-sky-400 hover:underline">{name}</button>) : <span className="text-slate-500">see the question instructions</span>}</p>
                    </div>
                    <p className="mt-2 text-[9px] text-slate-500">Selecting a question shows its instructions only. It does not change or run your SQL.</p>
                  </div>}
                </div>
              </details>
              <details className="border-t border-slate-700 px-4 py-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-400">SQLite dialect notes</summary>
                <div className="mt-2 space-y-2 text-[10px] leading-4 text-slate-500">
                  <p>No <code className="text-slate-300">CREATE/DROP DATABASE</code> or <code className="text-slate-300">GRANT/REVOKE</code>. For a temporary attached database try <code className="text-slate-300">ATTACH DATABASE ':memory:' AS lab;</code> then <code className="text-slate-300">DETACH DATABASE lab;</code>.</p>
                  <p><code className="text-slate-300">ANY</code>/<code className="text-slate-300">ALL</code> can be expressed with scalar <code className="text-slate-300">MIN</code>/<code className="text-slate-300">MAX</code> subqueries or <code className="text-slate-300">EXISTS</code>/<code className="text-slate-300">NOT EXISTS</code>. SQL permissions are controlled by the application and file access.</p>
                </div>
              </details>
            </div>
          </aside>

          <main className="flex min-h-[520px] min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-[#202020] px-4 py-2">
              <div className="flex items-center gap-2"><span className="rounded-t border-t-2 border-sky-500 bg-[#1e1e1e] px-3 py-2 font-mono text-xs text-slate-200">query.sql</span><span className="text-[10px] text-slate-500">SQLite · isolated student database</span></div>
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{tables.length ? 'Database connected' : loadingTables ? 'Connecting…' : 'Database unavailable'}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-[10px] text-slate-500"><span>SQL editor <span className="ml-2 text-slate-600">Ctrl/⌘+Enter run · Ctrl/⌘+Space autocomplete · Tab indent</span></span><span>{sql.split('\n').length} lines · UTF-8</span></div>
            <div className="relative flex min-h-[460px] flex-1 overflow-hidden bg-[#1e1e1e]">
              <div ref={lineNumbersRef} aria-hidden="true" className="w-12 shrink-0 overflow-hidden bg-[#1e1e1e] pt-4 text-right font-mono text-sm leading-7 text-slate-600">{sql.split('\n').map((_, index) => <div key={index} className="h-7 pr-3">{index + 1}</div>)}</div>
              <div className="relative min-w-0 flex-1 overflow-hidden">
                <pre aria-hidden="true" className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-4 font-mono text-sm leading-7 text-slate-200" style={{ transform: `translate(${-highlightScrollLeft}px, ${-highlightScroll}px)` }}>{highlightSql(sql)}{sql.endsWith('\n') ? ' ' : ''}</pre>
                <textarea ref={editorRef} aria-label="SQL editor" value={sql} onChange={handleEditorChange} onSelect={syncEditorSelection} onClick={syncEditorSelection} onKeyUp={syncEditorSelection} onKeyDown={onEditorKeyDown}
                  onScroll={(event) => { setHighlightScroll(event.currentTarget.scrollTop); setHighlightScrollLeft(event.currentTarget.scrollLeft); if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop; }}
                  spellCheck={false} wrap="off" className="relative block h-full min-h-[460px] w-full resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-7 text-transparent caret-sky-300 selection:bg-sky-500/30 outline-none" style={{ WebkitTextFillColor: 'transparent' }} />
                {suggestions.length > 0 && <div className="absolute bottom-4 left-4 z-20 max-h-52 w-64 overflow-auto rounded-md border border-slate-600 bg-[#252526] p-1 shadow-2xl">{suggestions.map((suggestion, index) => <button key={suggestion} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applySuggestion(suggestion)} className={'block w-full rounded px-2 py-1.5 text-left font-mono text-xs ' + (activeSuggestion === index ? 'bg-sky-900/70 text-sky-100' : 'text-slate-300 hover:bg-slate-700')}>{suggestion}</button>)}</div>}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 bg-[#202020] px-4 py-3">
              <p className="text-[10px] text-slate-500">{selectedQuestion ? 'Question: ' + selectedQuestion.topic : 'Independent query · no task selected'}</p>
              <div className="flex gap-2">
                <button type="button" disabled={running || reviewing || !sql.trim()} onClick={() => void executeSql()} className="inline-flex items-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">{running ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}{running ? 'Running…' : 'Run Query'}</button>
                <button type="button" disabled={running || reviewing || !sql.trim()} onClick={() => void submitForAiReview()} className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50">{reviewing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{reviewing ? 'Reviewing…' : 'Submit for AI Review'}</button>
              </div>
            </div>
          </main>

          <section className="border-t border-slate-700 bg-[#181818] lg:col-start-2" aria-label="Query output">
            <div className="flex items-center gap-1 border-b border-slate-700 px-2">{([
              ['results', 'Results'], ['messages', 'Messages'], ['errors', 'Errors'], ['ai', 'AI Feedback'],
            ] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setBottomPanel(id)} className={'border-b-2 px-3 py-2.5 text-[11px] font-semibold ' + (bottomPanel === id ? 'border-sky-400 text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-200')}>{label}{id === 'errors' && sqlError && <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[9px] text-white">!</span>}</button>)}</div>
            <div className="max-h-[360px] min-h-[150px] overflow-auto p-4">
              {bottomPanel === 'results' && <>
                {result ? <><div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400"><span>{result.message || (result.rowCount + ' row(s) returned')}{result.truncated ? ' · showing first 100 rows' : ''}</span><span>{result.executionMs} ms</span></div>
                  {result.columns.length > 0 ? <div className="overflow-auto rounded border border-slate-700"><table className="w-full border-collapse text-left text-xs"><thead className="sticky top-0 bg-[#252526]"><tr>{result.columns.map((column) => <th key={column} className="whitespace-nowrap border-b border-slate-700 px-3 py-2 font-mono font-semibold text-slate-300">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{result.rows.map((row, rowIndex) => <tr key={rowIndex} className="hover:bg-[#252526]">{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-64 whitespace-nowrap px-3 py-2 font-mono text-slate-300">{cell === null ? <em className="text-slate-600">NULL</em> : String(cell)}</td>)}</tr>)}</tbody></table></div> : <p className="font-mono text-xs text-emerald-300">{result.message || 'Statement completed with no result set.'}</p>}
                </> : <p className="text-xs text-slate-500">Run a query to see its actual result rows here.</p>}
              </>}
              {bottomPanel === 'messages' && <div className="space-y-2 text-xs text-slate-300">{executionMessage ? <p className="flex items-start gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-400" />{executionMessage}</p> : <p className="text-slate-500">Execution messages appear here after Run Query or AI Review.</p>}{tables.length > 0 && <p className="text-[10px] text-slate-500">Connected to your isolated database: {tables.length} tables and views.</p>}</div>}
              {bottomPanel === 'errors' && <div className="space-y-2 text-xs">{sqlError && <p className="rounded border border-rose-900/70 bg-rose-950/30 p-3 font-mono text-rose-300">{sqlError}</p>}{reviewError && <p className="rounded border border-rose-900/70 bg-rose-950/30 p-3 text-rose-300">{reviewError}</p>}{review?.executionError && <p className="rounded border border-amber-900/70 bg-amber-950/20 p-3 font-mono text-amber-300">{review.executionError}</p>}{!sqlError && !reviewError && !review?.executionError && <p className="text-slate-500">No SQL or review errors.</p>}</div>}
              {bottomPanel === 'ai' && <div className="space-y-3">
                {reviewing && <p className="flex items-center gap-2 text-xs text-sky-300"><LoaderCircle className="h-4 w-4 animate-spin" />AI is reviewing your SQL and its actual output…</p>}
                {review && <><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-sky-950 px-2 py-1 text-[10px] font-semibold text-sky-300">{selectedQuestion ? 'Question review · ' + selectedQuestion.topic : 'Independent query review'}</span>{!selectedQuestion && <span className="text-[10px] text-slate-500">No unstated task was assumed.</span>}</div>
                  {review.executionError && <p className="rounded border border-amber-900/70 bg-amber-950/20 p-3 font-mono text-xs text-amber-300">Execution detail: {review.executionError}</p>}
                  <p className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{review.feedback}</p>
                </>}
                {reviewError && <p className="rounded border border-rose-900/70 bg-rose-950/30 p-3 text-xs text-rose-300">{reviewError}</p>}
                {!review && !reviewing && !reviewError && <p className="text-xs text-slate-500">Submit for AI Review to get feedback on query correctness, logic, and improvements.</p>}
              </div>}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
