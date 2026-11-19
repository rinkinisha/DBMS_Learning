import assert from 'node:assert/strict';
import test from 'node:test';
import initSqlJs from 'sql.js';
import { databaseStateFingerprint, normalizedQueryResult, validateSqlAnswer, validateTheoryAnswer } from './playgroundValidation.ts';

test('backend checks each theory answer format against the stored answer key', () => {
  assert.equal(validateTheoryAnswer('mcq', { correctIndex: 2 }, { selectedIndex: 2 }), true);
  assert.equal(validateTheoryAnswer('mcq', { correctIndex: 0 }, null), false);
  assert.equal(validateTheoryAnswer('scenario', { correctIndex: 1 }, { selectedIndex: 0 }), false);
  assert.equal(validateTheoryAnswer('true_false', { correctBoolean: true }, { value: true }), true);
  assert.equal(validateTheoryAnswer('fill_blank', { acceptedAnswers: ['data redundancy'] }, { value: ' Data   Redundancy! ' }), true);
  assert.equal(validateTheoryAnswer('matching', { pairs: [{ left: 'PK', right: 'Unique row identifier' }] }, { pairs: { PK: 'Unique row identifier' } }), true);
});

test('backend SQL checker accepts the reference result and rejects invalid or different SQL', async () => {
  const SQL = await initSqlJs();
  const base = new SQL.Database();
  base.run('CREATE TABLE students (student_id INTEGER PRIMARY KEY, full_name TEXT, gpa REAL); INSERT INTO students VALUES (1, \'Asha\', 3.9), (2, \'Dev\', 3.2);');
  const initialState = databaseStateFingerprint(base);
  const expectedResult = normalizedQueryResult(base.exec('SELECT full_name, gpa FROM students WHERE gpa >= 3.5'));

  const correctDb = new SQL.Database(base.export());
  const correct = validateSqlAnswer(correctDb, 'SELECT full_name, gpa FROM students WHERE gpa >= 3.5;', initialState, expectedResult);
  assert.equal(correct.correct, true);
  assert.equal(correct.result?.rowCount, 1);
  correctDb.close();

  const wrongDb = new SQL.Database(base.export());
  const wrong = validateSqlAnswer(wrongDb, 'SELECT full_name, gpa FROM students;', initialState, expectedResult);
  assert.equal(wrong.correct, false);
  const syntax = validateSqlAnswer(wrongDb, 'SELECT FROM', initialState, expectedResult);
  assert.equal(syntax.correct, false);
  assert.match(syntax.error ?? '', /syntax/i);
  wrongDb.close();

  const expectedUpdateDb = new SQL.Database(base.export());
  expectedUpdateDb.run('UPDATE students SET gpa = 4.0 WHERE student_id = 1');
  const updateState = databaseStateFingerprint(expectedUpdateDb);
  const updateDb = new SQL.Database(base.export());
  assert.equal(validateSqlAnswer(updateDb, 'UPDATE students SET gpa = 4.0 WHERE student_id = 1', updateState, '').correct, true);
  expectedUpdateDb.close();
  updateDb.close();
  base.close();
});
