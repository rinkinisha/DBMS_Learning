import { Content, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error(
      'GEMINI_API_KEY is not configured. Please add it in the Settings > Secrets panel.'
    ) as Error & { httpStatus?: number };
    err.httpStatus = 503;
    throw err;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ParsedApiError {
  httpStatus: number;
  message: string;
  isTransient: boolean;
}

export function formatGeminiError(err: unknown): ParsedApiError {
  const e = err as { status?: number; httpStatus?: number; message?: string };
  const rawMessage = e?.message || 'Gemini AI request failed.';

  if (e?.httpStatus === 503 && rawMessage.includes('GEMINI_API_KEY is not configured')) {
    return { httpStatus: 503, message: rawMessage, isTransient: false };
  }

  // Try extracting structured error payload from @google/genai error string
  let code = typeof e?.status === 'number' ? e.status : 0;
  let statusText = '';
  let innerMsg = rawMessage;

  try {
    const parsed = JSON.parse(rawMessage) as {
      error?: { code?: number; message?: string; status?: string };
    };
    if (parsed?.error) {
      code = parsed.error.code || code;
      statusText = parsed.error.status || '';
      innerMsg = parsed.error.message || innerMsg;
    }
  } catch {
    // rawMessage may contain embedded JSON after a prefix
    const idx = rawMessage.indexOf('{');
    if (idx !== -1) {
      try {
        const parsed = JSON.parse(rawMessage.slice(idx)) as {
          error?: { code?: number; message?: string; status?: string };
        };
        if (parsed?.error) {
          code = parsed.error.code || code;
          statusText = parsed.error.status || '';
          innerMsg = parsed.error.message || innerMsg;
        }
      } catch {
        // Ignore parse failure
      }
    }
  }

  const upper = `${statusText} ${innerMsg}`.toUpperCase();

  if (code === 400 && upper.includes('API_KEY_INVALID')) {
    return {
      httpStatus: 400,
      message:
        'Your Gemini API key appears invalid. Please verify GEMINI_API_KEY in the Settings > Secrets panel.',
      isTransient: false,
    };
  }

  if (code === 403 || upper.includes('PERMISSION_DENIED')) {
    return {
      httpStatus: 403,
      message:
        'Gemini API permission denied. Please check your API key in the Settings > Secrets panel.',
      isTransient: false,
    };
  }

  if (code === 429 || upper.includes('RESOURCE_EXHAUSTED') || upper.includes('QUOTA')) {
    return {
      httpStatus: 429,
      message:
        'Gemini API rate limit or quota reached. Please wait a moment or configure a billing-enabled key in Settings > Secrets.',
      isTransient: false,
    };
  }

  if (code === 404 || upper.includes('NOT_FOUND')) {
    return {
      httpStatus: 502,
      message: 'Requested Gemini model is currently unavailable.',
      isTransient: false,
    };
  }

  if (
    code === 503 ||
    code === 500 ||
    code === 504 ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('HIGH DEMAND') ||
    upper.includes('OVERLOADED') ||
    upper.includes('DEADLINE_EXCEEDED') ||
    upper.includes('TIMEOUT') ||
    upper.includes('ECONNRESET') ||
    upper.includes('FETCH FAILED')
  ) {
    return {
      httpStatus: 503,
      message:
        'Gemini AI is temporarily experiencing high demand. Please click Retry or try again in a few seconds.',
      isTransient: true,
    };
  }

  return {
    httpStatus: code >= 400 && code < 600 ? code : 500,
    message: innerMsg,
    isTransient: false,
  };
}

async function runWithModelFallback<T>(
  runner: (ai: GoogleGenAI, model: string) => Promise<T>
): Promise<T> {
  const ai = getAiClient();
  const attempts: { model: string; delayMs: number }[] = [
    { model: PRIMARY_MODEL, delayMs: 0 },
    { model: PRIMARY_MODEL, delayMs: 600 },
    { model: FALLBACK_MODEL, delayMs: 400 },
    { model: FALLBACK_MODEL, delayMs: 1200 },
  ];

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const { model, delayMs } = attempts[i];
    if (delayMs > 0) await sleep(delayMs);
    try {
      return await runner(ai, model);
    } catch (err) {
      lastError = err;
      const info = formatGeminiError(err);
      // Do not retry non-transient auth/quota/bad-request errors
      if (!info.isTransient) {
        throw err;
      }
    }
  }
  throw lastError;
}

export async function generateStructuredAiExplanation(
  unitTitle: string,
  conceptTitle: string,
  conceptSummary: string
) {
  return runWithModelFallback(async (ai, model) => {
    const config: Record<string, unknown> = {
      systemInstruction:
        'You are an expert DBMS professor in DBMS Arena. Produce structured, crystal-clear, beginner-friendly explanations strictly scoped to the current unit and concept.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: 'Simple beginner-friendly introduction (2-3 sentences).',
          },
          formalDefinition: {
            type: Type.STRING,
            description: 'Detailed beginner-friendly explanation & definitions.',
          },
          realWorldAnalogy: {
            type: Type.STRING,
            description: 'Relatable real-world example & analogy.',
          },
          workedExample: {
            type: Type.STRING,
            description: 'Concrete practical DBMS/SQL example.',
          },
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
          trySqlQuery: {
            type: Type.STRING,
            description: 'Valid SQLite SELECT query on the practice schema.',
          },
        },
      },
    };

    if (model === PRIMARY_MODEL) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }

    const response = await ai.models.generateContent({
      model,
      contents: `You are teaching inside DBMS Arena.
Current Unit: "${unitTitle}"
Current Concept: "${conceptTitle}" (${conceptSummary})

Generate a beginner-friendly, thorough, and strictly on-topic DBMS lesson strictly aligned to "${conceptTitle}" inside "${unitTitle}".
Practice SQLite tables available for examples: departments(dept_id, dept_name, building, budget), instructors(instructor_id, full_name, email, dept_id, salary), students(student_id, full_name, email, dept_id, year_level, gpa), courses(course_id, course_code, title, credits, dept_id, instructor_id), enrollments(student_id, course_id, semester, grade), projects(project_id, project_name, dept_id, lead_instructor_id, budget).`,
      config,
    });

    const raw = (response.text ?? '{}').trim();
    return JSON.parse(raw);
  });
}

export async function generateTutorChatReply(params: {
  message: string;
  history?: { role: 'user' | 'model'; text: string }[];
  context?: { unitTitle?: string; conceptTitle?: string; currentSql?: string };
}): Promise<string> {
  const trimmedMessage = params.message.trim();
  const contextLines = [
    params.context?.unitTitle ? `Current Unit: ${params.context.unitTitle}` : null,
    params.context?.conceptTitle ? `Current Concept: ${params.context.conceptTitle}` : null,
    params.context?.currentSql ? `Student's SQL Draft:\n${params.context.currentSql}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const rawHistory = Array.isArray(params.history) ? params.history.slice(-6) : [];
  // Avoid duplicating the latest message if client happened to include it
  const cleanedHistory = rawHistory.filter((item, idx) => {
    if (!item || typeof item.text !== 'string' || !item.text.trim()) return false;
    if (
      idx === rawHistory.length - 1 &&
      item.role === 'user' &&
      item.text.trim() === trimmedMessage
    ) {
      return false;
    }
    return true;
  });

  // Gemini chats history should start with a 'user' turn if non-empty
  const firstUserIdx = cleanedHistory.findIndex((h) => h.role === 'user');
  const chatHistory: Content[] =
    firstUserIdx >= 0
      ? cleanedHistory.slice(firstUserIdx).map((h) => ({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: h.text }],
        }))
      : [];

  const promptMessage = contextLines
    ? `Context:\n${contextLines}\n\nQuestion: ${trimmedMessage}`
    : trimmedMessage;

  return runWithModelFallback(async (ai, model) => {
    const config: Record<string, unknown> = {
      systemInstruction:
        'You are Owlbert, the friendly expert DBMS Tutor in DBMS Arena. Always stay aware of the student’s current Unit and Concept. Give concise, structured answers with clear examples, ER notation or SQL snippets when helpful. Available practice tables: departments, instructors, students, courses, enrollments, projects.',
    };
    if (model === PRIMARY_MODEL) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }

    const chat = ai.chats.create({
      model,
      config,
      history: chatHistory,
    });

    const response = await chat.sendMessage({ message: promptMessage });
    const text = response.text?.trim();
    if (!text) {
      throw new Error('Empty response received from Gemini AI.');
    }
    return text;
  });
}
