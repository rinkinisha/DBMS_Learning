import type { Database, SqlValue } from 'sql.js';

export type TheoryChallengeType = 'mcq' | 'true_false' | 'fill_blank' | 'matching' | 'scenario';

export function normalizeAnswer(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');
}

export function validateTheoryAnswer(type: TheoryChallengeType, expected: Record<string, unknown>, answer: unknown): boolean {
  if (type === 'mcq' || type === 'scenario') {
    const selectedIndex = (answer as { selectedIndex?: unknown } | null)?.selectedIndex;
    if (typeof expected.correctAnswer === 'string' && Array.isArray(expected.options)) {
      return typeof selectedIndex === 'number' && Number.isInteger(selectedIndex) &&
        expected.options[selectedIndex] === expected.correctAnswer;
    }
    return typeof selectedIndex === 'number' && Number.isInteger(selectedIndex) && selectedIndex === expected.correctIndex;
  }
  if (type === 'true_false') return (answer as { value?: unknown } | null)?.value === expected.correctBoolean;
  if (type === 'fill_blank') {
    const accepted = (expected.acceptedAnswers as string[] ?? []).map(normalizeAnswer);
    return accepted.includes(normalizeAnswer((answer as { value?: unknown } | null)?.value));
  }
  const submitted = (answer as { pairs?: Record<string, string> } | null)?.pairs ?? {};
  const pairs = expected.pairs as { left: string; right: string }[] ?? [];
  return pairs.length > 0 && pairs.every((pair) => submitted[pair.left] === pair.right);
}

export function databaseStateFingerprint(db: Database): string {
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values ?? [];
  return JSON.stringify(tables.map(([rawName]) => {
    const name = String(rawName).replace(/"/g, '""');
    const rows = db.exec(`SELECT * FROM "${name}"`)[0]?.values ?? [];
    return [name, rows.map((row) => JSON.stringify(row)).sort()];
  }));
}

export function normalizedQueryResult(results: { columns: string[]; values: SqlValue[][] }[] | undefined): string {
  if (!results?.length) return '';
  const last = results[results.length - 1];
  return JSON.stringify([last.columns.map((column) => column.toLocaleLowerCase()), last.values.map((row) => JSON.stringify(row)).sort()]);
}

export function validateSqlAnswer(db: Database, sql: string, expectedState: string, expectedResult: string) {
  const statements = sql.trim().split(';').map((part) => part.trim()).filter(Boolean);
  if (statements.length !== 1 || !/^(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(sql.trim())) {
    return { correct: false, error: 'Use one SELECT, INSERT, UPDATE, or DELETE statement for this challenge.', result: null };
  }
  const started = performance.now();
  try {
    const results = db.exec(sql.trim());
    const correct = databaseStateFingerprint(db) === expectedState && normalizedQueryResult(results) === expectedResult;
    const last = results?.[results.length - 1];
    const result = last ? {
      columns: last.columns,
      rows: last.values,
      rowCount: last.values.length,
      executionMs: Math.round((performance.now() - started) * 100) / 100,
    } : null;
    return { correct, error: correct ? undefined : 'Your SQL ran, but its result or database changes do not match the task yet.', result };
  } catch (err) {
    return { correct: false, error: (err as Error).message, result: null };
  }
}
