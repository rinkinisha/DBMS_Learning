import assert from 'node:assert/strict';
import test from 'node:test';
import { SEED_CONCEPTS, SEED_QUESTIONS } from './seedData.ts';

test('all four units have structurally complete challenge items and explanations', () => {
  assert.equal(SEED_QUESTIONS.length, 188);
  for (const unit of [1, 2, 3, 4]) {
    assert.ok(SEED_QUESTIONS.some((question) => question.unit_number === unit), `Unit ${unit} has questions`);
  }
  for (const question of SEED_QUESTIONS) {
    assert.ok(question.prompt.trim(), `Question prompt exists: ${question.unit_number} ${question.prompt}`);
    assert.ok(question.explanation.trim(), `Explanation exists: ${question.unit_number} ${question.prompt}`);
  }
});

test('all 87 lessons retain their required learner-facing content sections', () => {
  assert.equal(SEED_CONCEPTS.length, 87);
  for (const concept of SEED_CONCEPTS) {
    const lesson = concept.lesson_content;
    for (const field of ['simpleIntro', 'detailedExplanation'] as const) {
      assert.ok(lesson[field].trim().length > 0, `${concept.title}: ${field}`);
    }
    for (const field of ['definitions', 'realWorldExamples', 'practicalExamples', 'visualSteps', 'commonMistakes', 'quickRecap'] as const) {
      assert.ok(lesson[field].length > 0, `${concept.title}: ${field}`);
    }
    assert.ok(concept.definition_text.trim(), `${concept.title}: definition`);
    assert.ok(concept.practical_sql.trim(), `${concept.title}: practical SQL or explicit not-applicable note`);
  }
});

test('MCQ answer values exactly match their keyed options across all units', () => {
  const mcqs = SEED_QUESTIONS.filter((question) => question.question_type === 'mcq');
  assert.equal(mcqs.length, 83);
  for (const question of mcqs) {
    const options = question.payload.options as string[];
    const index = question.payload.correctIndex as number;
    assert.ok(Number.isInteger(index) && index >= 0 && index < options.length, question.prompt);
    assert.equal(question.payload.correctAnswer, options[index], question.prompt);
    assert.equal(new Set(options.map((option) => option.toLowerCase())).size, options.length, question.prompt);
  }
});

test('every non-SQL answer key has a valid, unambiguous shape', () => {
  for (const question of SEED_QUESTIONS) {
    const payload = question.payload;
    if (question.question_type === 'true_false') {
      assert.equal(typeof payload.correct, 'boolean', question.prompt);
    } else if (question.question_type === 'matching' || question.question_type === 'memory') {
      const pairs = payload.pairs as { left?: string; right?: string; term?: string; definition?: string }[];
      assert.ok(Array.isArray(pairs) && pairs.length > 0, question.prompt);
      const left = pairs.map((pair) => pair.left ?? pair.term);
      const right = pairs.map((pair) => pair.right ?? pair.definition);
      assert.ok(left.every((value) => typeof value === 'string' && value.trim()), question.prompt);
      assert.ok(right.every((value) => typeof value === 'string' && value.trim()), question.prompt);
      assert.equal(new Set(left).size, left.length, question.prompt);
      assert.equal(new Set(right).size, right.length, question.prompt);
    } else if (question.question_type === 'drag_drop') {
      if (payload.mode === 'order') {
        const items = payload.items as string[];
        const order = payload.correctOrder as string[];
        assert.deepEqual([...order].sort(), [...items].sort(), question.prompt);
      } else if (payload.mode === 'categorize') {
        const items = payload.items as string[];
        const buckets = Object.values(payload.correctBuckets as Record<string, string[]>).flat();
        assert.deepEqual([...buckets].sort(), [...items].sort(), question.prompt);
      }
    }
  }
});

test('high-risk SQL wording includes the required dialect and NULL caveats', () => {
  const questions = SEED_QUESTIONS.map((question) => question.prompt).join('\n');
  assert.match(questions, /default NO ACTION behavior/i);
  assert.match(questions, /In SQLite, what must accompany `ALTER TABLE/i);
  assert.match(questions, /non-NULL `credits` value/i);
  const setQuestion = SEED_QUESTIONS.find((question) => question.prompt.includes('Relational Algebra Set Operations'));
  assert.match(String(setQuestion?.payload.statement), /column names need not match/i);
});

test('SQL challenges without a reference result are explicitly held for admin review', () => {
  const sqlQuestions = SEED_QUESTIONS.filter((question) => question.question_type === 'sql_challenge');
  assert.equal(sqlQuestions.length, 32);
  for (const question of sqlQuestions) {
    assert.equal(question.payload.auditStatus, 'needs_admin_review', question.prompt);
    assert.ok(String(question.payload.auditReason).includes('reference SQL result'), question.prompt);
  }
});

test('the corrected historical question avoids claiming the relational model replaced earlier systems', () => {
  const question = SEED_QUESTIONS.find((entry) => entry.prompt.includes('1970 proposal introduced'));
  assert.ok(question);
  const options = question.payload.options as string[];
  assert.equal(options[question.payload.correctIndex as number], 'E.F. Codd’s Relational Model');
  assert.ok(!question.prompt.includes('replaced brittle pointer trees'));
});

test('the Unit IV 3NF recap includes the prime-attribute condition', () => {
  const question = SEED_QUESTIONS.find((entry) => entry.prompt === 'Verify Third Normal Form (3NF):');
  assert.ok(question);
  assert.match(String(question.payload.statement), /superkey or A is prime/i);
});
