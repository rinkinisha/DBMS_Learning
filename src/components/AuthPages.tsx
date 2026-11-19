import { FormEvent, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Shield,
  User,
  UserCheck,
} from 'lucide-react';
import { Student } from '../types';
import { apiFetch, setAuthToken } from '../lib/api';

interface AuthPagesProps {
  mode: 'login' | 'signup';
  onNavigateMode: (mode: 'login' | 'signup') => void;
  onAuthSuccess: (user: Student, token?: string, welcomeMessage?: string) => void;
}

export function AuthPages({ mode, onNavigateMode, onAuthSuccess }: AuthPagesProps) {
  // Account role selector (Student vs Admin)
  const [accountRole, setAccountRole] = useState<'student' | 'admin'>('student');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPwd, setShowLoginPwd] = useState(false);

  // Forgot password state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newResetPwd, setNewResetPwd] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'verify'>('request');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetHintCode, setResetHintCode] = useState<string | null>(null);

  // Signup state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSignupPwd, setShowSignupPwd] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateSignupClient = (): string | null => {
    if (fullName.trim().length < 2) return 'Full name must be at least 2 characters.';
    const u = username.trim();
    if (u.length < 3 || u.length > 24 || !/^[a-zA-Z0-9_]+$/.test(u)) {
      return 'Username must be 3–24 characters using letters, numbers, or underscores only.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail.trim())) {
      return 'Please enter a valid email address.';
    }
    if (signupPassword.length < 8 || !/[a-zA-Z]/.test(signupPassword) || !/[0-9]/.test(signupPassword)) {
      return 'Password must be at least 8 characters and include at least one letter and one number.';
    }
    if (signupPassword !== confirmPassword) {
      return 'Passwords do not match.';
    }
    return null;
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginEmail.trim() || !loginPassword) {
      setError('Please enter both your email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
          role: accountRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      setAuthToken(data.token);
      onAuthSuccess(data.user, data.token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const clientErr = validateSignupClient();
    if (clientErr) {
      setError(clientErr);
      return;
    }
    setSubmitting(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      const res = await apiFetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName.trim(),
          username: username.trim(),
          email: signupEmail.trim(),
          password: signupPassword,
          confirmPassword,
          timezone: tz,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setAuthToken(data.token);
      onAuthSuccess(data.user, data.token, data.welcomeMessage);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetMessage(null);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not process recovery request');
      setResetMessage(data.message);
      setResetHintCode(data.recoveryCodeHint ?? null);
      setResetStep('verify');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCompleteReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: resetCode.trim(),
          newPassword: newResetPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setForgotOpen(false);
      setResetStep('request');
      setLoginEmail(forgotEmail.trim());
      setResetMessage(data.message);
      setResetHintCode(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-8 px-4 sm:px-6">
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {/* Left Brand Showcase */}
        <div className="lg:col-span-5 bg-slate-900 text-white p-7 sm:p-9 flex flex-col justify-between space-y-8">
          <div className="space-y-6">
            <div className="font-display text-2xl font-extrabold tracking-tight">DBMS Arena</div>
            <div className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-700 bg-slate-800">
              <img
                src="/src/assets/images/mascot_dbms_owl_1795020561133.jpg"
                alt="Rinku DBMS Arena mascot"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold leading-tight text-balance">
                {mode === 'login'
                  ? 'Welcome back to your DBMS Arena journey'
                  : 'Create your student account and start from Unit I'}
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Master all 87 micro-concepts across DBMS Basics, SQL Part 1, SQL Part 2, and Relational Algebra with daily streaks and live rankings.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs text-slate-300 border-t border-slate-800 pt-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Personal progress, XP, hearts, and streak saved permanently</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Real-time daily, weekly, monthly, and all-time leaderboards</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Interactive SQL Playground and AI Doubt Assistant</span>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="lg:col-span-7 p-7 sm:p-10 flex flex-col justify-center space-y-6">
          {/* Role & Page Switcher */}
          <div className="space-y-3 border-b border-slate-200 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setAccountRole('student');
                    setError(null);
                    setForgotOpen(false);
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    accountRole === 'student'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Student</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountRole('admin');
                    setError(null);
                    setForgotOpen(false);
                    if (mode === 'signup') onNavigateMode('login');
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    accountRole === 'admin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Admin</span>
                </button>
              </div>

              {accountRole === 'student' ? (
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setForgotOpen(false);
                      onNavigateMode('login');
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setForgotOpen(false);
                      onNavigateMode('signup');
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      mode === 'signup' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Create Account
                  </button>
                </div>
              ) : (
                <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">
                  Administrator Login
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800">
              {error}
            </div>
          )}

          {resetMessage && !error && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900 space-y-1">
              <div>{resetMessage}</div>
              {resetHintCode && (
                <div className="font-mono text-emerald-800">
                  Verification code: <strong>{resetHintCode}</strong>
                </div>
              )}
            </div>
          )}

          {(mode === 'login' || accountRole === 'admin') && !forgotOpen && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {accountRole === 'admin' && (
                <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Enter your Administrator email and password to access DBMS Arena &amp; Admin Studio.</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700">
                  {accountRole === 'admin' ? 'Admin Email Address' : 'Email Address or Username'}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-email"
                    type={accountRole === 'admin' ? 'email' : 'text'}
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder={
                      accountRole === 'admin'
                        ? 'admin@dbmsarena.edu'
                        : 'student@university.edu or username'
                    }
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  {accountRole === 'student' && (
                    <button
                      type="button"
                      onClick={() => {
                        setForgotOpen(true);
                        setForgotEmail(loginEmail);
                        setError(null);
                      }}
                      className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type={showLoginPwd ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder={accountRole === 'admin' ? 'Enter admin password' : 'Enter your password'}
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPwd((v) => !v)}
                    aria-label={showLoginPwd ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  >
                    {showLoginPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={`w-full btn-tactile py-3 px-5 rounded-xl text-white text-sm font-bold border-b-4 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                  accountRole === 'admin'
                    ? 'bg-indigo-600 hover:bg-indigo-700 border-indigo-800'
                    : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-800'
                }`}
              >
                <span>
                  {submitting
                    ? 'Signing in...'
                    : accountRole === 'admin'
                      ? 'Login as Administrator'
                      : 'Login to DBMS Arena'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {accountRole === 'student' && (
                <div className="text-center text-xs text-slate-600 pt-1">
                  New to DBMS Arena?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      onNavigateMode('signup');
                    }}
                    className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Create a student account
                  </button>
                </div>
              )}
            </form>
          )}

          {mode === 'login' && forgotOpen && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-lg text-slate-900">Reset Your Password</h2>
                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen(false);
                    setError(null);
                  }}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Back to Login
                </button>
              </div>

              {resetStep === 'request' ? (
                <form onSubmit={handleRequestReset} className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">Registered Email</label>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="student@university.edu"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    Send Recovery Code
                  </button>
                </form>
              ) : (
                <form onSubmit={handleCompleteReset} className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">6-Digit Code</label>
                    <input
                      type="text"
                      required
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="123456"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">New Password</label>
                    <input
                      type="password"
                      required
                      value={newResetPwd}
                      onChange={(e) => setNewResetPwd(e.target.value)}
                      placeholder="At least 8 chars, letters + numbers"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Save New Password
                  </button>
                </form>
              )}
            </div>
          )}

          {accountRole === 'student' && mode === 'signup' && (
            <form onSubmit={handleSignupSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label htmlFor="signup-name" className="block text-xs font-semibold text-slate-700">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="signup-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Rinki Nisha"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="signup-username" className="block text-xs font-semibold text-slate-700">
                    Username
                  </label>
                  <div className="relative">
                    <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="signup-username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="rinki_nisha"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="signup-email" className="block text-xs font-semibold text-slate-700">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="signup-email"
                    type="email"
                    required
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="rinki@university.edu"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label htmlFor="signup-password" className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="signup-password"
                      type={showSignupPwd ? 'text' : 'password'}
                      required
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="8+ chars, letters & digits"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-emerald-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPwd((v) => !v)}
                      aria-label={showSignupPwd ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                    >
                      {showSignupPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="signup-confirm" className="block text-xs font-semibold text-slate-700">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="signup-confirm"
                      type={showSignupPwd ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500">
                New accounts start at 0 XP, 0 Gems, 5 Hearts, and 0-day Streak on Unit I Concept 1.
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-tactile py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold border-b-4 border-emerald-800 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{submitting ? 'Creating Account...' : 'Create Student Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="text-center text-xs text-slate-600">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    onNavigateMode('login');
                  }}
                  className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                >
                  Login here
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
