import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getWorkspaces } from '@/lib/asana';

export async function GET() {
  try {
    await requireAuth();
    const workspaces = await getWorkspaces();
    return NextResponse.json(workspaces);
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
