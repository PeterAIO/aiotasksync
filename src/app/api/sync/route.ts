import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { runFullSync, runStreamingSync } from '@/lib/sync';

// Manual sync (from UI button) — streams progress
export async function POST() {
  try {
    await requireAuth();
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runStreamingSync(true, 'manual', (event) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// Auto-sync (called by Vercel cron)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await runFullSync();
    const synced = results.filter(r => r.status === 'success').length;
    const unchanged = results.filter(r => r.status === 'unchanged').length;
    const errors = results.filter(r => r.status === 'error').length;
    return NextResponse.json({
      summary: `Synced: ${synced}, Unchanged: ${unchanged}, Errors: ${errors}`,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
