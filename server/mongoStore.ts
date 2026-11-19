import crypto from 'node:crypto';
import { Db, MongoClient } from 'mongodb';
import type { Database as SqlJsDatabase } from 'sql.js';
import { queryAll } from './db.ts';
import {
  CURRICULUM_VERSION,
  SEED_BADGES,
  SEED_CONCEPTS,
  SEED_QUESTIONS,
  SEED_UNITS,
} from './seedData.ts';
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

function hashSeedPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CounterDoc {
  _id: string;
  seq: number;
}

export class MongoDataStore implements DataStore {
  public readonly status: DataStoreStatus;
  private client: MongoClient;
  private db: Db;

  constructor(client: MongoClient, db: Db) {
    this.client = client;
    this.db = db;
    this.status = {
      backend: 'mongodb',
      mongoConfigured: true,
      mongoConnected: true,
      note: 'Connected to MongoDB Atlas.',
    };
  }

  private async nextSeq(name: string): Promise<number> {
    const res = await this.db
      .collection<CounterDoc>('counters')
      .findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
      );
    return res?.seq ?? 1;
  }

  private async setCounterAtLeast(name: string, minVal: number): Promise<void> {
    await this.db
      .collection<CounterDoc>('counters')
      .updateOne({ _id: name }, { $max: { seq: minVal } }, { upsert: true });
  }

  async initialize(sqliteFallbackDb?: SqlJsDatabase): Promise<void> {
    await this.ensureIndexes();

    const unitCount = await this.db.collection('units').countDocuments();
    const studentCount = await this.db.collection('students').countDocuments();

    if (unitCount === 0 && studentCount === 0) {
      if (sqliteFallbackDb) {
        const sqliteUnits = queryAll<{ c: number }>(sqliteFallbackDb, 'SELECT COUNT(*) AS c FROM units')[0]?.c ?? 0;
        if (sqliteUnits > 0) {
          await this.importFromSqlite(sqliteFallbackDb);
        } else {
          await this.seedFreshDatabase();
        }
      } else {
        await this.seedFreshDatabase();
      }
    } else {
      await this.migrateCurriculumIfNeeded();
    }

    // Ensure all streak/milestone badges exist
    for (const b of SEED_BADGES) {
      const existing = await this.db.collection('badges').findOne({ code: b.code });
      if (!existing) {
        const id = await this.nextSeq('badges');
        await this.db.collection('badges').insertOne({
          id,
          code: b.code,
          title: b.title,
          description: b.description,
          icon_name: b.icon_name,
          requirement_text: b.requirement_text,
        });
      }
    }

    // Ensure Admin account exists & sync env overrides if set
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@dbmsarena.edu').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@1234';
    const existingAdmin = await this.db
      .collection<StudentFullRow>('students')
      .findOne({ role: 'admin' }, { projection: { _id: 0 } });

    if (!existingAdmin) {
      const id = await this.nextSeq('students');
      const now = new Date().toISOString();
      await this.db.collection('students').insertOne({
        id,
        name: 'Arena Administrator',
        username: 'arena_admin',
        email: adminEmail,
        email_lower: adminEmail,
        username_lower: 'arena_admin',
        password_hash: hashSeedPassword(adminPassword),
        avatar_seed: 'admin',
        xp: 0,
        hearts: 5,
        max_hearts: 5,
        gems: 0,
        streak_days: 0,
        longest_streak: 0,
        last_active_date: '',
        league: 'Bronze',
        weekly_xp: 0,
        role: 'admin',
        is_primary: 0,
        is_demo: 0,
        timezone: 'Asia/Kolkata',
        streak_history_json: '[]',
        streak_updated_at: null,
        sql_solved_count: 0,
        created_at: now,
      });
    } else if (process.env.ADMIN_PASSWORD) {
      await this.db.collection('students').updateOne(
        { id: existingAdmin.id },
        {
          $set: {
            email: adminEmail,
            email_lower: adminEmail,
            password_hash: hashSeedPassword(adminPassword),
          },
        }
      );
    }
  }

  private async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.db.collection('units').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('units').createIndex({ unit_number: 1 }, { unique: true }),
      this.db.collection('concepts').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('concepts').createIndex({ unit_id: 1, order_index: 1 }),
      this.db.collection('questions').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('questions').createIndex({ concept_id: 1, is_unit_assessment: 1 }),
      this.db.collection('questions').createIndex({ unit_id: 1, is_unit_assessment: 1 }),
      this.db.collection('badges').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('badges').createIndex({ code: 1 }, { unique: true }),
      this.db.collection('students').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('students').createIndex(
        { email_lower: 1 },
        { unique: true, partialFilterExpression: { email_lower: { $type: 'string', $gt: '' } } }
      ),
      this.db.collection('students').createIndex(
        { username_lower: 1 },
        { unique: true, partialFilterExpression: { username_lower: { $type: 'string', $gt: '' } } }
      ),
      this.db.collection('sessions').createIndex({ token: 1 }, { unique: true }),
      this.db.collection('sessions').createIndex({ student_id: 1 }),
      this.db.collection('password_resets').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('password_resets').createIndex({ student_id: 1, reset_code: 1 }),
      this.db
        .collection('student_concept_progress')
        .createIndex({ student_id: 1, concept_id: 1 }, { unique: true }),
      this.db
        .collection('student_unit_progress')
        .createIndex({ student_id: 1, unit_id: 1 }, { unique: true }),
      this.db
        .collection('student_badges')
        .createIndex({ student_id: 1, badge_id: 1 }, { unique: true }),
      this.db.collection('daily_missions').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('daily_missions').createIndex({ student_id: 1, mission_date: 1 }),
      this.db.collection('xp_transactions').createIndex({ id: 1 }, { unique: true }),
      this.db
        .collection('xp_transactions')
        .createIndex({ student_id: 1, local_date: 1, created_at: 1 }),
      this.db
        .collection('xp_transactions')
        .createIndex({ student_id: 1, source_type: 1, source_ref_id: 1 }),
      this.db.collection('quiz_attempts').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('quiz_attempts').createIndex({ student_id: 1, created_at: 1 }),
      this.db.collection('sql_submissions').createIndex({ id: 1 }, { unique: true }),
      this.db
        .collection('sql_submissions')
        .createIndex({ student_id: 1, passed: 1, challenge_key: 1 }),
      this.db.collection('daily_streaks').createIndex({ user_id: 1 }, { unique: true }),
      this.db
        .collection('ai_explanation_cache')
        .createIndex({ concept_id: 1, style: 1 }, { unique: true }),
      this.db.collection('curriculum_meta').createIndex({ key: 1 }, { unique: true }),
    ]);
  }

  private async importFromSqlite(sqlDb: SqlJsDatabase): Promise<void> {
    const simpleTables = [
      'curriculum_meta',
      'migration_audit_log',
      'units',
      'concepts',
      'questions',
      'badges',
      'sessions',
      'password_resets',
      'student_concept_progress',
      'student_unit_progress',
      'daily_missions',
      'student_badges',
      'xp_transactions',
      'quiz_attempts',
      'sql_submissions',
      'daily_streaks',
      'ai_explanation_cache',
    ];

    const students = queryAll<StudentFullRow>(sqlDb, 'SELECT * FROM students');
    if (students.length > 0) {
      const docs = students.map((s) => ({
        ...s,
        email_lower: s.email ? s.email.trim().toLowerCase() : null,
        username_lower: s.username ? s.username.trim().toLowerCase() : null,
      }));
      await this.db.collection('students').insertMany(docs);
      const maxId = Math.max(...students.map((s) => Number(s.id) || 0));
      await this.setCounterAtLeast('students', maxId);
    }

    for (const table of simpleTables) {
      const rows = queryAll<Record<string, unknown>>(sqlDb, `SELECT * FROM ${table}`);
      if (rows.length > 0) {
        await this.db.collection(table).insertMany(rows);
        if ('id' in rows[0]) {
          const maxId = Math.max(...rows.map((r) => Number(r.id) || 0));
          await this.setCounterAtLeast(table, maxId);
        }
      }
    }
  }

  private async insertOfficialCurriculum(): Promise<{
    unitIdMap: Map<number, number>;
    conceptIdMap: Map<string, number>;
  }> {
    const unitIdMap = new Map<number, number>();
    const unitDocs: UnitRow[] = [];
    for (const u of SEED_UNITS) {
      const id = await this.nextSeq('units');
      unitIdMap.set(u.unit_number, id);
      unitDocs.push({
        id,
        unit_number: u.unit_number,
        title: u.title,
        subtitle: u.subtitle,
        description: u.description,
        accent_color: u.accent_color,
        estimated_hours: u.estimated_hours,
        unlock_xp_bonus: u.unlock_xp_bonus,
      });
    }
    if (unitDocs.length > 0) await this.db.collection('units').insertMany(unitDocs);

    const conceptIdMap = new Map<string, number>();
    const conceptDocs: ConceptRow[] = [];
    for (const c of SEED_CONCEPTS) {
      const unitId = unitIdMap.get(c.unit_number)!;
      const id = await this.nextSeq('concepts');
      conceptIdMap.set(`${c.unit_number}:${c.order_index}`, id);
      conceptDocs.push({
        id,
        unit_id: unitId,
        order_index: c.order_index,
        topic_tag: c.topic_tag,
        title: c.title,
        summary: c.summary,
        duration_minutes: c.duration_minutes,
        xp_reward: c.xp_reward,
        gem_reward: c.gem_reward,
        definition_text: c.definition_text,
        example_text: c.example_text,
        diagram_type: c.diagram_type,
        diagram_config_json: JSON.stringify(c.diagram_config),
        practical_sql: c.practical_sql,
        practical_explanation: c.practical_explanation,
        lesson_content_json: JSON.stringify(c.lesson_content),
        is_published: 1,
        ai_approved: 1,
      });
    }
    if (conceptDocs.length > 0) await this.db.collection('concepts').insertMany(conceptDocs);

    const questionDocs: QuestionRow[] = [];
    for (const q of SEED_QUESTIONS) {
      const unitId = unitIdMap.get(q.unit_number)!;
      const conceptId =
        q.concept_order_index !== null
          ? conceptIdMap.get(`${q.unit_number}:${q.concept_order_index}`) ?? null
          : null;
      const id = await this.nextSeq('questions');
      questionDocs.push({
        id,
        unit_id: unitId,
        concept_id: conceptId,
        is_unit_assessment: q.is_unit_assessment ? 1 : 0,
        question_type: q.question_type,
        prompt: q.prompt,
        payload_json: JSON.stringify(q.payload),
        explanation: q.explanation,
        xp_value: q.xp_value,
      });
    }
    if (questionDocs.length > 0) await this.db.collection('questions').insertMany(questionDocs);

    return { unitIdMap, conceptIdMap };
  }

  private async seedFreshDatabase(): Promise<void> {
    await this.insertOfficialCurriculum();

    for (const b of SEED_BADGES) {
      const id = await this.nextSeq('badges');
      await this.db.collection('badges').insertOne({
        id,
        code: b.code,
        title: b.title,
        description: b.description,
        icon_name: b.icon_name,
        requirement_text: b.requirement_text,
      });
    }

    await this.db.collection('curriculum_meta').updateOne(
      { key: 'curriculum_version' },
      {
        $set: {
          key: 'curriculum_version',
          value: CURRICULUM_VERSION,
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true }
    );
  }

  private async migrateCurriculumIfNeeded(): Promise<void> {
    const meta = await this.db
      .collection<{ key: string; value: string }>('curriculum_meta')
      .findOne({ key: 'curriculum_version' });
    if (meta?.value === CURRICULUM_VERSION) return;

    const existingUnits = await this.db.collection('units').countDocuments();
    if (existingUnits === 0) {
      await this.seedFreshDatabase();
      return;
    }

    const logId = await this.nextSeq('migration_audit_log');
    await this.db.collection('migration_audit_log').insertOne({
      id: logId,
      old_version: meta?.value ?? 'v1_initial_seed',
      new_version: CURRICULUM_VERSION,
      completed_snapshot_json: '[]',
      note: 'Updated official DBMS Arena curriculum in MongoDB while preserving student accounts and activity.',
      migrated_at: new Date().toISOString(),
    });

    await Promise.all([
      this.db.collection('ai_explanation_cache').deleteMany({}),
      this.db.collection('student_concept_progress').deleteMany({}),
      this.db.collection('student_unit_progress').deleteMany({}),
      this.db.collection('questions').deleteMany({}),
      this.db.collection('concepts').deleteMany({}),
      this.db.collection('units').deleteMany({}),
    ]);

    await this.insertOfficialCurriculum();
    await this.db.collection('curriculum_meta').updateOne(
      { key: 'curriculum_version' },
      {
        $set: {
          key: 'curriculum_version',
          value: CURRICULUM_VERSION,
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true }
    );
  }

  // ---------------- CURRICULUM ----------------
  async getUnits(): Promise<UnitRow[]> {
    return this.db
      .collection<UnitRow>('units')
      .find({}, { projection: { _id: 0 } })
      .sort({ unit_number: 1 })
      .toArray();
  }

  async getUnitById(id: number): Promise<UnitRow | null> {
    return this.db.collection<UnitRow>('units').findOne({ id }, { projection: { _id: 0 } });
  }

  async getNextUnit(unitNumber: number): Promise<UnitRow | null> {
    return this.db
      .collection<UnitRow>('units')
      .find({ unit_number: { $gt: unitNumber } }, { projection: { _id: 0 } })
      .sort({ unit_number: 1 })
      .limit(1)
      .next();
  }

  async createUnit(input: Omit<UnitRow, 'id'>): Promise<number> {
    const id = await this.nextSeq('units');
    await this.db.collection<UnitRow>('units').insertOne({ id, ...input });
    return id;
  }

  async updateUnit(
    id: number,
    input: Pick<UnitRow, 'title' | 'subtitle' | 'description' | 'accent_color' | 'estimated_hours'>
  ): Promise<void> {
    await this.db.collection('units').updateOne({ id }, { $set: input });
  }

  async getConcepts(opts?: { publishedOnly?: boolean }): Promise<ConceptRow[]> {
    const filter = opts?.publishedOnly ? { is_published: 1 } : {};
    return this.db
      .collection<ConceptRow>('concepts')
      .find(filter, { projection: { _id: 0 } })
      .sort({ unit_id: 1, order_index: 1 })
      .toArray();
  }

  async getConceptsWithAdminMeta(): Promise<
    (ConceptRow & { unit_title: string; unit_number: number; question_count: number })[]
  > {
    const [units, concepts, questionAgg] = await Promise.all([
      this.getUnits(),
      this.getConcepts(),
      this.db
        .collection('questions')
        .aggregate<{ _id: number | null; count: number }>([
          { $match: { concept_id: { $ne: null } } },
          { $group: { _id: '$concept_id', count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const unitMap = new Map(units.map((u) => [u.id, u]));
    const qCountMap = new Map(
      questionAgg.filter((q) => q._id !== null).map((q) => [Number(q._id), q.count])
    );

    const enriched = concepts.map((c) => {
      const u = unitMap.get(c.unit_id);
      return {
        ...c,
        unit_title: u?.title ?? 'Unit',
        unit_number: u?.unit_number ?? 99,
        question_count: qCountMap.get(c.id) ?? 0,
      };
    });

    enriched.sort((a, b) =>
      a.unit_number !== b.unit_number
        ? a.unit_number - b.unit_number
        : a.order_index - b.order_index
    );
    return enriched;
  }

  async getConceptById(id: number): Promise<(ConceptRow & { unit_title: string }) | null> {
    const c = await this.db
      .collection<ConceptRow>('concepts')
      .findOne({ id }, { projection: { _id: 0 } });
    if (!c) return null;
    const u = await this.getUnitById(c.unit_id);
    return { ...c, unit_title: u?.title ?? '' };
  }

  async getNextConceptInUnit(unitId: number, orderIndex: number): Promise<ConceptRow | null> {
    return this.db
      .collection<ConceptRow>('concepts')
      .find(
        { unit_id: unitId, order_index: { $gt: orderIndex }, is_published: 1 },
        { projection: { _id: 0 } }
      )
      .sort({ order_index: 1 })
      .limit(1)
      .next();
  }

  async getFirstPublishedConceptInUnit(unitId: number): Promise<ConceptRow | null> {
    return this.db
      .collection<ConceptRow>('concepts')
      .find({ unit_id: unitId, is_published: 1 }, { projection: { _id: 0 } })
      .sort({ order_index: 1 })
      .limit(1)
      .next();
  }

  async createConcept(input: Omit<ConceptRow, 'id'>): Promise<number> {
    const id = await this.nextSeq('concepts');
    await this.db.collection<ConceptRow>('concepts').insertOne({ id, ...input });
    return id;
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
    const updateDoc: Record<string, unknown> = {
      title: input.title,
      topic_tag: input.topic_tag,
      summary: input.summary,
      duration_minutes: input.duration_minutes,
      xp_reward: input.xp_reward,
      definition_text: input.definition_text,
      example_text: input.example_text,
      practical_sql: input.practical_sql,
    };
    if (input.lesson_content_json !== null) {
      updateDoc.lesson_content_json = input.lesson_content_json;
    }
    await this.db.collection('concepts').updateOne({ id }, { $set: updateDoc });
  }

  async reorderConcept(conceptId: number, direction: 'up' | 'down'): Promise<void> {
    const target = await this.db
      .collection<ConceptRow>('concepts')
      .findOne({ id: conceptId }, { projection: { _id: 0 } });
    if (!target) throw new Error('Concept not found');

    const neighbor =
      direction === 'up'
        ? await this.db
            .collection<ConceptRow>('concepts')
            .find(
              { unit_id: target.unit_id, order_index: { $lt: target.order_index } },
              { projection: { _id: 0 } }
            )
            .sort({ order_index: -1 })
            .limit(1)
            .next()
        : await this.db
            .collection<ConceptRow>('concepts')
            .find(
              { unit_id: target.unit_id, order_index: { $gt: target.order_index } },
              { projection: { _id: 0 } }
            )
            .sort({ order_index: 1 })
            .limit(1)
            .next();

    if (neighbor) {
      await Promise.all([
        this.db
          .collection('concepts')
          .updateOne({ id: target.id }, { $set: { order_index: neighbor.order_index } }),
        this.db
          .collection('concepts')
          .updateOne({ id: neighbor.id }, { $set: { order_index: target.order_index } }),
      ]);
    }
  }

  async setConceptPublished(conceptId: number, isPublished: boolean): Promise<void> {
    await this.db
      .collection('concepts')
      .updateOne({ id: conceptId }, { $set: { is_published: isPublished ? 1 : 0 } });
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
    const setDoc: Record<string, unknown> = {
      lesson_content_json: input.lesson_content_json,
      ai_approved: 1,
    };
    if (input.definition_text !== null) setDoc.definition_text = input.definition_text;
    if (input.practical_sql !== null) setDoc.practical_sql = input.practical_sql;
    if (input.is_published !== null) setDoc.is_published = input.is_published;

    await this.db.collection('concepts').updateOne({ id: conceptId }, { $set: setDoc });
  }

  async deleteConcept(conceptId: number): Promise<void> {
    await Promise.all([
      this.db.collection('concepts').deleteOne({ id: conceptId }),
      this.db.collection('questions').deleteMany({ concept_id: conceptId }),
      this.db.collection('student_concept_progress').deleteMany({ concept_id: conceptId }),
    ]);
  }

  // ---------------- QUESTIONS ----------------
  async getQuestionsForConcept(conceptId: number): Promise<QuestionRow[]> {
    return this.db
      .collection<QuestionRow>('questions')
      .find({ concept_id: conceptId, is_unit_assessment: 0 }, { projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray();
  }

  async getUnitAssessmentQuestions(unitId: number): Promise<QuestionRow[]> {
    return this.db
      .collection<QuestionRow>('questions')
      .find({ unit_id: unitId, is_unit_assessment: 1 }, { projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray();
  }

  async getAllQuestionsWithContext(): Promise<QuestionWithContextRow[]> {
    const [questions, units, concepts] = await Promise.all([
      this.db
        .collection<QuestionRow>('questions')
        .find({}, { projection: { _id: 0 } })
        .sort({ id: -1 })
        .toArray(),
      this.getUnits(),
      this.getConcepts(),
    ]);
    const uMap = new Map(units.map((u) => [u.id, u.unit_number]));
    const cMap = new Map(concepts.map((c) => [c.id, c.title]));
    return questions.map((q) => ({
      ...q,
      unit_number: uMap.get(q.unit_id) ?? 1,
      concept_title: q.concept_id ? cMap.get(q.concept_id) ?? null : null,
    }));
  }

  async createQuestion(input: Omit<QuestionRow, 'id'>): Promise<number> {
    const id = await this.nextSeq('questions');
    await this.db.collection<QuestionRow>('questions').insertOne({ id, ...input });
    return id;
  }

  async deleteQuestion(questionId: number): Promise<void> {
    await this.db.collection('questions').deleteOne({ id: questionId });
  }

  // ---------------- BADGES & MIGRATIONS ----------------
  async getBadges(): Promise<BadgeRow[]> {
    return this.db
      .collection<BadgeRow>('badges')
      .find({}, { projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray();
  }

  async getStudentBadges(studentId: number): Promise<StudentBadgeJoinRow[]> {
    const [badges, earned] = await Promise.all([
      this.getBadges(),
      this.db
        .collection<{ student_id: number; badge_id: number; earned_at: string }>('student_badges')
        .find({ student_id: studentId }, { projection: { _id: 0 } })
        .toArray(),
    ]);
    const earnedMap = new Map(earned.map((e) => [e.badge_id, e.earned_at]));
    return badges.map((b) => ({
      ...b,
      earned_at: earnedMap.get(b.id) ?? null,
      earned: earnedMap.has(b.id) ? 1 : 0,
    }));
  }

  async awardBadgeByCode(studentId: number, badgeCode: string): Promise<boolean> {
    const badge = await this.db
      .collection<BadgeRow>('badges')
      .findOne({ code: badgeCode }, { projection: { _id: 0 } });
    if (!badge) return false;
    const existing = await this.db
      .collection('student_badges')
      .findOne({ student_id: studentId, badge_id: badge.id });
    if (existing) return false;
    await this.db.collection('student_badges').insertOne({
      student_id: studentId,
      badge_id: badge.id,
      earned_at: new Date().toISOString(),
    });
    return true;
  }

  async getMigrationLogs(limit = 5): Promise<MigrationAuditRow[]> {
    return this.db
      .collection<MigrationAuditRow>('migration_audit_log')
      .find({}, { projection: { _id: 0 } })
      .sort({ id: -1 })
      .limit(limit)
      .toArray();
  }

  // ---------------- STUDENTS & AUTH ----------------
  async getStudentById(id: number): Promise<StudentFullRow | null> {
    return this.db
      .collection<StudentFullRow>('students')
      .findOne({ id }, { projection: { _id: 0, email_lower: 0, username_lower: 0 } });
  }

  async getStudentByEmail(email: string): Promise<StudentFullRow | null> {
    const lower = email.trim().toLowerCase();
    return this.db
      .collection<StudentFullRow>('students')
      .findOne(
        {
          $or: [
            { email_lower: lower },
            { email: { $regex: `^${escapeRegex(lower)}$`, $options: 'i' } },
          ],
        },
        { projection: { _id: 0, email_lower: 0, username_lower: 0 } }
      );
  }

  async getStudentByUsername(username: string): Promise<StudentFullRow | null> {
    const lower = username.trim().toLowerCase();
    return this.db
      .collection<StudentFullRow>('students')
      .findOne(
        {
          $or: [
            { username_lower: lower },
            { username: { $regex: `^${escapeRegex(lower)}$`, $options: 'i' } },
          ],
        },
        { projection: { _id: 0, email_lower: 0, username_lower: 0 } }
      );
  }

  async getAllStudentsForAdmin(): Promise<StudentFullRow[]> {
    return this.db
      .collection<StudentFullRow>('students')
      .find({}, { projection: { _id: 0, email_lower: 0, username_lower: 0 } })
      .sort({ is_demo: 1, xp: -1 })
      .toArray();
  }

  async createStudent(input: Omit<StudentFullRow, 'id'>): Promise<number> {
    const id = await this.nextSeq('students');
    await this.db.collection('students').insertOne({
      id,
      ...input,
      email_lower: input.email ? input.email.trim().toLowerCase() : null,
      username_lower: input.username ? input.username.trim().toLowerCase() : null,
    });
    return id;
  }

  async updateStudentFields(id: number, fields: Partial<StudentFullRow>): Promise<void> {
    const setDoc: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'id' || v === undefined) continue;
      setDoc[k] = v;
    }
    if (typeof fields.email === 'string') {
      setDoc.email_lower = fields.email.trim().toLowerCase();
    }
    if (typeof fields.username === 'string') {
      setDoc.username_lower = fields.username.trim().toLowerCase();
    }
    if (Object.keys(setDoc).length === 0) return;
    await this.db.collection('students').updateOne({ id }, { $set: setDoc });
  }

  async incrementStudentSqlSolved(id: number): Promise<void> {
    await this.db.collection('students').updateOne({ id }, { $inc: { sql_solved_count: 1 } });
  }

  async deleteStudentCascade(targetId: number): Promise<void> {
    await Promise.all([
      this.db.collection('sessions').deleteMany({ student_id: targetId }),
      this.db.collection('password_resets').deleteMany({ student_id: targetId }),
      this.db.collection('xp_transactions').deleteMany({ student_id: targetId }),
      this.db.collection('quiz_attempts').deleteMany({ student_id: targetId }),
      this.db.collection('sql_submissions').deleteMany({ student_id: targetId }),
      this.db.collection('daily_streaks').deleteMany({ user_id: targetId }),
      this.db.collection('student_badges').deleteMany({ student_id: targetId }),
      this.db.collection('daily_missions').deleteMany({ student_id: targetId }),
      this.db.collection('student_concept_progress').deleteMany({ student_id: targetId }),
      this.db.collection('student_unit_progress').deleteMany({ student_id: targetId }),
      this.db.collection('students').deleteOne({ id: targetId }),
    ]);
  }

  async createSession(session: SessionRow): Promise<void> {
    await this.db.collection<SessionRow>('sessions').insertOne({ ...session });
  }

  async getSessionByToken(token: string): Promise<SessionRow | null> {
    return this.db
      .collection<SessionRow>('sessions')
      .findOne({ token }, { projection: { _id: 0 } });
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.collection('sessions').deleteOne({ token });
  }

  async createPasswordReset(input: Omit<PasswordResetRow, 'id'>): Promise<number> {
    const id = await this.nextSeq('password_resets');
    await this.db.collection<PasswordResetRow>('password_resets').insertOne({ id, ...input });
    return id;
  }

  async getLatestValidPasswordReset(
    studentId: number,
    code: string
  ): Promise<PasswordResetRow | null> {
    return this.db
      .collection<PasswordResetRow>('password_resets')
      .find({ student_id: studentId, reset_code: code, used: 0 }, { projection: { _id: 0 } })
      .sort({ id: -1 })
      .limit(1)
      .next();
  }

  async markPasswordResetUsed(id: number): Promise<void> {
    await this.db.collection('password_resets').updateOne({ id }, { $set: { used: 1 } });
  }

  // ---------------- LEARNING PATH PROGRESS ----------------
  async initializeStudentPathProgress(studentId: number): Promise<void> {
    const [units, concepts] = await Promise.all([this.getUnits(), this.getConcepts()]);
    const unit1Id = units.find((u) => u.unit_number === 1)?.id;

    if (units.length > 0) {
      await this.db.collection('student_unit_progress').bulkWrite(
        units.map((u) => ({
          updateOne: {
            filter: { student_id: studentId, unit_id: u.id },
            update: {
              $setOnInsert: {
                student_id: studentId,
                unit_id: u.id,
                status: u.unit_number === 1 ? 'unlocked' : 'locked',
                assessment_score: null,
                completed_at: null,
              },
            },
            upsert: true,
          },
        }))
      );
    }

    const unitNumberMap = new Map(units.map((u) => [u.id, u.unit_number]));
    const sortedConcepts = [...concepts].sort((a, b) => {
      const ua = unitNumberMap.get(a.unit_id) ?? 99;
      const ub = unitNumberMap.get(b.unit_id) ?? 99;
      return ua !== ub ? ua - ub : a.order_index - b.order_index;
    });

    let firstUnit1Unlocked = false;
    if (sortedConcepts.length > 0) {
      await this.db.collection('student_concept_progress').bulkWrite(
        sortedConcepts.map((c) => {
          let status = 'locked';
          if (c.unit_id === unit1Id && !firstUnit1Unlocked) {
            status = 'unlocked';
            firstUnit1Unlocked = true;
          }
          return {
            updateOne: {
              filter: { student_id: studentId, concept_id: c.id },
              update: {
                $setOnInsert: {
                  student_id: studentId,
                  concept_id: c.id,
                  status,
                  best_score: null,
                  attempts: 0,
                  completed_at: null,
                },
              },
              upsert: true,
            },
          };
        })
      );
    }
  }

  async resetStudentPathProgress(studentId: number): Promise<void> {
    await Promise.all([
      this.db.collection('student_unit_progress').deleteMany({ student_id: studentId }),
      this.db.collection('student_concept_progress').deleteMany({ student_id: studentId }),
    ]);
    await this.initializeStudentPathProgress(studentId);
  }

  async unlockAllForStudent(studentId: number): Promise<void> {
    const [units, concepts] = await Promise.all([this.getUnits(), this.getConcepts()]);
    for (const u of units) {
      await this.upsertStudentUnitProgress(studentId, u.id, { statusIfNotCompleted: 'unlocked' });
    }
    for (const c of concepts) {
      await this.upsertStudentConceptProgress(studentId, c.id, { statusIfNotCompleted: 'unlocked' });
    }
  }

  async getStudentUnitProgress(studentId: number): Promise<StudentUnitProgressRow[]> {
    return this.db
      .collection<StudentUnitProgressRow>('student_unit_progress')
      .find({ student_id: studentId }, { projection: { _id: 0 } })
      .toArray();
  }

  async getOneStudentUnitProgress(
    studentId: number,
    unitId: number
  ): Promise<StudentUnitProgressRow | null> {
    return this.db
      .collection<StudentUnitProgressRow>('student_unit_progress')
      .findOne({ student_id: studentId, unit_id: unitId }, { projection: { _id: 0 } });
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
      await this.db.collection('student_unit_progress').insertOne({
        student_id: studentId,
        unit_id: unitId,
        status: input.status ?? input.statusIfNotCompleted ?? 'locked',
        assessment_score: input.assessment_score ?? null,
        completed_at: input.completed_at ?? null,
      });
      return;
    }

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

    await this.db.collection('student_unit_progress').updateOne(
      { student_id: studentId, unit_id: unitId },
      {
        $set: {
          status: nextStatus,
          assessment_score: nextScore,
          completed_at: nextCompleted,
        },
      }
    );
  }

  async getStudentConceptProgress(studentId: number): Promise<StudentConceptProgressRow[]> {
    return this.db
      .collection<StudentConceptProgressRow>('student_concept_progress')
      .find({ student_id: studentId }, { projection: { _id: 0 } })
      .toArray();
  }

  async getOneStudentConceptProgress(
    studentId: number,
    conceptId: number
  ): Promise<StudentConceptProgressRow | null> {
    return this.db
      .collection<StudentConceptProgressRow>('student_concept_progress')
      .findOne({ student_id: studentId, concept_id: conceptId }, { projection: { _id: 0 } });
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
      await this.db.collection('student_concept_progress').insertOne({
        student_id: studentId,
        concept_id: conceptId,
        status: input.status ?? input.statusIfNotCompleted ?? 'locked',
        best_score: input.best_score ?? null,
        attempts: input.attempts ?? 0,
        completed_at: input.completed_at ?? null,
      });
      return;
    }

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

    await this.db.collection('student_concept_progress').updateOne(
      { student_id: studentId, concept_id: conceptId },
      {
        $set: {
          status: nextStatus,
          best_score: nextBest,
          attempts: nextAttempts,
          completed_at: nextCompleted,
        },
      }
    );
  }

  async countIncompleteConceptsInUnit(studentId: number, unitId: number): Promise<number> {
    const [unitConcepts, prog] = await Promise.all([
      this.db
        .collection<{ id: number }>('concepts')
        .find({ unit_id: unitId, is_published: 1 }, { projection: { id: 1, _id: 0 } })
        .toArray(),
      this.getStudentConceptProgress(studentId),
    ]);
    const completedIds = new Set(
      prog.filter((p) => p.status === 'completed').map((p) => p.concept_id)
    );
    return unitConcepts.filter((c) => !completedIds.has(c.id)).length;
  }

  async countCompletedPublishedConcepts(studentId: number): Promise<number> {
    const [publishedConcepts, prog] = await Promise.all([
      this.db
        .collection<{ id: number }>('concepts')
        .find({ is_published: 1 }, { projection: { id: 1, _id: 0 } })
        .toArray(),
      this.db
        .collection<StudentConceptProgressRow>('student_concept_progress')
        .find({ student_id: studentId, status: 'completed' }, { projection: { concept_id: 1, _id: 0 } })
        .toArray(),
    ]);
    const pubSet = new Set(publishedConcepts.map((c) => c.id));
    return prog.filter((p) => pubSet.has(p.concept_id)).length;
  }

  async countPublishedConcepts(): Promise<number> {
    const c = await this.db.collection('concepts').countDocuments({ is_published: 1 });
    return c || 87;
  }

  async countCompletedUnits(studentId: number): Promise<number> {
    return this.db
      .collection('student_unit_progress')
      .countDocuments({ student_id: studentId, status: 'completed' });
  }

  async countUnits(): Promise<number> {
    const c = await this.db.collection('units').countDocuments();
    return c || 4;
  }

  // ---------------- DAILY MISSIONS ----------------
  async ensureDailyMissions(studentId: number, missionDate: string): Promise<void> {
    const count = await this.db
      .collection('daily_missions')
      .countDocuments({ student_id: studentId, mission_date: missionDate });
    if (count > 0) return;

    const defs = [
      { key: 'complete_concept', title: 'Pass 1 Concept Assessment', target: 1, xp: 40, gems: 15 },
      { key: 'run_sql', title: 'Run 3 queries in SQL Playground', target: 3, xp: 30, gems: 10 },
      { key: 'ask_tutor', title: 'Ask the AI Tutor 1 question', target: 1, xp: 20, gems: 10 },
    ];
    const docs: DailyMissionRow[] = [];
    for (const d of defs) {
      const id = await this.nextSeq('daily_missions');
      docs.push({
        id,
        student_id: studentId,
        mission_key: d.key,
        title: d.title,
        target_count: d.target,
        current_count: 0,
        xp_reward: d.xp,
        gem_reward: d.gems,
        claimed: 0,
        mission_date: missionDate,
      });
    }
    await this.db.collection<DailyMissionRow>('daily_missions').insertMany(docs);
  }

  async getDailyMissions(studentId: number, missionDate: string): Promise<DailyMissionRow[]> {
    return this.db
      .collection<DailyMissionRow>('daily_missions')
      .find({ student_id: studentId, mission_date: missionDate }, { projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray();
  }

  async getDailyMissionById(
    missionId: number,
    studentId: number
  ): Promise<DailyMissionRow | null> {
    return this.db
      .collection<DailyMissionRow>('daily_missions')
      .findOne({ id: missionId, student_id: studentId }, { projection: { _id: 0 } });
  }

  async incrementDailyMission(
    studentId: number,
    missionKey: string,
    missionDate: string
  ): Promise<{ reachedTargetNow: boolean; currentCount: number }> {
    await this.ensureDailyMissions(studentId, missionDate);
    const before = await this.db
      .collection<DailyMissionRow>('daily_missions')
      .find({ student_id: studentId, mission_key: missionKey, mission_date: missionDate })
      .sort({ id: -1 })
      .limit(1)
      .next();

    if (!before) {
      return { reachedTargetNow: false, currentCount: 0 };
    }

    const nextCount = Math.min(before.target_count, before.current_count + 1);
    await this.db
      .collection('daily_missions')
      .updateMany(
        { student_id: studentId, mission_key: missionKey, mission_date: missionDate },
        { $set: { current_count: nextCount } }
      );

    const reachedTargetNow =
      before.current_count < before.target_count && nextCount >= before.target_count;
    return { reachedTargetNow, currentCount: nextCount };
  }

  async markDailyMissionClaimed(missionId: number): Promise<void> {
    await this.db.collection('daily_missions').updateOne({ id: missionId }, { $set: { claimed: 1 } });
  }

  // ---------------- STREAKS ----------------
  async getDailyStreak(studentId: number): Promise<DailyStreakRow | null> {
    return this.db
      .collection<DailyStreakRow>('daily_streaks')
      .findOne({ user_id: studentId }, { projection: { _id: 0 } });
  }

  async upsertDailyStreak(row: DailyStreakRow): Promise<void> {
    await this.db
      .collection<DailyStreakRow>('daily_streaks')
      .updateOne({ user_id: row.user_id }, { $set: { ...row } }, { upsert: true });
  }

  async updateDailyStreakTimezone(studentId: number, timezone: string): Promise<void> {
    await this.db
      .collection('daily_streaks')
      .updateOne({ user_id: studentId }, { $set: { timezone } });
  }

  // ---------------- XP, QUIZ & SQL ----------------
  async hasXpTransaction(
    studentId: number,
    sourceType: string,
    sourceRefId: string,
    localDate?: string
  ): Promise<boolean> {
    const filter: Record<string, unknown> = {
      student_id: studentId,
      source_type: sourceType,
      source_ref_id: sourceRefId,
    };
    if (localDate) filter.local_date = localDate;
    const doc = await this.db.collection('xp_transactions').findOne(filter);
    return Boolean(doc);
  }

  async insertXpTransaction(input: Omit<XpTransactionRow, 'id'>): Promise<number> {
    const id = await this.nextSeq('xp_transactions');
    await this.db.collection<XpTransactionRow>('xp_transactions').insertOne({ id, ...input });
    return id;
  }

  async sumStudentXpSince(studentId: number, sinceLocalDate: string): Promise<number> {
    const rows = await this.db
      .collection('xp_transactions')
      .aggregate<{ total: number }>([
        { $match: { student_id: studentId, local_date: { $gte: sinceLocalDate } } },
        { $group: { _id: null, total: { $sum: '$xp_amount' } } },
      ])
      .toArray();
    return rows[0]?.total ?? 0;
  }

  async getRecentXpTransactions(studentId: number, limit: number): Promise<XpTransactionRow[]> {
    return this.db
      .collection<XpTransactionRow>('xp_transactions')
      .find({ student_id: studentId }, { projection: { _id: 0 } })
      .sort({ id: -1 })
      .limit(limit)
      .toArray();
  }

  async insertQuizAttempt(input: Omit<QuizAttemptRow, 'id'>): Promise<number> {
    const id = await this.nextSeq('quiz_attempts');
    await this.db.collection<QuizAttemptRow>('quiz_attempts').insertOne({ id, ...input });
    return id;
  }

  async getStudentQuizStats(studentId: number): Promise<{ avgAcc: number; totalAttempts: number }> {
    const rows = await this.db
      .collection('quiz_attempts')
      .aggregate<{ avg: number; count: number }>([
        { $match: { student_id: studentId } },
        { $group: { _id: null, avg: { $avg: '$score' }, count: { $sum: 1 } } },
      ])
      .toArray();
    const row = rows[0];
    return {
      avgAcc: row ? Math.round(row.avg * 10) / 10 : 0,
      totalAttempts: row?.count ?? 0,
    };
  }

  async hasSolvedSqlChallenge(studentId: number, challengeKey: string): Promise<boolean> {
    const doc = await this.db
      .collection('sql_submissions')
      .findOne({ student_id: studentId, challenge_key: challengeKey, passed: 1 });
    return Boolean(doc);
  }

  async insertSqlSubmission(input: Omit<SqlSubmissionRow, 'id'>): Promise<number> {
    const id = await this.nextSeq('sql_submissions');
    await this.db.collection<SqlSubmissionRow>('sql_submissions').insertOne({ id, ...input });
    return id;
  }

  async countDistinctSolvedSql(studentId: number): Promise<number> {
    const rows = await this.db
      .collection('sql_submissions')
      .aggregate<{ count: number }>([
        { $match: { student_id: studentId, passed: 1 } },
        { $group: { _id: { $ifNull: ['$challenge_key', '$sql_text'] } } },
        { $count: 'count' },
      ])
      .toArray();
    return rows[0]?.count ?? 0;
  }

  async getLeaderboardAggregateData(
    sinceLocalDate: string | null,
    isDailyExact: boolean,
    weekStart: string
  ): Promise<LeaderboardAggregateData> {
    const [totalConcepts, totalUnits, students, publishedConcepts] = await Promise.all([
      this.countPublishedConcepts(),
      this.countUnits(),
      this.db
        .collection<StudentFullRow>('students')
        .find(
          { role: 'student', is_demo: 0 },
          { projection: { _id: 0, email_lower: 0, username_lower: 0 } }
        )
        .toArray(),
      this.db
        .collection<{ id: number }>('concepts')
        .find({ is_published: 1 }, { projection: { id: 1, _id: 0 } })
        .toArray(),
    ]);

    const periodMatch: Record<string, unknown> = {};
    if (sinceLocalDate) {
      periodMatch.local_date = isDailyExact ? sinceLocalDate : { $gte: sinceLocalDate };
    }

    const publishedIds = publishedConcepts.map((c) => c.id);

    const [periodRows, weeklyRows, conceptRows, unitRows, accRows, sqlRows] = await Promise.all([
      this.db
        .collection('xp_transactions')
        .aggregate<{ _id: number; sum_xp: number; achieved_at: string | null }>([
          { $match: periodMatch },
          {
            $group: {
              _id: '$student_id',
              sum_xp: { $sum: '$xp_amount' },
              achieved_at: { $max: '$created_at' },
            },
          },
        ])
        .toArray(),
      this.db
        .collection('xp_transactions')
        .aggregate<{ _id: number; sum_xp: number }>([
          { $match: { local_date: { $gte: weekStart } } },
          { $group: { _id: '$student_id', sum_xp: { $sum: '$xp_amount' } } },
        ])
        .toArray(),
      this.db
        .collection('student_concept_progress')
        .aggregate<{ _id: number; c_count: number }>([
          { $match: { status: 'completed', concept_id: { $in: publishedIds } } },
          { $group: { _id: '$student_id', c_count: { $sum: 1 } } },
        ])
        .toArray(),
      this.db
        .collection('student_unit_progress')
        .aggregate<{ _id: number; u_count: number }>([
          { $match: { status: 'completed' } },
          { $group: { _id: '$student_id', u_count: { $sum: 1 } } },
        ])
        .toArray(),
      this.db
        .collection('quiz_attempts')
        .aggregate<{ _id: number; avg_score: number }>([
          { $group: { _id: '$student_id', avg_score: { $avg: '$score' } } },
        ])
        .toArray(),
      this.db
        .collection('sql_submissions')
        .aggregate<{ _id: { student_id: number; key: string } }>([
          { $match: { passed: 1 } },
          {
            $group: {
              _id: { student_id: '$student_id', key: { $ifNull: ['$challenge_key', '$sql_text'] } },
            },
          },
        ])
        .toArray(),
    ]);

    const sqlMap = new Map<number, number>();
    for (const s of sqlRows) {
      sqlMap.set(s._id.student_id, (sqlMap.get(s._id.student_id) ?? 0) + 1);
    }

    return {
      totalConcepts,
      totalUnits,
      students,
      periodMap: new Map(
        periodRows.map((r) => [r._id, { sum_xp: r.sum_xp, achieved_at: r.achieved_at }])
      ),
      weeklyMap: new Map(weeklyRows.map((r) => [r._id, r.sum_xp])),
      conceptMap: new Map(conceptRows.map((r) => [r._id, r.c_count])),
      unitMap: new Map(unitRows.map((r) => [r._id, r.u_count])),
      accMap: new Map(accRows.map((r) => [r._id, Math.round(r.avg_score * 10) / 10])),
      sqlMap,
    };
  }

  // ---------------- AI CACHE ----------------
  async getAiExplanationCache(conceptId: number, style: string): Promise<string | null> {
    const doc = await this.db
      .collection<{ content_json: string }>('ai_explanation_cache')
      .findOne({ concept_id: conceptId, style });
    return doc?.content_json ?? null;
  }

  async upsertAiExplanationCache(
    conceptId: number,
    style: string,
    contentJson: string
  ): Promise<void> {
    await this.db.collection('ai_explanation_cache').updateOne(
      { concept_id: conceptId, style },
      {
        $set: {
          concept_id: conceptId,
          style,
          content_json: contentJson,
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true }
    );
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
