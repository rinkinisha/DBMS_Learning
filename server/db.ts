import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import {
  CURRICULUM_VERSION,
  PRACTICE_DB_INIT_SQL,
  SEED_BADGES,
  SEED_CONCEPTS,
  SEED_QUESTIONS,
  SEED_UNITS,
} from './seedData.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const APP_DB_PATH = path.join(DATA_DIR, 'dbms_arena.sqlite');

let SQL: SqlJsStatic | null = null;
let appDb: Database | null = null;
let practiceDb: Database | null = null;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function saveAppDb(): void {
  if (!appDb) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const exported = appDb.export();
  fs.writeFileSync(APP_DB_PATH, Buffer.from(exported));
}

export function queryAll<T = Record<string, unknown>>(
  db: Database,
  sql: string,
  params: (string | number | null)[] = []
): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function queryOne<T = Record<string, unknown>>(
  db: Database,
  sql: string,
  params: (string | number | null)[] = []
): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function runStmt(
  db: Database,
  sql: string,
  params: (string | number | null)[] = [],
  persist = true
): number {
  db.run(sql, params);
  const res = db.exec('SELECT last_insert_rowid() AS id');
  const lastId = res?.[0]?.values?.[0]?.[0];
  if (persist && db === appDb) {
    saveAppDb();
  }
  return typeof lastId === 'number' ? lastId : 0;
}

function ensureConceptColumns(db: Database): void {
  const cols = queryAll<{ name: string }>(db, "PRAGMA table_info('concepts')");
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has('topic_tag')) {
    db.run("ALTER TABLE concepts ADD COLUMN topic_tag TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('lesson_content_json')) {
    db.run("ALTER TABLE concepts ADD COLUMN lesson_content_json TEXT NOT NULL DEFAULT '{}'");
  }
  if (!colNames.has('is_published')) {
    db.run('ALTER TABLE concepts ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1');
  }
  if (!colNames.has('ai_approved')) {
    db.run('ALTER TABLE concepts ADD COLUMN ai_approved INTEGER NOT NULL DEFAULT 1');
  }
}

function hashSeedPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function ensureStudentAndActivitySchema(db: Database): void {
  const cols = queryAll<{ name: string }>(db, "PRAGMA table_info('students')");
  const colNames = new Set(cols.map((c) => c.name));

  if (!colNames.has('username')) {
    db.run('ALTER TABLE students ADD COLUMN username TEXT');
  }
  if (!colNames.has('email')) {
    db.run('ALTER TABLE students ADD COLUMN email TEXT');
  }
  if (!colNames.has('password_hash')) {
    db.run('ALTER TABLE students ADD COLUMN password_hash TEXT');
  }
  if (!colNames.has('is_demo')) {
    db.run('ALTER TABLE students ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0');
  }
  if (!colNames.has('timezone')) {
    db.run("ALTER TABLE students ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata'");
  }
  if (!colNames.has('longest_streak')) {
    db.run('ALTER TABLE students ADD COLUMN longest_streak INTEGER NOT NULL DEFAULT 0');
  }
  if (!colNames.has('streak_history_json')) {
    db.run("ALTER TABLE students ADD COLUMN streak_history_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!colNames.has('streak_updated_at')) {
    db.run('ALTER TABLE students ADD COLUMN streak_updated_at TEXT');
  }
  if (!colNames.has('sql_solved_count')) {
    db.run('ALTER TABLE students ADD COLUMN sql_solved_count INTEGER NOT NULL DEFAULT 0');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      student_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      reset_code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS xp_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_ref_id TEXT,
      xp_amount INTEGER NOT NULL,
      gems_amount INTEGER NOT NULL DEFAULT 0,
      local_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      concept_id INTEGER,
      is_unit_assessment INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      xp_awarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sql_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      concept_id INTEGER,
      challenge_key TEXT,
      sql_text TEXT NOT NULL,
      passed INTEGER NOT NULL,
      execution_ms REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_streaks (
      user_id INTEGER PRIMARY KEY,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_activity_date TEXT,
      streak_history_json TEXT NOT NULL DEFAULT '[]',
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email_unique
      ON students(LOWER(email)) WHERE email IS NOT NULL AND email != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username_unique
      ON students(LOWER(username)) WHERE username IS NOT NULL AND username != '';
    CREATE INDEX IF NOT EXISTS idx_sessions_student ON sessions(student_id);
    CREATE INDEX IF NOT EXISTS idx_xp_tx_student_date ON xp_transactions(student_id, local_date, created_at);
    CREATE INDEX IF NOT EXISTS idx_xp_tx_source ON xp_transactions(student_id, source_type, source_ref_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student ON quiz_attempts(student_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sql_submissions_student ON sql_submissions(student_id, passed, challenge_key);
    CREATE INDEX IF NOT EXISTS idx_scp_student_status ON student_concept_progress(student_id, status);
  `);

  // Mark legacy seeded placeholder rows (those without email/password) as demo accounts cleanly without deleting progress
  const legacyRows = queryAll<{
    id: number;
    avatar_seed: string;
    email: string | null;
    username: string | null;
    password_hash: string | null;
    streak_days: number;
    longest_streak: number;
  }>(db, 'SELECT id, avatar_seed, email, username, password_hash, streak_days, longest_streak FROM students');

  for (const r of legacyRows) {
    if (!r.password_hash && !r.email) {
      const demoUsername = r.username || `${r.avatar_seed || 'student'}_demo_${r.id}`;
      const demoEmail = `${demoUsername}@demo.dbmsarena.local`;
      const demoHash = hashSeedPassword('Demo@1234');
      db.run(
        `UPDATE students
         SET is_demo = 1,
             username = ?,
             email = ?,
             password_hash = ?,
             longest_streak = MAX(COALESCE(longest_streak, 0), COALESCE(streak_days, 0))
         WHERE id = ?`,
        [demoUsername, demoEmail, demoHash, r.id]
      );
    }
  }

  // Ensure all streak milestone badges exist
  for (const b of SEED_BADGES) {
    db.run(
      `INSERT OR IGNORE INTO badges (code, title, description, icon_name, requirement_text) VALUES (?, ?, ?, ?, ?)`,
      [b.code, b.title, b.description, b.icon_name, b.requirement_text]
    );
  }

  // Ensure a real Admin account exists (separate from student accounts)
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@dbmsarena.edu').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@1234';
  const adminExists = queryOne<{ id: number }>(
    db,
    "SELECT id FROM students WHERE role = 'admin' LIMIT 1"
  );
  if (!adminExists) {
    const now = new Date().toISOString();
    runStmt(
      db,
      `INSERT INTO students (name, username, email, password_hash, avatar_seed, xp, hearts, max_hearts, gems, streak_days, longest_streak, last_active_date, league, weekly_xp, role, is_primary, is_demo, timezone, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 5, 5, 0, 0, 0, '', 'Bronze', 0, 'admin', 0, 0, 'Asia/Kolkata', ?)`,
      [
        'Arena Administrator',
        'arena_admin',
        adminEmail,
        hashSeedPassword(adminPassword),
        'admin',
        now,
      ],
      false
    );
  } else if (process.env.ADMIN_PASSWORD) {
    db.run('UPDATE students SET email = ?, password_hash = ? WHERE id = ?', [
      adminEmail,
      hashSeedPassword(adminPassword),
      adminExists.id,
    ]);
  }

  saveAppDb();
}

function createAppSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS curriculum_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS migration_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      old_version TEXT NOT NULL,
      new_version TEXT NOT NULL,
      completed_snapshot_json TEXT NOT NULL,
      note TEXT NOT NULL,
      migrated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_number INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      description TEXT NOT NULL,
      accent_color TEXT NOT NULL DEFAULT 'emerald',
      estimated_hours REAL NOT NULL DEFAULT 2,
      unlock_xp_bonus INTEGER NOT NULL DEFAULT 150
    );

    CREATE TABLE IF NOT EXISTS concepts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL,
      order_index INTEGER NOT NULL,
      topic_tag TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 15,
      xp_reward INTEGER NOT NULL DEFAULT 50,
      gem_reward INTEGER NOT NULL DEFAULT 15,
      definition_text TEXT NOT NULL,
      example_text TEXT NOT NULL,
      diagram_type TEXT NOT NULL,
      diagram_config_json TEXT NOT NULL,
      practical_sql TEXT NOT NULL,
      practical_explanation TEXT NOT NULL,
      lesson_content_json TEXT NOT NULL DEFAULT '{}',
      is_published INTEGER NOT NULL DEFAULT 1,
      ai_approved INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL,
      concept_id INTEGER,
      is_unit_assessment INTEGER NOT NULL DEFAULT 0,
      question_type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      explanation TEXT NOT NULL,
      xp_value INTEGER NOT NULL DEFAULT 15,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
      FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar_seed TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      hearts INTEGER NOT NULL DEFAULT 5,
      max_hearts INTEGER NOT NULL DEFAULT 5,
      gems INTEGER NOT NULL DEFAULT 50,
      streak_days INTEGER NOT NULL DEFAULT 1,
      last_active_date TEXT NOT NULL,
      league TEXT NOT NULL DEFAULT 'Bronze',
      weekly_xp INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'student',
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_concept_progress (
      student_id INTEGER NOT NULL,
      concept_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'locked',
      best_score INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      PRIMARY KEY (student_id, concept_id),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_unit_progress (
      student_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'locked',
      assessment_score INTEGER,
      completed_at TEXT,
      PRIMARY KEY (student_id, unit_id),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      mission_key TEXT NOT NULL,
      title TEXT NOT NULL,
      target_count INTEGER NOT NULL,
      current_count INTEGER NOT NULL DEFAULT 0,
      xp_reward INTEGER NOT NULL,
      gem_reward INTEGER NOT NULL,
      claimed INTEGER NOT NULL DEFAULT 0,
      mission_date TEXT NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon_name TEXT NOT NULL,
      requirement_text TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_badges (
      student_id INTEGER NOT NULL,
      badge_id INTEGER NOT NULL,
      earned_at TEXT NOT NULL,
      PRIMARY KEY (student_id, badge_id),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_explanation_cache (
      concept_id INTEGER NOT NULL,
      style TEXT NOT NULL,
      content_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (concept_id, style)
    );
  `);

  ensureConceptColumns(db);
}

function insertOfficialCurriculum(db: Database): {
  unitIdMap: Map<number, number>;
  conceptIdMap: Map<string, number>;
} {
  const unitIdMap = new Map<number, number>();
  for (const u of SEED_UNITS) {
    const uid = runStmt(
      db,
      `INSERT INTO units (unit_number, title, subtitle, description, accent_color, estimated_hours, unlock_xp_bonus)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [u.unit_number, u.title, u.subtitle, u.description, u.accent_color, u.estimated_hours, u.unlock_xp_bonus],
      false
    );
    unitIdMap.set(u.unit_number, uid);
  }

  const conceptIdMap = new Map<string, number>();
  for (const c of SEED_CONCEPTS) {
    const unitId = unitIdMap.get(c.unit_number)!;
    const cid = runStmt(
      db,
      `INSERT INTO concepts (unit_id, order_index, topic_tag, title, summary, duration_minutes, xp_reward, gem_reward, definition_text, example_text, diagram_type, diagram_config_json, practical_sql, practical_explanation, lesson_content_json, is_published, ai_approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
      [
        unitId,
        c.order_index,
        c.topic_tag,
        c.title,
        c.summary,
        c.duration_minutes,
        c.xp_reward,
        c.gem_reward,
        c.definition_text,
        c.example_text,
        c.diagram_type,
        JSON.stringify(c.diagram_config),
        c.practical_sql,
        c.practical_explanation,
        JSON.stringify(c.lesson_content),
      ],
      false
    );
    conceptIdMap.set(`${c.unit_number}:${c.order_index}`, cid);
  }

  for (const q of SEED_QUESTIONS) {
    const unitId = unitIdMap.get(q.unit_number)!;
    const conceptId =
      q.concept_order_index !== null ? conceptIdMap.get(`${q.unit_number}:${q.concept_order_index}`) ?? null : null;
    runStmt(
      db,
      `INSERT INTO questions (unit_id, concept_id, is_unit_assessment, question_type, prompt, payload_json, explanation, xp_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        unitId,
        conceptId,
        q.is_unit_assessment ? 1 : 0,
        q.question_type,
        q.prompt,
        JSON.stringify(q.payload),
        q.explanation,
        q.xp_value,
      ],
      false
    );
  }

  return { unitIdMap, conceptIdMap };
}

export function initializeStudentPathProgressForUser(db: Database, studentId: number): void {
  const units = queryAll<{ id: number; unit_number: number }>(
    db,
    'SELECT id, unit_number FROM units ORDER BY unit_number ASC'
  );
  for (const u of units) {
    db.run(
      `INSERT OR IGNORE INTO student_unit_progress (student_id, unit_id, status) VALUES (?, ?, ?)`,
      [studentId, u.id, u.unit_number === 1 ? 'unlocked' : 'locked']
    );
  }

  const concepts = queryAll<{ id: number; unit_id: number; order_index: number }>(
    db,
    `SELECT c.id, c.unit_id, c.order_index
     FROM concepts c
     JOIN units u ON c.unit_id = u.id
     ORDER BY u.unit_number ASC, c.order_index ASC`
  );
  const unit1Id = units.find((u) => u.unit_number === 1)?.id;
  let firstUnit1Unlocked = false;

  for (const c of concepts) {
    let status = 'locked';
    if (c.unit_id === unit1Id && !firstUnit1Unlocked) {
      status = 'unlocked';
      firstUnit1Unlocked = true;
    }
    db.run(
      `INSERT OR IGNORE INTO student_concept_progress (student_id, concept_id, status) VALUES (?, ?, ?)`,
      [studentId, c.id, status]
    );
  }
  saveAppDb();
}

function initializeStudentPathProgress(
  db: Database,
  studentId: number,
  unitIdMap: Map<number, number>,
  conceptIdMap: Map<string, number>
): void {
  for (const u of SEED_UNITS) {
    const unitId = unitIdMap.get(u.unit_number)!;
    runStmt(
      db,
      `INSERT INTO student_unit_progress (student_id, unit_id, status) VALUES (?, ?, ?)`,
      [studentId, unitId, u.unit_number === 1 ? 'unlocked' : 'locked'],
      false
    );
  }

  for (const c of SEED_CONCEPTS) {
    const cid = conceptIdMap.get(`${c.unit_number}:${c.order_index}`)!;
    const initialStatus = c.unit_number === 1 && c.order_index === 1 ? 'unlocked' : 'locked';
    runStmt(
      db,
      `INSERT INTO student_concept_progress (student_id, concept_id, status) VALUES (?, ?, ?)`,
      [studentId, cid, initialStatus],
      false
    );
  }
}

function migrateCurriculumIfNeeded(db: Database): void {
  const versionRow = queryOne<{ value: string }>(
    db,
    "SELECT value FROM curriculum_meta WHERE key = 'curriculum_version'"
  );
  if (versionRow?.value === CURRICULUM_VERSION) return;

  const existingUnits = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM units');
  const existingStudents = queryAll<{ id: number; is_primary: number }>(
    db,
    'SELECT id, is_primary FROM students'
  );

  // If DB is completely fresh (no units and no students), perform full fresh seed
  if ((!existingUnits || existingUnits.count === 0) && existingStudents.length === 0) {
    const { unitIdMap, conceptIdMap } = insertOfficialCurriculum(db);

    for (const b of SEED_BADGES) {
      runStmt(
        db,
        `INSERT OR IGNORE INTO badges (code, title, description, icon_name, requirement_text) VALUES (?, ?, ?, ?, ?)`,
        [b.code, b.title, b.description, b.icon_name, b.requirement_text],
        false
      );
    }

    const today = todayIso();
    const peers = [
      { name: 'Rinki Nisha', avatar_seed: 'rinki', xp: 240, hearts: 5, gems: 85, streak: 4, league: 'Silver', weekly_xp: 240, is_primary: 1 },
      { name: 'Priya Nair', avatar_seed: 'priya', xp: 495, hearts: 5, gems: 120, streak: 7, league: 'Silver', weekly_xp: 310, is_primary: 0 },
      { name: 'Arjun Mehta', avatar_seed: 'arjun', xp: 410, hearts: 4, gems: 95, streak: 5, league: 'Silver', weekly_xp: 275, is_primary: 0 },
      { name: 'Elena Rostova', avatar_seed: 'elena', xp: 365, hearts: 5, gems: 70, streak: 3, league: 'Silver', weekly_xp: 225, is_primary: 0 },
      { name: 'Marcus Chen', avatar_seed: 'marcus', xp: 290, hearts: 5, gems: 65, streak: 4, league: 'Silver', weekly_xp: 195, is_primary: 0 },
      { name: 'Kabir Sharma', avatar_seed: 'kabir', xp: 215, hearts: 3, gems: 45, streak: 2, league: 'Silver', weekly_xp: 165, is_primary: 0 },
      { name: 'Sana Kapoor', avatar_seed: 'sana', xp: 180, hearts: 5, gems: 55, streak: 2, league: 'Silver', weekly_xp: 130, is_primary: 0 },
    ];

    let primaryId = 1;
    for (const p of peers) {
      const sid = runStmt(
        db,
        `INSERT INTO students (name, avatar_seed, xp, hearts, max_hearts, gems, streak_days, last_active_date, league, weekly_xp, role, is_primary, created_at)
         VALUES (?, ?, ?, ?, 5, ?, ?, ?, ?, ?, 'student', ?, ?)`,
        [p.name, p.avatar_seed, p.xp, p.hearts, p.gems, p.streak, today, p.league, p.weekly_xp, p.is_primary, today],
        false
      );
      if (p.is_primary === 1) primaryId = sid;
    }

    initializeStudentPathProgress(db, primaryId, unitIdMap, conceptIdMap);
    ensureDailyMissions(db, primaryId);
  } else {
    // Non-destructive safe migration: preserve students, XP, hearts, gems, streaks, badges, missions!
    const completedSnapshot = queryAll(
      db,
      `SELECT scp.student_id, c.title, scp.status, scp.best_score, scp.completed_at
       FROM student_concept_progress scp
       JOIN concepts c ON scp.concept_id = c.id
       WHERE scp.status = 'completed'`
    );

    runStmt(
      db,
      `INSERT INTO migration_audit_log (old_version, new_version, completed_snapshot_json, note, migrated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        versionRow?.value ?? 'v1_initial_seed',
        CURRICULUM_VERSION,
        JSON.stringify(completedSnapshot),
        'Preserved all student profiles, XP, hearts, gems, streaks, daily missions, and badges while migrating to the official 4-Unit 87-concept DBMS syllabus.',
        new Date().toISOString(),
      ],
      false
    );

    // Cleanly replace curriculum tables only (no duplicate units/concepts)
    db.run('DELETE FROM ai_explanation_cache');
    db.run('DELETE FROM student_concept_progress');
    db.run('DELETE FROM student_unit_progress');
    db.run('DELETE FROM questions');
    db.run('DELETE FROM concepts');
    db.run('DELETE FROM units');

    const { unitIdMap, conceptIdMap } = insertOfficialCurriculum(db);

    for (const st of existingStudents) {
      if (st.is_primary === 1) {
        initializeStudentPathProgress(db, st.id, unitIdMap, conceptIdMap);
        ensureDailyMissions(db, st.id);
      }
    }
  }

  db.run(
    `INSERT INTO curriculum_meta (key, value, updated_at)
     VALUES ('curriculum_version', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [CURRICULUM_VERSION, new Date().toISOString()]
  );

  saveAppDb();
}

export function ensureDailyMissions(db: Database, studentId: number): void {
  const today = todayIso();
  const existing = queryAll(
    db,
    `SELECT id FROM daily_missions WHERE student_id = ? AND mission_date = ?`,
    [studentId, today]
  );
  if (existing.length > 0) return;

  const missions = [
    { key: 'complete_concept', title: 'Pass 1 Concept Assessment', target: 1, xp: 40, gems: 15 },
    { key: 'run_sql', title: 'Run 3 queries in SQL Playground', target: 3, xp: 30, gems: 10 },
    { key: 'ask_tutor', title: 'Ask the AI Tutor 1 question', target: 1, xp: 20, gems: 10 },
  ];

  for (const m of missions) {
    runStmt(
      db,
      `INSERT INTO daily_missions (student_id, mission_key, title, target_count, current_count, xp_reward, gem_reward, claimed, mission_date)
       VALUES (?, ?, ?, ?, 0, ?, ?, 0, ?)`,
      [studentId, m.key, m.title, m.target, m.xp, m.gems, today],
      false
    );
  }
  saveAppDb();
}

export async function getDatabases(): Promise<{ appDb: Database; practiceDb: Database }> {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => path.resolve(process.cwd(), 'node_modules/sql.js/dist', file),
    });
  }

  if (!appDb) {
    if (fs.existsSync(APP_DB_PATH)) {
      const fileBuf = fs.readFileSync(APP_DB_PATH);
      appDb = new SQL.Database(fileBuf);
      createAppSchema(appDb);
    } else {
      appDb = new SQL.Database();
      createAppSchema(appDb);
    }
    migrateCurriculumIfNeeded(appDb);
    ensureStudentAndActivitySchema(appDb);
  }

  if (!practiceDb) {
    practiceDb = new SQL.Database();
    practiceDb.run(PRACTICE_DB_INIT_SQL);
  }

  return { appDb, practiceDb };
}

export function resetPracticeDb(): Database {
  if (!SQL) throw new Error('SQL.js not initialized');
  practiceDb = new SQL.Database();
  practiceDb.run(PRACTICE_DB_INIT_SQL);
  return practiceDb;
}
