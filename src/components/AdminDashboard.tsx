import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Edit3,
  Eye,
  EyeOff,
  Heart,
  HelpCircle,
  Layers,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { ConceptLessonContent } from '../types';
import { apiFetch } from '../lib/api';

interface AdminConcept {
  id: number;
  unit_id: number;
  unit_number: number;
  unit_title: string;
  order_index: number;
  topic_tag: string;
  title: string;
  summary: string;
  duration_minutes: number;
  xp_reward: number;
  definition_text: string;
  example_text: string;
  practical_sql: string;
  is_published: boolean;
  ai_approved: boolean;
  has_full_lesson: boolean;
  question_count: number;
  lesson_content: ConceptLessonContent;
}

interface AdminOverview {
  units: {
    id: number;
    unit_number: number;
    title: string;
    subtitle: string;
    description: string;
    accent_color: string;
    estimated_hours: number;
  }[];
  concepts: AdminConcept[];
  questions: {
    id: number;
    unit_id: number;
    unit_number: number;
    concept_id: number | null;
    concept_title: string | null;
    is_unit_assessment: boolean;
    question_type: string;
    prompt: string;
    xp_value: number;
  }[];
  students: {
    id: number;
    name: string;
    username?: string;
    email?: string;
    xp: number;
    weekly_xp: number;
    hearts: number;
    max_hearts: number;
    gems: number;
    streak_days: number;
    league: string;
    role?: string;
    is_demo?: number;
    is_primary: number;
  }[];
  migrations?: {
    id: number;
    old_version: string;
    new_version: string;
    note: string;
    migrated_at: string;
  }[];
}

interface AdminDashboardProps {
  onDashboardRefresh: () => Promise<void>;
}

export function AdminDashboard({ onDashboardRefresh }: AdminDashboardProps) {
  const [tab, setTab] = useState<'concepts' | 'units' | 'questions' | 'students'>('concepts');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [unitFilter, setUnitFilter] = useState<number>(1);
  const [onlyMissing, setOnlyMissing] = useState(false);

  // Add Concept form
  const [newConceptUnitId, setNewConceptUnitId] = useState<number>(1);
  const [newConceptTitle, setNewConceptTitle] = useState('');
  const [newConceptSummary, setNewConceptSummary] = useState('');
  const [newConceptSql, setNewConceptSql] = useState('SELECT * FROM students LIMIT 5;');

  // Edit / AI Review Concept state
  const [editingConcept, setEditingConcept] = useState<AdminConcept | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editSql, setEditSql] = useState('');
  const [editLesson, setEditLesson] = useState<ConceptLessonContent | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDraftReady, setAiDraftReady] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Question form
  const [newQUnitId, setNewQUnitId] = useState<number>(1);
  const [newQConceptId, setNewQConceptId] = useState<string>('');
  const [newQType, setNewQType] = useState<'mcq' | 'true_false' | 'sql_challenge'>('mcq');
  const [newQPrompt, setNewQPrompt] = useState('');
  const [newQOptA, setNewQOptA] = useState('');
  const [newQOptB, setNewQOptB] = useState('');
  const [newQOptC, setNewQOptC] = useState('');
  const [newQCorrectBool, setNewQCorrectBool] = useState(true);
  const [newQStarterSql, setNewQStarterSql] = useState('SELECT full_name, gpa FROM students;');
  const [newQRequiredCols, setNewQRequiredCols] = useState('full_name, gpa');
  const [newQExplanation, setNewQExplanation] = useState('');

  const loadOverview = async () => {
    const res = await apiFetch('/api/admin/overview');
    const json = await res.json();
    setData(json);
    if (json.units?.[0]?.id && !newConceptUnitId) {
      setNewConceptUnitId(json.units[0].id);
      setNewQUnitId(json.units[0].id);
    }
  };

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const openEditor = (c: AdminConcept) => {
    setEditingConcept(c);
    setEditTitle(c.title);
    setEditSummary(c.summary);
    setEditSql(c.practical_sql);
    setEditLesson(
      c.lesson_content?.simpleIntro
        ? c.lesson_content
        : {
            simpleIntro: c.summary,
            detailedExplanation: c.definition_text || c.summary,
            definitions: [{ term: c.title, meaning: c.definition_text || c.summary }],
            realWorldExamples: [c.example_text || c.summary],
            practicalExamples: [{ label: c.title, snippet: c.practical_sql, outcome: '' }],
            visualSteps: [],
            commonMistakes: [],
            quickRecap: [c.summary],
          }
    );
    setAiDraftReady(false);
    setAiError(null);
  };

  const handleGenerateAiLesson = async () => {
    if (!editingConcept) return;
    setAiGenerating(true);
    setAiError(null);
    try {
      const res = await apiFetch(`/api/admin/concepts/${editingConcept.id}/generate-lesson`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI generation failed');
      setEditLesson(json.lessonDraft);
      if (json.trySqlQuery) setEditSql(json.trySqlQuery);
      setAiDraftReady(true);
      flash('AI lesson draft generated—review and approve below.');
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveAndApprove = async () => {
    if (!editingConcept || !editLesson) return;
    await apiFetch(`/api/admin/concepts/${editingConcept.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTitle,
        topic_tag: editingConcept.topic_tag || editTitle,
        summary: editSummary,
        duration_minutes: editingConcept.duration_minutes,
        xp_reward: editingConcept.xp_reward,
        definition_text: editLesson.detailedExplanation,
        example_text: editLesson.realWorldExamples?.[0] ?? editSummary,
        practical_sql: editSql,
        lesson_content: editLesson,
      }),
    });
    await apiFetch(`/api/admin/concepts/${editingConcept.id}/approve-lesson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lesson_content: editLesson,
        practical_sql: editSql,
        publish: true,
      }),
    });
    setEditingConcept(null);
    await loadOverview();
    await onDashboardRefresh();
    flash('Lesson approved, saved to database, and published!');
  };

  const handleReorder = async (conceptId: number, direction: 'up' | 'down') => {
    await apiFetch(`/api/admin/concepts/${conceptId}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    await loadOverview();
    await onDashboardRefresh();
    flash('Concept order updated.');
  };

  const handleTogglePublish = async (c: AdminConcept) => {
    await apiFetch(`/api/admin/concepts/${c.id}/publish`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !c.is_published }),
    });
    await loadOverview();
    await onDashboardRefresh();
    flash(c.is_published ? 'Concept unpublished.' : 'Concept published.');
  };

  const handleStudentAction = async (
    studentId: number,
    action: 'grant_xp' | 'refill_hearts' | 'unlock_all' | 'reset_progress'
  ) => {
    await apiFetch(`/api/admin/students/${studentId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await loadOverview();
    await onDashboardRefresh();
    flash('Student record updated.');
  };

  const handleCreateConcept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConceptTitle.trim()) return;
    const unitConcepts = data?.concepts.filter((c) => c.unit_id === Number(newConceptUnitId)) ?? [];
    await apiFetch('/api/admin/concepts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unit_id: Number(newConceptUnitId),
        order_index: unitConcepts.length + 1,
        topic_tag: newConceptTitle,
        title: newConceptTitle,
        summary: newConceptSummary || newConceptTitle,
        duration_minutes: 15,
        xp_reward: 60,
        gem_reward: 15,
        definition_text: newConceptSummary || newConceptTitle,
        example_text: newConceptSummary || newConceptTitle,
        practical_sql: newConceptSql,
        is_published: false, // New concepts start as draft until approved/published
      }),
    });
    setNewConceptTitle('');
    setNewConceptSummary('');
    await loadOverview();
    await onDashboardRefresh();
    flash('Concept created as Draft. Use AI Generate + Approve to publish.');
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQPrompt.trim()) return;
    let payload: Record<string, unknown>;
    if (newQType === 'mcq') {
      payload = {
        options: [newQOptA || 'Option A', newQOptB || 'Option B', newQOptC || 'Option C'],
        correctIndex: 0,
      };
    } else if (newQType === 'true_false') {
      payload = { statement: newQPrompt, correct: newQCorrectBool };
    } else {
      payload = {
        starterSql: newQStarterSql,
        requiredColumns: newQRequiredCols
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        expectedMinRows: 1,
      };
    }

    await apiFetch('/api/admin/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unit_id: Number(newQUnitId),
        concept_id: newQConceptId ? Number(newQConceptId) : null,
        is_unit_assessment: !newQConceptId,
        question_type: newQType,
        prompt: newQPrompt,
        payload,
        explanation: newQExplanation || 'Verified in Admin Studio.',
        xp_value: 20,
      }),
    });
    setNewQPrompt('');
    setNewQOptA('');
    setNewQOptB('');
    setNewQOptC('');
    setNewQExplanation('');
    await loadOverview();
    flash('Question added to bank.');
  };

  if (!data) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading Admin Studio...</div>;
  }

  const missingContentCount = data.concepts.filter(
    (c) => !c.has_full_lesson || c.question_count === 0
  ).length;

  const filteredConcepts = data.concepts.filter((c) => {
    if (c.unit_number !== unitFilter) return false;
    if (onlyMissing && c.has_full_lesson && c.question_count > 0) return false;
    return true;
  });

  const tabs = [
    { id: 'concepts' as const, label: `Concepts (${data.concepts.length})`, icon: BookOpen },
    { id: 'units' as const, label: `Units (${data.units.length})`, icon: Layers },
    { id: 'questions' as const, label: `Questions (${data.questions.length})`, icon: HelpCircle },
    { id: 'students' as const, label: `Students (${data.students.length})`, icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">Admin Curriculum Studio</h1>
          <p className="text-sm text-slate-600 tabular-nums">
            {data.units.length} Units · {data.concepts.length} Concepts · {data.questions.length} Interactive Items ·{' '}
            <span className={missingContentCount > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
              {missingContentCount} Missing Content/Questions
            </span>
          </p>
        </div>

        {statusMsg && (
          <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            <span>{statusMsg}</span>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-100 rounded-xl w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* CONCEPTS TAB */}
      {tab === 'concepts' && (
        <div className="space-y-5">
          {/* Unit Sub-Filter + Missing Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {data.units.map((u) => {
                const count = data.concepts.filter((c) => c.unit_number === u.unit_number).length;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setUnitFilter(u.unit_number)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer tabular-nums ${
                      unitFilter === u.unit_number
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Unit {u.unit_number} ({count})
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setOnlyMissing((v) => !v)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer border ${
                onlyMissing
                  ? 'bg-amber-100 border-amber-400 text-amber-900'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              {onlyMissing ? 'Showing Missing Only' : 'Filter Missing Content'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Create Concept Form */}
            <form
              onSubmit={handleCreateConcept}
              className="lg:col-span-4 p-5 rounded-2xl border border-slate-200 bg-white space-y-3"
            >
              <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Add Micro-Concept</span>
              </h3>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Unit</label>
                <select
                  value={newConceptUnitId}
                  onChange={(e) => setNewConceptUnitId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                >
                  {data.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Concept Title</label>
                <input
                  type="text"
                  required
                  value={newConceptTitle}
                  onChange={(e) => setNewConceptTitle(e.target.value)}
                  placeholder="e.g., SQL FULL OUTER JOIN"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Summary</label>
                <textarea
                  rows={2}
                  value={newConceptSummary}
                  onChange={(e) => setNewConceptSummary(e.target.value)}
                  placeholder="15-minute learning outcome..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Practical SQL</label>
                <input
                  type="text"
                  value={newConceptSql}
                  onChange={(e) => setNewConceptSql(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs"
                />
              </div>
              <button
                type="submit"
                className="w-full btn-tactile py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold border-b-4 border-emerald-800 cursor-pointer"
              >
                Create Draft Concept
              </button>
            </form>

            {/* Concept List */}
            <div className="lg:col-span-8 space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
              {filteredConcepts.length === 0 ? (
                <div className="p-8 rounded-2xl border border-slate-200 bg-white text-center text-sm text-slate-500">
                  No concepts match this filter.
                </div>
              ) : (
                filteredConcepts.map((c, idx) => (
                  <div
                    key={c.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-xs text-slate-500 tabular-nums">
                        {c.unit_number}.{c.order_index} · {c.duration_minutes}m · {c.question_count} Qs ·{' '}
                        <span className={c.has_full_lesson ? 'text-emerald-700' : 'text-amber-700 font-semibold'}>
                          {c.has_full_lesson ? 'Lesson Ready' : 'Missing Lesson'}
                        </span>
                        {' · '}
                        <span className={c.is_published ? 'text-sky-700' : 'text-slate-500'}>
                          {c.is_published ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <div className="font-display font-bold text-sm text-slate-900 truncate">{c.title}</div>
                      <div className="text-xs text-slate-600 truncate">{c.summary}</div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleReorder(c.id, 'up')}
                        title="Move Up"
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === filteredConcepts.length - 1}
                        onClick={() => handleReorder(c.id, 'down')}
                        title="Move Down"
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(c)}
                        title={c.is_published ? 'Unpublish' : 'Publish'}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        {c.is_published ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditor(c)}
                        className="px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit / AI</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/concepts/${c.id}`, { method: 'DELETE' });
                          await loadOverview();
                          await onDashboardRefresh();
                          flash('Concept deleted.');
                        }}
                        aria-label={`Delete ${c.title}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* UNITS TAB */}
      {tab === 'units' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.units.map((u) => {
              const unitConcepts = data.concepts.filter((c) => c.unit_id === u.id);
              return (
                <div key={u.id} className="p-5 rounded-2xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
                    <span>{u.subtitle}</span>
                    <span>
                      {unitConcepts.length} Concepts · ~{u.estimated_hours} hrs
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-lg text-slate-900">{u.title}</h3>
                  <p className="text-sm text-slate-600">{u.description}</p>
                </div>
              );
            })}
          </div>

          {data.migrations && data.migrations.length > 0 && (
            <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-2">
              <div className="text-xs font-semibold text-slate-700">Curriculum Migration Audit Log</div>
              {data.migrations.map((m) => (
                <div key={m.id} className="text-xs text-slate-600">
                  <span className="font-mono text-slate-800">{m.old_version} &rarr; {m.new_version}</span> · {m.note}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QUESTIONS TAB */}
      {tab === 'questions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreateQuestion}
            className="lg:col-span-4 p-5 rounded-2xl border border-slate-200 bg-white space-y-3"
          >
            <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Add Assessment Question</span>
            </h3>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Unit</label>
              <select
                value={newQUnitId}
                onChange={(e) => {
                  setNewQUnitId(Number(e.target.value));
                  setNewQConceptId('');
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                {data.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Target Concept</label>
              <select
                value={newQConceptId}
                onChange={(e) => setNewQConceptId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="">Unit Mastery Assessment</option>
                {data.concepts
                  .filter((c) => c.unit_id === Number(newQUnitId))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.order_index}. {c.title}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Challenge Type</label>
              <select
                value={newQType}
                onChange={(e) => setNewQType(e.target.value as 'mcq' | 'true_false' | 'sql_challenge')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="mcq">Multiple Choice (MCQ)</option>
                <option value="true_false">True / False</option>
                <option value="sql_challenge">Live SQL Challenge</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Prompt / Statement</label>
              <textarea
                required
                rows={2}
                value={newQPrompt}
                onChange={(e) => setNewQPrompt(e.target.value)}
                placeholder="Enter question text..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            {newQType === 'mcq' && (
              <div className="space-y-2">
                <input
                  type="text"
                  required
                  value={newQOptA}
                  onChange={(e) => setNewQOptA(e.target.value)}
                  placeholder="Option A (Correct Answer)"
                  className="w-full px-3 py-1.5 rounded-lg border border-emerald-300 text-xs"
                />
                <input
                  type="text"
                  required
                  value={newQOptB}
                  onChange={(e) => setNewQOptB(e.target.value)}
                  placeholder="Option B (Distractor)"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
                <input
                  type="text"
                  value={newQOptC}
                  onChange={(e) => setNewQOptC(e.target.value)}
                  placeholder="Option C (Distractor)"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            )}

            {newQType === 'true_false' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Correct Answer</label>
                <select
                  value={newQCorrectBool ? 'true' : 'false'}
                  onChange={(e) => setNewQCorrectBool(e.target.value === 'true')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              </div>
            )}

            {newQType === 'sql_challenge' && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newQStarterSql}
                  onChange={(e) => setNewQStarterSql(e.target.value)}
                  placeholder="Starter SQL"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono text-xs"
                />
                <input
                  type="text"
                  value={newQRequiredCols}
                  onChange={(e) => setNewQRequiredCols(e.target.value)}
                  placeholder="Required columns (comma-separated)"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono text-xs"
                />
              </div>
            )}

            <input
              type="text"
              value={newQExplanation}
              onChange={(e) => setNewQExplanation(e.target.value)}
              placeholder="Explanation shown after answering..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
            />

            <button
              type="submit"
              className="w-full btn-tactile py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold border-b-4 border-emerald-800 cursor-pointer"
            >
              Add Question
            </button>
          </form>

          <div className="lg:col-span-8 space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
            {data.questions.map((q) => (
              <div
                key={q.id}
                className="p-4 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="text-xs text-slate-500">
                    Unit {q.unit_number} · {q.is_unit_assessment ? 'Unit Assessment' : q.concept_title} ·{' '}
                    {q.question_type}
                  </div>
                  <div className="text-sm font-medium text-slate-900">{q.prompt}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/questions/${q.id}`, { method: 'DELETE' });
                    await loadOverview();
                    flash('Question removed.');
                  }}
                  aria-label="Delete question"
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STUDENTS TAB */}
      {tab === 'students' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">League</th>
                  <th className="px-5 py-3 font-medium">XP / Gems</th>
                  <th className="px-5 py-3 font-medium">Hearts</th>
                  <th className="px-5 py-3 font-medium text-right">Instructor Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.students.map((st) => (
                  <tr key={st.id} className={!st.is_demo ? 'bg-emerald-50/30' : 'hover:bg-slate-50'}>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900">
                        {st.name}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          {st.role === 'admin'
                            ? '(Admin)'
                            : st.is_demo
                              ? '(Legacy Demo)'
                              : '(Registered)'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        @{st.username || `user_${st.id}`} · {st.email || '—'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">{st.league}</td>
                    <td className="px-5 py-3.5 font-mono text-xs tabular-nums text-slate-700">
                      {st.xp} XP · {st.gems} Gems
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs tabular-nums text-rose-600">
                      {st.hearts}/{st.max_hearts}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStudentAction(st.id, 'grant_xp')}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Zap className="w-3 h-3 text-emerald-600" />
                          <span>+100 XP</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStudentAction(st.id, 'refill_hearts')}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Heart className="w-3 h-3 text-rose-500" />
                          <span>Full Hearts</span>
                        </button>
                        {Boolean(st.is_primary) && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStudentAction(st.id, 'unlock_all')}
                              className="px-2.5 py-1.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-xs font-medium text-sky-800 flex items-center gap-1 cursor-pointer"
                            >
                              <Unlock className="w-3 h-3" />
                              <span>Unlock All Units</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStudentAction(st.id, 'reset_progress')}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-600 flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset Path</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit & AI Lesson Review/Approve Modal */}
      {editingConcept && editLesson && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs text-slate-500">{editingConcept.unit_title}</div>
                <h2 className="font-display font-bold text-lg text-slate-900">
                  Edit &amp; Approve Lesson · {editingConcept.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingConcept(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-600">
                  Use AI to draft a fresh 10-part beginner-friendly lesson, then review and approve to persist.
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAiLesson}
                  disabled={aiGenerating}
                  className="btn-tactile px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold border-b-4 border-sky-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{aiGenerating ? 'Generating Draft...' : 'Generate AI Lesson Draft'}</span>
                </button>
              </div>

              {aiError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {aiError}
                </div>
              )}

              {aiDraftReady && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
                  New AI draft loaded below. Review the fields and click &ldquo;Approve &amp; Save Lesson&rdquo; to persist.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Concept Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Practical SQL</label>
                  <input
                    type="text"
                    value={editSql}
                    onChange={(e) => setEditSql(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Summary</label>
                <input
                  type="text"
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Simple Introduction</label>
                <textarea
                  rows={2}
                  value={editLesson.simpleIntro}
                  onChange={(e) => setEditLesson({ ...editLesson, simpleIntro: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Detailed Beginner Explanation</label>
                <textarea
                  rows={3}
                  value={editLesson.detailedExplanation}
                  onChange={(e) =>
                    setEditLesson({ ...editLesson, detailedExplanation: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quick Recap (one point per line)</label>
                <textarea
                  rows={2}
                  value={editLesson.quickRecap.join('\n')}
                  onChange={(e) =>
                    setEditLesson({
                      ...editLesson,
                      quickRecap: e.target.value.split('\n').filter(Boolean),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingConcept(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAndApprove}
                className="btn-tactile px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold border-b-4 border-emerald-800 cursor-pointer"
              >
                Approve &amp; Save Lesson
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
