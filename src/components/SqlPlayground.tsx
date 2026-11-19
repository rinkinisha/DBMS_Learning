import { useEffect, useState } from 'react';
import {
  Database,
  History,
  KeyRound,
  Play,
  RotateCcw,
  Sparkles,
  Table2,
} from 'lucide-react';
import { PracticeTableInfo, SqlExecutionResult } from '../types';
import { apiFetch } from '../lib/api';

interface SqlPlaygroundProps {
  initialSql?: string;
  onAskTutorAboutSql: (sql: string) => void;
  onQueryExecuted: () => Promise<void>;
}

const PRESET_QUERIES = [
  {
    label: 'Join Students & Departments',
    sql: `SELECT s.student_id, s.full_name, d.dept_name, s.gpa
FROM students s
JOIN departments d ON s.dept_id = d.dept_id
ORDER BY s.gpa DESC;`,
  },
  {
    label: 'M:N Enrollments Breakdown',
    sql: `SELECT s.full_name, c.course_code, c.title, e.grade
FROM enrollments e
JOIN students s ON e.student_id = s.student_id
JOIN courses c ON e.course_id = c.course_id;`,
  },
  {
    label: 'Department Avg GPA (GROUP BY)',
    sql: `SELECT d.dept_name, COUNT(s.student_id) AS student_count, ROUND(AVG(s.gpa), 2) AS avg_gpa
FROM departments d
LEFT JOIN students s ON d.dept_id = s.dept_id
GROUP BY d.dept_id
ORDER BY avg_gpa DESC;`,
  },
  {
    label: 'Subquery Above Average',
    sql: `SELECT full_name, year_level, gpa
FROM students
WHERE gpa > (SELECT AVG(gpa) FROM students);`,
  },
];

export function SqlPlayground({
  initialSql,
  onAskTutorAboutSql,
  onQueryExecuted,
}: SqlPlaygroundProps) {
  const [tables, setTables] = useState<PracticeTableInfo[]>([]);
  const [sql, setSql] = useState(
    initialSql ||
      `SELECT s.full_name, d.dept_name, s.gpa\nFROM students s\nJOIN departments d ON s.dept_id = d.dept_id\nORDER BY s.gpa DESC;`
  );
  const [result, setResult] = useState<SqlExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const loadTables = async () => {
    try {
      const res = await apiFetch('/api/sql/tables');
      const data = await res.json();
      if (Array.isArray(data)) setTables(data);
    } catch {
      // Ignore schema inspect error
    }
  };

  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    if (initialSql) {
      setSql(initialSql);
    }
  }, [initialSql]);

  const executeSql = async (queryOverride?: string) => {
    const queryToRun = (queryOverride ?? sql).trim();
    if (!queryToRun) return;
    setRunning(true);
    setError(null);
    try {
      const res = await apiFetch('/api/sql/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: queryToRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SQL error');
      setResult(data);
      setHistory((prev) => [queryToRun, ...prev.filter((q) => q !== queryToRun)].slice(0, 6));
      await loadTables();
      await onQueryExecuted();
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const resetSandbox = async () => {
    await apiFetch('/api/sql/reset', { method: 'POST' });
    setError(null);
    setResult(null);
    await loadTables();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">Real SQL Playground</h1>
          <p className="text-sm text-slate-600">
            Execute real SQLite queries against the University relational schema (`SELECT`, `JOIN`, `GROUP BY`, `CREATE`, `INSERT`).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetSandbox}
            className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Tables</span>
          </button>
          <button
            type="button"
            onClick={() => onAskTutorAboutSql(sql)}
            className="px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ask AI About Query</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Practice Schema Explorer */}
        <div className="lg:col-span-4 p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-600" />
              <span>Practice Schema</span>
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">{tables.length} tables</span>
          </div>

          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {tables.map((t) => (
              <div key={t.name} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      const nextSql = `SELECT * FROM ${t.name} LIMIT 10;`;
                      setSql(nextSql);
                      executeSql(nextSql);
                    }}
                    className="font-mono text-xs font-bold text-sky-800 hover:underline flex items-center gap-1.5 cursor-pointer"
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    <span>{t.name}</span>
                  </button>
                  <span className="text-[11px] text-slate-500 tabular-nums">{t.rowCount} rows</span>
                </div>
                <div className="space-y-1">
                  {t.columns.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-800 flex items-center gap-1">
                        {c.pk && <KeyRound className="w-3 h-3 text-amber-600" />}
                        <span>{c.name}</span>
                      </span>
                      <span className="text-slate-500">{c.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Editor & Results */}
        <div className="lg:col-span-8 space-y-5">
          {/* Preset Chips */}
          <div className="flex flex-wrap gap-2">
            {PRESET_QUERIES.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setSql(p.sql);
                  executeSql(p.sql);
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-sky-400 text-xs font-medium text-slate-700 cursor-pointer transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-900 text-slate-300 flex items-center justify-between text-xs">
              <span className="font-mono">SQLite Practice Engine</span>
              <span className="text-slate-400">Tip: Ctrl/Cmd + Enter to run</span>
            </div>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  executeSql();
                }
              }}
              rows={7}
              spellCheck={false}
              className="w-full p-4 bg-slate-950 text-emerald-300 font-mono text-sm focus:outline-none resize-y"
            />
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Each query counts toward your daily SQL Mission.
              </div>
              <button
                type="button"
                disabled={running}
                onClick={() => executeSql()}
                className="btn-tactile px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold border-b-4 border-emerald-800 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{running ? 'Running...' : 'Run Query'}</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-mono text-rose-800">
              SQL Error: {error}
            </div>
          )}

          {result && (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 tabular-nums">
                <span>
                  {result.message ? result.message : `${result.rowCount} row(s) returned`}
                </span>
                <span>Execution: {result.executionMs} ms</span>
              </div>

              {result.columns.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/70 border-b border-slate-200">
                        {result.columns.map((col) => (
                          <th key={col} className="px-4 py-2.5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.rows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-slate-50">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-4 py-2 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                              {cell === null ? <span className="text-slate-400 italic">NULL</span> : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5">
              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <span>Recent Queries</span>
              </div>
              <div className="space-y-1.5">
                {history.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSql(h)}
                    className="w-full text-left p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 font-mono text-xs text-slate-700 truncate cursor-pointer"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
