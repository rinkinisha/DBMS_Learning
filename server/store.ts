import { MongoClient } from 'mongodb';
import {
  getDatabases,
  getPracticeDatabaseForStudent,
  resetPracticeDb as resetPracticeSqliteDb,
  savePracticeDatabaseForStudent,
} from './db.ts';
import { MongoDataStore } from './mongoStore.ts';
import { SqliteDataStore } from './sqliteStore.ts';
import type { DataStore } from './storeTypes.ts';

let storePromise: Promise<DataStore> | null = null;

function isPlaceholderUri(uri: string): boolean {
  return (
    !uri ||
    uri.includes('<db_password>') ||
    uri.includes('CHANGE_ME') ||
    uri.includes('MY_MONGODB')
  );
}

function extractDbNameFromUri(uri: string): string | null {
  try {
    const withoutQuery = uri.split('?')[0];
    const schemeIdx = withoutQuery.indexOf('://');
    if (schemeIdx === -1) return null;
    const afterHostIdx = withoutQuery.indexOf('/', schemeIdx + 3);
    if (afterHostIdx === -1) return null;
    const dbPart = withoutQuery.slice(afterHostIdx + 1).trim();
    return dbPart || null;
  } catch {
    return null;
  }
}

async function initStoreInternal(): Promise<DataStore> {
  const rawUri = (process.env.MONGODB_URI ?? '').trim();
  const { appDb } = await getDatabases();

  if (!rawUri) {
    console.info(
      '[DB] MONGODB_URI is not set in environment; running on local SQLite store. Add MONGODB_URI in Settings > Secrets to activate MongoDB Atlas.'
    );
    return new SqliteDataStore(appDb, {
      backend: 'sqlite_fallback',
      mongoConfigured: false,
      mongoConnected: false,
      note: 'MONGODB_URI secret not configured yet; using local SQLite store.',
    });
  }

  if (isPlaceholderUri(rawUri)) {
    console.warn(
      '[DB] MONGODB_URI still contains a placeholder (<db_password>); running on local SQLite store until replaced in Settings > Secrets.'
    );
    return new SqliteDataStore(appDb, {
      backend: 'sqlite_fallback',
      mongoConfigured: false,
      mongoConnected: false,
      note: 'MONGODB_URI contains placeholder password; replace <db_password> in Settings > Secrets.',
    });
  }

  const client = new MongoClient(rawUri, {
    serverSelectionTimeoutMS: 6000,
    connectTimeoutMS: 6000,
  });

  try {
    await client.connect();
    const dbName =
      (process.env.MONGODB_DB_NAME ?? '').trim() ||
      extractDbNameFromUri(rawUri) ||
      'dbms_arena';
    const mongoDb = client.db(dbName);
    await mongoDb.command({ ping: 1 });

    const mongoStore = new MongoDataStore(client, mongoDb);
    await mongoStore.initialize(appDb);
    console.info(`[DB] Connected to MongoDB Atlas database "${dbName}".`);
    return mongoStore;
  } catch (err) {
    const msg = (err as Error).message || 'Connection failed';
    console.warn(
      `[DB] Could not connect to MongoDB Atlas (${msg}). Falling back to local SQLite store.`
    );
    try {
      await client.close();
    } catch {
      // ignore close error
    }
    return new SqliteDataStore(appDb, {
      backend: 'sqlite_fallback',
      mongoConfigured: true,
      mongoConnected: false,
      note: 'MongoDB Atlas connection failed; check password and Atlas IP Network Access (0.0.0.0/0).',
    });
  }
}

export async function getStore(): Promise<DataStore> {
  if (!storePromise) {
    storePromise = initStoreInternal();
  }
  return storePromise;
}

export async function getPracticeDatabase(studentId: number) {
  await getDatabases();
  return getPracticeDatabaseForStudent(studentId);
}

export function savePracticeDatabase(studentId: number) {
  savePracticeDatabaseForStudent(studentId);
}

export function resetPracticeDatabase(studentId: number) {
  return resetPracticeSqliteDb(studentId);
}
