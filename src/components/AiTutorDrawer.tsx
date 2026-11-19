import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface AiTutorDrawerProps {
  open: boolean;
  initialPrompt?: string;
  context?: { unitTitle?: string; conceptTitle?: string; currentSql?: string };
  onClose: () => void;
  onMissionUpdated: () => Promise<void>;
}

const SUGGESTIONS = [
  'Explain Primary Key vs Candidate Key with an example',
  'Why do M:N relationships need a junction table?',
  'Difference between 3NF and BCNF?',
  'How do I write a LEFT JOIN in the SQL Playground?',
];

export function AiTutorDrawer({
  open,
  initialPrompt,
  context,
  onClose,
  onMissionUpdated,
}: AiTutorDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'Hi! I am Owlbert, your DBMS Arena Tutor. Ask me anything about ER diagrams, normalization, transactions, or SQL queries.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && initialPrompt) {
      setInput(initialPrompt);
    }
  }, [open, initialPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!open) return null;

  const sendMessage = async (textOverride?: string) => {
    const content = (textOverride ?? input).trim();
    if (!content || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text: content }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history: nextMessages.slice(-6),
          context,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gemini AI request failed');
      setMessages((prev) => [...prev, { role: 'model', text: data.reply }]);
      await onMissionUpdated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/src/assets/images/mascot_dbms_owl_1795020561133.jpg"
              alt="Owlbert DBMS Tutor"
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-xl object-cover border border-slate-200"
            />
            <div>
              <h2 className="font-display font-bold text-base text-slate-900">Owlbert AI Tutor</h2>
              <div className="text-xs text-slate-500">DBMS Doubt Assistant</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Tutor"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8FAFC]">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] p-3.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-sm'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                <span>Owlbert is thinking...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Quick Suggestions */}
        <div className="px-4 py-2.5 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => sendMessage(s)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="p-4 bg-white border-t border-slate-200 flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a DBMS or SQL question..."
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send message"
            className="btn-tactile p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border-b-4 border-emerald-800 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
