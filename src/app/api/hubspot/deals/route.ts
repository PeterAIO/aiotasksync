import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { searchDeals } from '@/lib/hubspot';

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const query = req.nextUrl.searchParams.get('q') || '';
    const data = await searchDeals(query);
    return NextResponse.json(data.results || []);
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
