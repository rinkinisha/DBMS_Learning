const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PREFERRED_MODEL = process.env.GROQ_MODEL?.trim();
const MODEL_CANDIDATES = [
  PREFERRED_MODEL,
  process.env.GROQ_FALLBACK_MODEL?.trim(),
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
].filter((model, index, models): model is string => Boolean(model) && models.indexOf(model) === index);
let availableModelsCache: { expiresAt: number; ids: Set<string> } | undefined;

interface GroqError extends Error {
  status?: number;
}

export interface ParsedApiError {
  httpStatus: number;
  message: string;
  isTransient: boolean;
}

function createGroqError(message: string, status?: number): GroqError {
  const error = new Error(message) as GroqError;
  error.status = status;
  return error;
}

function getApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw createGroqError('GROQ_API_KEY is not configured. Add a Groq API key to your environment or Settings > Secrets.', 503);
  }
  return apiKey;
}

export function formatGroqError(error: unknown): ParsedApiError {
  const err = error as GroqError;
  const status = err?.status ?? 0;
  const rawMessage = err?.message || 'Groq API request failed.';
  if (status === 503 && rawMessage.includes('GROQ_API_KEY is not configured')) {
    return { httpStatus: 503, message: rawMessage, isTransient: false };
  }
  if (status === 401 || status === 403) {
    return { httpStatus: status, message: 'Groq API authentication failed. Check the GROQ_API_KEY in Settings > Secrets.', isTransient: false };
  }
  if (status === 429) {
    return { httpStatus: 429, message: 'Groq API rate limit or quota reached. Wait a moment and try again.', isTransient: false };
  }
  if (status === 404 || (status === 400 && /model.*(not found|does not exist|do not have access|unavailable)/i.test(rawMessage))) {
    return { httpStatus: 502, message: 'The configured Groq model is unavailable for this account. Check GROQ_MODEL in your environment.', isTransient: false };
  }
  if (status >= 500 || /fetch failed|timeout|timed out|ECONNRESET|ENOTFOUND/i.test(rawMessage)) {
    return { httpStatus: 503, message: 'Groq is temporarily unavailable. Please retry in a moment.', isTransient: true };
  }
  return { httpStatus: status >= 400 ? status : 500, message: rawMessage, isTransient: false };
}

async function requestGroq(model: string, system: string, prompt: string, maxTokens: number): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${getApiKey()}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = await response.json().catch(() => ({})) as {
    choices?: { message?: { content?: string | null } }[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw createGroqError(data.error?.message || `Groq API returned HTTP ${response.status}.`, response.status);
  }
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw createGroqError('Groq returned an empty response.', 502);
  return text;
}

async function getAvailableModels(): Promise<Set<string> | undefined> {
  if (availableModelsCache && availableModelsCache.expiresAt > Date.now()) return availableModelsCache.ids;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { authorization: `Bearer ${getApiKey()}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return undefined;
    const data = await response.json() as { data?: { id?: string }[] };
    const ids = new Set((data.data ?? []).map((model) => model.id).filter((id): id is string => Boolean(id)));
    availableModelsCache = { ids, expiresAt: Date.now() + 5 * 60_000 };
    return ids;
  } catch {
    // The configured model candidates below remain available as a fallback if discovery is offline.
    return undefined;
  }
}

function isModelAccessError(error: unknown): boolean {
  const err = error as GroqError;
  return err?.status === 404 || (err?.status === 400 && /model.*(not found|does not exist|do not have access|unavailable)/i.test(err.message));
}

async function generateText(system: string, prompt: string, maxTokens = 3000): Promise<string> {
  const availableModels = await getAvailableModels();
  const candidates = availableModels
    ? MODEL_CANDIDATES.filter((model) => availableModels.has(model))
    : MODEL_CANDIDATES;
  if (candidates.length === 0) {
    throw createGroqError('No supported Groq chat model is available to this API key. Check model permissions in Groq Console.', 502);
  }

  let lastError: unknown;
  for (const model of candidates) {
    try {
      return await requestGroq(model, system, prompt, maxTokens);
    } catch (error) {
      if (isModelAccessError(error)) {
        lastError = error;
        continue;
      }
      if (formatGroqError(error).isTransient && model !== candidates[candidates.length - 1]) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw createGroqError(
    `None of the available Groq model choices worked for this API key. Last model error: ${(lastError as Error)?.message || 'model unavailable'}`,
    502,
  );
}

function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = Math.min(...[cleaned.indexOf('{'), cleaned.indexOf('[')].filter((index) => index >= 0));
  if (!Number.isFinite(start)) throw createGroqError('Groq returned invalid JSON.', 502);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    throw createGroqError('Groq returned invalid JSON.', 502);
  }
}

const DBMS_SYSTEM = 'You are a precise and friendly DBMS instructor and tutor in DBMS Arena. Keep every answer accurate, beginner-friendly, and specific to the selected curriculum concept.';

export async function generateStructuredAiExplanation(unitTitle: string, conceptTitle: string, conceptSummary: string) {
  const prompt = `Return only a valid JSON object with keys summary, formalDefinition, realWorldAnalogy, workedExample, visualSteps, commonPitfalls, quickRecap, trySqlQuery. Explain the exact topic "${conceptTitle}" in the exact unit "${unitTitle}". Course context: ${conceptSummary}. Stay specific to this topic. Keep the explanation suitable for a first-time DBMS learner. visualSteps must be an array of objects with step, title, detail. commonPitfalls and quickRecap must be arrays of short strings. trySqlQuery should be a valid SQLite SELECT query on the practice schema departments(dept_id, dept_name, building, budget), instructors(instructor_id, full_name, email, dept_id, salary), students(student_id, full_name, email, dept_id, year_level, gpa), courses(course_id, course_code, title, credits, dept_id, instructor_id), enrollments(student_id, course_id, semester, grade), projects(project_id, project_name, dept_id, lead_instructor_id, budget).`;
  return parseJson<Record<string, unknown>>(await generateText(DBMS_SYSTEM, prompt, 3500));
}

export async function generateTopicSpecificDeepDive(input: {
  unitTitle: string; conceptTitle: string; summary: string; definition: string; example: string; lessonDetails: string;
}) {
  const prompt = `Return only valid JSON: {"deepDiveContent":"..."}. Write one coherent plain-text lesson with concise headings in this order: Introduction and definition; Key points; Real-world example; Practical example where applicable; Short recap. The exact subject is "${input.conceptTitle}" in unit "${input.unitTitle}". Syllabus summary: ${input.summary}. Canonical definition: ${input.definition}. Course example: ${input.example}. Additional course lesson material: ${input.lessonDetails}. Teach a first-time learner, use accurate technical terminology, cover the selected topic's important points and stay tightly on topic. Avoid repeated ideas. For "Advantages of DBMS", specifically cover reduced redundancy, consistency, security, sharing/concurrency, integrity, backup/recovery, data independence, centralized management, and accessibility, with relevant examples. For other topics, explain their own key features and examples. Do not give a generic DBMS introduction unless that is the selected topic.`;
  return parseJson<{ deepDiveContent: string }>(await generateText(DBMS_SYSTEM, prompt, 4500));
}

export async function generateDynamicQuestions(unitTitle: string, conceptTitle: string, summary: string, count = 5) {
  const prompt = `Create ${count} fresh beginner-friendly DBMS multiple-choice questions. Exact topic: "${conceptTitle}". Unit: "${unitTitle}". Course context: ${summary}. Each question must be specific to this topic, unambiguous, with exactly four options and one correct answer. Return only a valid JSON array. Each item must have prompt, options (four strings), correctIndex (0-3), and explanation.`;
  const questions = parseJson<{ prompt: string; options: string[]; correctIndex: number; explanation: string }[]>(await generateText(DBMS_SYSTEM, prompt, 4500));
  return questions.slice(0, count).map((question, index) => ({
    id: Date.now() + index, unit_id: 0, concept_id: null, is_unit_assessment: false,
    question_type: 'mcq', prompt: question.prompt,
    payload: { options: question.options, correctIndex: question.correctIndex },
    explanation: question.explanation, xp_value: 10,
  }));
}

export type PlaygroundTheoryType = 'mcq' | 'true_false' | 'fill_blank' | 'matching' | 'scenario';

function normalizeChoiceQuestion(value: unknown): Record<string, unknown> | null {
  let candidate = value;
  if (Array.isArray(candidate)) candidate = candidate[0];
  if (!candidate || typeof candidate !== 'object') return null;
  const raw = candidate as Record<string, unknown>;
  if (raw.question && typeof raw.question === 'object') candidate = raw.question;
  const question = candidate as Record<string, unknown>;
  const prompt = question.prompt ?? question.questionText ?? question.question;
  const rawOptions = question.options ?? question.choices;
  let options: string[] = [];
  if (Array.isArray(rawOptions)) {
    options = rawOptions.map((option) => {
      if (typeof option === 'string' || typeof option === 'number') return String(option).trim();
      if (option && typeof option === 'object') {
        const item = option as Record<string, unknown>;
        return String(item.text ?? item.label ?? item.value ?? '').trim();
      }
      return '';
    });
  } else if (rawOptions && typeof rawOptions === 'object') {
    options = Object.entries(rawOptions as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, option]) => String(option).trim());
  }
  const uniqueOptions = new Set(options.map((option) => option.toLocaleLowerCase()));
  if (typeof prompt !== 'string' || !prompt.trim() || options.length !== 4 || options.some((option) => !option) || uniqueOptions.size !== 4) return null;

  let correctIndex: number | undefined;
  const indexValue = question.correctIndex ?? question.answerIndex;
  if (typeof indexValue === 'number' && Number.isInteger(indexValue)) correctIndex = indexValue;
  if (typeof indexValue === 'string') {
    const trimmed = indexValue.trim();
    if (/^[0-3]$/.test(trimmed)) correctIndex = Number(trimmed);
    else if (/^[A-D]$/i.test(trimmed)) correctIndex = trimmed.toUpperCase().charCodeAt(0) - 65;
  }
  const correctAnswer = question.correctAnswer ?? question.answer;
  if (correctIndex === undefined && typeof correctAnswer === 'string') {
    const match = options.findIndex((option) => option.toLocaleLowerCase() === correctAnswer.trim().toLocaleLowerCase());
    if (match >= 0) correctIndex = match;
    else if (/^[A-D]$/i.test(correctAnswer.trim())) correctIndex = correctAnswer.trim().toUpperCase().charCodeAt(0) - 65;
  }
  if (correctIndex === undefined || correctIndex < 0 || correctIndex > 3) return null;
  return {
    prompt: prompt.trim(), options, correctIndex,
    hint: typeof question.hint === 'string' ? question.hint : '',
    explanation: typeof question.explanation === 'string' ? question.explanation : '',
  };
}

function normalizeTheoryQuestion(type: PlaygroundTheoryType, value: unknown): Record<string, unknown> | null {
  let candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object') return null;
  const outer = candidate as Record<string, unknown>;
  if (outer.question && typeof outer.question === 'object') candidate = outer.question;
  const question = candidate as Record<string, unknown>;
  if (type === 'mcq' || type === 'scenario') return normalizeChoiceQuestion(question);

  const prompt = question.prompt ?? question.questionText ?? question.question;
  if (typeof prompt !== 'string' || !prompt.trim()) return null;
  const normalized: Record<string, unknown> = {
    prompt: prompt.trim(),
    hint: typeof question.hint === 'string' ? question.hint : '',
    explanation: typeof question.explanation === 'string' ? question.explanation : '',
  };

  if (type === 'true_false') {
    const answer = question.correctBoolean ?? question.correctAnswer ?? question.answer;
    if (typeof answer === 'boolean') normalized.correctBoolean = answer;
    else if (typeof answer === 'string' && /^(true|false)$/i.test(answer.trim())) normalized.correctBoolean = answer.trim().toLowerCase() === 'true';
    else return null;
  } else if (type === 'fill_blank') {
    normalized.prompt = prompt.replace(/\[blank\]|<blank>|_{3,}/gi, '___');
    const answers = question.acceptedAnswers ?? question.acceptedAnswer ?? question.answers;
    const acceptedAnswers = Array.isArray(answers) ? answers.map(String).map((answer) => answer.trim()).filter(Boolean) : typeof answers === 'string' ? [answers.trim()] : [];
    if (!String(normalized.prompt).includes('___') || acceptedAnswers.length === 0) return null;
    normalized.acceptedAnswers = acceptedAnswers.slice(0, 3);
  } else {
    let pairs = question.pairs;
    if (!Array.isArray(pairs) && Array.isArray(question.leftItems) && Array.isArray(question.rightItems)) {
      const rightItems = question.rightItems as unknown[];
      pairs = (question.leftItems as unknown[]).map((left, index) => ({ left, right: rightItems[index] }));
    }
    if (!Array.isArray(pairs)) return null;
    const normalizedPairs = pairs.map((pair) => {
      if (!pair || typeof pair !== 'object') return null;
      const item = pair as Record<string, unknown>;
      const left = item.left ?? item.term ?? item.question;
      const right = item.right ?? item.match ?? item.answer;
      return typeof left === 'string' && typeof right === 'string' && left.trim() && right.trim()
        ? { left: left.trim(), right: right.trim() }
        : null;
    });
    if (normalizedPairs.length !== 3 || normalizedPairs.some((pair) => !pair)) return null;
    normalized.pairs = normalizedPairs;
  }
  return normalized;
}

export async function generatePlaygroundTheoryQuestion(input: {
  unitTitle: string; conceptTitle: string; summary: string; definition: string; example: string; type: PlaygroundTheoryType;
}) {
  const context = `Exact topic: "${input.conceptTitle}". Unit: "${input.unitTitle}". Summary: ${input.summary}. Definition: ${input.definition}. Example: ${input.example}. Keep the question tightly tied to this topic.`;
  const basePrompt = `Create one beginner DBMS learning challenge of type "${input.type}". ${context} Return only a JSON object, not an array or markdown. Include prompt, hint, explanation, and the answer fields appropriate to the type. For mcq/scenario, options must be an array of exactly four distinct non-empty strings, and correctIndex must be a JSON integer from 0 to 3 (zero-based). Scenario questions must apply the topic to a realistic situation. true_false requires a boolean correctBoolean. fill_blank requires exactly one ___ in prompt and acceptedAnswers with 1-3 equivalent short strings. matching requires exactly three pairs with left and right strings. The hint must guide without giving the answer.`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const retryNote = attempt === 0 ? '' : ' Your previous output was not valid for this schema. Correct the schema and check every field carefully.';
      const parsed = parseJson<unknown>(await generateText(DBMS_SYSTEM, `${basePrompt}${retryNote}`, 1800));
      const normalized = normalizeTheoryQuestion(input.type, parsed);
      if (normalized) return normalized;
    } catch (error) {
      if (attempt === 1 || !/invalid JSON/i.test((error as Error).message)) throw error;
    }
  }
  throw createGroqError('Groq could not generate a valid question for this topic. Please retry.', 502);
}

export async function generatePlaygroundSqlChallenge(input: {
  unitTitle: string; conceptTitle: string; summary: string; definition: string; schema: string;
}) {
  const prompt = `Create one small runnable SQL challenge for the exact topic "${input.conceptTitle}" in unit "${input.unitTitle}". Summary: ${input.summary}. Definition: ${input.definition}. Available SQLite schema: ${input.schema}. Return only valid JSON with prompt, starterSql, solutionSql, hint, explanation. Keep the task relevant to this concept. solutionSql must be one valid SQLite statement using only listed tables. It may be SELECT, WITH, INSERT, UPDATE, or DELETE. For writes, safely modify one relevant record using a restrictive condition. starterSql should be a useful partial query. Do not include comments or prose inside SQL fields.`;
  return parseJson<{ prompt: string; starterSql: string; solutionSql: string; hint: string; explanation: string }>(await generateText(DBMS_SYSTEM, prompt, 2200));
}

export async function generatePlaygroundFeedback(input: {
  conceptTitle: string; prompt: string; learnerWork: string; correct: boolean; explanation: string; hint: string; error?: string;
}) {
  return generateTutorChatReply({
    message: `Coach a beginner on the exact topic "${input.conceptTitle}". Challenge: ${input.prompt}. Student work: ${input.learnerWork}. The backend validator's result is authoritative: ${input.correct ? 'CORRECT' : 'NOT YET CORRECT'}. ${input.error ? `Execution/validation detail: ${input.error}.` : ''} Course explanation: ${input.explanation}. Hint: ${input.hint}. Give short, specific and encouraging feedback. If incorrect, guide with the hint without giving the complete answer. Do not override the backend result or introduce unrelated concepts.`,
    context: { conceptTitle: input.conceptTitle },
  });
}

export async function reviewSqlPractice(conceptTitle: string, task: string, sql: string, result: string) {
  return generateTutorChatReply({
    message: `Review this student's SQL practice for the exact topic "${conceptTitle}". Task: ${task}. Student SQL: ${sql}. Execution result: ${result}. Give concise, encouraging feedback in simple language. Explain what is correct, identify a specific improvement if needed, and suggest a next step.`,
    context: { conceptTitle },
  });
}

export async function generateTutorChatReply(params: {
  message: string;
  history?: { role: 'user' | 'model'; text: string }[];
  context?: { unitTitle?: string; conceptTitle?: string; currentSql?: string };
}): Promise<string> {
  const message = params.message.trim();
  const context = [
    params.context?.unitTitle ? `Current unit: ${params.context.unitTitle}` : '',
    params.context?.conceptTitle ? `Current concept: ${params.context.conceptTitle}` : '',
    params.context?.currentSql ? `Student SQL draft:\n${params.context.currentSql}` : '',
  ].filter(Boolean).join('\n');
  const history = (params.history ?? []).slice(-6).filter((item, index, items) =>
    item.text?.trim() && !(index === items.length - 1 && item.role === 'user' && item.text.trim() === message)
  );
  const transcript = history.map((item) => `${item.role === 'model' ? 'Tutor' : 'Student'}: ${item.text}`).join('\n');
  const prompt = `${context ? `${context}\n\n` : ''}${transcript ? `Recent conversation:\n${transcript}\n\n` : ''}Student's message: ${message}`;
  return generateText(
    'You are Rinku, the friendly expert DBMS Tutor in DBMS Arena. Answer concisely with examples, ER notation, or SQL when useful. Stay aware of the selected unit and concept. Available practice tables: departments, instructors, students, courses, enrollments, projects.',
    prompt,
    1800
  );
}
