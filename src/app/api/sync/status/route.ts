import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getSyncState } from '@/lib/store';

export async function GET() {
  try {
    await requireAuth();
    const state = await getSyncState();
    return NextResponse.json({ lastRun: state.lastRun || null, lastRunType: state.lastRunType || null });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
