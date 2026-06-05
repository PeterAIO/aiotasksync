import { NextRequest, NextResponse } from 'next/server';
import { findUser } from '@/lib/store';
import { verifyPassword, createToken, ensureAdminUser } from '@/lib/auth';
import { serialize } from 'cookie';

export async function POST(req: NextRequest) {
  try {
    await ensureAdminUser();
    const { email, password } = await req.json();

    const user = await findUser(email);
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = createToken({ email: user.email, role: user.role });
    const cookie = serialize('aiotasksync_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    const response = NextResponse.json({ email: user.email, role: user.role });
    response.headers.set('Set-Cookie', cookie);
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
