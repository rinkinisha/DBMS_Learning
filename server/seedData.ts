import { SeedConcept, SeedQuestion, SeedUnit } from './curriculum/types.ts';
import { UNIT_1_CONCEPTS, UNIT_1_QUESTIONS } from './curriculum/unit1.ts';
import { UNIT_2_CONCEPTS, UNIT_2_QUESTIONS } from './curriculum/unit2.ts';
import { UNIT_3_CONCEPTS, UNIT_3_QUESTIONS } from './curriculum/unit3.ts';
import { UNIT_4_CONCEPTS, UNIT_4_QUESTIONS } from './curriculum/unit4.ts';

export type { SeedUnit, SeedConcept, SeedQuestion };

export const CURRICULUM_VERSION = 'v2_official_4_units_87_concepts';

export const SEED_UNITS: SeedUnit[] = [
  {
    unit_number: 1,
    title: 'UNIT I: Introduction and Basics of DBMS',
    subtitle: 'Foundations · Architecture · ER Model',
    description:
      'Master DBMS fundamentals, history, advantages and disadvantages, applications and need, 1/2/3-Level architectures, File System vs DBMS, and the Entity Relationship Model.',
    accent_color: 'emerald',
    estimated_hours: 3.5,
    unlock_xp_bonus: 150,
  },
  {
    unit_number: 2,
    title: 'UNIT II: SQL Part 1',
    subtitle: 'Core Queries · Filtering · Aggregates · Joins',
    description:
      'Build SQL fluency from RDBMS foundations through SELECT, WHERE, boolean logic, DML edits, aggregate functions, pattern matching, and all JOIN types.',
    accent_color: 'sky',
    estimated_hours: 7,
    unlock_xp_bonus: 220,
  },
  {
    unit_number: 3,
    title: 'UNIT III: SQL Part 2',
    subtitle: 'Grouping · Subqueries · DDL · Constraints · Views',
    description:
      'Advance into UNION, GROUP BY, HAVING, EXISTS, ANY/ALL, CASE, NULL functions, Database/Table DDL, Constraints, Indexes, Auto Increment, Dates, and Views.',
    accent_color: 'amber',
    estimated_hours: 6.5,
    unlock_xp_bonus: 260,
  },
  {
    unit_number: 4,
    title: 'UNIT IV: Relational Algebra and Database Theory',
    subtitle: 'Relational Algebra · Transactions · ACID · Normalization',
    description:
      'Master formal Relational Algebra operators, syntax and semantics, division, grouping, relational comparison, Transaction Management, ACID properties, and Normalization (1NF to BCNF).',
    accent_color: 'indigo',
    estimated_hours: 4.5,
    unlock_xp_bonus: 300,
  },
];

export const SEED_CONCEPTS: SeedConcept[] = [
  ...UNIT_1_CONCEPTS,
  ...UNIT_2_CONCEPTS,
  ...UNIT_3_CONCEPTS,
  ...UNIT_4_CONCEPTS,
];

export const SEED_QUESTIONS: SeedQuestion[] = [
  ...UNIT_1_QUESTIONS,
  ...UNIT_2_QUESTIONS,
  ...UNIT_3_QUESTIONS,
  ...UNIT_4_QUESTIONS,
];

export const SEED_BADGES = [
  {
    code: 'FIRST_SPARK',
    title: 'Schema Apprentice',
    description: 'Complete your very first 15-minute DBMS concept.',
    icon_name: 'Sparkles',
    requirement_text: 'Complete 1 concept',
  },
  {
    code: 'UNIT_1_MASTER',
    title: 'Unit I Conqueror',
    description: 'Pass the Unit I Mastery Assessment and unlock SQL Part 1.',
    icon_name: 'ShieldCheck',
    requirement_text: 'Pass Unit I Assessment',
  },
  {
    code: 'SQL_STRIKER',
    title: 'Query Striker',
    description: 'Execute 3+ SQL queries inside the live SQL Playground.',
    icon_name: 'Terminal',
    requirement_text: 'Run 3 SQL queries',
  },
  {
    code: 'STREAK_KEEPER',
    title: 'Streak Guardian',
    description: 'Maintain a 5-day active learning streak in DBMS Arena.',
    icon_name: 'Flame',
    requirement_text: '5-day streak',
  },
  {
    code: 'XP_500',
    title: 'Gold League Contender',
    description: 'Earn 500 total XP across lessons, mini-games, and missions.',
    icon_name: 'Trophy',
    requirement_text: 'Reach 500 XP',
  },
  {
    code: 'STREAK_3',
    title: '3-Day Spark',
    description: 'Maintain an active DBMS learning streak for 3 consecutive days.',
    icon_name: 'Flame',
    requirement_text: '3-day streak',
  },
  {
    code: 'STREAK_7',
    title: '7-Day Week Warrior',
    description: 'Complete qualifying DBMS activities for 7 straight days.',
    icon_name: 'Flame',
    requirement_text: '7-day streak',
  },
  {
    code: 'STREAK_14',
    title: '14-Day Fortnight Scholar',
    description: 'Stay consistent across two full weeks of DBMS practice.',
    icon_name: 'Flame',
    requirement_text: '14-day streak',
  },
  {
    code: 'STREAK_30',
    title: '30-Day Monthly Titan',
    description: 'Build an unstoppable 30-day daily DBMS habit.',
    icon_name: 'Flame',
    requirement_text: '30-day streak',
  },
  {
    code: 'STREAK_60',
    title: '60-Day Iron Architect',
    description: 'Sustain 60 consecutive days of relational mastery.',
    icon_name: 'Flame',
    requirement_text: '60-day streak',
  },
  {
    code: 'STREAK_100',
    title: '100-Day DBMS Legend',
    description: 'Achieve legendary consistency with a 100-day DBMS learning streak.',
    icon_name: 'Trophy',
    requirement_text: '100-day streak',
  },
];

export const PRACTICE_DB_INIT_SQL = `
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS instructors;
DROP TABLE IF EXISTS departments;

CREATE TABLE departments (
  dept_id TEXT PRIMARY KEY,
  dept_name TEXT NOT NULL,
  building TEXT NOT NULL,
  budget INTEGER NOT NULL
);

CREATE TABLE instructors (
  instructor_id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  dept_id TEXT NOT NULL,
  salary INTEGER NOT NULL,
  FOREIGN KEY (dept_id) REFERENCES departments(dept_id)
);

CREATE TABLE students (
  student_id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  dept_id TEXT NOT NULL,
  year_level INTEGER NOT NULL,
  gpa REAL NOT NULL,
  FOREIGN KEY (dept_id) REFERENCES departments(dept_id)
);

CREATE TABLE courses (
  course_id INTEGER PRIMARY KEY,
  course_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  credits INTEGER NOT NULL,
  dept_id TEXT NOT NULL,
  instructor_id INTEGER,
  FOREIGN KEY (dept_id) REFERENCES departments(dept_id),
  FOREIGN KEY (instructor_id) REFERENCES instructors(instructor_id)
);

CREATE TABLE enrollments (
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  semester TEXT NOT NULL,
  grade TEXT,
  PRIMARY KEY (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES students(student_id),
  FOREIGN KEY (course_id) REFERENCES courses(course_id)
);

CREATE TABLE projects (
  project_id INTEGER PRIMARY KEY,
  project_name TEXT NOT NULL,
  dept_id TEXT NOT NULL,
  lead_instructor_id INTEGER NOT NULL,
  budget INTEGER NOT NULL,
  FOREIGN KEY (dept_id) REFERENCES departments(dept_id),
  FOREIGN KEY (lead_instructor_id) REFERENCES instructors(instructor_id)
);

INSERT INTO departments VALUES
  ('CS', 'Computer Science', 'Turing Hall', 480000),
  ('DS', 'Data Science', 'Euler Wing', 390000),
  ('EC', 'Electrical Engineering', 'Maxwell Lab', 420000),
  ('MA', 'Applied Mathematics', 'Gauss Center', 310000);

INSERT INTO instructors VALUES
  (101, 'Dr. Ada Lovelace', 'ada@arena.edu', 'CS', 135000),
  (102, 'Dr. Edgar Codd', 'codd@arena.edu', 'CS', 142000),
  (103, 'Dr. Grace Hopper', 'grace@arena.edu', 'DS', 138000),
  (104, 'Dr. Claude Shannon', 'shannon@arena.edu', 'EC', 129000),
  (105, 'Dr. Emmy Noether', 'noether@arena.edu', 'MA', 126000);

INSERT INTO students VALUES
  (1, 'Rinki Nisha', 'rinki@arena.edu', 'CS', 3, 3.88),
  (2, 'Arjun Mehta', 'arjun@arena.edu', 'CS', 2, 3.65),
  (3, 'Priya Nair', 'priya@arena.edu', 'DS', 4, 3.92),
  (4, 'Kabir Sharma', 'kabir@arena.edu', 'EC', 1, 3.41),
  (5, 'Elena Rostova', 'elena@arena.edu', 'DS', 3, 3.79),
  (6, 'Marcus Chen', 'marcus@arena.edu', 'CS', 2, 3.54),
  (7, 'Sana Kapoor', 'sana@arena.edu', 'MA', 4, 3.84);

INSERT INTO courses VALUES
  (201, 'CS301', 'Database Management Systems', 4, 'CS', 102),
  (202, 'CS204', 'Data Structures & Algorithms', 4, 'CS', 101),
  (203, 'DS310', 'Distributed Data Pipelines', 3, 'DS', 103),
  (204, 'EC210', 'Signals & Digital Systems', 3, 'EC', 104),
  (205, 'MA220', 'Discrete Structures & Logic', 4, 'MA', 105);

INSERT INTO enrollments VALUES
  (1, 201, 'Fall 2026', 'A'),
  (1, 202, 'Fall 2026', 'A'),
  (2, 201, 'Fall 2026', 'B+'),
  (3, 201, 'Fall 2026', 'A'),
  (3, 203, 'Fall 2026', 'A-'),
  (4, 204, 'Fall 2026', 'B'),
  (5, 203, 'Fall 2026', 'A'),
  (6, 202, 'Fall 2026', 'B+'),
  (7, 205, 'Fall 2026', 'A');

INSERT INTO projects VALUES
  (301, 'Zero-Latency Query Engine', 'CS', 102, 95000),
  (302, 'Autonomous Schema Verifier', 'DS', 103, 72000),
  (303, 'Error-Correcting Memory Bus', 'EC', 104, 68000);
`;
