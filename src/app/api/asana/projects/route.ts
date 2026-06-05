import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getProjects } from '@/lib/asana';

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const workspace = req.nextUrl.searchParams.get('workspace') || undefined;
    const projects = await getProjects(workspace);
    return NextResponse.json(projects);
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
