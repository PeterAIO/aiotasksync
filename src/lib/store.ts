/**
 * Storage layer — uses Vercel KV (Redis) when available, falls back to filesystem for local dev.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// --- KV helpers ---

async function kvGet<T>(key: string, fallback: T): Promise<T> {
  if (!USE_KV) return fileGet(key, fallback);
  try {
    const { kv } = await import('@vercel/kv');
    const val = await kv.get<T>(key);
    return val ?? fallback;
  } catch {
    return fallback;
  }
}

async function kvSet<T>(key: string, data: T): Promise<void> {
  if (!USE_KV) return fileSet(key, data);
  try {
    const { kv } = await import('@vercel/kv');
    await kv.set(key, data);
  } catch (err) {
    console.error('KV write error:', err);
  }
}

async function kvDel(key: string): Promise<void> {
  if (!USE_KV) return;
  try {
    const { kv } = await import('@vercel/kv');
    await kv.del(key);
  } catch {}
}

// --- Filesystem fallback ---

async function ensureDir() {
  try { await mkdir(DATA_DIR, { recursive: true }); } catch {}
}

async function fileGet<T>(key: string, fallback: T): Promise<T> {
  try {
    await ensureDir();
    const data = await readFile(path.join(DATA_DIR, `${key}.json`), 'utf8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

async function fileSet<T>(key: string, data: T): Promise<void> {
  await ensureDir();
  await writeFile(path.join(DATA_DIR, `${key}.json`), JSON.stringify(data, null, 2));
}

// --- Types ---

export interface User {
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface Mapping {
  projectId: string;
  projectName: string;
  companyName?: string;
  dealName?: string;
}

export interface Mappings {
  companies: Record<string, Mapping>;
  deals: Record<string, Mapping>;
}

export interface SyncState {
  lastSync: Record<string, string>;
  lastRun?: string;
  lastRunType?: 'manual' | 'auto';
}

// --- Users ---

export async function getUsers(): Promise<User[]> {
  return kvGet<User[]>('users', []);
}

export async function addUser(user: User): Promise<void> {
  const users = await getUsers();
  const existing = users.findIndex(u => u.email === user.email);
  if (existing >= 0) users[existing] = user;
  else users.push(user);
  await kvSet('users', users);
}

export async function removeUser(email: string): Promise<void> {
  const users = await getUsers();
  await kvSet('users', users.filter(u => u.email !== email));
}

export async function findUser(email: string): Promise<User | undefined> {
  const users = await getUsers();
  return users.find(u => u.email === email);
}

// --- Mappings ---

export async function getMappings(): Promise<Mappings> {
  return kvGet<Mappings>('mappings', { companies: {}, deals: {} });
}

export async function saveMappings(mappings: Mappings): Promise<void> {
  await kvSet('mappings', mappings);
}

// --- Sync State ---

export async function getSyncState(): Promise<SyncState> {
  return kvGet<SyncState>('sync-state', { lastSync: {} });
}

export async function saveSyncState(state: SyncState, runType?: 'manual' | 'auto'): Promise<void> {
  state.lastRun = new Date().toISOString();
  if (runType) state.lastRunType = runType;
  await kvSet('sync-state', state);
}
