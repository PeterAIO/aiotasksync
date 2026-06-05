import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { getUsers, addUser, type User } from './store';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_NAME = 'aiotasksync_token';

export interface SessionUser {
  email: string;
  role: 'admin' | 'user';
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createToken(user: SessionUser): string {
  return jwt.sign({ email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): SessionUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as SessionUser;
    return { email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  if (session.role !== 'admin') throw new Error('Forbidden');
  return session;
}

// Ensure admin user exists on first run
export async function ensureAdminUser() {
  const users = await getUsers();
  if (users.length === 0) {
    const email = process.env.ADMIN_EMAIL || 'admin@admin.com';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = await hashPassword(password);
    await addUser({ email, passwordHash: hash, role: 'admin', createdAt: new Date().toISOString() });
  }
}
