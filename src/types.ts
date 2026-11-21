export type QuestionType =
  | 'mcq'
  | 'true_false'
  | 'matching'
  | 'drag_drop'
  | 'sql_challenge'
  | 'memory';

export type ProgressStatus = 'locked' | 'unlocked' | 'completed';

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';

export interface ConceptLessonContent {
  simpleIntro: string;
  detailedExplanation: string;
  definitions: { term: string; meaning: string }[];
  realWorldExamples: string[];
  advantages?: string[];
  disadvantages?: string[];
  practicalExamples: { label: string; snippet: string; outcome: string }[];
  visualSteps: { step: string; title: string; detail: string }[];
  commonMistakes: string[];
  quickRecap: string[];
}

export interface Unit {
  id: number;
  unit_number: number;
  title: string;
  subtitle: string;
  description: string;
  accent_color: string;
  estimated_hours: number;
  unlock_xp_bonus: number;
  status: ProgressStatus;
  assessment_score: number | null;
  concepts: Concept[];
}

export interface Concept {
  id: number;
  unit_id: number;
  order_index: number;
  topic_tag?: string;
  title: string;
  summary: string;
  duration_minutes: number;
  xp_reward: number;
  gem_reward: number;
  definition_text: string;
  example_text: string;
  diagram_type: string;
  diagram_config: Record<string, unknown>;
  practical_sql: string;
  practical_explanation: string;
  lesson_content?: ConceptLessonContent;
  is_published?: boolean;
  ai_approved?: boolean;
  status: ProgressStatus;
  best_score: number | null;
  attempts: number;
}

export interface Question {
  id: number;
  unit_id: number;
  concept_id: number | null;
  is_unit_assessment: boolean;
  question_type: QuestionType;
  prompt: string;
  payload: Record<string, unknown>;
  explanation: string;
  xp_value: number;
}

export interface Student {
  id: number;
  name: string;
  username: string;
  email: string;
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
  is_demo?: boolean;
  timezone?: string;
  discord_user_id?: string | null;
  sql_solved_count?: number;
  created_at?: string;
}

export interface StreakWeeklyDay {
  date: string;
  dayShort: string;
  dayFull: string;
  status: 'completed' | 'missed' | 'pending' | 'future';
  isToday: boolean;
}

export interface StreakInfo {
  userId: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  streakHistory: string[];
  timezone: string;
  todayDate: string;
  completedToday: boolean;
  motivationalMessage: string;
  weeklyCalendar: StreakWeeklyDay[];
  milestones: { days: number; title: string; unlocked: boolean }[];
}

export interface DailyMission {
  id: number;
  student_id: number;
  mission_key: string;
  title: string;
  target_count: number;
  current_count: number;
  xp_reward: number;
  gem_reward: number;
  claimed: boolean;
  mission_date: string;
}

export interface Badge {
  id: number;
  code: string;
  title: string;
  description: string;
  icon_name: string;
  requirement_text: string;
  earned: boolean;
  earned_at: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  id: number;
  name: string;
  username: string;
  avatar_seed: string;
  xp: number;
  period_xp: number;
  weekly_xp: number;
  streak_days: number;
  longest_streak: number;
  completed_concepts: number;
  total_concepts: number;
  completed_units: number;
  total_units: number;
  unit_completion_pct: number;
  sql_solved: number;
  accuracy: number;
  league: string;
  is_current_user: boolean;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  totalRegistered: number;
  totalFiltered: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  currentUserRank: number | null;
  currentUserEntry: LeaderboardEntry | null;
  entries: LeaderboardEntry[];
}

export interface ProfilePayload {
  user: Student;
  streak: StreakInfo;
  stats: {
    completedConcepts: number;
    totalConcepts: number;
    completedUnits: number;
    totalUnits: number;
    sqlSolved: number;
    accuracy: number;
    totalQuizAttempts: number;
  };
  badges: Badge[];
  recentXp: {
    id: number;
    source_type: string;
    source_ref_id: string | null;
    xp_amount: number;
    gems_amount: number;
    local_date: string;
    created_at: string;
  }[];
}

export interface AiExplanation {
  deepDiveContent?: string;
  summary: string;
  formalDefinition: string;
  realWorldAnalogy: string;
  workedExample: string;
  visualSteps: { step: string; title: string; detail: string }[];
  commonPitfalls: string[];
  trySqlQuery: string;
  lessonContent?: ConceptLessonContent;
}

export interface SqlExecutionResult {
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  executionMs: number;
  message?: string;
  truncated?: boolean;
}

export interface PracticeTableInfo {
  name: string;
  objectType: 'table' | 'view';
  columns: {
    name: string;
    type: string;
    pk: boolean;
    primaryKeyOrder: number;
    notNull: boolean;
    defaultValue: string | null;
  }[];
  foreignKeys: {
    id: number;
    column: string;
    referencedTable: string;
    referencedColumn: string;
    onUpdate: string;
    onDelete: string;
  }[];
  rowCount: number;
}

export interface DashboardPayload {
  student: Student;
  streak: StreakInfo;
  units: Unit[];
  missions: DailyMission[];
  badges: Badge[];
  leaderboard: LeaderboardEntry[];
  leaderboardMeta?: {
    totalRegistered: number;
    currentUserRank: number | null;
    currentUserEntry: LeaderboardEntry | null;
  };
}
