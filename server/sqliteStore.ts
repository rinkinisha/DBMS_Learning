import { Database } from 'sql.js';
import {
  ensureDailyMissions as sqliteEnsureDailyMissions,
  initializeStudentPathProgressForUser,
  queryAll,
  queryOne,
  runStmt,
  saveAppDb,
} from './db.ts';
import type {
  BadgeRow,
  ConceptRow,
  DailyMissionRow,
  DailyStreakRow,
  DataStore,
  DataStoreStatus,
  LeaderboardAggregateData,
  MigrationAuditRow,
  PasswordResetRow,
  QuestionRow,
  QuestionWithContextRow,
  QuizAttemptRow,
  SessionRow,
  SqlSubmissionRow,
  StudentBadgeJoinRow,
  StudentConceptProgressRow,
  StudentFullRow,
  StudentUnitProgressRow,
  UnitRow,
  XpTransactionRow,
} from './storeTypes.ts';

export class SqliteDataStore implements DataStore {
  public readonly status: DataStoreStatus;
  private db: Database;

  constructor(db: Database, status: DataStoreStatus) {
    this.db = db;
    this.status = status;
  }

  async getUnits(): Promise<UnitRow[]> {
    return queryAll<UnitRow>(this.db, 'SELECT * FROM units ORDER BY unit_number ASC');
  }

  async getUnitById(id: number): Promise<UnitRow | null> {
    return queryOne<UnitRow>(this.db, 'SELECT * FROM units WHERE id = ?', [id]);
  }

  async getNextUnit(unitNumber: number): Promise<UnitRow | null> {
    return queryOne<UnitRow>(
      this.db,
      'SELECT * FROM units WHERE unit_number > ? ORDER BY unit_number ASC LIMIT 1',
      [unitNumber]
    );
  }

  async createUnit(input: Omit<UnitRow, 'id'>): Promise<number> {
    return runStmt(
      this.db,
      `INSERT INTO units (unit_number, title, subtitle, description, accent_color, estimated_hours, unlock_xp_bonus)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.unit_number,
        input.title,
        input.subtitle,
        input.description,
        input.accent_color,
        input.estimated_hours,
        input.unlock_xp_bonus,
      ]
    );
  }

  async updateUnit(
    id: number,
    input: Pick<UnitRow, 'title' | 'subtitle' | 'description' | 'accent_color' | 'estimated_hours'>
  ): Promise<void> {
    runStmt(
      this.db,
      `UPDATE units SET title = ?, subtitle = ?, description = ?, accent_color = ?, estimated_hours = ? WHERE id = ?`,
      [input.title, input.subtitle, input.description, input.accent_color, input.estimated_hours, id]
    );
  }

  async getConcepts(opts?: { publishedOnly?: boolean }): Promise<ConceptRow[]> {
    const where = opts?.publishedOnly ? 'WHERE is_published = 1' : '';
    return queryAll<ConceptRow>(
      this.db,
      `SELECT * FROM concepts ${where} ORDER BY unit_id ASC, order_index ASC`
    );
  }

  async getConceptsWithAdminMeta(): Promise<
    (ConceptRow & { unit_title: string; unit_number: number; question_count: number })[]
  > {
    return queryAll(
      this.db,
      `SELECT c.*, u.title AS unit_title, u.unit_number,
              (SELECT COUNT(*) FROM questions q WHERE q.concept_id = c.id) AS question_count
       FROM concepts c
       JOIN units u ON c.unit_id = u.id
       ORDER BY u.unit_number ASC, c.order_index ASC`
    );
  }

  async getConceptById(id: number): Promise<(ConceptRow & { unit_title: string }) | null> {
    return queryOne(
      this.db,
      'SELECT c.*, u.title AS unit_title FROM concepts c JOIN units u ON c.unit_id = u.id WHERE c.id = ?',
      [id]
    );
  }

  async getNextConceptInUnit(unitId: number, orderIndex: number): Promise<ConceptRow | null> {
    return queryOne<ConceptRow>(
      this.db,
      `SELECT * FROM concepts WHERE unit_id = ? AND order_index > ? AND is_published = 1 ORDER BY order_index ASC LIMIT 1`,
      [unitId, orderIndex]
    );
  }

  async getFirstPublishedConceptInUnit(unitId: number): Promise<ConceptRow | null> {
    return queryOne<ConceptRow>(
      this.db,
      `SELECT * FROM concepts WHERE unit_id = ? AND is_published = 1 ORDER BY order_index ASC LIMIT 1`,
      [unitId]
    );
  }

  async createConcept(input: Omit<ConceptRow, 'id'>): Promise<number> {
    return runStmt(
      this.db,
      `INSERT INTO concepts (unit_id, order_index, topic_tag, title, summary, duration_minutes, xp_reward, gem_reward, definition_text, example_text, diagram_type, diagram_config_json, practical_sql, practical_explanation, lesson_content_json, is_published, ai_approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.unit_id,
        input.order_index,
        input.topic_tag,
        input.title,
        input.summary,
        input.duration_minutes,
        input.xp_reward,
        input.gem_reward,
        input.definition_text,
        input.example_text,
        input.diagram_type,
        input.diagram_config_json,
        input.practical_sql,
        input.practical_explanation,
        input.lesson_content_json,
        input.is_published,
        input.ai_approved,
      ]
    );
  }

  async updateConcept(
    id: number,
    input: {
      title: string;
      topic_tag: string;
      summary: string;
      duration_minutes: number;
      xp_reward: number;
      definition_text: string;
      example_text: string;
      practical_sql: string;
      lesson_content_json: string | null;
    }
  ): Promise<void> {
    runStmt(
      this.db,
      `UPDATE concepts
       SET title = ?, topic_tag = ?, summary = ?, duration_minutes = ?, xp_reward = ?, definition_text = ?, example_text = ?, practical_sql = ?, lesson_content_json = COALESCE(?, lesson_content_json)
       WHERE id = ?`,
      [
        input.title,
        input.topic_tag,
        input.summary,
        input.duration_minutes,
        input.xp_reward,
        input.definition_text,
        input.example_text,
        input.practical_sql,
        input.lesson_content_json,
        id,
      ]
    );
  }

  async reorderConcept(conceptId: number, direction: 'up' | 'down'): Promise<void> {
    const target = queryOne<{ id: number; unit_id: number; order_index: number }>(
      this.db,
      'SELECT id, unit_id, order_index FROM concepts WHERE id = ?',
      [conceptId]
    );
    if (!target) {
      throw new Error('Concept not found');
    }

    const neighbor =
      direction === 'up'
        ? queryOne<{ id: number; order_index: number }>(
            this.db,
            'SELECT id, order_index FROM concepts WHERE unit_id = ? AND order_index < ? ORDER BY order_index DESC LIMIT 1',
            [target.unit_id, target.order_index]
          )
        : queryOne<{ id: number; order_index: number }>(
            this.db,
            'SELECT id, order_index FROM concepts WHERE unit_id = ? AND order_index > ? ORDER BY order_index ASC LIMIT 1',
            [target.unit_id, target.order_index]
          );

    if (neighbor) {
      this.db.run('UPDATE concepts SET order_index = ? WHERE id = ?', [
        neighbor.order_index,
        target.id,
      ]);
      this.db.run('UPDATE concepts SET order_index = ? WHERE id = ?', [
        target.order_index,
        neighbor.id,
      ]);
      saveAppDb();
    }
  }

  async setConceptPublished(conceptId: number, isPublished: boolean): Promise<void> {
    runStmt(this.db, 'UPDATE concepts SET is_published = ? WHERE id = ?', [
      isPublished ? 1 : 0,
      conceptId,
    ]);
  }

  async approveConceptLesson(
    conceptId: number,
    input: {
      lesson_content_json: string;
      definition_text: string | null;
      practical_sql: string | null;
      is_published: number | null;
    }
  ): Promise<void> {
    runStmt(
      this.db,
      `UPDATE concepts
       SET lesson_content_json = ?,
           definition_text = COALESCE(?, definition_text),
           practical_sql = COALESCE(?, practical_sql),
           ai_approved = 1,
           is_published = COALESCE(?, is_published)
       WHERE id = ?`,
      [
        input.lesson_content_json,
        input.definition_text,
        input.practical_sql,
        input.is_published,
        conceptId,
      ]
    );
  }

  async deleteConcept(conceptId: number): Promise<void> {
    runStmt(this.db, 'DELETE FROM concepts WHERE id = ?', [conceptId]);
  }

  async getQuestionsForConcept(conceptId: number): Promise<QuestionRow[]> {
    return queryAll<QuestionRow>(
      this.db,
      'SELECT * FROM questions WHERE concept_id = ? AND is_unit_assessment = 0 ORDER BY id ASC',
      [conceptId]
    );
  }

  async getUnitAssessmentQuestions(unitId: number): Promise<QuestionRow[]> {
    return queryAll<QuestionRow>(
      this.db,
      'SELECT * FROM questions WHERE unit_id = ? AND is_unit_assessment = 1 ORDER BY id ASC',
      [unitId]
    );
  }

  async getAllQuestionsWithContext(): Promise<QuestionWithContextRow[]> {
    return queryAll<QuestionWithContextRow>(
      this.db,
      `SELECT q.*, u.unit_number, c.title AS concept_title
       FROM questions q
       JOIN units u ON q.unit_id = u.id
       LEFT JOIN concepts c ON q.concept_id = c.id
       ORDER BY q.id DESC`
    );
  }

  async createQuestion(input: Omit<QuestionRow, 'id'>): Promise<number> {
    return runStmt(
      this.db,
      `INSERT INTO questions (unit_id, concept_id, is_unit_assessment, question_type, prompt, payload_json, explanation, xp_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.unit_id,
        input.concept_id,
        input.is_unit_assessment,
        input.question_type,
        input.prompt,
        input.payload_json,
        input.explanation,
        input.xp_value,
      ]
    );
  }

  async deleteQuestion(questionId: number): Promise<void> {
    runStmt(this.db, 'DELETE FROM questions WHERE id = ?', [questionId]);
  }

  async getBadges(): Promise<BadgeRow[]> {
    return queryAll<BadgeRow>(this.db, 'SELECT * FROM badges ORDER BY id ASC');
  }

  async getStudentBadges(studentId: number): Promise<StudentBadgeJoinRow[]> {
    return queryAll<StudentBadgeJoinRow>(
      this.db,
      `SELECT b.*, sb.earned_at, CASE WHEN sb.badge_id IS NOT NULL THEN 1 ELSE 0 END AS earned
       FROM badges b
       LEFT JOIN student_badges sb ON sb.badge_id = b.id AND sb.student_id = ?
       ORDER BY b.id ASC`,
      [studentId]
    );
  }

  async awardBadgeByCode(studentId: number, badgeCode: string): Promise<boolean> {
    const badge = queryOne<{ id: number }>(this.db, 'SELECT id FROM badges WHERE code = ?', [
      badgeCode,
    ]);
    if (!badge) return false;
    const existing = queryOne(
      this.db,
      'SELECT 1 FROM student_badges WHERE student_id = ? AND badge_id = ?',
      [studentId, badge.id]
    );
    if (existing) return false;
    runStmt(
      this.db,
      'INSERT INTO student_badges (student_id, badge_id, earned_at) VALUES (?, ?, ?)',
      [studentId, badge.id, new Date().toISOString()]
    );
    return true;
  }

  async getMigrationLogs(limit = 5): Promise<MigrationAuditRow[]> {
    return queryAll<MigrationAuditRow>(
      this.db,
      'SELECT * FROM migration_audit_log ORDER BY id DESC LIMIT ?',
      [limit]
    );
  }

  async getStudentById(id: number): Promise<StudentFullRow | null> {
    return queryOne<StudentFullRow>(this.db, 'SELECT * FROM students WHERE id = ?', [id]);
  }

  async getStudentByEmail(email: string): Promise<StudentFullRow | null> {
    return queryOne<StudentFullRow>(
      this.db,
      'SELECT * FROM students WHERE LOWER(email) = LOWER(?) LIMIT 1',
      [email]
    );
  }

  async getStudentByUsername(username: string): Promise<StudentFullRow | null> {
    return queryOne<StudentFullRow>(
      this.db,
      'SELECT * FROM students WHERE LOWER(username) = LOWER(?) LIMIT 1',
      [username]
    );
  }

  async getAllStudentsForAdmin(): Promise<StudentFullRow[]> {
    return queryAll<StudentFullRow>(
      this.db,
      'SELECT * FROM students ORDER BY is_demo ASC, xp DESC'
    );
  }

  async createStudent(input: Omit<StudentFullRow, 'id'>): Promise<number> {
    return runStmt(
      this.db,
      `INSERT INTO students (
         name, username, email, password_hash, avatar_seed,
         xp, hearts, max_hearts, gems, streak_days, longest_streak,
         last_active_date, league, weekly_xp, role, is_primary, is_demo,
         timezone, streak_history_json, streak_updated_at, sql_solved_count, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.username,
        input.email,
        input.password_hash,
        input.avatar_seed,
        input.xp,
        input.hearts,
        input.max_hearts,
        input.gems,
        input.streak_days,
        input.longest_streak,
        input.last_active_date,
        input.league,
        input.weekly_xp,
        input.role,
        input.is_primary,
        input.is_demo,
        input.timezone,
        input.streak_history_json,
        input.streak_updated_at,
        input.sql_solved_count,
        input.created_at,
      ]
    );
  }

  async updateStudentFields(id: number, fields: Partial<StudentFullRow>): Promise<void> {
    const entries = Object.entries(fields).filter(([k, v]) => k !== 'id' && v !== undefined);
    if (entries.length === 0) return;
    const setSql = entries.map(([k]) => `${k} = ?`).join(', ');
    const params = entries.map(([, v]) => (v === undefined ? null : v)) as (
      | string
      | number
      | null
    )[];
    params.push(id);
    runStmt(this.db, `UPDATE students SET ${setSql} WHERE id = ?`, params);
  }

  async incrementStudentSqlSolved(id: number): Promise<void> {
    runStmt(
      this.db,
      'UPDATE students SET sql_solved_count = COALESCE(sql_solved_count, 0) + 1 WHERE id = ?',
      [id]
    );
  }

  async deleteStudentCascade(targetId: number): Promise<void> {
    this.db.run('DELETE FROM sessions WHERE student_id = ?', [targetId]);
    this.db.run('DELETE FROM password_resets WHERE student_id = ?', [targetId]);
    this.db.run('DELETE FROM xp_transactions WHERE student_id = ?', [targetId]);
    this.db.run('DELETE FROM quiz_attempts WHERE student_id = ?', [targetId]);
    this.db.run('DELETE FROM sql_submissions WHERE student_id = ?', [targetId]);
    this.db.run('DELETE FROM daily_streaks WHERE user_id = ?', [targetId]);
    this.db.run('DELETE FROM student_badges WHERE student_id = ?', [targetId]);
    this.db.run('DELETE FROM daily_missions WHERE student_id = ?', [targetId]);
    this.db.run('DELETE FROM student_concept_progress WHERE student_id = ?', [targetId]);
    this.db.run('DELETE FROM student_unit_progress WHERE student_id = ?', [targetId]);
    runStmt(this.db, 'DELETE FROM students WHERE id = ?', [targetId]);
  }

  async createSession(session: SessionRow): Promise<void> {
    runStmt(
      this.db,
      'INSERT INTO sessions (token, student_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [session.token, session.student_id, session.expires_at, session.created_at]
    );
  }

  async getSessionByToken(token: string): Promise<SessionRow | null> {
    return queryOne<SessionRow>(
      this.db,
      'SELECT token, student_id, expires_at, created_at FROM sessions WHERE token = ?',
      [token]
    );
  }

  async deleteSession(token: string): Promise<void> {
    this.db.run('DELETE FROM sessions WHERE token = ?', [token]);
    saveAppDb();
  }

  async createPasswordReset(input: Omit<PasswordResetRow, 'id'>): Promise<number> {
    return runStmt(
      this.db,
      `INSERT INTO password_resets (student_id, reset_code, expires_at, used, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [input.student_id, input.reset_code, input.expires_at, input.used, input.created_at]
    );
  }

  async getLatestValidPasswordReset(
    studentId: number,
    code: string
  ): Promise<PasswordResetRow | null> {
    return queryOne<PasswordResetRow>(
      this.db,
      `SELECT id, student_id, reset_code, expires_at, used, created_at FROM password_resets
       WHERE student_id = ? AND reset_code = ? AND used = 0
       ORDER BY id DESC LIMIT 1`,
      [studentId, code]
    );
  }

  async markPasswordResetUsed(id: number): Promise<void> {
    runStmt(this.db, 'UPDATE password_resets SET used = 1 WHERE id = ?', [id]);
  }

  async initializeStudentPathProgress(studentId: number): Promise<void> {
    initializeStudentPathProgressForUser(this.db, studentId);
  }

  async resetStudentPathProgress(studentId: number): Promise<void> {
    this.db.run('DELETE FROM student_unit_progress WHERE student_id = ?', [studentId]);
    this.db.run('DELETE FROM student_concept_progress WHERE student_id = ?', [studentId]);
    initializeStudentPathProgressForUser(this.db, studentId);
  }

  async unlockAllForStudent(studentId: number): Promise<void> {
    const units = queryAll<{ id: number }>(this.db, 'SELECT id FROM units');
    for (const u of units) {
      this.db.run(
        `INSERT INTO student_unit_progress (student_id, unit_id, status) VALUES (?, ?, 'unlocked')
         ON CONFLICT(student_id, unit_id) DO UPDATE SET status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'unlocked' END`,
        [studentId, u.id]
      );
    }
    const concepts = queryAll<{ id: number }>(this.db, 'SELECT id FROM concepts');
    for (const c of concepts) {
      this.db.run(
        `INSERT INTO student_concept_progress (student_id, concept_id, status) VALUES (?, ?, 'unlocked')
         ON CONFLICT(student_id, concept_id) DO UPDATE SET status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'unlocked' END`,
        [studentId, c.id]
      );
    }
    saveAppDb();
  }

  async getStudentUnitProgress(studentId: number): Promise<StudentUnitProgressRow[]> {
    return queryAll<StudentUnitProgressRow>(
      this.db,
      'SELECT * FROM student_unit_progress WHERE student_id = ?',
      [studentId]
    );
  }

  async getOneStudentUnitProgress(
    studentId: number,
    unitId: number
  ): Promise<StudentUnitProgressRow | null> {
    return queryOne<StudentUnitProgressRow>(
      this.db,
      'SELECT * FROM student_unit_progress WHERE student_id = ? AND unit_id = ?',
      [studentId, unitId]
    );
  }

  async upsertStudentUnitProgress(
    studentId: number,
    unitId: number,
    input: {
      status?: string;
      statusIfNotCompleted?: string;
      assessment_score?: number;
      completed_at?: string;
    }
  ): Promise<void> {
    const existing = await this.getOneStudentUnitProgress(studentId, unitId);
    if (!existing) {
      const status = input.status ?? input.statusIfNotCompleted ?? 'locked';
      this.db.run(
        `INSERT INTO student_unit_progress (student_id, unit_id, status, assessment_score, completed_at)
         VALUES (?, ?, ?, ?, ?)`,
        [studentId, unitId, status, input.assessment_score ?? null, input.completed_at ?? null]
      );
    } else {
      const nextStatus =
        input.status ??
        (input.statusIfNotCompleted
          ? existing.status === 'completed'
            ? 'completed'
            : input.statusIfNotCompleted
          : existing.status);
      const nextScore =
        input.assessment_score !== undefined
          ? Math.max(existing.assessment_score ?? 0, input.assessment_score)
          : existing.assessment_score;
      const nextCompleted = input.completed_at ?? existing.completed_at;
      this.db.run(
        `UPDATE student_unit_progress SET status = ?, assessment_score = ?, completed_at = ? WHERE student_id = ? AND unit_id = ?`,
        [nextStatus, nextScore, nextCompleted, studentId, unitId]
      );
    }
    saveAppDb();
  }

  async getStudentConceptProgress(studentId: number): Promise<StudentConceptProgressRow[]> {
    return queryAll<StudentConceptProgressRow>(
      this.db,
      'SELECT * FROM student_concept_progress WHERE student_id = ?',
      [studentId]
    );
  }

  async getOneStudentConceptProgress(
    studentId: number,
    conceptId: number
  ): Promise<StudentConceptProgressRow | null> {
    return queryOne<StudentConceptProgressRow>(
      this.db,
      'SELECT * FROM student_concept_progress WHERE student_id = ? AND concept_id = ?',
      [studentId, conceptId]
    );
  }

  async upsertStudentConceptProgress(
    studentId: number,
    conceptId: number,
    input: {
      status?: string;
      statusIfNotCompleted?: string;
      best_score?: number | null;
      attempts?: number;
      completed_at?: string | null;
    }
  ): Promise<void> {
    const existing = await this.getOneStudentConceptProgress(studentId, conceptId);
    if (!existing) {
      const status = input.status ?? input.statusIfNotCompleted ?? 'locked';
      this.db.run(
        `INSERT INTO student_concept_progress (student_id, concept_id, status, best_score, attempts, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          studentId,
          conceptId,
          status,
          input.best_score ?? null,
          input.attempts ?? 0,
          input.completed_at ?? null,
        ]
      );
    } else {
      const nextStatus =
        input.status ??
        (input.statusIfNotCompleted
          ? existing.status === 'completed'
            ? 'completed'
            : input.statusIfNotCompleted
          : existing.status);
      const nextBest = input.best_score !== undefined ? input.best_score : existing.best_score;
      const nextAttempts = input.attempts !== undefined ? input.attempts : existing.attempts;
      const nextCompleted =
        input.completed_at !== undefined ? input.completed_at : existing.completed_at;
      this.db.run(
        `UPDATE student_concept_progress SET status = ?, best_score = ?, attempts = ?, completed_at = ? WHERE student_id = ? AND concept_id = ?`,
        [nextStatus, nextBest, nextAttempts, nextCompleted, studentId, conceptId]
      );
    }
    saveAppDb();
  }

  async countIncompleteConceptsInUnit(studentId: number, unitId: number): Promise<number> {
    const row = queryOne<{ count: number }>(
      this.db,
      `SELECT COUNT(*) AS count
       FROM concepts c
       LEFT JOIN student_concept_progress scp ON scp.concept_id = c.id AND scp.student_id = ?
       WHERE c.unit_id = ? AND c.is_published = 1 AND COALESCE(scp.status, 'locked') != 'completed'`,
      [studentId, unitId]
    );
    return row?.count ?? 0;
  }

  async countCompletedPublishedConcepts(studentId: number): Promise<number> {
    const row = queryOne<{ c: number }>(
      this.db,
      `SELECT COUNT(*) AS c FROM student_concept_progress scp
       JOIN concepts con ON con.id = scp.concept_id
       WHERE scp.student_id = ? AND scp.status = 'completed' AND con.is_published = 1`,
      [studentId]
    );
    return row?.c ?? 0;
  }

  async countPublishedConcepts(): Promise<number> {
    const row = queryOne<{ c: number }>(
      this.db,
      'SELECT COUNT(*) AS c FROM concepts WHERE is_published = 1'
    );
    return row?.c ?? 87;
  }

  async countCompletedUnits(studentId: number): Promise<number> {
    const row = queryOne<{ c: number }>(
      this.db,
      `SELECT COUNT(*) AS c FROM student_unit_progress WHERE student_id = ? AND status = 'completed'`,
      [studentId]
    );
    return row?.c ?? 0;
  }

  async countUnits(): Promise<number> {
    const row = queryOne<{ c: number }>(this.db, 'SELECT COUNT(*) AS c FROM units');
    return row?.c ?? 4;
  }

  async ensureDailyMissions(studentId: number, missionDate: string): Promise<void> {
    const existing = queryAll(
      this.db,
      `SELECT id FROM daily_missions WHERE student_id = ? AND mission_date = ?`,
      [studentId, missionDate]
    );
    if (existing.length > 0) return;

    const missions = [
      { key: 'complete_concept', title: 'Pass 1 Concept Assessment', target: 1, xp: 40, gems: 15 },
      { key: 'run_sql', title: 'Run 3 queries in SQL Playground', target: 3, xp: 30, gems: 10 },
      { key: 'ask_tutor', title: 'Ask the AI Tutor 1 question', target: 1, xp: 20, gems: 10 },
    ];
    for (const m of missions) {
      runStmt(
        this.db,
        `INSERT INTO daily_missions (student_id, mission_key, title, target_count, current_count, xp_reward, gem_reward, claimed, mission_date)
         VALUES (?, ?, ?, ?, 0, ?, ?, 0, ?)`,
        [studentId, m.key, m.title, m.target, m.xp, m.gems, missionDate],
        false
      );
    }
    saveAppDb();
  }

  async getDailyMissions(studentId: number, missionDate: string): Promise<DailyMissionRow[]> {
    return queryAll<DailyMissionRow>(
      this.db,
      `SELECT * FROM daily_missions WHERE student_id = ? AND mission_date = ? ORDER BY id ASC`,
      [studentId, missionDate]
    );
  }

  async getDailyMissionById(missionId: number, studentId: number): Promise<DailyMissionRow | null> {
    return queryOne<DailyMissionRow>(
      this.db,
      'SELECT * FROM daily_missions WHERE id = ? AND student_id = ?',
      [missionId, studentId]
    );
  }

  async incrementDailyMission(
    studentId: number,
    missionKey: string,
    missionDate: string
  ): Promise<{ reachedTargetNow: boolean; currentCount: number }> {
    await this.ensureDailyMissions(studentId, missionDate);
    const before = queryOne<{ current_count: number; target_count: number }>(
      this.db,
      `SELECT current_count, target_count FROM daily_missions
       WHERE student_id = ? AND mission_key = ? AND mission_date = ?
       ORDER BY id DESC LIMIT 1`,
      [studentId, missionKey, missionDate]
    );
    this.db.run(
      `UPDATE daily_missions
       SET current_count = MIN(target_count, current_count + 1)
       WHERE student_id = ? AND mission_key = ? AND mission_date = ?`,
      [studentId, missionKey, missionDate]
    );
    saveAppDb();
    const after = queryOne<{ current_count: number }>(
      this.db,
      `SELECT current_count FROM daily_missions
       WHERE student_id = ? AND mission_key = ? AND mission_date = ?
       ORDER BY id DESC LIMIT 1`,
      [studentId, missionKey, missionDate]
    );
    const reachedTargetNow = Boolean(
      before &&
        before.current_count < before.target_count &&
        before.current_count + 1 >= before.target_count
    );
    return { reachedTargetNow, currentCount: after?.current_count ?? 0 };
  }

  async markDailyMissionClaimed(missionId: number): Promise<void> {
    runStmt(this.db, 'UPDATE daily_missions SET claimed = 1 WHERE id = ?', [missionId]);
  }

  async getDailyStreak(studentId: number): Promise<DailyStreakRow | null> {
    return queryOne<DailyStreakRow>(this.db, 'SELECT * FROM daily_streaks WHERE user_id = ?', [
      studentId,
    ]);
  }

  async upsertDailyStreak(row: DailyStreakRow): Promise<void> {
    const existing = await this.getDailyStreak(row.user_id);
    if (!existing) {
      this.db.run(
        `INSERT INTO daily_streaks (user_id, current_streak, longest_streak, last_activity_date, streak_history_json, timezone, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.user_id,
          row.current_streak,
          row.longest_streak,
          row.last_activity_date,
          row.streak_history_json,
          row.timezone,
          row.updated_at,
        ]
      );
    } else {
      this.db.run(
        `UPDATE daily_streaks
         SET current_streak = ?, longest_streak = ?, last_activity_date = ?, streak_history_json = ?, timezone = ?, updated_at = ?
         WHERE user_id = ?`,
        [
          row.current_streak,
          row.longest_streak,
          row.last_activity_date,
          row.streak_history_json,
          row.timezone,
          row.updated_at,
          row.user_id,
        ]
      );
    }
    saveAppDb();
  }

  async updateDailyStreakTimezone(studentId: number, timezone: string): Promise<void> {
    this.db.run('UPDATE daily_streaks SET timezone = ? WHERE user_id = ?', [timezone, studentId]);
    saveAppDb();
  }

  async hasXpTransaction(
    studentId: number,
    sourceType: string,
    sourceRefId: string,
    localDate?: string
  ): Promise<boolean> {
    if (localDate) {
      const row = queryOne<{ id: number }>(
        this.db,
        `SELECT id FROM xp_transactions
         WHERE student_id = ? AND source_type = ? AND source_ref_id = ? AND local_date = ?
         LIMIT 1`,
        [studentId, sourceType, sourceRefId, localDate]
      );
      return Boolean(row);
    }
    const row = queryOne<{ id: number }>(
      this.db,
      `SELECT id FROM xp_transactions
       WHERE student_id = ? AND source_type = ? AND source_ref_id = ?
       LIMIT 1`,
      [studentId, sourceType, sourceRefId]
    );
    return Boolean(row);
  }

  async insertXpTransaction(input: Omit<XpTransactionRow, 'id'>): Promise<number> {
    return runStmt(
      this.db,
      `INSERT INTO xp_transactions (student_id, source_type, source_ref_id, xp_amount, gems_amount, local_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.student_id,
        input.source_type,
        input.source_ref_id,
        input.xp_amount,
        input.gems_amount,
        input.local_date,
        input.created_at,
      ]
    );
  }

  async sumStudentXpSince(studentId: number, sinceLocalDate: string): Promise<number> {
    const row = queryOne<{ w_xp: number }>(
      this.db,
      `SELECT COALESCE(SUM(xp_amount), 0) AS w_xp
       FROM xp_transactions
       WHERE student_id = ? AND local_date >= ?`,
      [studentId, sinceLocalDate]
    );
    return row?.w_xp ?? 0;
  }

  async getRecentXpTransactions(studentId: number, limit: number): Promise<XpTransactionRow[]> {
    return queryAll<XpTransactionRow>(
      this.db,
      `SELECT id, student_id, source_type, source_ref_id, xp_amount, gems_amount, local_date, created_at
       FROM xp_transactions
       WHERE student_id = ?
       ORDER BY id DESC LIMIT ?`,
      [studentId, limit]
    );
  }

  async insertQuizAttempt(input: Omit<QuizAttemptRow, 'id'>): Promise<number> {
    return runStmt(
      this.db,
      `INSERT INTO quiz_attempts (student_id, unit_id, concept_id, is_unit_assessment, score, passed, xp_awarded, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.student_id,
        input.unit_id,
        input.concept_id,
        input.is_unit_assessment,
        input.score,
        input.passed,
        input.xp_awarded,
        input.created_at,
      ]
    );
  }

  async getStudentQuizStats(studentId: number): Promise<{ avgAcc: number; totalAttempts: number }> {
    const row = queryOne<{ avg_acc: number; total_attempts: number }>(
      this.db,
      `SELECT ROUND(AVG(score), 1) AS avg_acc, COUNT(*) AS total_attempts
       FROM quiz_attempts WHERE student_id = ?`,
      [studentId]
    );
    return {
      avgAcc: row?.avg_acc ?? 0,
      totalAttempts: row?.total_attempts ?? 0,
    };
  }

  async hasSolvedSqlChallenge(studentId: number, challengeKey: string): Promise<boolean> {
    const row = queryOne<{ id: number }>(
      this.db,
      `SELECT id FROM sql_submissions WHERE student_id = ? AND challenge_key = ? AND passed = 1 LIMIT 1`,
      [studentId, challengeKey]
    );
    return Boolean(row);
  }

  async insertSqlSubmission(input: Omit<SqlSubmissionRow, 'id'>): Promise<number> {
    return runStmt(
      this.db,
      `INSERT INTO sql_submissions (student_id, concept_id, challenge_key, sql_text, passed, execution_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.student_id,
        input.concept_id,
        input.challenge_key,
        input.sql_text,
        input.passed,
        input.execution_ms,
        input.created_at,
      ]
    );
  }

  async countDistinctSolvedSql(studentId: number): Promise<number> {
    const row = queryOne<{ c: number }>(
      this.db,
      `SELECT COUNT(DISTINCT COALESCE(challenge_key, sql_text)) AS c
       FROM sql_submissions WHERE student_id = ? AND passed = 1`,
      [studentId]
    );
    return row?.c ?? 0;
  }

  async getLeaderboardAggregateData(
    sinceLocalDate: string | null,
    isDailyExact: boolean,
    weekStart: string
  ): Promise<LeaderboardAggregateData> {
    const totalConcepts = await this.countPublishedConcepts();
    const totalUnits = await this.countUnits();
    const students = queryAll<StudentFullRow>(
      this.db,
      `SELECT * FROM students WHERE role = 'student' AND is_demo = 0`
    );

    let dateFilter = '';
    const dateParams: string[] = [];
    if (sinceLocalDate) {
      dateFilter = isDailyExact ? 'WHERE local_date = ?' : 'WHERE local_date >= ?';
      dateParams.push(sinceLocalDate);
    }

    const periodRows = queryAll<{ student_id: number; sum_xp: number; achieved_at: string | null }>(
      this.db,
      `SELECT student_id, COALESCE(SUM(xp_amount), 0) AS sum_xp, MAX(created_at) AS achieved_at
       FROM xp_transactions ${dateFilter} GROUP BY student_id`,
      dateParams
    );

    const weeklyRows = queryAll<{ student_id: number; sum_xp: number }>(
      this.db,
      `SELECT student_id, COALESCE(SUM(xp_amount), 0) AS sum_xp
       FROM xp_transactions WHERE local_date >= ? GROUP BY student_id`,
      [weekStart]
    );

    const conceptRows = queryAll<{ student_id: number; c_count: number }>(
      this.db,
      `SELECT scp.student_id, COUNT(*) AS c_count
       FROM student_concept_progress scp
       JOIN concepts c ON c.id = scp.concept_id
       WHERE scp.status = 'completed' AND c.is_published = 1
       GROUP BY scp.student_id`
    );

    const unitRows = queryAll<{ student_id: number; u_count: number }>(
      this.db,
      `SELECT student_id, COUNT(*) AS u_count
       FROM student_unit_progress WHERE status = 'completed' GROUP BY student_id`
    );

    const accRows = queryAll<{ student_id: number; avg_score: number }>(
      this.db,
      `SELECT student_id, ROUND(AVG(score), 1) AS avg_score
       FROM quiz_attempts GROUP BY student_id`
    );

    const sqlRows = queryAll<{ student_id: number; solved: number }>(
      this.db,
      `SELECT student_id, COUNT(DISTINCT COALESCE(challenge_key, sql_text)) AS solved
       FROM sql_submissions WHERE passed = 1 GROUP BY student_id`
    );

    return {
      totalConcepts,
      totalUnits,
      students,
      periodMap: new Map(periodRows.map((r) => [r.student_id, r])),
      weeklyMap: new Map(weeklyRows.map((r) => [r.student_id, r.sum_xp])),
      conceptMap: new Map(conceptRows.map((r) => [r.student_id, r.c_count])),
      unitMap: new Map(unitRows.map((r) => [r.student_id, r.u_count])),
      accMap: new Map(accRows.map((r) => [r.student_id, r.avg_score])),
      sqlMap: new Map(sqlRows.map((r) => [r.student_id, r.solved])),
    };
  }

  async getAiExplanationCache(conceptId: number, style: string): Promise<string | null> {
    const row = queryOne<{ content_json: string }>(
      this.db,
      'SELECT content_json FROM ai_explanation_cache WHERE concept_id = ? AND style = ?',
      [conceptId, style]
    );
    return row?.content_json ?? null;
  }

  async upsertAiExplanationCache(
    conceptId: number,
    style: string,
    contentJson: string
  ): Promise<void> {
    this.db.run(
      `INSERT INTO ai_explanation_cache (concept_id, style, content_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(concept_id, style) DO UPDATE SET
         content_json = excluded.content_json,
         updated_at = excluded.updated_at`,
      [conceptId, style, contentJson, new Date().toISOString()]
    );
    saveAppDb();
  }
}

export { sqliteEnsureDailyMissions };
