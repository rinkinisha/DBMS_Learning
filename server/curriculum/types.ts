export interface LessonContentSeed {
  simpleIntro: string;
  detailedExplanation: string;
  definitions: { term: string; meaning: string }[];
  realWorldExamples: string[];
  practicalExamples: { label: string; snippet: string; outcome: string }[];
  visualSteps: { step: string; title: string; detail: string }[];
  commonMistakes: string[];
  quickRecap: string[];
}

export interface SeedUnit {
  unit_number: number;
  title: string;
  subtitle: string;
  description: string;
  accent_color: string;
  estimated_hours: number;
  unlock_xp_bonus: number;
}

export interface SeedConcept {
  unit_number: number;
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
  diagram_config: Record<string, unknown>;
  practical_sql: string;
  practical_explanation: string;
  lesson_content: LessonContentSeed;
}

export interface SeedQuestion {
  unit_number: number;
  concept_order_index: number | null;
  is_unit_assessment: boolean;
  question_type: 'mcq' | 'true_false' | 'matching' | 'drag_drop' | 'sql_challenge' | 'memory';
  prompt: string;
  payload: Record<string, unknown>;
  explanation: string;
  xp_value: number;
}
