import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getMappings, saveMappings } from '@/lib/store';

export async function GET() {
  try {
    await requireAuth();
    const mappings = await getMappings();
    return NextResponse.json(mappings);
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const body = await req.json();
    await saveMappings(body);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
