import { FormEvent, useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Check,
  Code2,
  Edit3,
  Flame,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { ProfilePayload, Student } from '../types';
import { DailyStreakCard } from './DailyStreakCard';
import { StudentAvatar } from './StudentAvatar';
import { apiFetch } from '../lib/api';

interface StudentProfilePageProps {
  onProfileUpdated: (updatedUser: Student) => Promise<void>;
  onLogout: () => Promise<void>;
}

const AVATAR_SEED_PRESETS = ['owl', 'schema', 'query', 'spark', 'bolt', 'prism', 'atlas', 'nova'];

export function StudentProfilePage({ onProfileUpdated, onLogout }: StudentProfilePageProps) {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarSeed, setAvatarSeed] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadProfile = async () => {
    try {
      const res = await apiFetch('/api/profile');
      const data = await res.json();
      if (res.ok) {
        setProfile(data);
        setDisplayName(data.user.name);
        setAvatarSeed(data.user.avatar_seed);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < 2) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: displayName.trim(),
          avatar_seed: avatarSeed.trim() || displayName.trim().toLowerCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update profile');
      setEditing(false);
      setFeedback('Profile updated across Dashboard and Leaderboard.');
      await loadProfile();
      await onProfileUpdated(data.user);
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="p-12 text-center text-sm text-slate-500">
        Loading student profile...
      </div>
    );
  }

  const { user, streak, stats, badges, recentXp } = profile;
  const conceptPct =
    stats.totalConcepts > 0 ? Math.round((stats.completedConcepts / stats.totalConcepts) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Identity Header Card */}
      <div className="p-6 sm:p-8 rounded-2xl border border-slate-200 bg-white space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <StudentAvatar name={user.name} seed={user.avatar_seed} size="xl" />
            <div className="space-y-1">
              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                <span>@{user.username}</span>
                <span aria-hidden="true">·</span>
                <span>{user.email}</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-amber-700">{user.league} League</span>
                {user.is_demo && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-600">Legacy Demo Account</span>
                  </>
                )}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
                {user.name}
              </h1>
              <div className="text-xs text-slate-500 tabular-nums">
                Role: {user.role === 'admin' ? 'Administrator' : 'Student'} · Timezone: {user.timezone || 'Asia/Kolkata'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{editing ? 'Cancel Edit' : 'Edit Profile'}</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 cursor-pointer whitespace-nowrap"
            >
              Sign Out
            </button>
          </div>
        </div>

        {feedback && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900">
            {feedback}
          </div>
        )}

        {editing && (
          <form onSubmit={handleSaveProfile} className="pt-5 border-t border-slate-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Choose Avatar Style</label>
                <div className="flex flex-wrap items-center gap-2">
                  {AVATAR_SEED_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAvatarSeed(preset)}
                      className={`p-1 rounded-xl border transition-all cursor-pointer ${
                        avatarSeed === preset
                          ? 'border-emerald-600 ring-2 ring-emerald-200'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <StudentAvatar name={displayName || user.name} seed={preset} size="sm" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn-tactile px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold border-b-4 border-emerald-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </form>
        )}

        {/* Key Academic & Arena Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>Total XP</span>
            </div>
            <div className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
              {user.xp}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-orange-500" />
              <span>Current Streak</span>
            </div>
            <div className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
              {streak.currentStreak}d
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>Longest Streak</span>
            </div>
            <div className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
              {streak.longestStreak}d
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-sky-600" />
              <span>Concepts</span>
            </div>
            <div className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
              {stats.completedConcepts}/{stats.totalConcepts}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              <span>Units Passed</span>
            </div>
            <div className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
              {stats.completedUnits}/{stats.totalUnits}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Code2 className="w-3.5 h-3.5 text-teal-600" />
              <span>SQL Solved</span>
            </div>
            <div className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
              {stats.sqlSolved}
            </div>
          </div>
        </div>

        {/* Overall Syllabus Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">Overall DBMS Syllabus Progress</span>
            <span className="font-mono tabular-nums text-slate-600">
              {conceptPct}% ({stats.accuracy}% quiz accuracy)
            </span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${conceptPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Streak & Recent XP Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5">
          <DailyStreakCard streak={streak} />
        </div>

        <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-600" />
              <span>XP Activity Ledger</span>
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">{recentXp.length} recent entries</span>
          </div>

          {recentXp.length === 0 ? (
            <div className="p-8 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
              No XP transactions yet. Pass Unit I Concept 1 or solve a SQL challenge to earn your first XP!
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentXp.map((tx) => (
                <div key={tx.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900 capitalize">
                      {tx.source_type.replace(/_/g, ' ')}
                    </div>
                    <div className="text-slate-500 tabular-nums">
                      {tx.local_date} {tx.source_ref_id ? `· ${tx.source_ref_id}` : ''}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-emerald-700 tabular-nums">
                    +{tx.xp_amount} XP
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Achievements Grid */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <span>Achievements &amp; Streak Milestones</span>
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">
            {badges.filter((b) => b.earned).length}/{badges.length} Unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {badges.map((b) => (
            <div
              key={b.id}
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                b.earned ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/60 opacity-75'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  b.earned ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {b.icon_name === 'Flame' ? (
                  <Flame className="w-5 h-5" />
                ) : b.icon_name === 'Trophy' ? (
                  <Trophy className="w-5 h-5" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="font-display font-bold text-sm text-slate-900">{b.title}</div>
                <div className="text-[11px] text-slate-500">
                  {b.earned ? 'Unlocked' : b.requirement_text}
                </div>
                <p className="text-xs text-slate-600">{b.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
