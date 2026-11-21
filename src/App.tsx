import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Settings,
  ShieldAlert,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { Concept, DashboardPayload, Student, Unit } from './types';
import { LearningPath } from './components/LearningPath';
import { StudentDashboardSidebar } from './components/StudentDashboardSidebar';
import { ConceptLessonModal } from './components/ConceptLessonModal';
import { SqlPlayground } from './components/SqlPlayground';
import { LeaguesAndBadges } from './components/LeaguesAndBadges';
import { AdminDashboard } from './components/AdminDashboard';
import { AiTutorDrawer } from './components/AiTutorDrawer';
import { AuthPages } from './components/AuthPages';
import { StudentAccountMenu } from './components/StudentAccountMenu';
import { apiFetch, clearAuthToken, getAuthToken, setAuthToken } from './lib/api';

type ViewTab = 'learn' | 'sql' | 'leagues' | 'admin';

function pathToView(pathname: string): ViewTab | 'login' | 'signup' {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/login') return 'login';
  if (clean === '/signup') return 'signup';
  if (clean === '/sql') return 'sql';
  if (clean === '/leaderboard' || clean === '/leagues') return 'leagues';
  if (clean === '/admin') return 'admin';
  return 'learn';
}

function viewToPath(view: ViewTab | 'login' | 'signup'): string {
  switch (view) {
    case 'login':
      return '/login';
    case 'signup':
      return '/signup';
    case 'sql':
      return '/sql';
    case 'leagues':
      return '/leaderboard';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}

export default function App() {
  const [route, setRoute] = useState<ViewTab | 'login' | 'signup'>(() =>
    pathToView(window.location.pathname)
  );
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<Student | null>(null);
  const [welcomeBanner, setWelcomeBanner] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [streakCelebrating, setStreakCelebrating] = useState(false);

  const [activeLesson, setActiveLesson] = useState<{
    unit: Unit;
    concept: Concept | null;
    isUnitAssessment: boolean;
  } | null>(null);

  const [playgroundInitialSql, setPlaygroundInitialSql] = useState<string | undefined>(undefined);
  const [playgroundInitialConceptId, setPlaygroundInitialConceptId] = useState<number | undefined>(undefined);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorInitialPrompt, setTutorInitialPrompt] = useState<string | undefined>(undefined);

  const navigate = useCallback((next: ViewTab | 'login' | 'signup', replace = false) => {
    const nextPath = viewToPath(next);
    if (window.location.pathname !== nextPath) {
      if (replace) {
        window.history.replaceState({}, '', nextPath);
      } else {
        window.history.pushState({}, '', nextPath);
      }
    }
    setRoute(next);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(pathToView(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await apiFetch('/api/dashboard', { cache: 'no-store' });
      if (res.status === 401) {
        clearAuthToken();
        setCurrentUser(null);
        setDashboard(null);
        navigate('login', true);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load dashboard');
      setDashboard(data);
      setCurrentUser(data.student);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiFetch('/api/auth/session');
        if (!active) return;
        if (!res.ok) {
          clearAuthToken();
          setCurrentUser(null);
          setAuthChecked(true);
          setLoading(false);
          const current = pathToView(window.location.pathname);
          if (current !== 'login' && current !== 'signup') {
            navigate('login', true);
          }
          return;
        }
        const data = await res.json();
        if (!data.authenticated || !data.user) {
          clearAuthToken();
          setCurrentUser(null);
          setAuthChecked(true);
          setLoading(false);
          const current = pathToView(window.location.pathname);
          if (current !== 'login' && current !== 'signup') {
            navigate('login', true);
          }
          return;
        }
        setCurrentUser(data.user);
        setAuthChecked(true);
        const current = pathToView(window.location.pathname);
        if (current === 'login' || current === 'signup') {
          navigate('learn', true);
        }
        await fetchDashboard();
      } catch {
        if (active) {
          setAuthChecked(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchDashboard, navigate]);

  // Real-time Socket.IO sync for sidebar standings when authenticated
  useEffect(() => {
    if (!currentUser) return;
    const token = getAuthToken();
    const socket = io({
      withCredentials: true,
      auth: token ? { token } : undefined,
      reconnectionAttempts: 5,
      reconnectionDelay: 2500,
      reconnectionDelayMax: 10000,
    });
    socket.on('connect', () => {
      socket.emit('leaderboard:subscribe');
    });
    socket.on('connect_error', () => {
      // Ignore transient network drops silently
    });
    socket.on('leaderboard:updated', () => {
      fetchDashboard();
    });
    return () => {
      socket.disconnect();
    };
  }, [currentUser?.id, fetchDashboard]);

  const handleAuthSuccess = async (user: Student, token?: string, welcomeMsg?: string) => {
    if (token) setAuthToken(token);
    setCurrentUser(user);
    setAuthChecked(true);
    setLoading(true);
    if (welcomeMsg) {
      setWelcomeBanner(welcomeMsg);
    }
    navigate('learn', true);
    await fetchDashboard();
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    clearAuthToken();
    setCurrentUser(null);
    setDashboard(null);
    setActiveLesson(null);
    setWelcomeBanner(null);
    navigate('login');
  };

  const triggerStreakCelebration = () => {
    setStreakCelebrating(true);
    setTimeout(() => setStreakCelebrating(false), 1800);
  };

  const handleLoseHeart = async () => {
    await apiFetch('/api/student/lose-heart', { method: 'POST' });
    await fetchDashboard();
  };

  const handleRefillHearts = async () => {
    await apiFetch('/api/student/refill-hearts', { method: 'POST' });
    await fetchDashboard();
  };

  const handleClaimMission = async (missionId: number) => {
    const res = await apiFetch('/api/student/claim-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionId }),
    });
    const data = await res.json();
    if (data.streak?.streakIncreased) triggerStreakCelebration();
    await fetchDashboard();
  };

  // The active lesson is opened from a dashboard snapshot. Replace that
  // snapshot when fresh dashboard content arrives so an already-open lesson
  // does not keep rendering old lesson_content.
  useEffect(() => {
    if (!dashboard) return;
    setActiveLesson((current) => {
      if (!current) return current;
      const unit = dashboard.units.find((candidate) => candidate.id === current.unit.id);
      if (!unit) return current;
      const concept = current.isUnitAssessment
        ? null
        : unit.concepts.find((candidate) => candidate.id === current.concept?.id) ?? current.concept;
      if (unit === current.unit && concept === current.concept) return current;
      return { ...current, unit, concept };
    });
  }, [dashboard]);

  // Lesson edits can be published by another admin session. Refresh the
  // Learning Path when this tab becomes active again, without touching quiz
  // or SQL Playground state.
  useEffect(() => {
    if (!currentUser || route !== 'learn') return;
    let lastRefreshAt = 0;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastRefreshAt < 1000) return;
      lastRefreshAt = Date.now();
      void fetchDashboard();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [currentUser?.id, route, fetchDashboard]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-sm text-slate-500">
        Loading DBMS Arena...
      </div>
    );
  }

  // Unauthenticated view -> Separate Login / Signup pages
  if (!currentUser || route === 'login' || route === 'signup') {
    const authMode = route === 'signup' ? 'signup' : 'login';
    return (
      <AuthPages
        mode={authMode}
        onNavigateMode={(nextMode) => navigate(nextMode)}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  const isAdmin = currentUser.role === 'admin';
  const navItems: { id: ViewTab; label: string; icon: typeof BookOpen }[] = [
    { id: 'learn', label: 'Learn Path', icon: BookOpen },
    { id: 'sql', label: 'SQL Playground', icon: Terminal },
    { id: 'leagues', label: 'Leaderboard', icon: Award },
    ...(isAdmin ? [{ id: 'admin' as const, label: 'Admin Studio', icon: Settings }] : []),
  ];

  const activeView: ViewTab = route;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Top Bar Contract: Zone 1 Brand — Zone 2 Nav Links — Zone 3 Primary CTA */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => navigate('learn')}
            className="font-display text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            DBMS Arena
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                    active
                      ? 'text-emerald-700 border-emerald-600 font-semibold'
                      : 'text-slate-600 border-transparent hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0 flex items-center gap-2">
            <StudentAccountMenu student={currentUser} onLogout={handleLogout} onUpdated={fetchDashboard} />
            <button
              type="button"
              onClick={() => {
                setTutorInitialPrompt(undefined);
                setTutorOpen(true);
              }}
              className="btn-tactile px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold border-b-4 border-emerald-800 flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Ask AI Tutor</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-12 space-y-6">
        {welcomeBanner && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-4 text-sm text-emerald-950">
            <div className="font-medium">{welcomeBanner}</div>
            <button
              type="button"
              onClick={() => setWelcomeBanner(null)}
              aria-label="Dismiss welcome banner"
              className="p-1 text-emerald-700 hover:text-emerald-950 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading && (
          <div className="p-12 text-center text-sm text-slate-500">
            Loading DBMS Arena workspace...
          </div>
        )}

        {error && !loading && (
          <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
            {error}
          </div>
        )}

        {dashboard && !loading && (
          <>
            {activeView === 'learn' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-8">
                  <LearningPath
                    units={dashboard.units}
                    onStartConcept={(unit, concept) =>
                      setActiveLesson({ unit, concept, isUnitAssessment: false })
                    }
                    onStartUnitAssessment={(unit) =>
                      setActiveLesson({ unit, concept: null, isUnitAssessment: true })
                    }
                  />
                </div>
                <div className="lg:col-span-4 lg:sticky lg:top-24">
                  <StudentDashboardSidebar
                    streak={dashboard.streak}
                    streakCelebrating={streakCelebrating}
                    missions={dashboard.missions}
                    onClaimMission={handleClaimMission}
                  />
                </div>
              </div>
            )}

            {activeView === 'sql' && (
              <SqlPlayground
                units={dashboard.units}
                initialSql={playgroundInitialSql}
                initialConceptId={playgroundInitialConceptId}
                onAskTutorAboutSql={(currentSql) => {
                  setTutorInitialPrompt(`Can you review or explain this SQL query?\n\n${currentSql}`);
                  setTutorOpen(true);
                }}
                onQueryExecuted={fetchDashboard}
              />
            )}

            {activeView === 'leagues' && (
              <LeaguesAndBadges student={dashboard.student} badges={dashboard.badges} />
            )}

            {activeView === 'admin' &&
              (isAdmin ? (
                <AdminDashboard onDashboardRefresh={fetchDashboard} />
              ) : (
                <div className="p-8 rounded-2xl border border-rose-200 bg-rose-50 text-center space-y-3 max-w-lg mx-auto">
                  <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto" />
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    Administrator Access Required
                  </h2>
                  <p className="text-sm text-slate-600">
                    Student accounts cannot access Admin Studio routes. Return to your learning path to continue studying.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('learn')}
                    className="btn-tactile px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold border-b-4 border-emerald-800 cursor-pointer"
                  >
                    Return to Learn Path
                  </button>
                </div>
              ))}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        className={`md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid h-14 ${
          navItems.length === 4 ? 'grid-cols-4' : 'grid-cols-3'
        }`}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
                active ? 'text-emerald-700 font-semibold' : 'text-slate-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[70px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Concept Lesson & Assessment Modal */}
      {activeLesson && dashboard && (
        <ConceptLessonModal
          unit={activeLesson.unit}
          concept={activeLesson.concept}
          isUnitAssessment={activeLesson.isUnitAssessment}
          hearts={dashboard.student.hearts}
          onClose={() => setActiveLesson(null)}
          onOpenPlaygroundWithSql={(sql, conceptId) => {
            setPlaygroundInitialSql(sql);
            setPlaygroundInitialConceptId(conceptId);
            setActiveLesson(null);
            navigate('sql');
          }}
          onAskTutor={(prompt) => {
            setTutorInitialPrompt(prompt);
            setTutorOpen(true);
          }}
          onLoseHeart={handleLoseHeart}
          onRefillHearts={handleRefillHearts}
          onDashboardRefresh={fetchDashboard}
          onStreakCelebrated={triggerStreakCelebration}
        />
      )}

      {/* AI Doubt Assistant Drawer */}
      <AiTutorDrawer
        open={tutorOpen}
        initialPrompt={tutorInitialPrompt}
        context={{
          unitTitle: activeLesson?.unit.title,
          conceptTitle: activeLesson?.concept?.title,
          currentSql: activeView === 'sql' ? playgroundInitialSql : undefined,
        }}
        onClose={() => setTutorOpen(false)}
        onMissionUpdated={fetchDashboard}
      />
    </div>
  );
}
