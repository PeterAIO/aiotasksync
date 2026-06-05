import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hashPassword } from '@/lib/auth';
import { getUsers, addUser, removeUser } from '@/lib/store';

export async function GET() {
  try {
    await requireAdmin();
    const users = await getUsers();
    // Don't expose password hashes
    return NextResponse.json(users.map(u => ({ email: u.email, role: u.role, createdAt: u.createdAt })));
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { email, password, role = 'user' } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await addUser({ email, passwordHash, role, createdAt: new Date().toISOString() });
    return NextResponse.json({ success: true, email, role });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

// Reset password or update role
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const { email, password, role } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const users = await getUsers();
    const user = users.find(u => u.email === email);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (password) user.passwordHash = await hashPassword(password);
    if (role) user.role = role;

    await addUser(user);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const { email } = await req.json();

    if (email === session.email) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    await removeUser(email);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
