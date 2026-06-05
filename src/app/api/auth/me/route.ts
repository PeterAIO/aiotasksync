import { NextResponse } from 'next/server';
import { getSession, ensureAdminUser } from '@/lib/auth';

export async function GET() {
  try {
    await ensureAdminUser();
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(session);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
