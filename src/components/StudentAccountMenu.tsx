import { FormEvent, useState } from 'react';
import { LogOut, Settings } from 'lucide-react';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import { apiFetch } from '../lib/api';

const AVATAR_PRESETS = ['owl', 'schema', 'query', 'spark', 'bolt', 'prism', 'atlas', 'nova'];

interface StudentAccountMenuProps {
  student: Student;
  onLogout: () => Promise<void>;
  onUpdated: (student: Student) => Promise<void>;
}

export function StudentAccountMenu({ student, onLogout, onUpdated }: StudentAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(student.name);
  const [seed, setSeed] = useState(student.avatar_seed);
  const [discordUserId, setDiscordUserId] = useState(student.discord_user_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), avatar_seed: seed.trim() || name.trim().toLowerCase(), discord_user_id: discordUserId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update account');
      await onUpdated(data.user);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button type="button" aria-label="Open account menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 rounded-xl border border-slate-200 p-1.5 pr-3 hover:bg-slate-50">
        <StudentAvatar name={student.name} seed={student.avatar_seed} size="sm" />
        <span className="hidden sm:block max-w-28 truncate text-xs font-semibold text-slate-700">@{student.username}</span>
      </button>
      {open && <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50 space-y-3">
        <div className="flex items-center gap-3">
          <StudentAvatar name={student.name} seed={student.avatar_seed} size="md" />
          <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-900">{student.name}</div><div className="truncate text-xs text-slate-500">@{student.username}</div></div>
        </div>
        {!editing ? <>
          <button type="button" onClick={() => { setName(student.name); setSeed(student.avatar_seed); setDiscordUserId(student.discord_user_id ?? ''); setEditing(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />Account settings</button>
          <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"><LogOut className="h-4 w-4" />Sign out</button>
        </> : <form onSubmit={save} className="space-y-3">
          <label className="block text-xs font-semibold text-slate-600">Display name<input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
          <label className="block text-xs font-semibold text-slate-600">Discord User ID <span className="font-normal text-slate-400">(optional)</span><input inputMode="numeric" pattern="[0-9]{17,20}" maxLength={20} value={discordUserId} onChange={(e) => setDiscordUserId(e.target.value)} placeholder="17–20 digit ID" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
          <div><div className="mb-1 text-xs font-semibold text-slate-600">Avatar style</div><div className="flex flex-wrap gap-1.5">{AVATAR_PRESETS.map((preset) => <button type="button" key={preset} aria-label={`Choose ${preset} avatar`} onClick={() => setSeed(preset)} className={`rounded-lg border p-1 ${seed === preset ? 'border-emerald-600 ring-2 ring-emerald-100' : 'border-slate-200'}`}><StudentAvatar name={name || student.name} seed={preset} size="sm" /></button>)}</div></div>
          {error && <p className="text-xs text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-100">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button></div>
        </form>}
      </div>}
    </div>
  );
}
