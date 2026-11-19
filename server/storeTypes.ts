export interface UnitRow {
  id: number;
  unit_number: number;
  title: string;
  subtitle: string;
  description: string;
  accent_color: string;
  estimated_hours: number;
  unlock_xp_bonus: number;
}

export interface ConceptRow {
  id: number;
  unit_id: number;
  order_index: number;
  topic_tag: string;
  title: string;
  summary: string;
  duration_minutes: number;
  xp_reward: number;
  gem_reward: number;
  definition_text: string;
  example_text: string;
  diagram_type: string;
  diagram_config_json: string;
  practical_sql: string;
  practical_explanation: string;
  lesson_content_json: string;
  is_published: number;
  ai_approved: number;
}

export interface QuestionRow {
  id: number;
  unit_id: number;
  concept_id: number | null;
  is_unit_assessment: number;
  question_type: string;
  prompt: string;
  payload_json: string;
  explanation: string;
  xp_value: number;
}

export interface QuestionWithContextRow extends QuestionRow {
  unit_number: number;
  concept_title: string | null;
}

export interface BadgeRow {
  id: number;
  code: string;
  title: string;
  description: string;
  icon_name: string;
  requirement_text: string;
}

export interface StudentBadgeJoinRow extends BadgeRow {
  earned_at: string | null;
  earned: number;
}

export interface StudentFullRow {
  id: number;
  name: string;
  username: string;
  email: string;
  password_hash: string | null;
  avatar_seed: string;
  xp: number;
  hearts: number;
  max_hearts: number;
  gems: number;
  streak_days: number;
  longest_streak: number;
  last_active_date: string;
  league: string;
  weekly_xp: number;
  role: 'student' | 'admin';
  is_primary: number;
  is_demo: number;
  timezone: string;
  streak_history_json: string;
  streak_updated_at: string | null;
  sql_solved_count: number;
  created_at: string;
}

export interface SessionRow {
  token: string;
  student_id: number;
  expires_at: string;
  created_at: string;
}

export interface PasswordResetRow {
  id: number;
  student_id: number;
  reset_code: string;
  expires_at: string;
  used: number;
  created_at: string;
}

export interface StudentUnitProgressRow {
  student_id: number;
  unit_id: number;
  status: string;
  assessment_score: number | null;
  completed_at: string | null;
}

export interface StudentConceptProgressRow {
  student_id: number;
  concept_id: number;
  status: string;
  best_score: number | null;
  attempts: number;
  completed_at: string | null;
}

export interface DailyMissionRow {
  id: number;
  student_id: number;
  mission_key: string;
  title: string;
  target_count: number;
  current_count: number;
  xp_reward: number;
  gem_reward: number;
  claimed: number;
  mission_date: string;
}

export interface XpTransactionRow {
  id: number;
  student_id: number;
  source_type: string;
  source_ref_id: string | null;
  xp_amount: number;
  gems_amount: number;
  local_date: string;
  created_at: string;
}

export interface QuizAttemptRow {
  id: number;
  student_id: number;
  unit_id: number;
  concept_id: number | null;
  is_unit_assessment: number;
  score: number;
  passed: number;
  xp_awarded: number;
  created_at: string;
}

export interface SqlSubmissionRow {
  id: number;
  student_id: number;
  concept_id: number | null;
  challenge_key: string | null;
  sql_text: string;
  passed: number;
  execution_ms: number;
  created_at: string;
}

export interface DailyStreakRow {
  user_id: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  streak_history_json: string;
  timezone: string;
  updated_at: string;
}

export interface MigrationAuditRow {
  id: number;
  old_version: string;
  new_version: string;
  completed_snapshot_json: string;
  note: string;
  migrated_at: string;
}

export interface LeaderboardAggregateData {
  totalConcepts: number;
  totalUnits: number;
  students: StudentFullRow[];
  periodMap: Map<number, { sum_xp: number; achieved_at: string | null }>;
  weeklyMap: Map<number, number>;
  conceptMap: Map<number, number>;
  unitMap: Map<number, number>;
  accMap: Map<number, number>;
  sqlMap: Map<number, number>;
}

export interface DataStoreStatus {
  backend: 'mongodb' | 'sqlite_fallback';
  mongoConfigured: boolean;
  mongoConnected: boolean;
  note: string;
}

export interface DataStore {
  readonly status: DataStoreStatus;

  // Curriculum
  getUnits(): Promise<UnitRow[]>;
  getUnitById(id: number): Promise<UnitRow | null>;
  getNextUnit(unitNumber: number): Promise<UnitRow | null>;
  createUnit(input: Omit<UnitRow, 'id'>): Promise<number>;
  updateUnit(
    id: number,
    input: Pick<UnitRow, 'title' | 'subtitle' | 'description' | 'accent_color' | 'estimated_hours'>
  ): Promise<void>;

  getConcepts(opts?: { publishedOnly?: boolean }): Promise<ConceptRow[]>;
  getConceptsWithAdminMeta(): Promise<
    (ConceptRow & { unit_title: string; unit_number: number; question_count: number })[]
  >;
  getConceptById(id: number): Promise<(ConceptRow & { unit_title: string }) | null>;
  getNextConceptInUnit(unitId: number, orderIndex: number): Promise<ConceptRow | null>;
  getFirstPublishedConceptInUnit(unitId: number): Promise<ConceptRow | null>;
  createConcept(input: Omit<ConceptRow, 'id'>): Promise<number>;
  updateConcept(
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
  ): Promise<void>;
  reorderConcept(conceptId: number, direction: 'up' | 'down'): Promise<void>;
  setConceptPublished(conceptId: number, isPublished: boolean): Promise<void>;
  approveConceptLesson(
    conceptId: number,
    input: {
      lesson_content_json: string;
      definition_text: string | null;
      practical_sql: string | null;
      is_published: number | null;
    }
  ): Promise<void>;
  deleteConcept(conceptId: number): Promise<void>;

  // Questions
  getQuestionsForConcept(conceptId: number): Promise<QuestionRow[]>;
  getUnitAssessmentQuestions(unitId: number): Promise<QuestionRow[]>;
  getAllQuestionsWithContext(): Promise<QuestionWithContextRow[]>;
  createQuestion(input: Omit<QuestionRow, 'id'>): Promise<number>;
  deleteQuestion(questionId: number): Promise<void>;

  // Badges & Migrations
  getBadges(): Promise<BadgeRow[]>;
  getStudentBadges(studentId: number): Promise<StudentBadgeJoinRow[]>;
  awardBadgeByCode(studentId: number, badgeCode: string): Promise<boolean>;
  getMigrationLogs(limit?: number): Promise<MigrationAuditRow[]>;

  // Students & Auth
  getStudentById(id: number): Promise<StudentFullRow | null>;
  getStudentByEmail(email: string): Promise<StudentFullRow | null>;
  getStudentByUsername(username: string): Promise<StudentFullRow | null>;
  getAllStudentsForAdmin(): Promise<StudentFullRow[]>;
  createStudent(input: Omit<StudentFullRow, 'id'>): Promise<number>;
  updateStudentFields(id: number, fields: Partial<StudentFullRow>): Promise<void>;
  incrementStudentSqlSolved(id: number): Promise<void>;
  deleteStudentCascade(id: number): Promise<void>;

  createSession(session: SessionRow): Promise<void>;
  getSessionByToken(token: string): Promise<SessionRow | null>;
  deleteSession(token: string): Promise<void>;

  createPasswordReset(input: Omit<PasswordResetRow, 'id'>): Promise<number>;
  getLatestValidPasswordReset(studentId: number, code: string): Promise<PasswordResetRow | null>;
  markPasswordResetUsed(id: number): Promise<void>;

  // Learning Path Progress
  initializeStudentPathProgress(studentId: number): Promise<void>;
  resetStudentPathProgress(studentId: number): Promise<void>;
  unlockAllForStudent(studentId: number): Promise<void>;
  getStudentUnitProgress(studentId: number): Promise<StudentUnitProgressRow[]>;
  getOneStudentUnitProgress(
    studentId: number,
    unitId: number
  ): Promise<StudentUnitProgressRow | null>;
  upsertStudentUnitProgress(
    studentId: number,
    unitId: number,
    input: {
      status?: string;
      statusIfNotCompleted?: string;
      assessment_score?: number;
      completed_at?: string;
    }
  ): Promise<void>;
  getStudentConceptProgress(studentId: number): Promise<StudentConceptProgressRow[]>;
  getOneStudentConceptProgress(
    studentId: number,
    conceptId: number
  ): Promise<StudentConceptProgressRow | null>;
  upsertStudentConceptProgress(
    studentId: number,
    conceptId: number,
    input: {
      status?: string;
      statusIfNotCompleted?: string;
      best_score?: number | null;
      attempts?: number;
      completed_at?: string | null;
    }
  ): Promise<void>;
  countIncompleteConceptsInUnit(studentId: number, unitId: number): Promise<number>;
  countCompletedPublishedConcepts(studentId: number): Promise<number>;
  countPublishedConcepts(): Promise<number>;
  countCompletedUnits(studentId: number): Promise<number>;
  countUnits(): Promise<number>;

  // Daily Missions
  ensureDailyMissions(studentId: number, missionDate: string): Promise<void>;
  getDailyMissions(studentId: number, missionDate: string): Promise<DailyMissionRow[]>;
  getDailyMissionById(missionId: number, studentId: number): Promise<DailyMissionRow | null>;
  incrementDailyMission(
    studentId: number,
    missionKey: string,
    missionDate: string
  ): Promise<{ reachedTargetNow: boolean; currentCount: number }>;
  markDailyMissionClaimed(missionId: number): Promise<void>;

  // Streaks
  getDailyStreak(studentId: number): Promise<DailyStreakRow | null>;
  upsertDailyStreak(row: DailyStreakRow): Promise<void>;
  updateDailyStreakTimezone(studentId: number, timezone: string): Promise<void>;

  // XP, Quiz & SQL Activity
  hasXpTransaction(
    studentId: number,
    sourceType: string,
    sourceRefId: string,
    localDate?: string
  ): Promise<boolean>;
  insertXpTransaction(input: Omit<XpTransactionRow, 'id'>): Promise<number>;
  sumStudentXpSince(studentId: number, sinceLocalDate: string): Promise<number>;
  getRecentXpTransactions(studentId: number, limit: number): Promise<XpTransactionRow[]>;

  insertQuizAttempt(input: Omit<QuizAttemptRow, 'id'>): Promise<number>;
  getStudentQuizStats(studentId: number): Promise<{ avgAcc: number; totalAttempts: number }>;

  hasSolvedSqlChallenge(studentId: number, challengeKey: string): Promise<boolean>;
  insertSqlSubmission(input: Omit<SqlSubmissionRow, 'id'>): Promise<number>;
  countDistinctSolvedSql(studentId: number): Promise<number>;

  getLeaderboardAggregateData(
    sinceLocalDate: string | null,
    isDailyExact: boolean,
    weekStart: string
  ): Promise<LeaderboardAggregateData>;

  // AI Cache
  getAiExplanationCache(conceptId: number, style: string): Promise<string | null>;
  upsertAiExplanationCache(conceptId: number, style: string, contentJson: string): Promise<void>;
}
