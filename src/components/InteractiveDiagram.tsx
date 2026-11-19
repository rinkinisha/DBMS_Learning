import { useState } from 'react';
import { ArrowRight, Database, KeyRound, Layers, Table2 } from 'lucide-react';

interface InteractiveDiagramProps {
  diagramType: string;
  config: Record<string, unknown>;
}

export function InteractiveDiagram({ diagramType, config }: InteractiveDiagramProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [highlightFk, setHighlightFk] = useState(true);

  if (diagramType === 'three_schema') {
    const layers = (config.layers as { id: string; label: string; role: string; sample: string }[]) ?? [];
    const active = layers[selectedIdx] ?? layers[0];
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Click any layer to inspect its abstraction role</span>
          <span>ANSI-SPARC Interactive Stack</span>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {layers.map((layer, idx) => {
            const isSelected = idx === selectedIdx;
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-50 border-emerald-500 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center font-display font-bold text-sm ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      L{idx + 1}
                    </div>
                    <div>
                      <div className="font-display font-semibold text-slate-900">{layer.label}</div>
                      <div className="text-sm text-slate-600">{layer.role}</div>
                    </div>
                  </div>
                  <Layers className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
                </div>
              </button>
            );
          })}
        </div>
        {active && (
          <div className="p-4 rounded-xl bg-slate-900 text-slate-100">
            <div className="text-xs text-emerald-400 font-medium mb-1">Active Layer Blueprint · {active.label}</div>
            <pre className="font-mono text-xs sm:text-sm whitespace-pre-wrap text-slate-100">{active.sample}</pre>
          </div>
        )}
      </div>
    );
  }

  if (diagramType === 'schema_instance') {
    const cols = (config.schemaColumns as string[]) ?? [];
    const rows = (config.instances as (string | number)[][]) ?? [];
    const [showSchemaOnly, setShowSchemaOnly] = useState(false);

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-600">
            Toggle between the static <strong className="text-slate-900">Schema</strong> blueprint and live{' '}
            <strong className="text-slate-900">Instance</strong> rows.
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setShowSchemaOnly(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                !showSchemaOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Schema + Instance
            </button>
            <button
              type="button"
              onClick={() => setShowSchemaOnly(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                showSchemaOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Schema Blueprint Only
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-sky-50 border-b border-slate-200">
                {cols.map((c) => (
                  <th key={c} className="px-4 py-3 font-mono text-xs font-semibold text-sky-900 whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            {!showSchemaOnly ? (
              <tbody className="divide-y divide-slate-100 text-sm">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {r.map((cell, j) => (
                      <td key={j} className="px-4 py-2.5 text-slate-700 font-mono text-xs tabular-nums">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                <tr>
                  <td colSpan={cols.length} className="px-4 py-6 text-center text-sm text-slate-500">
                    Schema defines column names, types, and constraints—independent of current rows.
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>
    );
  }

  if (diagramType === 'key_explorer') {
    const tableName = String(config.tableName ?? 'Relation');
    const columns =
      (config.columns as { name: string; keyType: string; minimal: boolean; unique: boolean }[]) ?? [];
    const active = columns[selectedIdx] ?? columns[0];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Click any attribute in {tableName} to inspect its key classification</span>
          <span>Entity &amp; Key Inspector</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {columns.map((col, idx) => {
            const isSelected = idx === selectedIdx;
            return (
              <button
                key={col.name}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-amber-50 border-amber-500 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">{col.name}</span>
                  <KeyRound className={`w-4 h-4 ${isSelected ? 'text-amber-600' : 'text-slate-400'}`} />
                </div>
                <div className="mt-1 text-xs text-slate-600">{col.keyType}</div>
              </button>
            );
          })}
        </div>
        {active && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4 text-sm">
            <div>
              <span className="font-mono font-semibold text-slate-900">{active.name}</span>
              <span className="text-slate-500 mx-2">·</span>
              <span className="text-slate-700">{active.keyType}</span>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className={active.unique ? 'text-emerald-700' : 'text-slate-500'}>
                Unique: {active.unique ? 'Yes' : 'No'}
              </span>
              <span className="text-slate-300">|</span>
              <span className={active.minimal ? 'text-emerald-700' : 'text-slate-500'}>
                Minimal Superkey: {active.minimal ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (diagramType === 'er_cardinality') {
    const scenarios =
      (config.scenarios as {
        id: string;
        left: string;
        rel: string;
        right: string;
        ratio: string;
        note: string;
      }[]) ?? [];
    const active = scenarios[selectedIdx] ?? scenarios[0];

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {scenarios.map((sc, idx) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                idx === selectedIdx
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {sc.ratio} ({sc.left} &harr; {sc.right})
            </button>
          ))}
        </div>

        {active && (
          <div className="p-6 rounded-xl border border-slate-200 bg-white space-y-5">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
              <div className="px-5 py-3 rounded-lg border-2 border-slate-800 bg-sky-50 font-display font-bold text-slate-900 min-w-[130px] text-center">
                {active.left}
              </div>
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-700">
                <span className="h-0.5 w-6 bg-slate-400" />
                <span className="px-3 py-1.5 border-2 border-emerald-600 bg-emerald-50 rounded-md rotate-0">
                  {active.rel} ({active.ratio})
                </span>
                <span className="h-0.5 w-6 bg-slate-400" />
              </div>
              <div className="px-5 py-3 rounded-lg border-2 border-slate-800 bg-amber-50 font-display font-bold text-slate-900 min-w-[130px] text-center">
                {active.right}
              </div>
            </div>
            <p className="text-sm text-slate-600 text-center max-w-xl mx-auto">{active.note}</p>
          </div>
        )}
      </div>
    );
  }

  if (diagramType === 'eer_hierarchy') {
    const sup = config.superclass as { name: string; attrs: string[] } | undefined;
    const subs = (config.subclasses as { name: string; attrs: string[] }[]) ?? [];
    const [mode, setMode] = useState<'disjoint' | 'overlapping'>('disjoint');

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-slate-500">Toggle Disjoint (d) vs Overlapping (o) specialization constraint</span>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('disjoint')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                mode === 'disjoint' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Disjoint (d)
            </button>
            <button
              type="button"
              onClick={() => setMode('overlapping')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                mode === 'overlapping' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Overlapping (o)
            </button>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 bg-white flex flex-col items-center gap-4">
          {sup && (
            <div className="px-5 py-3 rounded-xl border-2 border-slate-800 bg-slate-50 text-center">
              <div className="font-display font-bold text-slate-900">{sup.name}</div>
              <div className="text-xs font-mono text-slate-600 mt-1">{sup.attrs.join(' · ')}</div>
            </div>
          )}
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-4 bg-slate-400" />
            <div className="w-10 h-10 rounded-full border-2 border-emerald-600 bg-emerald-50 flex items-center justify-center font-display font-bold text-emerald-800">
              {mode === 'disjoint' ? 'd' : 'o'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {mode === 'disjoint'
                ? 'IS-A: Member belongs to at most ONE subclass'
                : 'IS-A: Member may belong to MULTIPLE subclasses'}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
            {subs.map((sub) => (
              <div key={sub.name} className="p-3.5 rounded-xl border-2 border-sky-700 bg-sky-50 text-center">
                <div className="font-display font-bold text-slate-900">{sub.name}</div>
                <div className="text-xs font-mono text-slate-700 mt-1">+ {sub.attrs.join(', ')}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (diagramType === 'er_to_table') {
    const mappings = (config.mappings as { rule: string; from: string; to: string }[]) ?? [];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">ER Diagram Construct &rarr; Relational SQL Table</span>
          <button
            type="button"
            onClick={() => setHighlightFk((v) => !v)}
            className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
          >
            {highlightFk ? 'Hide SQL Targets' : 'Show SQL Targets'}
          </button>
        </div>
        {mappings.map((m, idx) => (
          <div
            key={idx}
            className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3"
          >
            <div className="space-y-1">
              <div className="text-xs font-semibold text-emerald-700">{m.rule}</div>
              <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{m.from}</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 hidden md:block shrink-0" />
            {highlightFk && (
              <div className="px-3.5 py-2 rounded-lg bg-slate-900 text-emerald-300 font-mono text-xs flex items-center gap-2">
                <Table2 className="w-3.5 h-3.5 shrink-0" />
                <span>{m.to}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Fallback / rel_algebra
  const operators = (config.operators as { symbol: string; name: string; sql: string; effect: string }[]) ?? [];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {operators.map((op) => (
        <div key={op.name} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-700 font-display font-bold text-lg flex items-center justify-center">
            {op.symbol}
          </div>
          <div className="font-display font-semibold text-slate-900">{op.name}</div>
          <div className="text-xs text-slate-600">{op.effect}</div>
          <div className="font-mono text-xs bg-slate-100 text-slate-800 px-2.5 py-1.5 rounded-md">{op.sql}</div>
        </div>
      ))}
    </div>
  );
}
