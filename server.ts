import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Server as SocketIOServer } from 'socket.io';
import { createPracticeDatabaseFromSnapshot, exportPracticeDatabaseSnapshot } from './server/db.ts';
import { databaseStateFingerprint, normalizedQueryResult, validateSqlAnswer, validateTheoryAnswer } from './server/playgroundValidation.ts';
import { queryAll, queryOne } from './server/db.ts';
import {
  getPracticeDatabase,
  getStore,
  resetPracticeDatabase,
} from './server/store.ts';
import type { DataStore } from './server/storeTypes.ts';
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
import {
  formatGroqError,
  generateDynamicQuestions,
  generatePlaygroundFeedback,
  generatePlaygroundSqlChallenge,
  generatePlaygroundTheoryQuestion,
  generateStructuredAiExplanation,
  generateTopicSpecificDeepDive,
  generateTutorChatReply,
  reviewSqlPractice,
} from './server/groqService.ts';

type PlaygroundTheoryType = 'mcq' | 'true_false' | 'fill_blank' | 'matching' | 'scenario';
interface PlaygroundChallenge {
  studentId: number;
  conceptId: number;
  kind: 'theory' | 'sql';
  topicTitle: string;
  prompt: string;
  hint: string;
  explanation: string;
  theoryType?: PlaygroundTheoryType;
  answer?: Record<string, unknown>;
  baseSnapshot?: Uint8Array;
  expectedState?: string;
  expectedResult?: string;
  sqlType?: string;
}
const playgroundChallenges = new Map<string, PlaygroundChallenge>();


const PORT = Number(process.env.PORT || 3000);

interface AuthedRequest extends Request {
  currentUser?: AuthStudentRow;
}

async function incrementMission(
  store: DataStore,
  studentId: number,
  missionKey: string,
  timezone: string = DEFAULT_TIMEZONE
): Promise<{ reachedTargetNow: boolean; currentCount: number }> {
  const today = getLocalDateIso(new Date(), timezone);
  return store.incrementDailyMission(studentId, missionKey, today);
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
  await getStore();
  await getPracticeDatabase();

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

  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const store = await getStore();
      res.json({
        ok: true,
        database: store.status.backend,
        mongoConfigured: store.status.mongoConfigured,
        mongoConnected: store.status.mongoConnected,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  // ---------------- AUTH MIDDLEWARE ----------------
  async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
      const store = await getStore();
      const user = await getAuthenticatedUser(store, req);
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

      const store = await getStore();

      const dupEmail = await store.getStudentByEmail(trimmedEmail);
      if (dupEmail) {
        res.status(409).json({ error: 'An account with this email address already exists.' });
        return;
      }

      const dupUsername = await store.getStudentByUsername(trimmedUsername);
      if (dupUsername) {
        res.status(409).json({ error: 'This username is already taken. Please choose another.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const tz = (timezone ?? DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
      const passwordHash = hashPassword(password!);

      const newId = await store.createStudent({
        name: trimmedName,
        username: trimmedUsername,
        email: trimmedEmail,
        password_hash: passwordHash,
        avatar_seed: trimmedUsername.toLowerCase(),
        xp: 0,
        hearts: 5,
        max_hearts: 5,
        gems: 0,
        streak_days: 0,
        longest_streak: 0,
        last_active_date: '',
        league: 'Bronze',
        weekly_xp: 0,
        role: 'student',
        is_primary: 0,
        is_demo: 0,
        timezone: tz,
        streak_history_json: '[]',
        streak_updated_at: null,
        sql_solved_count: 0,
        created_at: nowIso,
      });

      await store.upsertDailyStreak({
        user_id: newId,
        current_streak: 0,
        longest_streak: 0,
        last_activity_date: null,
        streak_history_json: '[]',
        timezone: tz,
        updated_at: nowIso,
      });

      await store.initializeStudentPathProgress(newId);
      await store.ensureDailyMissions(newId, getLocalDateIso(new Date(), tz));

      const createdUser = (await store.getStudentById(newId))!;
      const token = await createUserSession(store, newId);
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

  app.get('/api/auth/session', async (req: Request, res: Response) => {
    try {
      const store = await getStore();
      const user = await getAuthenticatedUser(store, req);
      if (!user) {
        res.json({ authenticated: false, user: null, streak: null });
        return;
      }
      const streak = await buildStreakPayload(store, user.id);
      const refreshed = (await store.getStudentById(user.id))!;
      res.json({
        authenticated: true,
        user: sanitizeUserForClient(refreshed),
        streak,
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
      const identifier = (email ?? '').trim().toLowerCase();
      if (!identifier || !password) {
        res.status(400).json({ error: 'Email/username and password are required.' });
        return;
      }

      const store = await getStore();
      let row = await store.getStudentByEmail(identifier);
      if (!row && role !== 'admin') {
        row = await store.getStudentByUsername(identifier);
      }

      if (!row || !verifyPassword(password, row.password_hash)) {
        const msg =
          role === 'admin'
            ? 'Invalid administrator email or password. If you configured ADMIN_EMAIL or ADMIN_PASSWORD in Settings > Secrets, use those exact credentials.'
            : 'Invalid email/username or password.';
        res.status(401).json({ error: msg });
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

      await evaluateAndPersistStreakBreak(store, row.id);
      await store.initializeStudentPathProgress(row.id);
      await store.ensureDailyMissions(
        row.id,
        getLocalDateIso(new Date(), row.timezone || DEFAULT_TIMEZONE)
      );

      const refreshed = (await store.getStudentById(row.id))!;
      const token = await createUserSession(store, row.id);
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
        const store = await getStore();
        await deleteUserSession(store, token);
      }
      clearSessionCookie(res, req);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const store = await getStore();
      const user = req.currentUser!;
      const streak = await buildStreakPayload(store, user.id);
      const refreshed = (await store.getStudentById(user.id))!;
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
      const store = await getStore();
      const user = await store.getStudentByEmail(email!.trim());
      if (!user || user.is_demo === 1 || user.role === 'admin') {
        res.json({
          ok: true,
          message:
            'If an eligible student account matches that email, a 6-digit recovery code has been issued.',
        });
        return;
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      await store.createPasswordReset({
        student_id: user.id,
        reset_code: code,
        expires_at: expiresAt,
        used: 0,
        created_at: now.toISOString(),
      });

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

      const store = await getStore();
      const user = await store.getStudentByEmail((email ?? '').trim());
      if (!user) {
        res.status(400).json({ error: 'Invalid email or recovery code.' });
        return;
      }

      const resetRow = await store.getLatestValidPasswordReset(user.id, (code ?? '').trim());
      if (!resetRow || new Date(resetRow.expires_at).getTime() <= Date.now()) {
        res.status(400).json({ error: 'Recovery code is invalid or expired.' });
        return;
      }

      await store.markPasswordResetUsed(resetRow.id);
      await store.updateStudentFields(user.id, { password_hash: hashPassword(newPassword!) });

      res.json({ ok: true, message: 'Password updated cleanly. You can now sign in.' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------- DASHBOARD, STREAK, PROFILE & LEADERBOARD ----------------
  app.get('/api/dashboard', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const store = await getStore();
      const studentId = req.currentUser!.id;
      const streak = await buildStreakPayload(store, studentId);
      const studentRow = await store.getStudentById(studentId);
      if (!studentRow) {
        res.status(404).json({ error: 'Student profile not found' });
        return;
      }

      await store.initializeStudentPathProgress(studentId);
      const today = getLocalDateIso(new Date(), studentRow.timezone || DEFAULT_TIMEZONE);
      await store.ensureDailyMissions(studentId, today);

      const [unitsRaw, unitProgRows, conceptsRaw, conceptProgRows, missionRows, badgeRows] =
        await Promise.all([
          store.getUnits(),
          store.getStudentUnitProgress(studentId),
          store.getConcepts({ publishedOnly: true }),
          store.getStudentConceptProgress(studentId),
          store.getDailyMissions(studentId, today),
          store.getStudentBadges(studentId),
        ]);

      const unitProgMap = new Map(unitProgRows.map((p) => [p.unit_id, p]));
      const conceptProgMap = new Map(conceptProgRows.map((p) => [p.concept_id, p]));

      const units = unitsRaw.map((u) => {
        const up = unitProgMap.get(u.id);
        return {
          ...u,
          status: up?.status ?? 'locked',
          assessment_score: up?.assessment_score ?? null,
          concepts: conceptsRaw
            .filter((c) => Number(c.unit_id) === Number(u.id))
            .map((c) => {
              const cp = conceptProgMap.get(c.id);
              return {
                ...c,
                status: cp?.status ?? 'locked',
                best_score: cp?.best_score ?? null,
                attempts: cp?.attempts ?? 0,
                is_published: Boolean(c.is_published),
                ai_approved: Boolean(c.ai_approved),
                diagram_config: JSON.parse(String(c.diagram_config_json || '{}')),
                lesson_content: JSON.parse(String(c.lesson_content_json || '{}')),
              };
            }),
        };
      });

      const missions = missionRows.map((m) => ({
        ...m,
        claimed: Boolean(m.claimed),
      }));

      const badges = badgeRows.map((b) => ({
        ...b,
        earned: Boolean(b.earned),
      }));

      const lbData = await buildDynamicLeaderboard(store, {
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
      const store = await getStore();
      const payload = await buildStreakPayload(store, req.currentUser!.id);
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/leaderboard', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const store = await getStore();
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

      const data = await buildDynamicLeaderboard(store, {
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
      const store = await getStore();
      const studentId = req.currentUser!.id;
      const streak = await buildStreakPayload(store, studentId);
      const student = (await store.getStudentById(studentId))!;

      const [
        completedConcepts,
        totalConcepts,
        completedUnits,
        totalUnits,
        sqlSolved,
        quizStats,
        badgeRows,
        recentXp,
      ] = await Promise.all([
        store.countCompletedPublishedConcepts(studentId),
        store.countPublishedConcepts(),
        store.countCompletedUnits(studentId),
        store.countUnits(),
        store.countDistinctSolvedSql(studentId),
        store.getStudentQuizStats(studentId),
        store.getStudentBadges(studentId),
        store.getRecentXpTransactions(studentId, 12),
      ]);

      const badges = badgeRows
        .map((b) => ({ ...b, earned: Boolean(b.earned) }))
        .sort((a, b) => Number(b.earned) - Number(a.earned) || a.id - b.id);

      res.json({
        user: sanitizeUserForClient(student),
        streak,
        stats: {
          completedConcepts,
          totalConcepts,
          completedUnits,
          totalUnits,
          sqlSolved: Math.max(student.sql_solved_count ?? 0, sqlSolved),
          accuracy: quizStats.avgAcc,
          totalQuizAttempts: quizStats.totalAttempts,
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

      const store = await getStore();
      const studentId = req.currentUser!.id;
      const safeAvatar = (avatar_seed ?? req.currentUser!.avatar_seed).trim().slice(0, 40);
      const safeTz = (timezone ?? req.currentUser!.timezone ?? DEFAULT_TIMEZONE).trim();

      await store.updateStudentFields(studentId, {
        name: trimmedName,
        avatar_seed: safeAvatar,
        timezone: safeTz,
      });
      await store.updateDailyStreakTimezone(studentId, safeTz);

      const updated = (await store.getStudentById(studentId))!;
      broadcastLeaderboardUpdate(studentId);
      res.json({ user: sanitizeUserForClient(updated) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/student/lose-heart', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const store = await getStore();
      const studentId = req.currentUser!.id;
      const student = (await store.getStudentById(studentId))!;
      const nextHearts = Math.max(0, Number(student.hearts) - 1);
      await store.updateStudentFields(studentId, { hearts: nextHearts });
      res.json({ hearts: nextHearts });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/student/refill-hearts', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const store = await getStore();
      const studentId = req.currentUser!.id;
      const student = (await store.getStudentById(studentId))!;
      if (student.hearts >= student.max_hearts) {
        res.json({
          hearts: student.hearts,
          gems: student.gems,
          message: 'Hearts are already full.',
        });
        return;
      }
      const cost = 25;
      if (student.gems >= cost) {
        const nextGems = student.gems - cost;
        await store.updateStudentFields(studentId, {
          hearts: student.max_hearts,
          gems: nextGems,
        });
        res.json({ hearts: student.max_hearts, gems: nextGems, message: 'Full hearts restored!' });
      } else {
        const nextHearts = Math.min(student.max_hearts, student.hearts + 1);
        await store.updateStudentFields(studentId, { hearts: nextHearts });
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
      const store = await getStore();
      const studentId = req.currentUser!.id;
      const mission = await store.getDailyMissionById(missionId, studentId);

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

      await store.markDailyMissionClaimed(missionId);
      const tx = await recordXpTransaction(store, {
        studentId,
        sourceType: 'daily_mission',
        sourceRefId: `mission:${missionId}`,
        xpAmount: mission.xp_reward,
        gemsAmount: mission.gem_reward,
        timezone: req.currentUser!.timezone,
      });

      const streakRes = await recordQualifyingStreakActivity(store, studentId);
      if (tx.newXp >= 500) await store.awardBadgeByCode(studentId, 'XP_500');
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
      const store = await getStore();
      const conceptId = Number(req.params.id);
      const studentId = req.currentUser!.id;

      const prog = await store.getOneStudentConceptProgress(studentId, conceptId);
      if (!prog || prog.status === 'locked') {
        res.status(403).json({ error: 'This concept is locked. Pass the previous concept first.' });
        return;
      }

      const concept = await store.getConceptById(conceptId);
      if (!concept) { res.status(404).json({ error: 'Concept not found' }); return; }
      res.json(await generateDynamicQuestions(concept.unit_title, concept.title, concept.summary));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/units/:id/assessment', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const store = await getStore();
      const unitId = Number(req.params.id);
      const studentId = req.currentUser!.id;

      const unitProg = await store.getOneStudentUnitProgress(studentId, unitId);
      if (!unitProg || unitProg.status === 'locked') {
        res.status(403).json({ error: 'Unit is locked. Pass the previous unit assessment first.' });
        return;
      }
      const incompleteCount = await store.countIncompleteConceptsInUnit(studentId, unitId);
      if (incompleteCount > 0) {
        res.status(403).json({
          error: `Complete all concepts in this unit first (${incompleteCount} remaining).`,
        });
        return;
      }

      const unit = await store.getUnitById(unitId);
      if (!unit) { res.status(404).json({ error: 'Unit not found' }); return; }
      res.json(await generateDynamicQuestions(unit.title, `${unit.title} mastery`, unit.description, 10));
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
      const store = await getStore();
      const student = req.currentUser!;
      const studentId = student.id;

      if (!isUnitAssessment && conceptId) {
        const currentProg = await store.getOneStudentConceptProgress(studentId, conceptId);
        if (!currentProg || currentProg.status === 'locked') {
          res.status(403).json({ error: 'Cannot submit locked concept.' });
          return;
        }
      } else if (isUnitAssessment && unitId) {
        const uProg = await store.getOneStudentUnitProgress(studentId, unitId);
        if (!uProg || uProg.status === 'locked') {
          res.status(403).json({ error: 'Cannot submit locked unit assessment.' });
          return;
        }
        const incompleteCount = await store.countIncompleteConceptsInUnit(studentId, unitId);
        if (incompleteCount > 0) {
          res.status(403).json({
            error: `Complete all concepts in this unit first (${incompleteCount} remaining).`,
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
        const concept = await store.getConceptById(conceptId);
        const prev = await store.getOneStudentConceptProgress(studentId, conceptId);

        const wasAlreadyCompleted = prev?.status === 'completed';
        const bestScore = Math.max(prev?.best_score ?? 0, clampedScore);
        const attempts = (prev?.attempts ?? 0) + 1;

        if (passed && concept) {
          await store.upsertStudentConceptProgress(studentId, conceptId, {
            status: 'completed',
            best_score: bestScore,
            attempts,
            completed_at: new Date().toISOString(),
          });

          sourceType = wasAlreadyCompleted ? 'concept_replay' : 'concept_pass';
          sourceRefId = `concept:${conceptId}`;
          plannedXp = wasAlreadyCompleted
            ? Math.round(concept.xp_reward * 0.4)
            : concept.xp_reward;
          plannedGems = wasAlreadyCompleted ? 5 : concept.gem_reward;

          const nextConcept = await store.getNextConceptInUnit(
            concept.unit_id,
            concept.order_index
          );
          if (nextConcept) {
            const nextProg = await store.getOneStudentConceptProgress(studentId, nextConcept.id);
            if (!nextProg || nextProg.status === 'locked') {
              await store.upsertStudentConceptProgress(studentId, nextConcept.id, {
                status: 'unlocked',
              });
              unlockedTitle = nextConcept.title;
            }
          }

          await incrementMission(store, studentId, 'complete_concept', student.timezone);
          await store.awardBadgeByCode(studentId, 'FIRST_SPARK');
        } else {
          await store.upsertStudentConceptProgress(studentId, conceptId, {
            statusIfNotCompleted: 'unlocked',
            best_score: bestScore,
            attempts,
          });
        }
      } else if (isUnitAssessment && unitId) {
        const unit = await store.getUnitById(unitId);
        if (passed && unit) {
          const prevUnit = await store.getOneStudentUnitProgress(studentId, unitId);
          const alreadyDone = prevUnit?.status === 'completed';

          await store.upsertStudentUnitProgress(studentId, unitId, {
            status: 'completed',
            assessment_score: clampedScore,
            completed_at: new Date().toISOString(),
          });

          sourceType = alreadyDone ? 'unit_replay' : 'unit_assessment';
          sourceRefId = `unit:${unitId}`;
          plannedXp = alreadyDone ? 50 : unit.unlock_xp_bonus;
          plannedGems = alreadyDone ? 10 : 40;

          if (unit.unit_number === 1) {
            await store.awardBadgeByCode(studentId, 'UNIT_1_MASTER');
          }

          const nextUnit = await store.getNextUnit(unit.unit_number);
          if (nextUnit) {
            await store.upsertStudentUnitProgress(studentId, nextUnit.id, {
              statusIfNotCompleted: 'unlocked',
            });
            const firstNextConcept = await store.getFirstPublishedConceptInUnit(nextUnit.id);
            if (firstNextConcept) {
              await store.upsertStudentConceptProgress(studentId, firstNextConcept.id, {
                statusIfNotCompleted: 'unlocked',
              });
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
      let streakResult: Awaited<ReturnType<typeof recordQualifyingStreakActivity>> | null = null;

      if (passed && plannedXp > 0) {
        const tx = await recordXpTransaction(store, {
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

        if (newXp >= 500) await store.awardBadgeByCode(studentId, 'XP_500');
        streakResult = await recordQualifyingStreakActivity(store, studentId);
      }

      await store.insertQuizAttempt({
        student_id: studentId,
        unit_id: unitId,
        concept_id: conceptId ?? null,
        is_unit_assessment: isUnitAssessment ? 1 : 0,
        score: clampedScore,
        passed: passed ? 1 : 0,
        xp_awarded: xpEarned,
        created_at: new Date().toISOString(),
      });

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

  // ---------------- REAL SQL PLAYGROUND (IN-MEMORY SQL.JS SANDBOX) ----------------
  app.get('/api/sql/tables', requireAuth, async (_req: Request, res: Response) => {
    try {
      const practiceDb = await getPracticeDatabase();
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

  app.get('/api/sql/playground/challenge/:conceptId', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const conceptId = Number(req.params.conceptId);
      const kind = req.query.kind === 'sql' ? 'sql' : 'theory';
      const concept = await (await getStore()).getConceptById(conceptId);
      if (!concept) { res.status(404).json({ error: 'Curriculum topic not found.' }); return; }
      const challengeId = randomUUID();

      if (kind === 'theory') {
        const allowedTypes: PlaygroundTheoryType[] = ['mcq', 'true_false', 'fill_blank', 'matching', 'scenario'];
        const requestedType = String(req.query.type ?? 'mcq') as PlaygroundTheoryType;
        const type = allowedTypes.includes(requestedType) ? requestedType : 'mcq';
        const generated = await generatePlaygroundTheoryQuestion({
          unitTitle: concept.unit_title,
          conceptTitle: concept.title,
          summary: concept.summary,
          definition: concept.definition_text,
          example: concept.example_text,
          type,
        });
        const answer: Record<string, unknown> = {};
        const question: Record<string, unknown> = { prompt: generated.prompt, hint: generated.hint };
        if (type === 'mcq' || type === 'scenario') {
          const options = Array.isArray(generated.options) ? generated.options.map(String) : [];
          const correctIndex = Number(generated.correctIndex);
          if (options.length !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) throw new Error('AI returned an invalid choice question. Please retry.');
          question.options = options;
          answer.correctIndex = correctIndex;
        } else if (type === 'true_false') {
          if (typeof generated.correctBoolean !== 'boolean') throw new Error('AI returned an invalid true/false question. Please retry.');
          question.statement = generated.prompt;
          answer.correctBoolean = generated.correctBoolean;
        } else if (type === 'fill_blank') {
          const acceptedAnswers = Array.isArray(generated.acceptedAnswers) ? generated.acceptedAnswers.map(String).filter(Boolean) : [];
          if (!generated.prompt || acceptedAnswers.length === 0 || !String(generated.prompt).includes('___')) throw new Error('AI returned an invalid fill-in question. Please retry.');
          answer.acceptedAnswers = acceptedAnswers;
        } else {
          const pairs = Array.isArray(generated.pairs) ? generated.pairs as { left: string; right: string }[] : [];
          if (pairs.length !== 3 || pairs.some((pair) => !pair.left || !pair.right)) throw new Error('AI returned an invalid matching question. Please retry.');
          question.leftItems = pairs.map((pair) => pair.left);
          question.rightItems = pairs.map((pair) => pair.right).sort(() => Math.random() - 0.5);
          answer.pairs = pairs;
        }
        playgroundChallenges.set(challengeId, {
          studentId: req.currentUser!.id, conceptId, kind, topicTitle: concept.title,
          prompt: String(generated.prompt), hint: String(generated.hint), explanation: String(generated.explanation),
          theoryType: type, answer,
        });
        res.json({ challengeId, kind, type, ...question });
        return;
      }

      const practiceDb = await getPracticeDatabase();
      const tables = queryAll<{ name: string }>(practiceDb, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const schema = tables.map(({ name }) => {
        const cols = queryAll<{ name: string; type: string }>(practiceDb, `PRAGMA table_info('${name.replace(/'/g, "''")}')`);
        return `${name}(${cols.map((column) => `${column.name} ${column.type}`).join(', ')})`;
      }).join('; ');
      const generated = await generatePlaygroundSqlChallenge({
        unitTitle: concept.unit_title, conceptTitle: concept.title, summary: concept.summary,
        definition: concept.definition_text, schema,
      });
      const solution = generated.solutionSql.trim();
      const statements = solution.split(';').map((part) => part.trim()).filter(Boolean);
      if (statements.length !== 1 || !/^(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(solution)) throw new Error('AI returned an unsupported SQL solution. Please retry.');
      const baseSnapshot = exportPracticeDatabaseSnapshot();
      const baselineDb = createPracticeDatabaseFromSnapshot(baseSnapshot);
      const baselineState = databaseStateFingerprint(baselineDb);
      baselineDb.close();
      const answerDb = createPracticeDatabaseFromSnapshot(baseSnapshot);
      let expectedResults: ReturnType<typeof answerDb.exec> | undefined;
      try { expectedResults = answerDb.exec(solution); }
      catch (err) { throw new Error(`AI-generated challenge solution was invalid: ${(err as Error).message}`); }
      const expectedState = databaseStateFingerprint(answerDb);
      const expectedResult = normalizedQueryResult(expectedResults);
      answerDb.close();
      if (!expectedResults?.length && expectedState === baselineState) {
        throw new Error('AI-generated challenge did not produce a verifiable result. Please retry.');
      }
      playgroundChallenges.set(challengeId, {
        studentId: req.currentUser!.id, conceptId, kind, topicTitle: concept.title,
        prompt: generated.prompt, hint: generated.hint, explanation: generated.explanation,
        baseSnapshot, expectedState, expectedResult, sqlType: statements[0].split(/\s+/)[0].toUpperCase(),
      });
      res.json({ challengeId, kind, prompt: generated.prompt, starterSql: generated.starterSql, hint: generated.hint });
    } catch (err) {
      const aiError = formatGroqError(err);
      console.error('[Playground challenge failed]', {
        conceptId: req.params.conceptId,
        kind: req.query.kind,
        type: req.query.type,
        status: aiError.httpStatus,
        message: (err as Error)?.message || aiError.message,
      });
      res.status(aiError.httpStatus >= 400 ? aiError.httpStatus : 500).json({ error: (err as Error).message || aiError.message });
    }
  });

  app.post('/api/sql/playground/submit', requireAuth, async (req: AuthedRequest, res: Response) => {
    const { challengeId, answer, sql } = req.body as { challengeId?: string; answer?: unknown; sql?: string };
    const challenge = challengeId ? playgroundChallenges.get(challengeId) : undefined;
    if (!challenge || challenge.studentId !== req.currentUser!.id) { res.status(404).json({ error: 'Challenge expired. Load a new challenge.' }); return; }
    const store = await getStore();
    const student = req.currentUser!;
    let correct = false;
    let error: string | undefined;
    let learnerWork = '';
    let result: { columns: string[]; rows: unknown[][]; rowCount: number; executionMs: number } | null = null;

    if (challenge.kind === 'theory') {
      const expected = challenge.answer ?? {};
      learnerWork = JSON.stringify(answer ?? '');
      correct = validateTheoryAnswer(challenge.theoryType ?? 'mcq', expected, answer);
      if (!correct) error = 'Review the topic and try another option.';
    } else {
      learnerWork = String(sql ?? '').trim();
      if (!learnerWork) { res.status(400).json({ error: 'Write a SQL answer before submitting.' }); return; }
      const db = createPracticeDatabaseFromSnapshot(challenge.baseSnapshot!);
      try {
        const validation = validateSqlAnswer(db, learnerWork, challenge.expectedState!, challenge.expectedResult!);
        correct = validation.correct;
        error = validation.error;
        result = validation.result;
      } finally { db.close(); }
    }

    const feedback = await generatePlaygroundFeedback({
      conceptTitle: challenge.topicTitle, prompt: challenge.prompt, learnerWork,
      correct, explanation: challenge.explanation, hint: challenge.hint, error,
    }).catch(() => correct ? `Correct! ${challenge.explanation}` : `${error || 'Not quite yet.'} Hint: ${challenge.hint}`);
    let xpAwarded = 0;
    let gemsAwarded = 0;
    let duplicateBlocked = false;
    if (correct) {
      const sourceRefId = `playground:${challenge.kind}:${challenge.conceptId}:${challenge.kind === 'theory' ? challenge.theoryType : 'sql'}`;
      const tx = await recordXpTransaction(store, {
        studentId: student.id, sourceType: 'sql_challenge', sourceRefId,
        xpAmount: challenge.kind === 'theory' ? 5 : 15,
        gemsAmount: challenge.kind === 'sql' ? 5 : 0,
        timezone: student.timezone,
      });
      xpAwarded = tx.xpAwarded;
      gemsAwarded = tx.gemsAwarded;
      duplicateBlocked = tx.duplicateBlocked;
      if (challenge.kind === 'sql') {
        const alreadySolved = await store.hasSolvedSqlChallenge(student.id, sourceRefId);
        await store.insertSqlSubmission({
          student_id: student.id, concept_id: challenge.conceptId, challenge_key: sourceRefId,
          sql_text: learnerWork, passed: 1, execution_ms: result?.executionMs ?? 0, created_at: new Date().toISOString(),
        });
        if (!alreadySolved) await store.incrementStudentSqlSolved(student.id);
      }
      playgroundChallenges.delete(challengeId!);
      broadcastLeaderboardUpdate(student.id);
      if (xpAwarded > 0) await recordQualifyingStreakActivity(store, student.id);
    }
    res.json({ correct, feedback, hint: correct ? null : challenge.hint, error: correct ? null : error, result, xpAwarded, gemsAwarded, duplicateBlocked, completed: correct });
  });

  app.post('/api/sql/execute', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { sql } = req.body as { sql: string };
      if (!sql || !sql.trim()) {
        res.status(400).json({ error: 'SQL query cannot be empty.' });
        return;
      }

      const [store, practiceDb] = await Promise.all([getStore(), getPracticeDatabase()]);
      const student = req.currentUser!;
      const start = performance.now();
      const results = practiceDb.exec(sql);
      const executionMs = Math.round((performance.now() - start) * 100) / 100;

      const { reachedTargetNow, currentCount } = await incrementMission(
        store,
        student.id,
        'run_sql',
        student.timezone
      );
      if (currentCount >= 3) {
        await store.awardBadgeByCode(student.id, 'SQL_STRIKER');
      }

      let streakRes = null;
      if (reachedTargetNow) {
        streakRes = await recordQualifyingStreakActivity(store, student.id);
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

      const [store, practiceDb] = await Promise.all([getStore(), getPracticeDatabase()]);
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
        await store.insertSqlSubmission({
          student_id: student.id,
          concept_id: conceptId ?? null,
          challenge_key: challengeKey ?? null,
          sql_text: sql.trim(),
          passed: 0,
          execution_ms: executionMs,
          created_at: new Date().toISOString(),
        });
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
        await store.insertSqlSubmission({
          student_id: student.id,
          concept_id: conceptId ?? null,
          challenge_key: challengeKey ?? null,
          sql_text: sql.trim(),
          passed: 0,
          execution_ms: executionMs,
          created_at: new Date().toISOString(),
        });
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

      const alreadySolved = await store.hasSolvedSqlChallenge(student.id, resolvedKey);

      await store.insertSqlSubmission({
        student_id: student.id,
        concept_id: conceptId ?? null,
        challenge_key: resolvedKey,
        sql_text: sql.trim(),
        passed: 1,
        execution_ms: executionMs,
        created_at: new Date().toISOString(),
      });

      if (!alreadySolved) {
        await store.incrementStudentSqlSolved(student.id);
        await recordXpTransaction(store, {
          studentId: student.id,
          sourceType: 'sql_challenge',
          sourceRefId: resolvedKey,
          xpAmount: 15,
          gemsAmount: 5,
          timezone: student.timezone,
        });
      }

      const streakRes = await recordQualifyingStreakActivity(store, student.id);
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
      resetPracticeDatabase();
      res.json({ message: 'Practice database restored to clean University schema.' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---------------- CLAUDE AI EXPLAINER & DOUBT ASSISTANT ----------------
  app.post('/api/ai/explain', requireAuth, async (req: Request, res: Response) => {
    try {
      const { conceptId, refresh, deepDive } = req.body as { conceptId: number; refresh?: boolean; deepDive?: boolean };
      const store = await getStore();
      const concept = await store.getConceptById(conceptId);

      if (!concept) {
        res.status(404).json({ error: 'Concept not found' });
        return;
      }

      if (!refresh && !deepDive) {
        const cached = await store.getAiExplanationCache(conceptId, 'groq-v1');
        if (cached) {
          res.json(JSON.parse(cached));
          return;
        }
      }

      if (deepDive) {
        let lessonContent: Record<string, unknown> = {};
        try { lessonContent = JSON.parse(concept.lesson_content_json || '{}'); } catch { /* Ignore malformed optional lesson details. */ }
        const parsed = await generateTopicSpecificDeepDive({
          unitTitle: concept.unit_title,
          conceptTitle: concept.title,
          summary: concept.summary,
          definition: concept.definition_text,
          example: concept.example_text,
          lessonDetails: JSON.stringify({
            lessonContent,
            practicalExplanation: concept.practical_explanation,
            practicalSql: concept.practical_sql,
          }),
        });
        res.json(parsed);
        return;
      }

      const parsed = await generateStructuredAiExplanation(
        concept.unit_title,
        concept.title,
        concept.summary
      );

      await store.upsertAiExplanationCache(conceptId, 'groq-v1', JSON.stringify(parsed));
      res.json(parsed);
    } catch (err) {
      const parsedErr = formatGroqError(err);
      res.status(parsedErr.httpStatus).json({ error: parsedErr.message });
    }
  });

  app.post('/api/ai/practice-review', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { conceptId, sql } = req.body as { conceptId: number; sql: string };
      if (typeof sql !== 'string' || !sql.trim()) { res.status(400).json({ error: 'Enter a SQL solution first.' }); return; }
      const store = await getStore();
      const concept = await store.getConceptById(Number(conceptId));
      if (!concept) { res.status(404).json({ error: 'Concept not found' }); return; }
      const practiceDb = await getPracticeDatabase();
      const started = Date.now();
      let result: { columns: string[]; rows: unknown[][]; rowCount: number } | null = null;
      let execution = '';
      try {
        if (!/^\s*(SELECT|WITH)\b/i.test(sql)) throw new Error('For this task, use a SELECT query.');
        const queryResult = practiceDb.exec(sql.trim());
        if (queryResult.length) {
          const first = queryResult[0];
          result = { columns: first.columns, rows: first.values, rowCount: first.values.length };
          execution = JSON.stringify(result);
        } else execution = 'SQL ran successfully and changed the practice database.';
      } catch (err) { execution = `SQL error: ${(err as Error).message}`; }
      const feedback = await reviewSqlPractice(concept.title, `Write a short SQL query that demonstrates ${concept.title} using the practice database.`, sql.trim(), execution);
      res.json({ feedback, result: result ? { ...result, executionMs: Date.now() - started } : null });
    } catch (err) {
      const parsedErr = formatGroqError(err);
      res.status(parsedErr.httpStatus).json({ error: parsedErr.message });
    }
  });

  app.post('/api/ai/chat', requireAuth, async (req: AuthedRequest, res: Response) => {
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

      const reply = await generateTutorChatReply({ message, history, context });

      const store = await getStore();
      const student = req.currentUser!;
      await incrementMission(store, student.id, 'ask_tutor', student.timezone);

      res.json({ reply });
    } catch (err) {
      const parsedErr = formatGroqError(err);
      res.status(parsedErr.httpStatus).json({ error: parsedErr.message });
    }
  });

  // ---------------- ADMIN STUDIO CRUD & AI AUTHORING (ADMIN ONLY) ----------------
  app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const store = await getStore();
      const [units, conceptsRaw, questionsRaw, allStudents, migrations] = await Promise.all([
        store.getUnits(),
        store.getConceptsWithAdminMeta(),
        store.getAllQuestionsWithContext(),
        store.getAllStudentsForAdmin(),
        store.getMigrationLogs(5),
      ]);

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

      const questions = questionsRaw.map((q) => ({
        ...q,
        is_unit_assessment: Boolean(q.is_unit_assessment),
        payload: JSON.parse(String(q.payload_json || '{}')),
      }));

      const students = allStudents.map((s) => ({
        id: s.id,
        name: s.name,
        username: s.username,
        email: s.email,
        xp: s.xp,
        weekly_xp: s.weekly_xp,
        hearts: s.hearts,
        max_hearts: s.max_hearts,
        gems: s.gems,
        streak_days: s.streak_days,
        longest_streak: s.longest_streak,
        league: s.league,
        role: s.role,
        is_demo: s.is_demo,
        is_primary: s.is_primary,
      }));

      const missingContentCount = concepts.filter(
        (c) => !c.has_full_lesson || Number(c.question_count) < 1
      ).length;

      res.json({ units, concepts, questions, students, migrations, missingContentCount });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/units', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const {
        unit_number,
        title,
        subtitle,
        description,
        accent_color,
        estimated_hours,
        unlock_xp_bonus,
      } = req.body;
      const store = await getStore();
      const id = await store.createUnit({
        unit_number: Number(unit_number),
        title,
        subtitle: subtitle || `Unit ${unit_number}`,
        description,
        accent_color: accent_color || 'emerald',
        estimated_hours: Number(estimated_hours || 2),
        unlock_xp_bonus: Number(unlock_xp_bonus || 150),
      });
      res.json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.put('/api/admin/units/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { title, subtitle, description, accent_color, estimated_hours } = req.body;
      const store = await getStore();
      await store.updateUnit(Number(req.params.id), {
        title,
        subtitle,
        description,
        accent_color,
        estimated_hours: Number(estimated_hours || 2),
      });
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
      const store = await getStore();
      const id = await store.createConcept({
        unit_id: Number(unit_id),
        order_index: Number(order_index || 1),
        topic_tag: topic_tag || title,
        title,
        summary,
        duration_minutes: Number(duration_minutes || 15),
        xp_reward: Number(xp_reward || 50),
        gem_reward: Number(gem_reward || 15),
        definition_text: definition_text || summary,
        example_text: example_text || summary,
        diagram_type: 'three_schema',
        diagram_config_json: '{}',
        practical_sql: practical_sql || 'SELECT * FROM students LIMIT 5;',
        practical_explanation: 'Run this query in the SQL Playground to inspect live rows.',
        lesson_content_json: JSON.stringify(lesson_content ?? {}),
        is_published: is_published === false ? 0 : 1,
        ai_approved: lesson_content ? 1 : 0,
      });
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
      const store = await getStore();
      await store.updateConcept(Number(req.params.id), {
        title,
        topic_tag: topic_tag || title,
        summary,
        duration_minutes: Number(duration_minutes || 15),
        xp_reward: Number(xp_reward || 50),
        definition_text,
        example_text,
        practical_sql,
        lesson_content_json: lesson_content ? JSON.stringify(lesson_content) : null,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/concepts/:id/reorder', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const conceptId = Number(req.params.id);
      const { direction } = req.body as { direction: 'up' | 'down' };
      const store = await getStore();
      await store.reorderConcept(conceptId, direction);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/admin/concepts/:id/publish', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { is_published } = req.body as { is_published: boolean };
      const store = await getStore();
      await store.setConceptPublished(Number(req.params.id), Boolean(is_published));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/concepts/:id/generate-lesson', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const conceptId = Number(req.params.id);
      const store = await getStore();
      const concept = await store.getConceptById(conceptId);
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
      const parsedErr = formatGroqError(err);
      res.status(parsedErr.httpStatus).json({ error: parsedErr.message });
    }
  });

  app.post('/api/admin/concepts/:id/approve-lesson', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const conceptId = Number(req.params.id);
      const { lesson_content, practical_sql, publish } = req.body;
      const store = await getStore();

      await store.approveConceptLesson(conceptId, {
        lesson_content_json: JSON.stringify(lesson_content),
        definition_text: lesson_content?.detailedExplanation ?? null,
        practical_sql: practical_sql ?? null,
        is_published: typeof publish === 'boolean' ? (publish ? 1 : 0) : null,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/admin/concepts/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const store = await getStore();
      await store.deleteConcept(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/questions', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { unit_id, concept_id, is_unit_assessment, question_type, prompt, payload, explanation, xp_value } =
        req.body;
      const store = await getStore();
      const id = await store.createQuestion({
        unit_id: Number(unit_id),
        concept_id: concept_id ? Number(concept_id) : null,
        is_unit_assessment: is_unit_assessment ? 1 : 0,
        question_type,
        prompt,
        payload_json: JSON.stringify(payload),
        explanation: explanation || 'Great job!',
        xp_value: Number(xp_value || 20),
      });
      res.json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/admin/questions/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const store = await getStore();
      await store.deleteQuestion(Number(req.params.id));
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
      const store = await getStore();

      if (action === 'grant_xp') {
        await recordXpTransaction(store, {
          studentId,
          sourceType: 'admin_grant',
          sourceRefId: `admin:${Date.now()}`,
          xpAmount: 100,
          gemsAmount: 30,
        });
        broadcastLeaderboardUpdate(studentId);
      } else if (action === 'refill_hearts') {
        const st = await store.getStudentById(studentId);
        if (st) {
          await store.updateStudentFields(studentId, { hearts: st.max_hearts });
        }
      } else if (action === 'unlock_all') {
        await store.unlockAllForStudent(studentId);
      } else if (action === 'reset_progress') {
        await store.resetStudentPathProgress(studentId);
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
      const store = await getStore();
      const target = await store.getStudentById(targetId);
      if (!target) {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }
      if (target.role === 'admin') {
        res.status(403).json({ error: 'Cannot delete administrator accounts.' });
        return;
      }
      await store.deleteStudentCascade(targetId);
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
