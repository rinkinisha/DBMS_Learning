import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import initSqlJs from 'sql.js';
import { PracticeDatabaseManager } from './practiceDatabase.ts';

test('student practice databases persist independently, enforce foreign keys, and reset independently', async () => {
  const SQL = await initSqlJs();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dbms-practice-isolation-'));
  const manager = new PracticeDatabaseManager(SQL, directory);
  try {
    const [studentA, studentB] = await Promise.all([Promise.resolve(manager.get(101)), Promise.resolve(manager.get(202))]);
    assert.equal(studentA.exec('PRAGMA foreign_keys')[0].values[0][0], 1);
    assert.equal(studentB.exec('PRAGMA foreign_keys')[0].values[0][0], 1);

    await Promise.all([
      Promise.resolve().then(() => {
        studentA.run('CREATE TABLE private_notes (note TEXT NOT NULL)');
        studentA.run("INSERT INTO private_notes VALUES ('A only')");
        manager.save(101);
      }),
      Promise.resolve().then(() => {
        studentB.run('CREATE TABLE private_notes (note TEXT NOT NULL)');
        studentB.run("INSERT INTO private_notes VALUES ('B only')");
        manager.save(202);
      }),
    ]);

    assert.equal(studentA.exec('SELECT note FROM private_notes')[0].values[0][0], 'A only');
    assert.equal(studentB.exec('SELECT note FROM private_notes')[0].values[0][0], 'B only');
    assert.ok(fs.existsSync(path.join(directory, 'student-101.sqlite')));
    assert.ok(fs.existsSync(path.join(directory, 'student-202.sqlite')));

    assert.throws(
      () => studentA.run("INSERT INTO enrollments (student_id, course_id, semester, grade) VALUES (8, 99999, 'Fall 2026', NULL)"),
      /FOREIGN KEY constraint failed/i
    );
    assert.throws(() => studentA.run('INSERT INTO constraint_lab (score) VALUES (101)'), /CHECK constraint failed/i);

    studentA.run('INSERT INTO constraint_lab (score) VALUES (88)');
    const generated = studentA.exec('SELECT record_id, label, created_on FROM constraint_lab ORDER BY record_id DESC LIMIT 1')[0].values[0];
    assert.equal(generated[0], 3);
    assert.equal(generated[1], 'unlabeled');
    assert.match(String(generated[2]), /^\d{4}-\d{2}-\d{2}$/);

    const plan = studentA.exec("EXPLAIN QUERY PLAN SELECT record_id FROM index_lab_records WHERE category = 'dept-03' AND metric >= 700")[0].values
      .map((row) => row.map(String).join(' ')).join(' ');
    assert.match(plan, /idx_index_lab_category_metric/);
    assert.equal(studentA.exec("SELECT type FROM sqlite_master WHERE name = 'student_course_directory'")[0].values[0][0], 'view');

    manager.reset(101);
    assert.throws(() => manager.get(101).exec('SELECT * FROM private_notes'));
    assert.equal(manager.get(202).exec('SELECT note FROM private_notes')[0].values[0][0], 'B only');

    manager.closeAll();
    const reopened = new PracticeDatabaseManager(SQL, directory);
    try {
      assert.equal(reopened.get(202).exec('SELECT note FROM private_notes')[0].values[0][0], 'B only');
      assert.equal(reopened.get(202).exec('PRAGMA foreign_keys')[0].values[0][0], 1);
    } finally {
      reopened.closeAll();
    }
  } finally {
    manager.closeAll();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
