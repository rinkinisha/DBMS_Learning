import fs from 'node:fs';
import path from 'node:path';
import type { Database, SqlJsStatic } from 'sql.js';
import { PRACTICE_DB_INIT_SQL } from './seedData.ts';

/** Owns durable, isolated practice databases. Application data never passes through this manager. */
export class PracticeDatabaseManager {
  private readonly databases = new Map<number, Database>();

  constructor(
    private readonly SQL: SqlJsStatic,
    private readonly directory: string
  ) {}

  get(studentId: number): Database {
    this.validateStudentId(studentId);
    const existing = this.databases.get(studentId);
    if (existing) {
      existing.run('PRAGMA foreign_keys = ON');
      if (existing.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0] !== 1) {
        throw new Error('SQLite foreign-key enforcement is disabled for this practice database.');
      }
      return existing;
    }

    fs.mkdirSync(this.directory, { recursive: true });
    const filePath = this.filePath(studentId);
    const database = fs.existsSync(filePath)
      ? new this.SQL.Database(fs.readFileSync(filePath))
      : this.createSeededDatabase();
    // sql.js does not persist this connection-level setting in exported database files.
    database.run('PRAGMA foreign_keys = ON');
    const foreignKeysEnabled = database.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0] === 1;
    if (!foreignKeysEnabled) {
      database.close();
      throw new Error('Could not enable SQLite foreign-key enforcement for the practice database.');
    }
    this.databases.set(studentId, database);
    if (!fs.existsSync(filePath)) this.save(studentId);
    return database;
  }

  save(studentId: number): void {
    this.validateStudentId(studentId);
    const database = this.databases.get(studentId);
    if (!database) throw new Error('Student practice database has not been opened.');
    fs.mkdirSync(this.directory, { recursive: true });
    const filePath = this.filePath(studentId);
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, Buffer.from(database.export()));
    fs.renameSync(temporaryPath, filePath);
  }

  reset(studentId: number): Database {
    this.validateStudentId(studentId);
    this.databases.get(studentId)?.close();
    const database = this.createSeededDatabase();
    this.databases.set(studentId, database);
    this.save(studentId);
    return database;
  }

  closeAll(): void {
    for (const database of this.databases.values()) database.close();
    this.databases.clear();
  }

  private createSeededDatabase(): Database {
    const database = new this.SQL.Database();
    database.run('PRAGMA foreign_keys = ON');
    database.run(PRACTICE_DB_INIT_SQL);
    const setting = database.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0];
    if (setting !== 1) {
      database.close();
      throw new Error('Could not enable SQLite foreign-key enforcement for the practice database.');
    }
    return database;
  }

  private filePath(studentId: number): string {
    return path.join(this.directory, `student-${studentId}.sqlite`);
  }

  private validateStudentId(studentId: number): void {
    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      throw new Error('A valid authenticated student ID is required for the practice database.');
    }
  }
}
