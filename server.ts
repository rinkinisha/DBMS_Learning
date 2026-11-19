import 'dotenv/config';
import http from 'node:http';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Server as SocketIOServer } from 'socket.io';
import { GoogleGenAI, Type } from '@google/genai';
import {
  ensureDailyMissions,
  getDatabases,
  initializeStudentPathProgressForUser,
  queryAll,
  queryOne,
  resetPracticeDb,
  runStmt,
  saveAppDb,
} from './server/db.ts';
import {
  AuthStudentRow,
  clearSessionCookie,
  createUserSession,
  deleteUserSession,
  extractSessionToken,
  getAuthenticatedUser,
  hashPassword,
  sanitizeUserForClient,
  setSessionCookie,
  validateEmail,
  validatePasswordStrength,
  validateUsername,
  verifyPassword,
} from './server/auth.ts';
import {
  buildStreakPayload,
  DEFAULT_TIMEZONE,
  evaluateAndPersistStreakBreak,
  getLocalDateIso,
  recordQualifyingStreakActivity,
} from './server/streakService.ts';
import {
  buildDynamicLeaderboard,
  LeaderboardPeriod,
  recordXpTransaction,
} from './server/leaderboardService.ts';

const PORT = 3000;

interface AuthedRequest extends Request {
  currentUser?: AuthStudentRow;
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add it in the Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function incrementMission(
  appDb: Awaited<ReturnType<typeof getDatabases>>['appDb'],
  studentId: number,
  missionKey: string,
  timezone: string = DEFAULT_TIMEZONE
): { reachedTargetNow: boolean } {
  const today = getLocalDateIso(new Date(), timezone);
  ensureDailyMissions(appDb, studentId);
  const before = queryOne<{ current_count: number; target_count: number }>(
    appDb,
    `SELECT current_count, target_count FROM daily_missions
     WHERE student_id = ? AND mission_key = ? AND mission_date = ?
     ORDER BY id DESC LIMIT 1`,
    [studentId, missionKey, today]
  );
  appDb.run(
    `UPDATE daily_missions
     SET current_count = MIN(target_count, current_count + 1)
     WHERE student_id = ? AND mission_key = ? AND mission_date = ?`,
    [studentId, missionKey, today]
  );
  saveAppDb();
  const reachedTargetNow = Boolean(
    before && before.current_count < before.target_count && before.current_count + 1 >= before.target_count
  );
  return { reachedTargetNow };
}

function awardBadgeIfEligible(
  appDb: Awaited<ReturnType<typeof getDatabases>>['appDb'],
  studentId: number,
  badgeCode: string
): void {
  const badge = queryOne<{ id: number }>(appDb, 'SELECT id FROM badges WHERE code = ?', [badgeCode]);
  if (!badge) return;
  const existing = queryOne(
    appDb,
    'SELECT 1 FROM student_badges WHERE student_id = ? AND badge_id = ?',
    [studentId, badge.id]
  );
  if (!existing) {
    runStmt(
      appDb,
      'INSERT INTO student_badges (student_id, badge_id, earned_at) VALUES (?, ?, ?)',
      [studentId, badge.id, new Date().toISOString()]
    );
  }
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  app.use(express.json({ limit: '2mb' }));
  await getDatabases();

  function broadcastLeaderboardUpdate(triggerStudentId?: number) {
    io.emit('leaderboard:updated', {
      timestamp: new Date().toISOString(),
      triggerStudentId: triggerStudentId ?? null,
    });
  }

  io.on('connection', (socket) => {
    socket.on('leaderboard:subscribe', () => {
      socket.emit('leaderboard:connected', { ok: true });
    });
  });

  // ---------------- AUTH MIDDLEWARE ----------------
  async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
      const { appDb: db } = await getDatabases();
      const user = getAuthenticatedUser(db, req);
      if (!user) {
        res.status(401).json({ error: 'Authentication required. Please log in.' });
        return;
      }
      req.currentUser = user;
      next();
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
    if (!req.currentUser || req.currentUser.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden: Administrator access required.' });
      return;
    }
    next();
  }

  // ---------------- AUTHENTICATION ROUTES ----------------
  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    try {
      const { name, username, email, password, confirmPassword, timezone } = req.body as {
        name?: string;
        username?: string;
        email?: string;
        password?: string;
        confirmPassword?: string;
        timezone?: string;
      };

      const trimmedName = (name ?? '').trim();
      const trimmedUsername = (username ?? '').trim();
      const trimmedEmail = (email ?? '').trim().toLowerCase();

      if (trimmedName.length < 2) {
        res.status(400).json({ error: 'Full name must be at least 2 characters.' });
        return;
      }
      const uErr = validateUsername(trimmedUsername);
      if (uErr) {
        res.status(400).json({ error: uErr });
        return;
      }
      const eErr = validateEmail(trimmedEmail);
      if (eErr) {
        res.status(400).json({ error: eErr });
        return;
      }
      const pErr = validatePasswordStrength(password ?? '');
      if (pErr) {
        res.status(400).json({ error: pErr });
        return;
      }
      if (confirmPassword !== undefined && password !== confirmPassword) {
        res.status(400).json({ error: 'Passwords do not match.' });
        return;
      }

      const { appDb: db } = await getDatabases();

      const dupEmail = queryOne<{ id: number }>(
        db,
        'SELECT id FROM students WHERE LOWER(email) = LOWER(?) LIMIT 1',
        [trimmedEmail]
      );
      if (dupEmail) {
        res.status(409).json({ error: 'An account with this email address already exists.' });
        return;
      }

      const dupUsername = queryOne<{ id: number }>(
        db,
        'SELECT id FROM students WHERE LOWER(username) = LOWER(?) LIMIT 1',
        [trimmedUsername]
      );
      if (dupUsername) {
        res.status(409).json({ error: 'This username is already taken. Please choose another.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const tz = (timezone ?? DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
      const passwordHash = hashPassword(password!);

      const newId = runStmt(
        db,
        `INSERT INTO students (
           name, username, email, password_hash, avatar_seed,
           xp, hearts, max_hearts, gems, streak_days, longest_streak,
           last_active_date, league, weekly_xp, role, is_primary, is_demo,
           timezone, streak_history_json, sql_solved_count, created_at
         ) VALUES (?, ?, ?, ?, ?, 0, 5, 5, 0, 0, 0, '', 'Bronze', 0, 'student', 0, 0, ?, '[]', 0, ?)`,
        [trimmedName, trimmedUsername, trimmedEmail, passwordHash, trimmedUsername.toLowerCase(), tz, nowIso],
        false
      );

      db.run(
        `INSERT INTO daily_streaks (user_id, current_streak, longest_streak, last_activity_date, streak_history_json, timezone, updated_at)
         VALUES (?, 0, 0, NULL, '[]', ?, ?)`,
        [newId, tz, nowIso]
      );

      initializeStudentPathProgressForUser(db, newId);
      ensureDailyMissions(db, newId);

      const createdUser = queryOne<AuthStudentRow>(
        db,
        `SELECT id, name, username, email, avatar_seed, xp, hearts, max_hearts, gems,
                streak_days, longest_streak, last_active_date, league, weekly_xp, role,
                is_demo, timezone, sql_solved_count, created_at
         FROM students WHERE id = ?`,
        [newId]
      )!;

      const token = createUserSession(db, newId);
      setSessionCookie(res, token, req);
      broadcastLeaderboardUpdate(newId);

      res.status(201).json({
        user: sanitizeUserForClient(createdUser),
        token,
        welcomeMessage: `Welcome to DBMS Arena, ${createdUser.name}! Complete Concept 1 to start your streak.`,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password, role } = req.body as {
        email?: string;
        password?: string;
        role?: 'student' | 'admin';
      };
      const trimmedEmail = (email ?? '').trim().toLowerCase();
      if (!trimmedEmail || !password) {
        res.status(400).json({ error: 'Email address and password are required.' });
        return;
      }

      const { appDb: db } = await getDatabases();
      const row = queryOne<AuthStudentRow & { password_hash: string | null }>(
        db,
        `SELECT * FROM students WHERE LOWER(email) = LOWER(?) LIMIT 1`,
        [trimmedEmail]
      );

      if (!row || !verifyPassword(password, row.password_hash)) {
        res.status(401).json({ error: 'Invalid email address or password.' });
        return;
      }

      if (role === 'admin' && row.role !== 'admin') {
        res.status(403).json({ error: 'This account does not have Administrator privileges.' });
        return;
      }
      if (role === 'student' && row.role === 'admin') {
        res.status(403).json({ error: 'Administrator accounts must sign in via the Admin option.' });
        return;
      }

      // Logging in NEVER increments streak, only checks if a missed day broke it
      evaluateAndPersistStreakBreak(db, row.id);
      initializeStudentPathProgressForUser(db, row.id);
      ensureDailyMissions(db, row.id);

      const refreshed = queryOne<AuthStudentRow>(
        db,
        `SELECT id, name, username, email, avatar_seed, xp, hearts, max_hearts, gems,
                streak_days, longest_streak, last_active_date, league, weekly_xp, role,
                is_demo, timezone, sql_solved_count, created_at
         FROM students WHERE id = ?`,
        [row.id]
      )!;

      const token = createUserSession(db, row.id);
      setSessionCookie(res, token, req);

      res.json({
        user: sanitizeUserForClient(refreshed),
        token,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    try {
      const token = extractSessionToken(req);
      if (token) {
        const { appDb: db } = await getDatabases();
        deleteUserSession(db, token);
      }
      clearSessionCookie(res, req);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      const user = req.currentUser!;
      const streak = buildStreakPayload(db, user.id);
      const refreshed = queryOne<AuthStudentRow>(db, 'SELECT * FROM students WHERE id = ?', [user.id])!;
      res.json({
        user: sanitizeUserForClient(refreshed),
        streak,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body as { email?: string };
      const eErr = validateEmail(email ?? '');
      if (eErr) {
        res.status(400).json({ error: eErr });
        return;
      }
      const { appDb: db } = await getDatabases();
      const user = queryOne<{ id: number; email: string; is_demo: number; role: string }>(
        db,
        'SELECT id, email, is_demo, role FROM students WHERE LOWER(email) = LOWER(?) LIMIT 1',
        [email!.trim()]
      );
      if (!user || user.is_demo === 1 || user.role === 'admin') {
        res.json({
          ok: true,
          message: 'If an eligible student account matches that email, a 6-digit recovery code has been issued.',
        });
        return;
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      runStmt(
        db,
        `INSERT INTO password_resets (student_id, reset_code, expires_at, used, created_at)
         VALUES (?, ?, ?, 0, ?)`,
        [user.id, code, expiresAt, now.toISOString()]
      );

      res.json({
        ok: true,
        message: 'Recovery code issued! Enter the 6-digit code below to set a new password.',
        recoveryCodeHint: code,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = req.body as {
        email?: string;
        code?: string;
        newPassword?: string;
      };
      const pErr = validatePasswordStrength(newPassword ?? '');
      if (pErr) {
        res.status(400).json({ error: pErr });
        return;
      }

      const { appDb: db } = await getDatabases();
      const user = queryOne<{ id: number }>(
        db,
        'SELECT id FROM students WHERE LOWER(email) = LOWER(?) LIMIT 1',
        [(email ?? '').trim()]
      );
      if (!user) {
        res.status(400).json({ error: 'Invalid email or recovery code.' });
        return;
      }

      const resetRow = queryOne<{ id: number; expires_at: string; used: number }>(
        db,
        `SELECT id, expires_at, used FROM password_resets
         WHERE student_id = ? AND reset_code = ? AND used = 0
         ORDER BY id DESC LIMIT 1`,
        [user.id, (code ?? '').trim()]
      );

      if (!resetRow || new Date(resetRow.expires_at).getTime() <= Date.now()) {
        res.status(400).json({ error: 'Recovery code is invalid or expired.' });
        return;
      }

      db.run('UPDATE password_resets SET used = 1 WHERE id = ?', [resetRow.id]);
      runStmt(db, 'UPDATE students SET password_hash = ? WHERE id = ?', [
        hashPassword(newPassword!),
        user.id,
      ]);

      res.json({ ok: true, message: 'Password updated cleanly. You can now sign in.' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------- DASHBOARD, STREAK, PROFILE & LEADERBOARD ----------------
  app.get('/api/dashboard', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      const studentId = req.currentUser!.id;
      const streak = buildStreakPayload(db, studentId);
      const studentRow = queryOne<AuthStudentRow>(db, 'SELECT * FROM students WHERE id = ?', [studentId]);
      if (!studentRow) {
        res.status(404).json({ error: 'Student profile not found' });
        return;
      }

      initializeStudentPathProgressForUser(db, studentId);
      ensureDailyMissions(db, studentId);

      const unitsRaw = queryAll<Record<string, unknown>>(
        db,
        `SELECT u.*, COALESCE(sup.status, 'locked') AS status, sup.assessment_score
         FROM units u
         LEFT JOIN student_unit_progress sup ON sup.unit_id = u.id AND sup.student_id = ?
         ORDER BY u.unit_number ASC`,
        [studentId]
      );

      const conceptsRaw = queryAll<Record<string, unknown>>(
        db,
        `SELECT c.*, COALESCE(scp.status, 'locked') AS status, scp.best_score, COALESCE(scp.attempts, 0) AS attempts
         FROM concepts c
         LEFT JOIN student_concept_progress scp ON scp.concept_id = c.id AND scp.student_id = ?
         WHERE c.is_published = 1
         ORDER BY c.unit_id ASC, c.order_index ASC`,
        [studentId]
      );

      const units = unitsRaw.map((u) => ({
        ...u,
        concepts: conceptsRaw
          .filter((c) => Number(c.unit_id) === Number(u.id))
          .map((c) => ({
            ...c,
            is_published: Boolean(c.is_published),
            ai_approved: Boolean(c.ai_approved),
            diagram_config: JSON.parse(String(c.diagram_config_json || '{}')),
            lesson_content: JSON.parse(String(c.lesson_content_json || '{}')),
          })),
      }));

      const today = getLocalDateIso(new Date(), studentRow.timezone || DEFAULT_TIMEZONE);
      const missions = queryAll<Record<string, unknown>>(
        db,
        `SELECT * FROM daily_missions WHERE student_id = ? AND mission_date = ? ORDER BY id ASC`,
        [studentId, today]
      ).map((m) => ({
        ...m,
        claimed: Boolean(m.claimed),
      }));

      const badges = queryAll<Record<string, unknown>>(
        db,
        `SELECT b.*, sb.earned_at, CASE WHEN sb.badge_id IS NOT NULL THEN 1 ELSE 0 END AS earned
         FROM badges b
         LEFT JOIN student_badges sb ON sb.badge_id = b.id AND sb.student_id = ?
         ORDER BY b.id ASC`,
        [studentId]
      ).map((b) => ({
        ...b,
        earned: Boolean(b.earned),
      }));

      const lbData = buildDynamicLeaderboard(db, {
        currentUserId: studentId,
        period: 'weekly',
        page: 1,
        pageSize: 10,
      });

      res.json({
        student: sanitizeUserForClient(studentRow),
        streak,
        units,
        missions,
        badges,
        leaderboard: lbData.entries,
        leaderboardMeta: {
          totalRegistered: lbData.totalRegistered,
          currentUserRank: lbData.currentUserRank,
          currentUserEntry: lbData.currentUserEntry,
        },
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/streak', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      const payload = buildStreakPayload(db, req.currentUser!.id);
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/leaderboard', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      const rawPeriod = String(req.query.period ?? 'weekly');
      const period: LeaderboardPeriod =
        rawPeriod === 'daily' ||
        rawPeriod === 'weekly' ||
        rawPeriod === 'monthly' ||
        rawPeriod === 'all_time'
          ? rawPeriod
          : 'weekly';
      const search = String(req.query.q ?? '');
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.limit ?? 20);

      const data = buildDynamicLeaderboard(db, {
        currentUserId: req.currentUser!.id,
        period,
        search,
        page,
        pageSize,
      });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/profile', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      const studentId = req.currentUser!.id;
      const streak = buildStreakPayload(db, studentId);
      const student = queryOne<AuthStudentRow>(db, 'SELECT * FROM students WHERE id = ?', [studentId])!;

      const completedConcepts =
        queryOne<{ c: number }>(
          db,
          `SELECT COUNT(*) AS c FROM student_concept_progress scp
           JOIN concepts con ON con.id = scp.concept_id
           WHERE scp.student_id = ? AND scp.status = 'completed' AND con.is_published = 1`,
          [studentId]
        )?.c ?? 0;

      const totalConcepts =
        queryOne<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM concepts WHERE is_published = 1')?.c ??
        87;

      const completedUnits =
        queryOne<{ c: number }>(
          db,
          `SELECT COUNT(*) AS c FROM student_unit_progress WHERE student_id = ? AND status = 'completed'`,
          [studentId]
        )?.c ?? 0;

      const totalUnits = queryOne<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM units')?.c ?? 4;

      const sqlSolved =
        queryOne<{ c: number }>(
          db,
          `SELECT COUNT(DISTINCT COALESCE(challenge_key, sql_text)) AS c
           FROM sql_submissions WHERE student_id = ? AND passed = 1`,
          [studentId]
        )?.c ?? 0;

      const accuracyRow = queryOne<{ avg_acc: number; total_attempts: number }>(
        db,
        `SELECT ROUND(AVG(score), 1) AS avg_acc, COUNT(*) AS total_attempts
         FROM quiz_attempts WHERE student_id = ?`,
        [studentId]
      );

      const badges = queryAll<Record<string, unknown>>(
        db,
        `SELECT b.*, sb.earned_at, CASE WHEN sb.badge_id IS NOT NULL THEN 1 ELSE 0 END AS earned
         FROM badges b
         LEFT JOIN student_badges sb ON sb.badge_id = b.id AND sb.student_id = ?
         ORDER BY earned DESC, b.id ASC`,
        [studentId]
      ).map((b) => ({ ...b, earned: Boolean(b.earned) }));

      const recentXp = queryAll(
        db,
        `SELECT id, source_type, source_ref_id, xp_amount, gems_amount, local_date, created_at
         FROM xp_transactions
         WHERE student_id = ?
         ORDER BY id DESC LIMIT 12`,
        [studentId]
      );

      res.json({
        user: sanitizeUserForClient(student),
        streak,
        stats: {
          completedConcepts,
          totalConcepts,
          completedUnits,
          totalUnits,
          sqlSolved: Math.max(student.sql_solved_count ?? 0, sqlSolved),
          accuracy: accuracyRow?.avg_acc ?? 0,
          totalQuizAttempts: accuracyRow?.total_attempts ?? 0,
        },
        badges,
        recentXp,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/profile', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { name, avatar_seed, timezone } = req.body as {
        name?: string;
        avatar_seed?: string;
        timezone?: string;
      };
      const trimmedName = (name ?? '').trim();
      if (trimmedName.length < 2) {
        res.status(400).json({ error: 'Display name must be at least 2 characters.' });
        return;
      }

      const { appDb: db } = await getDatabases();
      const studentId = req.currentUser!.id;
      const safeAvatar = (avatar_seed ?? req.currentUser!.avatar_seed).trim().slice(0, 40);
      const safeTz = (timezone ?? req.currentUser!.timezone ?? DEFAULT_TIMEZONE).trim();

      runStmt(
        db,
        'UPDATE students SET name = ?, avatar_seed = ?, timezone = ? WHERE id = ?',
        [trimmedName, safeAvatar, safeTz, studentId],
        false
      );
      db.run('UPDATE daily_streaks SET timezone = ? WHERE user_id = ?', [safeTz, studentId]);
      saveAppDb();

      const updated = queryOne<AuthStudentRow>(db, 'SELECT * FROM students WHERE id = ?', [studentId])!;
      broadcastLeaderboardUpdate(studentId);
      res.json({ user: sanitizeUserForClient(updated) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/student/lose-heart', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      const studentId = req.currentUser!.id;
      const student = queryOne<{ hearts: number }>(db, 'SELECT hearts FROM students WHERE id = ?', [
        studentId,
      ])!;
      const nextHearts = Math.max(0, Number(student.hearts) - 1);
      runStmt(db, 'UPDATE students SET hearts = ? WHERE id = ?', [nextHearts, studentId]);
      res.json({ hearts: nextHearts });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/student/refill-hearts', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      const studentId = req.currentUser!.id;
      const student = queryOne<{ hearts: number; max_hearts: number; gems: number }>(
        db,
        'SELECT hearts, max_hearts, gems FROM students WHERE id = ?',
        [studentId]
      )!;
      if (student.hearts >= student.max_hearts) {
        res.json({ hearts: student.hearts, gems: student.gems, message: 'Hearts are already full.' });
        return;
      }
      const cost = 25;
      if (student.gems >= cost) {
        const nextGems = student.gems - cost;
        runStmt(db, 'UPDATE students SET hearts = max_hearts, gems = ? WHERE id = ?', [
          nextGems,
          studentId,
        ]);
        res.json({ hearts: student.max_hearts, gems: nextGems, message: 'Full hearts restored!' });
      } else {
        const nextHearts = Math.min(student.max_hearts, student.hearts + 1);
        runStmt(db, 'UPDATE students SET hearts = ? WHERE id = ?', [nextHearts, studentId]);
        res.json({
          hearts: nextHearts,
          gems: student.gems,
          message: 'Granted +1 emergency recovery heart!',
        });
      }
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/student/claim-mission', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { missionId } = req.body as { missionId: number };
      const { appDb: db } = await getDatabases();
      const studentId = req.currentUser!.id;
      const mission = queryOne<{
        id: number;
        student_id: number;
        target_count: number;
        current_count: number;
        xp_reward: number;
        gem_reward: number;
        claimed: number;
      }>(db, 'SELECT * FROM daily_missions WHERE id = ? AND student_id = ?', [missionId, studentId]);

      if (!mission) {
        res.status(404).json({ error: 'Mission not found' });
        return;
      }
      if (mission.claimed) {
        res.status(400).json({ error: 'Mission already claimed' });
        return;
      }
      if (mission.current_count < mission.target_count) {
        res.status(400).json({ error: 'Mission target not yet reached' });
        return;
      }

      runStmt(db, 'UPDATE daily_missions SET claimed = 1 WHERE id = ?', [missionId], false);
      const tx = recordXpTransaction(db, {
        studentId,
        sourceType: 'daily_mission',
        sourceRefId: `mission:${missionId}`,
        xpAmount: mission.xp_reward,
        gemsAmount: mission.gem_reward,
        timezone: req.currentUser!.timezone,
      });

      const streakRes = recordQualifyingStreakActivity(db, studentId);
      if (tx.newXp >= 500) awardBadgeIfEligible(db, studentId, 'XP_500');
      broadcastLeaderboardUpdate(studentId);

      res.json({
        xp: tx.newXp,
        gems: tx.newGems,
        league: tx.newLeague,
        streak: streakRes,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------- QUESTIONS & SEQUENTIAL UNLOCK GUARD ----------------
  app.get('/api/concepts/:id/questions', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      const conceptId = Number(req.params.id);
      const studentId = req.currentUser!.id;

      const prog = queryOne<{ status: string }>(
        db,
        'SELECT status FROM student_concept_progress WHERE student_id = ? AND concept_id = ?',
        [studentId, conceptId]
      );
      if (!prog || prog.status === 'locked') {
        res.status(403).json({ error: 'This concept is locked. Pass the previous concept first.' });
        return;
      }

      const rows = queryAll<Record<string, unknown>>(
        db,
        'SELECT * FROM questions WHERE concept_id = ? AND is_unit_assessment = 0 ORDER BY id ASC',
        [conceptId]
      );
      res.json(
        rows.map((r) => ({
          ...r,
          is_unit_assessment: Boolean(r.is_unit_assessment),
          payload: JSON.parse(String(r.payload_json || '{}')),
        }))
      );
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/units/:id/assessment', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      const unitId = Number(req.params.id);
      const studentId = req.currentUser!.id;

      const unitProg = queryOne<{ status: string }>(
        db,
        'SELECT status FROM student_unit_progress WHERE student_id = ? AND unit_id = ?',
        [studentId, unitId]
      );
      if (!unitProg || unitProg.status === 'locked') {
        res.status(403).json({ error: 'Unit is locked. Pass the previous unit assessment first.' });
        return;
      }
      const incomplete = queryOne<{ count: number }>(
        db,
        `SELECT COUNT(*) AS count
         FROM concepts c
         LEFT JOIN student_concept_progress scp ON scp.concept_id = c.id AND scp.student_id = ?
         WHERE c.unit_id = ? AND c.is_published = 1 AND COALESCE(scp.status, 'locked') != 'completed'`,
        [studentId, unitId]
      );
      if (incomplete && incomplete.count > 0) {
        res.status(403).json({
          error: `Complete all concepts in this unit first (${incomplete.count} remaining).`,
        });
        return;
      }

      const rows = queryAll<Record<string, unknown>>(
        db,
        'SELECT * FROM questions WHERE unit_id = ? AND is_unit_assessment = 1 ORDER BY id ASC',
        [unitId]
      );
      res.json(
        rows.map((r) => ({
          ...r,
          is_unit_assessment: true,
          payload: JSON.parse(String(r.payload_json || '{}')),
        }))
      );
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/assessments/submit', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { conceptId, unitId, isUnitAssessment, score } = req.body as {
        conceptId?: number;
        unitId: number;
        isUnitAssessment: boolean;
        score: number;
      };
      const { appDb: db } = await getDatabases();
      const student = req.currentUser!;
      const studentId = student.id;

      // Backend sequential unlock validation
      if (!isUnitAssessment && conceptId) {
        const currentProg = queryOne<{ status: string }>(
          db,
          'SELECT status FROM student_concept_progress WHERE student_id = ? AND concept_id = ?',
          [studentId, conceptId]
        );
        if (!currentProg || currentProg.status === 'locked') {
          res.status(403).json({ error: 'Cannot submit locked concept.' });
          return;
        }
      } else if (isUnitAssessment && unitId) {
        const uProg = queryOne<{ status: string }>(
          db,
          'SELECT status FROM student_unit_progress WHERE student_id = ? AND unit_id = ?',
          [studentId, unitId]
        );
        if (!uProg || uProg.status === 'locked') {
          res.status(403).json({ error: 'Cannot submit locked unit assessment.' });
          return;
        }
        const incomplete = queryOne<{ count: number }>(
          db,
          `SELECT COUNT(*) AS count
           FROM concepts c
           LEFT JOIN student_concept_progress scp ON scp.concept_id = c.id AND scp.student_id = ?
           WHERE c.unit_id = ? AND c.is_published = 1 AND COALESCE(scp.status, 'locked') != 'completed'`,
          [studentId, unitId]
        );
        if (incomplete && incomplete.count > 0) {
          res.status(403).json({
            error: `Complete all concepts in this unit first (${incomplete.count} remaining).`,
          });
          return;
        }
      }

      const clampedScore = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
      const passed = clampedScore >= 70;
      let plannedXp = 0;
      let plannedGems = 0;
      let sourceType: 'concept_pass' | 'concept_replay' | 'unit_assessment' | 'unit_replay' =
        'concept_pass';
      let sourceRefId = '';
      let unlockedTitle: string | null = null;

      if (!isUnitAssessment && conceptId) {
        const concept = queryOne<{
          id: number;
          unit_id: number;
          order_index: number;
          xp_reward: number;
          gem_reward: number;
        }>(db, 'SELECT * FROM concepts WHERE id = ?', [conceptId]);

        const prev = queryOne<{ status: string; best_score: number | null; attempts: number }>(
          db,
          'SELECT status, best_score, attempts FROM student_concept_progress WHERE student_id = ? AND concept_id = ?',
          [studentId, conceptId]
        );

        const wasAlreadyCompleted = prev?.status === 'completed';
        const bestScore = Math.max(prev?.best_score ?? 0, clampedScore);
        const attempts = (prev?.attempts ?? 0) + 1;

        if (passed && concept) {
          db.run(
            `INSERT INTO student_concept_progress (student_id, concept_id, status, best_score, attempts, completed_at)
             VALUES (?, ?, 'completed', ?, ?, ?)
             ON CONFLICT(student_id, concept_id) DO UPDATE SET
               status = 'completed',
               best_score = excluded.best_score,
               attempts = excluded.attempts,
               completed_at = excluded.completed_at`,
            [studentId, conceptId, bestScore, attempts, new Date().toISOString()]
          );

          sourceType = wasAlreadyCompleted ? 'concept_replay' : 'concept_pass';
          sourceRefId = `concept:${conceptId}`;
          plannedXp = wasAlreadyCompleted
            ? Math.round(concept.xp_reward * 0.4)
            : concept.xp_reward;
          plannedGems = wasAlreadyCompleted ? 5 : concept.gem_reward;

          const nextConcept = queryOne<{ id: number; title: string }>(
            db,
            `SELECT id, title FROM concepts WHERE unit_id = ? AND order_index > ? AND is_published = 1 ORDER BY order_index ASC LIMIT 1`,
            [concept.unit_id, concept.order_index]
          );

          if (nextConcept) {
            const nextProg = queryOne<{ status: string }>(
              db,
              'SELECT status FROM student_concept_progress WHERE student_id = ? AND concept_id = ?',
              [studentId, nextConcept.id]
            );
            if (!nextProg || nextProg.status === 'locked') {
              db.run(
                `INSERT INTO student_concept_progress (student_id, concept_id, status)
                 VALUES (?, ?, 'unlocked')
                 ON CONFLICT(student_id, concept_id) DO UPDATE SET status = 'unlocked'`,
                [studentId, nextConcept.id]
              );
              unlockedTitle = nextConcept.title;
            }
          }

          incrementMission(db, studentId, 'complete_concept', student.timezone);
          awardBadgeIfEligible(db, studentId, 'FIRST_SPARK');
        } else {
          db.run(
            `INSERT INTO student_concept_progress (student_id, concept_id, status, best_score, attempts)
             VALUES (?, ?, 'unlocked', ?, ?)
             ON CONFLICT(student_id, concept_id) DO UPDATE SET
               best_score = excluded.best_score,
               attempts = excluded.attempts`,
            [studentId, conceptId, bestScore, attempts]
          );
        }
      } else if (isUnitAssessment && unitId) {
        const unit = queryOne<{ id: number; unit_number: number; unlock_xp_bonus: number }>(
          db,
          'SELECT * FROM units WHERE id = ?',
          [unitId]
        );
        if (passed && unit) {
          const prevUnit = queryOne<{ status: string }>(
            db,
            'SELECT status FROM student_unit_progress WHERE student_id = ? AND unit_id = ?',
            [studentId, unitId]
          );
          const alreadyDone = prevUnit?.status === 'completed';

          db.run(
            `INSERT INTO student_unit_progress (student_id, unit_id, status, assessment_score, completed_at)
             VALUES (?, ?, 'completed', ?, ?)
             ON CONFLICT(student_id, unit_id) DO UPDATE SET
               status = 'completed',
               assessment_score = MAX(COALESCE(assessment_score, 0), excluded.assessment_score),
               completed_at = excluded.completed_at`,
            [studentId, unitId, clampedScore, new Date().toISOString()]
          );

          sourceType = alreadyDone ? 'unit_replay' : 'unit_assessment';
          sourceRefId = `unit:${unitId}`;
          plannedXp = alreadyDone ? 50 : unit.unlock_xp_bonus;
          plannedGems = alreadyDone ? 10 : 40;

          if (unit.unit_number === 1) {
            awardBadgeIfEligible(db, studentId, 'UNIT_1_MASTER');
          }

          const nextUnit = queryOne<{ id: number; title: string }>(
            db,
            'SELECT id, title FROM units WHERE unit_number > ? ORDER BY unit_number ASC LIMIT 1',
            [unit.unit_number]
          );
          if (nextUnit) {
            db.run(
              `INSERT INTO student_unit_progress (student_id, unit_id, status)
               VALUES (?, ?, 'unlocked')
               ON CONFLICT(student_id, unit_id) DO UPDATE SET
                 status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'unlocked' END`,
              [studentId, nextUnit.id]
            );
            const firstNextConcept = queryOne<{ id: number }>(
              db,
              'SELECT id FROM concepts WHERE unit_id = ? AND is_published = 1 ORDER BY order_index ASC LIMIT 1',
              [nextUnit.id]
            );
            if (firstNextConcept) {
              db.run(
                `INSERT INTO student_concept_progress (student_id, concept_id, status)
                 VALUES (?, ?, 'unlocked')
                 ON CONFLICT(student_id, concept_id) DO UPDATE SET
                   status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'unlocked' END`,
                [studentId, firstNextConcept.id]
              );
            }
            unlockedTitle = nextUnit.title;
          }
        }
      }

      let xpEarned = 0;
      let gemsEarned = 0;
      let duplicateBlocked = false;
      let newXp = student.xp;
      let newGems = student.gems;
      let newLeague = student.league;
      let streakResult: ReturnType<typeof recordQualifyingStreakActivity> | null = null;

      if (passed && plannedXp > 0) {
        const tx = recordXpTransaction(db, {
          studentId,
          sourceType,
          sourceRefId,
          xpAmount: plannedXp,
          gemsAmount: plannedGems,
          timezone: student.timezone,
        });
        xpEarned = tx.xpAwarded;
        gemsEarned = tx.gemsAwarded;
        duplicateBlocked = tx.duplicateBlocked;
        newXp = tx.newXp;
        newGems = tx.newGems;
        newLeague = tx.newLeague;

        if (newXp >= 500) awardBadgeIfEligible(db, studentId, 'XP_500');
        streakResult = recordQualifyingStreakActivity(db, studentId);
      }

      runStmt(
        db,
        `INSERT INTO quiz_attempts (student_id, unit_id, concept_id, is_unit_assessment, score, passed, xp_awarded, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          studentId,
          unitId,
          conceptId ?? null,
          isUnitAssessment ? 1 : 0,
          clampedScore,
          passed ? 1 : 0,
          xpEarned,
          new Date().toISOString(),
        ]
      );

      if (passed) {
        broadcastLeaderboardUpdate(studentId);
      }

      res.json({
        passed,
        score: clampedScore,
        xpEarned,
        gemsEarned,
        duplicateBlocked,
        unlockedTitle,
        newXp,
        newGems,
        newLeague,
        streak: streakResult,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------- REAL SQL PLAYGROUND ----------------
  app.get('/api/sql/tables', requireAuth, async (_req: Request, res: Response) => {
    try {
      const { practiceDb } = await getDatabases();
      const tables = queryAll<{ name: string }>(
        practiceDb,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
      );

      const result = tables.map((t) => {
        const info = queryAll<{ name: string; type: string; pk: number }>(
          practiceDb,
          `PRAGMA table_info('${t.name.replace(/'/g, "''")}')`
        );
        const countObj = queryOne<{ c: number }>(practiceDb, `SELECT COUNT(*) AS c FROM "${t.name}"`);
        const sampleRes = practiceDb.exec(`SELECT * FROM "${t.name}" LIMIT 4`);
        return {
          name: t.name,
          columns: info.map((col) => ({
            name: col.name,
            type: col.type || 'TEXT',
            pk: Boolean(col.pk),
          })),
          rowCount: countObj?.c ?? 0,
          sampleRows: sampleRes?.[0]?.values ?? [],
        };
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/sql/execute', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { sql } = req.body as { sql: string };
      if (!sql || !sql.trim()) {
        res.status(400).json({ error: 'SQL query cannot be empty.' });
        return;
      }

      const { appDb: db, practiceDb } = await getDatabases();
      const student = req.currentUser!;
      const start = performance.now();
      const results = practiceDb.exec(sql);
      const executionMs = Math.round((performance.now() - start) * 100) / 100;

      const { reachedTargetNow } = incrementMission(db, student.id, 'run_sql', student.timezone);
      const mission = queryOne<{ current_count: number }>(
        db,
        `SELECT current_count FROM daily_missions WHERE student_id = ? AND mission_key = 'run_sql' ORDER BY id DESC LIMIT 1`,
        [student.id]
      );
      if (mission && mission.current_count >= 3) {
        awardBadgeIfEligible(db, student.id, 'SQL_STRIKER');
      }

      let streakRes = null;
      if (reachedTargetNow) {
        streakRes = recordQualifyingStreakActivity(db, student.id);
        broadcastLeaderboardUpdate(student.id);
      }

      if (!results || results.length === 0) {
        const changes = practiceDb.getRowsModified();
        res.json({
          columns: [],
          rows: [],
          rowCount: changes,
          executionMs,
          streak: streakRes,
          message: `Statement executed cleanly (${changes} row(s) affected).`,
        });
        return;
      }

      const lastResult = results[results.length - 1];
      res.json({
        columns: lastResult.columns,
        rows: lastResult.values,
        rowCount: lastResult.values.length,
        executionMs,
        streak: streakRes,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/sql/check-challenge', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { sql, requiredColumns, expectedMinRows, challengeKey, conceptId } = req.body as {
        sql: string;
        requiredColumns?: string[];
        expectedMinRows?: number;
        challengeKey?: string;
        conceptId?: number;
      };
      if (!sql || !sql.trim()) {
        res.status(400).json({ passed: false, error: 'Please enter a SQL query.' });
        return;
      }

      const { appDb: db, practiceDb } = await getDatabases();
      const student = req.currentUser!;
      const start = performance.now();
      const results = practiceDb.exec(sql);
      const executionMs = Math.round((performance.now() - start) * 100) / 100;

      if (!results || results.length === 0) {
        res.json({
          passed: false,
          columns: [],
          rows: [],
          rowCount: 0,
          executionMs,
          feedback: 'Your query returned no result set. Use a SELECT query that returns rows.',
        });
        return;
      }

      const last = results[results.length - 1];
      const lowerCols = last.columns.map((c) => c.toLowerCase());
      const missingCols = (requiredColumns ?? []).filter(
        (reqCol) => !lowerCols.includes(reqCol.toLowerCase())
      );

      if (missingCols.length > 0) {
        runStmt(
          db,
          `INSERT INTO sql_submissions (student_id, concept_id, challenge_key, sql_text, passed, execution_ms, created_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
          [student.id, conceptId ?? null, challengeKey ?? null, sql.trim(), executionMs, new Date().toISOString()]
        );
        res.json({
          passed: false,
          columns: last.columns,
          rows: last.values,
          rowCount: last.values.length,
          executionMs,
          feedback: `Missing expected column(s): ${missingCols.join(', ')}.`,
        });
        return;
      }

      if (expectedMinRows && last.values.length < expectedMinRows) {
        runStmt(
          db,
          `INSERT INTO sql_submissions (student_id, concept_id, challenge_key, sql_text, passed, execution_ms, created_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
          [student.id, conceptId ?? null, challengeKey ?? null, sql.trim(), executionMs, new Date().toISOString()]
        );
        res.json({
          passed: false,
          columns: last.columns,
          rows: last.values,
          rowCount: last.values.length,
          executionMs,
          feedback: `Expected at least ${expectedMinRows} row(s), but got ${last.values.length}. Check your WHERE/JOIN filter.`,
        });
        return;
      }

      const resolvedKey =
        challengeKey ||
        (conceptId ? `concept_sql:${conceptId}` : `query:${sql.trim().toLowerCase().replace(/\s+/g, ' ')}`);

      const alreadySolved = queryOne<{ id: number }>(
        db,
        `SELECT id FROM sql_submissions WHERE student_id = ? AND challenge_key = ? AND passed = 1 LIMIT 1`,
        [student.id, resolvedKey]
      );

      runStmt(
        db,
        `INSERT INTO sql_submissions (student_id, concept_id, challenge_key, sql_text, passed, execution_ms, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
        [student.id, conceptId ?? null, resolvedKey, sql.trim(), executionMs, new Date().toISOString()],
        false
      );

      if (!alreadySolved) {
        db.run('UPDATE students SET sql_solved_count = COALESCE(sql_solved_count, 0) + 1 WHERE id = ?', [
          student.id,
        ]);
        recordXpTransaction(db, {
          studentId: student.id,
          sourceType: 'sql_challenge',
          sourceRefId: resolvedKey,
          xpAmount: 15,
          gemsAmount: 5,
          timezone: student.timezone,
        });
      }

      const streakRes = recordQualifyingStreakActivity(db, student.id);
      broadcastLeaderboardUpdate(student.id);

      res.json({
        passed: true,
        columns: last.columns,
        rows: last.values,
        rowCount: last.values.length,
        executionMs,
        streak: streakRes,
        feedback: `Query verified! Returned ${last.values.length} row(s) in ${executionMs}ms.`,
      });
    } catch (err) {
      res.status(400).json({ passed: false, error: (err as Error).message });
    }
  });

  app.post('/api/sql/reset', requireAuth, async (_req: Request, res: Response) => {
    try {
      resetPracticeDb();
      res.json({ message: 'Practice database restored to clean University schema.' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------- GEMINI AI EXPLAINER & DOUBT ASSISTANT ----------------
  async function generateStructuredAiExplanation(
    unitTitle: string,
    conceptTitle: string,
    conceptSummary: string
  ) {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `You are teaching inside DBMS Arena.
Current Unit: "${unitTitle}"
Current Concept: "${conceptTitle}" (${conceptSummary})

Generate a beginner-friendly, thorough, and strictly on-topic DBMS lesson strictly aligned to "${conceptTitle}" inside "${unitTitle}".
Practice SQLite tables available for examples: departments(dept_id, dept_name, building, budget), instructors(instructor_id, full_name, email, dept_id, salary), students(student_id, full_name, email, dept_id, year_level, gpa), courses(course_id, course_code, title, credits, dept_id, instructor_id), enrollments(student_id, course_id, semester, grade), projects(project_id, project_name, dept_id, lead_instructor_id, budget).`,
      config: {
        systemInstruction:
          'You are an expert DBMS professor in DBMS Arena. Produce structured, crystal-clear, beginner-friendly explanations strictly scoped to the current unit and concept.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: 'Simple beginner-friendly introduction (2-3 sentences).' },
            formalDefinition: { type: Type.STRING, description: 'Detailed beginner-friendly explanation & definitions.' },
            realWorldAnalogy: { type: Type.STRING, description: 'Relatable real-world example & analogy.' },
            workedExample: { type: Type.STRING, description: 'Concrete practical DBMS/SQL example.' },
            visualSteps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  step: { type: Type.STRING },
                  title: { type: Type.STRING },
                  detail: { type: Type.STRING },
                },
              },
            },
            commonPitfalls: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            quickRecap: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            trySqlQuery: { type: Type.STRING, description: 'Valid SQLite SELECT query on the practice schema.' },
          },
        },
      },
    });
    return JSON.parse((response.text ?? '{}').trim());
  }

  app.post('/api/gemini/explain', requireAuth, async (req: Request, res: Response) => {
    try {
      const { conceptId, refresh } = req.body as { conceptId: number; refresh?: boolean };
      const { appDb: db } = await getDatabases();
      const concept = queryOne<{
        id: number;
        title: string;
        summary: string;
        unit_title: string;
      }>(
        db,
        'SELECT c.*, u.title AS unit_title FROM concepts c JOIN units u ON c.unit_id = u.id WHERE c.id = ?',
        [conceptId]
      );

      if (!concept) {
        res.status(404).json({ error: 'Concept not found' });
        return;
      }

      if (!refresh) {
        const cached = queryOne<{ content_json: string }>(
          db,
          'SELECT content_json FROM ai_explanation_cache WHERE concept_id = ? AND style = ?',
          [conceptId, 'standard']
        );
        if (cached) {
          res.json(JSON.parse(cached.content_json));
          return;
        }
      }

      const parsed = await generateStructuredAiExplanation(
        concept.unit_title,
        concept.title,
        concept.summary
      );

      db.run(
        `INSERT INTO ai_explanation_cache (concept_id, style, content_json, updated_at)
         VALUES (?, 'standard', ?, ?)
         ON CONFLICT(concept_id, style) DO UPDATE SET
           content_json = excluded.content_json,
           updated_at = excluded.updated_at`,
        [conceptId, JSON.stringify(parsed), new Date().toISOString()]
      );
      saveAppDb();
      res.json(parsed);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/gemini/chat', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { message, history, context } = req.body as {
        message: string;
        history?: { role: 'user' | 'model'; text: string }[];
        context?: { unitTitle?: string; conceptTitle?: string; currentSql?: string };
      };

      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Message is required.' });
        return;
      }

      const ai = getAiClient();
      const contextLines = [
        context?.unitTitle ? `Current Unit: ${context.unitTitle}` : null,
        context?.conceptTitle ? `Current Concept: ${context.conceptTitle}` : null,
        context?.currentSql ? `Student's SQL Draft:\n${context.currentSql}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const transcript = (history ?? [])
        .slice(-6)
        .map((h) => `${h.role === 'user' ? 'Student' : 'Tutor'}: ${h.text}`)
        .join('\n');

      const prompt = [
        contextLines ? `Context:\n${contextLines}` : '',
        transcript ? `Recent Conversation:\n${transcript}` : '',
        `Student Question: ${message}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are Owlbert, the friendly expert DBMS Tutor in DBMS Arena. Always stay aware of the student’s current Unit and Concept. Give concise, structured answers with clear examples, ER notation or SQL snippets when helpful. Available practice tables: departments, instructors, students, courses, enrollments, projects.',
        },
      });

      const { appDb: db } = await getDatabases();
      const student = req.currentUser!;
      incrementMission(db, student.id, 'ask_tutor', student.timezone);

      res.json({ reply: response.text ?? 'I could not generate an answer right now.' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------- ADMIN STUDIO CRUD & AI AUTHORING (ADMIN ONLY) ----------------
  app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      const units = queryAll(db, 'SELECT * FROM units ORDER BY unit_number ASC');
      const conceptsRaw = queryAll<Record<string, unknown>>(
        db,
        `SELECT c.*, u.title AS unit_title, u.unit_number,
                (SELECT COUNT(*) FROM questions q WHERE q.concept_id = c.id) AS question_count
         FROM concepts c
         JOIN units u ON c.unit_id = u.id
         ORDER BY u.unit_number ASC, c.order_index ASC`
      );
      const concepts = conceptsRaw.map((c) => {
        const lessonObj = JSON.parse(String(c.lesson_content_json || '{}'));
        const hasFullLesson = Boolean(
          lessonObj.simpleIntro &&
            lessonObj.detailedExplanation &&
            Array.isArray(lessonObj.quickRecap) &&
            lessonObj.quickRecap.length > 0
        );
        return {
          ...c,
          question_count: Number(c.question_count ?? 0),
          is_published: Boolean(c.is_published),
          ai_approved: Boolean(c.ai_approved),
          lesson_content: lessonObj,
          has_full_lesson: hasFullLesson,
        };
      });

      const questions = queryAll<Record<string, unknown>>(
        db,
        `SELECT q.*, u.unit_number, c.title AS concept_title
         FROM questions q
         JOIN units u ON q.unit_id = u.id
         LEFT JOIN concepts c ON q.concept_id = c.id
         ORDER BY q.id DESC`
      ).map((q) => ({
        ...q,
        is_unit_assessment: Boolean(q.is_unit_assessment),
        payload: JSON.parse(String(q.payload_json || '{}')),
      }));
      const students = queryAll(
        db,
        `SELECT id, name, username, email, xp, weekly_xp, hearts, max_hearts, gems, streak_days, longest_streak, league, role, is_demo, is_primary
         FROM students
         ORDER BY is_demo ASC, xp DESC`
      );
      const migrations = queryAll(db, 'SELECT * FROM migration_audit_log ORDER BY id DESC LIMIT 5');
      const missingContentCount = concepts.filter((c) => !c.has_full_lesson || Number(c.question_count) < 1).length;

      res.json({ units, concepts, questions, students, migrations, missingContentCount });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/units', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { unit_number, title, subtitle, description, accent_color, estimated_hours, unlock_xp_bonus } =
        req.body;
      const { appDb: db } = await getDatabases();
      const id = runStmt(
        db,
        `INSERT INTO units (unit_number, title, subtitle, description, accent_color, estimated_hours, unlock_xp_bonus)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(unit_number),
          title,
          subtitle || `Unit ${unit_number}`,
          description,
          accent_color || 'emerald',
          Number(estimated_hours || 2),
          Number(unlock_xp_bonus || 150),
        ]
      );
      res.json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.put('/api/admin/units/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { title, subtitle, description, accent_color, estimated_hours } = req.body;
      const { appDb: db } = await getDatabases();
      runStmt(
        db,
        `UPDATE units SET title = ?, subtitle = ?, description = ?, accent_color = ?, estimated_hours = ? WHERE id = ?`,
        [title, subtitle, description, accent_color, Number(estimated_hours || 2), Number(req.params.id)]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/concepts', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const {
        unit_id,
        order_index,
        topic_tag,
        title,
        summary,
        duration_minutes,
        xp_reward,
        gem_reward,
        definition_text,
        example_text,
        practical_sql,
        lesson_content,
        is_published,
      } = req.body;
      const { appDb: db } = await getDatabases();
      const id = runStmt(
        db,
        `INSERT INTO concepts (unit_id, order_index, topic_tag, title, summary, duration_minutes, xp_reward, gem_reward, definition_text, example_text, diagram_type, diagram_config_json, practical_sql, practical_explanation, lesson_content_json, is_published, ai_approved)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'three_schema', '{}', ?, 'Run this query in the SQL Playground to inspect live rows.', ?, ?, ?)`,
        [
          Number(unit_id),
          Number(order_index || 1),
          topic_tag || title,
          title,
          summary,
          Number(duration_minutes || 15),
          Number(xp_reward || 50),
          Number(gem_reward || 15),
          definition_text || summary,
          example_text || summary,
          practical_sql || 'SELECT * FROM students LIMIT 5;',
          JSON.stringify(lesson_content ?? {}),
          is_published === false ? 0 : 1,
          lesson_content ? 1 : 0,
        ]
      );
      res.json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.put('/api/admin/concepts/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const {
        title,
        topic_tag,
        summary,
        duration_minutes,
        xp_reward,
        definition_text,
        example_text,
        practical_sql,
        lesson_content,
      } = req.body;
      const { appDb: db } = await getDatabases();
      runStmt(
        db,
        `UPDATE concepts
         SET title = ?, topic_tag = ?, summary = ?, duration_minutes = ?, xp_reward = ?, definition_text = ?, example_text = ?, practical_sql = ?, lesson_content_json = COALESCE(?, lesson_content_json)
         WHERE id = ?`,
        [
          title,
          topic_tag || title,
          summary,
          Number(duration_minutes || 15),
          Number(xp_reward || 50),
          definition_text,
          example_text,
          practical_sql,
          lesson_content ? JSON.stringify(lesson_content) : null,
          Number(req.params.id),
        ]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/concepts/:id/reorder', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const conceptId = Number(req.params.id);
      const { direction } = req.body as { direction: 'up' | 'down' };
      const { appDb: db } = await getDatabases();
      const target = queryOne<{ id: number; unit_id: number; order_index: number }>(
        db,
        'SELECT id, unit_id, order_index FROM concepts WHERE id = ?',
        [conceptId]
      );
      if (!target) {
        res.status(404).json({ error: 'Concept not found' });
        return;
      }

      const neighbor =
        direction === 'up'
          ? queryOne<{ id: number; order_index: number }>(
              db,
              'SELECT id, order_index FROM concepts WHERE unit_id = ? AND order_index < ? ORDER BY order_index DESC LIMIT 1',
              [target.unit_id, target.order_index]
            )
          : queryOne<{ id: number; order_index: number }>(
              db,
              'SELECT id, order_index FROM concepts WHERE unit_id = ? AND order_index > ? ORDER BY order_index ASC LIMIT 1',
              [target.unit_id, target.order_index]
            );

      if (neighbor) {
        db.run('UPDATE concepts SET order_index = ? WHERE id = ?', [neighbor.order_index, target.id]);
        db.run('UPDATE concepts SET order_index = ? WHERE id = ?', [target.order_index, neighbor.id]);
        saveAppDb();
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/admin/concepts/:id/publish', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { is_published } = req.body as { is_published: boolean };
      const { appDb: db } = await getDatabases();
      runStmt(db, 'UPDATE concepts SET is_published = ? WHERE id = ?', [
        is_published ? 1 : 0,
        Number(req.params.id),
      ]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/concepts/:id/generate-lesson', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const conceptId = Number(req.params.id);
      const { appDb: db } = await getDatabases();
      const concept = queryOne<{ id: number; title: string; summary: string; unit_title: string }>(
        db,
        'SELECT c.*, u.title AS unit_title FROM concepts c JOIN units u ON c.unit_id = u.id WHERE c.id = ?',
        [conceptId]
      );
      if (!concept) {
        res.status(404).json({ error: 'Concept not found' });
        return;
      }

      const generated = await generateStructuredAiExplanation(
        concept.unit_title,
        concept.title,
        concept.summary
      );

      const lessonDraft = {
        simpleIntro: generated.summary,
        detailedExplanation: generated.formalDefinition,
        definitions: [{ term: concept.title, meaning: generated.summary }],
        realWorldExamples: [generated.realWorldAnalogy],
        practicalExamples: [
          {
            label: `${concept.title} Practical Example`,
            snippet: generated.trySqlQuery || 'SELECT * FROM students LIMIT 5;',
            outcome: generated.workedExample,
          },
        ],
        visualSteps: generated.visualSteps ?? [],
        commonMistakes: generated.commonPitfalls ?? [],
        quickRecap: generated.quickRecap ?? [generated.summary],
      };

      res.json({ lessonDraft, trySqlQuery: generated.trySqlQuery });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/concepts/:id/approve-lesson', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const conceptId = Number(req.params.id);
      const { lesson_content, practical_sql, publish } = req.body;
      const { appDb: db } = await getDatabases();

      runStmt(
        db,
        `UPDATE concepts
         SET lesson_content_json = ?,
             definition_text = COALESCE(?, definition_text),
             practical_sql = COALESCE(?, practical_sql),
             ai_approved = 1,
             is_published = COALESCE(?, is_published)
         WHERE id = ?`,
        [
          JSON.stringify(lesson_content),
          lesson_content?.detailedExplanation ?? null,
          practical_sql ?? null,
          typeof publish === 'boolean' ? (publish ? 1 : 0) : null,
          conceptId,
        ]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/admin/concepts/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      runStmt(db, 'DELETE FROM concepts WHERE id = ?', [Number(req.params.id)]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/questions', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { unit_id, concept_id, is_unit_assessment, question_type, prompt, payload, explanation, xp_value } =
        req.body;
      const { appDb: db } = await getDatabases();
      const id = runStmt(
        db,
        `INSERT INTO questions (unit_id, concept_id, is_unit_assessment, question_type, prompt, payload_json, explanation, xp_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(unit_id),
          concept_id ? Number(concept_id) : null,
          is_unit_assessment ? 1 : 0,
          question_type,
          prompt,
          JSON.stringify(payload),
          explanation || 'Great job!',
          Number(xp_value || 20),
        ]
      );
      res.json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/admin/questions/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { appDb: db } = await getDatabases();
      runStmt(db, 'DELETE FROM questions WHERE id = ?', [Number(req.params.id)]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/students/:id/action', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const studentId = Number(req.params.id);
      const { action } = req.body as {
        action: 'grant_xp' | 'refill_hearts' | 'unlock_all' | 'reset_progress';
      };
      const { appDb: db } = await getDatabases();

      if (action === 'grant_xp') {
        recordXpTransaction(db, {
          studentId,
          sourceType: 'admin_grant',
          sourceRefId: `admin:${Date.now()}`,
          xpAmount: 100,
          gemsAmount: 30,
        });
        broadcastLeaderboardUpdate(studentId);
      } else if (action === 'refill_hearts') {
        runStmt(db, 'UPDATE students SET hearts = max_hearts WHERE id = ?', [studentId]);
      } else if (action === 'unlock_all') {
        const units = queryAll<{ id: number }>(db, 'SELECT id FROM units');
        for (const u of units) {
          db.run(
            `INSERT INTO student_unit_progress (student_id, unit_id, status) VALUES (?, ?, 'unlocked')
             ON CONFLICT(student_id, unit_id) DO UPDATE SET status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'unlocked' END`,
            [studentId, u.id]
          );
        }
        const concepts = queryAll<{ id: number }>(db, 'SELECT id FROM concepts');
        for (const c of concepts) {
          db.run(
            `INSERT INTO student_concept_progress (student_id, concept_id, status) VALUES (?, ?, 'unlocked')
             ON CONFLICT(student_id, concept_id) DO UPDATE SET status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'unlocked' END`,
            [studentId, c.id]
          );
        }
        saveAppDb();
      } else if (action === 'reset_progress') {
        db.run('DELETE FROM student_unit_progress WHERE student_id = ?', [studentId]);
        db.run('DELETE FROM student_concept_progress WHERE student_id = ?', [studentId]);
        initializeStudentPathProgressForUser(db, studentId);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/admin/students/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const targetId = Number(req.params.id);
      if (targetId === req.currentUser?.id) {
        res.status(400).json({ error: 'Cannot delete the currently active admin account.' });
        return;
      }
      const { appDb: db } = await getDatabases();
      const target = queryOne<{ id: number; role: string }>(
        db,
        'SELECT id, role FROM students WHERE id = ?',
        [targetId]
      );
      if (!target) {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }
      if (target.role === 'admin') {
        res.status(403).json({ error: 'Cannot delete administrator accounts.' });
        return;
      }
      db.run('DELETE FROM sessions WHERE student_id = ?', [targetId]);
      db.run('DELETE FROM password_resets WHERE student_id = ?', [targetId]);
      db.run('DELETE FROM xp_transactions WHERE student_id = ?', [targetId]);
      db.run('DELETE FROM quiz_attempts WHERE student_id = ?', [targetId]);
      db.run('DELETE FROM sql_submissions WHERE student_id = ?', [targetId]);
      db.run('DELETE FROM daily_streaks WHERE user_id = ?', [targetId]);
      db.run('DELETE FROM student_badges WHERE student_id = ?', [targetId]);
      db.run('DELETE FROM daily_missions WHERE student_id = ?', [targetId]);
      db.run('DELETE FROM student_concept_progress WHERE student_id = ?', [targetId]);
      db.run('DELETE FROM student_unit_progress WHERE student_id = ?', [targetId]);
      runStmt(db, 'DELETE FROM students WHERE id = ?', [targetId]);
      broadcastLeaderboardUpdate(targetId);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ---------------- VITE DEV OR PROD STATIC ----------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`DBMS Arena server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DBMS Arena server:', err);
  process.exit(1);
});
